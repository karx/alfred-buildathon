const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenAI } = require("@google/genai");
const crypto = require("crypto");

// ── LLM provider ──────────────────────────────────────────────────

function resolveLLM() {
  const pref = (process.env.ALFRED_LLM || "").toLowerCase();
  if (pref === "gemini") return "gemini";
  if (pref === "claude") return "claude";
  if (process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return "gemini";
  return "claude";
}

let _anthropic = null;
let _gemini = null;

function getAnthropicClient() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

function getGeminiClient() {
  if (!_gemini) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _gemini;
}

async function callLLM(prompt) {
  const provider = resolveLLM();
  if (provider === "gemini") {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const res = await getGeminiClient().models.generateContent({ model, contents: prompt });
    return res.text;
  }
  const res = await getAnthropicClient().messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content[0].text;
}

function parseJson(text) {
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch {} }
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]); } catch {} }
  return null;
}

// ── Deterministic helpers ──────────────────────────────────────────

// Stable content-hash ID — same text always gets same ID
function todoId(text) {
  return "t_" + crypto.createHash("md5").update(text.toLowerCase().trim()).digest("hex").slice(0, 8);
}

// Classify an inbox item without LLM
function classifyItem(item) {
  if (item.source === "vault") {
    const p = item.payload?.relativePath || "";
    if (p.startsWith("Templates/") || p.startsWith(".obsidian")) return "skip";
    if (p.startsWith("Daily/"))     return "daily-note";
    return "vault-note";
  }
  if (item.source === "granola")    return "meeting";
  if (item.source === "arduino-in") return "hardware-event";
  return "unknown";
}

// Drop meta-tasks even if the LLM emits them despite prompt rules.
// Each pattern is a lowercase substring match against the action text.
const META_TASK_PATTERNS = [
  /^if\s/i,                    // "If X then..."
  /^determine\s+if\s/i,
  /^review\s+(the\s+)?(content|note|file)\s/i,
  /^plan\s/i,
  /^understand\s/i,
  /^identify\s/i,
  /^check\s+if\s/i,
  /^based\s+on\s/i,
];

function isMetaTask(text) {
  const t = (text || "").trim();
  if (!t) return true;
  if (t.length > 120) return true; // long procedural chains
  return META_TASK_PATTERNS.some((re) => re.test(t));
}

// Deterministic merge: same ID → preserve status, update priority/suggestion
// New ID → insert with status=todo
function mergeTodos(existing, incoming) {
  const byId = new Map(existing.map((t) => [t.id, t]));
  let added = 0;
  for (const t of incoming) {
    if (byId.has(t.id)) {
      // Preserve user-set status; only update LLM-derived fields
      byId.set(t.id, {
        ...byId.get(t.id),
        priority:   t.priority   || byId.get(t.id).priority,
        suggestion: t.suggestion || byId.get(t.id).suggestion,
        dueDate:    t.dueDate    || byId.get(t.id).dueDate,
      });
    } else {
      byId.set(t.id, { status: "todo", ...t });
      added++;
    }
  }
  return { todos: [...byId.values()], added };
}

// ── LLM hops (each focused, each independently failable) ──────────

// Hop 1 — per item: extract concrete actions AND identify existing todos that this item resolves
async function hopExtract(item, openTodos = []) {
  const prompt = `Extract actionable todos from this single inbox item. Be specific and concrete.

RULES:
- Return at most 2 actions per item.
- Each must be a single concrete task the user can do RIGHT NOW (a verb + object, ≤80 chars).
- NO meta-tasks: do not output "Review X", "Determine if Y", "Plan Z", "If W then...", "Understand...". If the only useful action would be a meta-task, return 0 actions.
- Only extract tasks explicitly mentioned in the content. Do not infer follow-ups, tests, or hypotheticals.

CLOSING EXISTING TODOS:
The list below shows the user's currently OPEN todos (status=todo or in_progress). If this inbox item EXPLICITLY states or clearly confirms that one of them is now finished, resolved, sent, shipped, completed, or no longer needed, include its exact ID in "closes". Be conservative — only close on direct evidence (the meeting said "we sent the deck", the note says "fixed", etc.). Do NOT close based on inference, relatedness, or partial overlap. If unsure, return an empty closes array.

OPEN TODOS (id | text | status):
${openTodos.map((t) => `- ${t.id} | ${t.text} | ${t.status}`).join("\n") || "(none)"}

SOURCE: ${item.source}
TYPE: ${item.type}
CONTENT: ${JSON.stringify(item.payload, null, 2)}

Return ONLY valid JSON (no markdown fences):
{
  "actions": [
    { "text": "Specific actionable task", "priority": "high|medium|low", "dueDate": "YYYY-MM-DD or null" }
  ],
  "closes": ["t_xxxxxxxx"],
  "summary": "One sentence describing what this item is about"
}

If nothing is actionable and nothing closes, return { "actions": [], "closes": [], "summary": "..." }.`;

  const text = await callLLM(prompt);
  const result = parseJson(text);
  if (!result) return { actions: [], closes: [], summary: "" };
  return {
    actions: Array.isArray(result.actions) ? result.actions : [],
    closes:  Array.isArray(result.closes)  ? result.closes  : [],
    summary: result.summary || "",
  };
}

