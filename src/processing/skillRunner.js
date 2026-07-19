const Anthropic = require("@anthropic-ai/sdk");
const { GoogleGenAI } = require("@google/genai");

function resolveLLM() {
  const pref = (process.env.ALFRED_LLM || "").toLowerCase();
  if (pref === "gemini") return "gemini";
  if (pref === "claude") return "claude";
  if (process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return "gemini";
  return "claude";
}

function createSkillRunner({ stateStore, outputHub }) {
  let anthropicClient = null;
  let geminiClient = null;
  let running = false;
  let pending = [];
  let periodicTimer = null;

  function getAnthropicClient() {
    if (!anthropicClient) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
      anthropicClient = new Anthropic();
    }
    return anthropicClient;
  }

  function getGeminiClient() {
    if (!geminiClient) {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
      geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return geminiClient;
  }

  async function callLLM(prompt) {
    const provider = resolveLLM();
    if (provider === "gemini") {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const interaction = await getGeminiClient().models.generateContent({
        model,
        contents: prompt,
      });
      return interaction.text;
    }
    const res = await getAnthropicClient().messages.create({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    return res.content[0].text;
  }

  function buildPrompt(state, newItems) {
    const todosJson = JSON.stringify(state.todos || [], null, 2);
    const nudgesJson = JSON.stringify((state.nudges || []).filter((n) => !n.acked), null, 2);
    const items = newItems.map((item, i) => `${i + 1}. [${item.source}] ${JSON.stringify(item, null, 2)}`).join("\n\n");

    return `You are Alfred, a personal knowledge and task orchestration system. Process the following new inbox items and update the user's state.

CURRENT STATE:
Daily Summary: ${state.dailySummary || "None yet"}
Active TODOs: ${todosJson}
Active Nudges: ${nudgesJson}
Now State: ${JSON.stringify(state.nowState || {})}

NEW INBOX ITEMS:
${items || "(none — periodic reprocessing)"}

Run the following skills:
1. CREATE TODO/REMINDERS: Extract actionable todos. Merge with existing; don't duplicate. Assign priority (high/medium/low) and status (todo).
2. REPRIORITIZE: Re-rank all todos by urgency. Return the full updated list.
3. GET THINGS DONE: For each high-priority todo, add a suggestion field: "Delegate: <to whom>" or "Do Now: <first step>".
4. GENERATE NUDGES: Identify top 1-3 most important nudges the user needs right now. Keep text under 40 chars for hardware display.
5. GARDEN KNOWLEDGEBASE: Note any items that should be filed to PARA (just add a vaultHint field to relevant todos).
6. DAILY NOTES: Write/update today's daily summary (2-4 sentences).

Preserve existing todo IDs. Generate new IDs for new items (t_<number>). Preserve acked nudges unchanged; generate new nudge IDs (n_<number>).

Return ONLY valid JSON, no markdown fences:
{
  "todos": [{ "id": "t1", "text": "...", "status": "todo|in_progress|done", "priority": "high|medium|low", "source": "granola|vault|arduino", "suggestion": "Do Now: ..." }],
  "nudges": [{ "id": "n1", "text": "...", "priority": "high|medium|low" }],
  "dailySummary": "...",
  "nowState": { "mode": "focus|meeting|sparring", "context": "..." },
  "processingLog": "Processed N items. Added X todos, Y nudges."
}`;
  }

  function parseResponse(text) {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {
      console.error("Skill runner: failed to parse Claude response:", e.message);
    }
    return null;
  }

  async function run(items) {
    if (running) {
      pending.push(...items);
      return;
    }
    running = true;

    try {
      await stateStore.patch({
        processingStatus: "processing",
        processingLog: `Processing ${items.length} new item(s)...`,
      });

      if (outputHub) {
        await outputHub.publish({
          channel: "alfred.processing.started",
          timestamp: new Date().toISOString(),
          itemCount: items.length,
        });
      }

      const state = stateStore.get();
      const prompt = buildPrompt(state, items);

      const provider = resolveLLM();
      console.log(`[SkillRunner] Using LLM: ${provider}`);
      let result = null;
      try {
        const text = await callLLM(prompt);
        result = parseResponse(text);
      } catch (err) {
        console.error(`Skill runner: ${provider} API error:`, err.message);
        await stateStore.patch({
          processingStatus: "idle",
          processingLog: `${provider} error: ${err.message}`,
        });
        return;
      }

      if (!result) {
        await stateStore.patch({
          processingStatus: "idle",
          processingLog: `Could not parse ${provider} response`,
        });
        return;
      }

      const hadNudges = (state.nudges || []).filter((n) => !n.acked).length;
      const newNudgeCount = (result.nudges || []).length;
      const pendingBuzzer = newNudgeCount > hadNudges;

      // Merge acked nudges back in
      const ackedNudges = (state.nudges || []).filter((n) => n.acked);
      const allNudges = [...(result.nudges || []), ...ackedNudges];

      await stateStore.patch({
        processingStatus: "idle",
        processingLog: result.processingLog || `Done. ${newNudgeCount} nudge(s).`,
        dailySummary: result.dailySummary || state.dailySummary,
        todos: result.todos || state.todos,
        nudges: allNudges,
        nowState: result.nowState || state.nowState,
        pendingBuzzer,
        lastProcessedAt: new Date().toISOString(),
      });

      // Drain processed items from inbox
      if (items.length > 0) await stateStore.drainInbox(items);

      if (outputHub) {
        await outputHub.publish({
          channel: "alfred.processing.done",
          timestamp: new Date().toISOString(),
          todoCount: (result.todos || []).length,
          nudgeCount: newNudgeCount,
          pendingBuzzer,
        });
      }
    } catch (err) {
      console.error("Skill runner error:", err.message);
      await stateStore.patch({
        processingStatus: "idle",
        processingLog: `Error: ${err.message}`,
      });
    } finally {
      running = false;
      if (pending.length > 0) {
        const next = pending.splice(0);
        pending = [];
        setImmediate(() => run(next));
      }
    }
  }

  return {
    async processNewItems(items) {
      await run(items);
    },

    startPeriodic(intervalMs = 60000) {
      periodicTimer = setInterval(async () => {
        const state = stateStore.get();
        if ((state.inbox || []).length > 0 && !running) {
          await run([]);
        }
      }, intervalMs);
    },

    stopPeriodic() {
      if (periodicTimer) {
        clearInterval(periodicTimer);
        periodicTimer = null;
      }
    },
  };
}

module.exports = { createSkillRunner };