// Hop 2 — after all items: reprioritize active todos
async function hopReprioritize(todos) {
  if (!todos.length) return todos;

  const prompt = `Re-rank these todos by urgency and impact. Return the same items with updated priority and an optional suggestion field ("Do Now: ..." or "Delegate: ..."). Keep all IDs unchanged exactly. Do not add or remove items.

TODOS:
${JSON.stringify(todos, null, 2)}

Return ONLY a valid JSON array (no markdown fences).`;

  const text = await callLLM(prompt);
  const reranked = parseJson(text);
  if (!Array.isArray(reranked)) return todos;

  // Defensive merge: only accept priority + suggestion from LLM, preserve everything else
  const byId = new Map(reranked.map((t) => [t.id, t]));
  return todos.map((t) => {
    const r = byId.get(t.id);
    if (!r) return t;
    return { ...t, priority: r.priority || t.priority, suggestion: r.suggestion || t.suggestion };
  });
}

// Hop 3 — after reprioritize: generate nudges
async function hopNudges(todos, nowState) {
  // Only nudge on actionable work: status must be "todo" (not in_progress, not done)
  const high = todos
    .filter((t) => t.priority === "high" && t.status === "todo")
    .slice(0, 5);
  if (!high.length) return [];

  const prompt = `Generate 1-3 nudges for the user right now. Max 40 characters each — they appear on a hardware display.

HIGH PRIORITY TODOS:
${JSON.stringify(high, null, 2)}

CURRENT MODE: ${nowState?.mode || "focus"}
CONTEXT: ${nowState?.context || ""}

Return ONLY a valid JSON array (no markdown fences):
[{ "id": "n_1", "text": "Short nudge under 40 chars", "priority": "high|medium|low" }]`;

  const text = await callLLM(prompt);
  const nudges = parseJson(text);
  return Array.isArray(nudges) ? nudges : [];
}

// Hop 4 — after processing: update daily summary
async function hopSummary(processedItems, todos, nowState, existing) {
  const counts = processedItems.reduce((acc, i) => { acc[i.source] = (acc[i.source] || 0) + 1; return acc; }, {});

  const prompt = `Update the daily summary (2–4 sentences) based on today's activity.

ITEMS PROCESSED: ${JSON.stringify(counts)}
ACTIVE TODOS: ${todos.filter((t) => t.status !== "done").length}
HIGH PRIORITY: ${todos.filter((t) => t.priority === "high" && t.status !== "done").length}
DONE TODAY: ${todos.filter((t) => t.status === "done").length}
MODE: ${nowState?.mode || "focus"}
PREVIOUS SUMMARY: ${existing || "(none)"}

Return ONLY a plain string — no JSON, no markdown.`;

  return await callLLM(prompt);
}

// Hop 5 — periodic garden: assign PARA vaultHints to todos missing them
async function hopGarden(todos, dailySummary) {
  const needsHint = todos.filter((t) => !t.vaultHint && t.status !== "done");
  if (!needsHint.length) return todos;

  const prompt = `You are filing tasks into a PARA knowledge base (Projects, Areas, Resources, Archive).
For each todo below, assign the most appropriate vaultHint — a path like "1 Projects/ProjectName", "2 Areas/AreaName", "3 Resources/TopicName", or "4 Archive".

TODOS NEEDING FILING:
${JSON.stringify(needsHint.map((t) => ({ id: t.id, text: t.text, source: t.source })), null, 2)}

DAILY CONTEXT: ${dailySummary || "(none)"}

Return ONLY a valid JSON array (no markdown fences):
[{ "id": "t_...", "vaultHint": "1 Projects/..." }]`;

  const text = await callLLM(prompt);
  const hints = parseJson(text);
  if (!Array.isArray(hints)) return todos;

  const byId = new Map(hints.map((h) => [h.id, h.vaultHint]));
  return todos.map((t) => byId.has(t.id) ? { ...t, vaultHint: byId.get(t.id) } : t);
}

// ── Orchestrator ──────────────────────────────────────────────────

const GARDEN_INTERVAL_MS = Number(process.env.ALFRED_GARDEN_MS) || 15 * 60 * 1000; // 15 min default

function createSkillRunner({ stateStore, outputHub }) {
  let running = false;
  let pending = [];
  let periodicTimer = null;
  let gardenTimer = null;

  async function run(items) {
    if (running) { pending.push(...items); return; }
    running = true;

    const provider = resolveLLM();

    try {
      await stateStore.patch({ processingStatus: "processing", processingLog: "Starting pipeline..." });
      if (outputHub) await outputHub.publish({ channel: "alfred.processing.started", timestamp: new Date().toISOString(), itemCount: items.length });

      const state = stateStore.get();
      let todos = [...(state.todos || [])];
      const processedItems = [];

      // ── Stage 1: per-item classify → extract → merge ─────────────
      const closedIds = new Set();
      for (const item of items) {
        const kind = classifyItem(item);

        if (kind === "skip") {
          console.log(`[SkillRunner] Skip (template): ${item.payload?.relativePath}`);
          processedItems.push(item); // still drain from inbox
          continue;
        }

        await stateStore.patch({ processingLog: `[${provider}] Extracting from ${item.source} (${kind})...` });

        // Open todos (non-done) are passed so the LLM can decide if this item closes any.
        const openTodos = todos.filter((t) => t.status !== "done");

        let extracted = { actions: [], closes: [], summary: "" };
        try {
          extracted = await hopExtract(item, openTodos);
          console.log(`[SkillRunner] Extracted ${extracted.actions?.length || 0} action(s), ${extracted.closes?.length || 0} close(s) from ${item.source}`);
        } catch (err) {
          console.error(`[SkillRunner] Extract failed (${item.source}):`, err.message);
        }

// Apply closes: only valid IDs, only items currently not already done.
        if (extracted.closes?.length) {
          const validIds = new Set(openTodos.map((t) => t.id));
          const accepted = [];
          for (const id of extracted.closes) {
            if (typeof id !== "string" || !validIds.has(id) || closedIds.has(id)) continue;
            closedIds.add(id);
            accepted.push(id);
            todos = todos.map((t) =>
              t.id === id
                ? { ...t, status: "done", closedAt: new Date().toISOString(), closedBy: item.source }
                : t
            );
          }
          if (accepted.length > 0) {
            console.log(`[SkillRunner] Closing ${accepted.length} todo(s) [${accepted.join(", ")}] based on ${item.source}`);
          }
        }

        if (extracted.actions?.length) {
          const incoming = extracted.actions
            .filter((a) => !isMetaTask(a.text))
            .map((a) => ({
              id:       todoId(a.text),
              text:     a.text,
              priority: a.priority || "medium",
              source:   item.source,
              dueDate:  a.dueDate || null,
            }));
          const dropped = extracted.actions.length - incoming.length;
          if (dropped > 0) console.log(`[SkillRunner] Dropped ${dropped} meta-task(s)`);
          if (incoming.length) {
            const merged = mergeTodos(todos, incoming);
            todos = merged.todos;
            if (merged.added) console.log(`[SkillRunner] Merged ${merged.added} new todo(s)`);
          }
        }

        processedItems.push(item);
      }

      // ── Stage 2: reprioritize (if anything was processed) ─────────
      const activeTodos = todos.filter((t) => t.status !== "done");
      if (processedItems.length > 0 && activeTodos.length > 0) {
        await stateStore.patch({ processingLog: `[${provider}] Reprioritizing ${activeTodos.length} todo(s)...` });
        try {
          const reranked = await hopReprioritize(activeTodos);
          const byId = new Map(reranked.map((t) => [t.id, t]));
          todos = todos.map((t) => byId.has(t.id) ? { ...t, ...byId.get(t.id), status: t.status } : t);
        } catch (err) {
          console.error("[SkillRunner] Reprioritize failed:", err.message);
        }
      }

      // ── Stage 3: nudges ───────────────────────────────────────────
      const ackedNudges = (state.nudges || []).filter((n) => n.acked);
      let activeNudges  = (state.nudges || []).filter((n) => !n.acked);
      const hadNudges   = activeNudges.length;

      if (processedItems.length > 0) {
        await stateStore.patch({ processingLog: `[${provider}] Generating nudges...` });
        try {
          const fresh = await hopNudges(todos, state.nowState);
          if (fresh.length) activeNudges = fresh;
        } catch (err) {
          console.error("[SkillRunner] Nudge generation failed:", err.message);
        }
      }

      // ── Stage 4: daily summary ────────────────────────────────────
      let dailySummary = state.dailySummary;
      if (processedItems.length > 0) {
        try {
          dailySummary = await hopSummary(processedItems, todos, state.nowState, state.dailySummary);
        } catch (err) {
          console.error("[SkillRunner] Summary failed:", err.message);
        }
      }

      // ── Atomic state patch ────────────────────────────────────────
      const pendingBuzzer = activeNudges.length > hadNudges;
      const activeTodoCount = todos.filter((t) => t.status !== "done").length;

      await stateStore.patch({
        processingStatus: "idle",
        processingLog: `Done. ${processedItems.length} item(s) → ${activeTodoCount} active todo(s), ${activeNudges.length} nudge(s).`,
        todos,
        nudges: [...activeNudges, ...ackedNudges],
        dailySummary,
        // nowState intentionally NOT touched — use POST /api/alfred/set-mode
        pendingBuzzer,
        lastProcessedAt: new Date().toISOString(),
      });

      // Drain processed items from inbox
      if (processedItems.length > 0) await stateStore.drainInbox(processedItems);

      if (outputHub) await outputHub.publish({
        channel: "alfred.processing.done",
        timestamp: new Date().toISOString(),
        todoCount: activeTodoCount,
        nudgeCount: activeNudges.length,
        pendingBuzzer,
      });

    } catch (err) {
      console.error("[SkillRunner] Fatal error:", err.message);
      await stateStore.patch({ processingStatus: "idle", processingLog: `Error: ${err.message}` });
    } finally {
      running = false;
      if (pending.length > 0) {
        const next = pending.splice(0);
        pending = [];
        setImmediate(() => run(next));
      }
    }
  }

  async function runGarden() {
    if (running) { console.log("[Garden] Skipping — main pipeline busy"); return; }
    const state = stateStore.get();
    const todos = state.todos || [];
    const needsHint = todos.filter((t) => !t.vaultHint && t.status !== "done");
    if (!needsHint.length) { console.log("[Garden] All todos already filed"); return; }

    console.log(`[Garden] Filing ${needsHint.length} todo(s) into PARA...`);
    await stateStore.patch({ processingLog: `[Garden] Filing ${needsHint.length} todo(s) into PARA...` });
    if (outputHub) await outputHub.publish({ channel: "alfred.garden.started", timestamp: new Date().toISOString() });

    try {
      const gardened = await hopGarden(todos, state.dailySummary);
      const filed = gardened.filter((t) => t.vaultHint && !todos.find((o) => o.id === t.id)?.vaultHint).length;
      await stateStore.patch({ todos: gardened, processingLog: `[Garden] Filed ${filed} todo(s) into PARA.` });
      console.log(`[Garden] Done — filed ${filed} todo(s)`);
      if (outputHub) await outputHub.publish({ channel: "alfred.garden.done", timestamp: new Date().toISOString(), filed });
    } catch (err) {
      console.error("[Garden] Error:", err.message);
      await stateStore.patch({ processingLog: `[Garden] Error: ${err.message}` });
    }
  }

  return {
    async processNewItems(items) {
      await run(items);
    },

    async runGarden() {
      await runGarden();
    },

    startPeriodic(intervalMs = 60000) {
      periodicTimer = setInterval(async () => {
        const state = stateStore.get();
        if ((state.inbox || []).length > 0 && !running) {
          await run(state.inbox.slice());
        }
      }, intervalMs);

      // Garden timer — independent, fires every ALFRED_GARDEN_MS
      console.log(`[Garden] Scheduling every ${GARDEN_INTERVAL_MS / 60000}min`);
      gardenTimer = setInterval(() => {
        runGarden().catch((e) => console.error("[Garden] Timer error:", e.message));
      }, GARDEN_INTERVAL_MS);
    },

    stopPeriodic() {
      if (periodicTimer) { clearInterval(periodicTimer); periodicTimer = null; }
      if (gardenTimer)   { clearInterval(gardenTimer);   gardenTimer = null; }
    },
  };
}

module.exports = { createSkillRunner };
