const fs = require("fs");
const path = require("path");

const ALFRED_DIR = "Alfred";
const DEBOUNCE_MS = 2000;

// ── Formatters ────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function checkbox(status) {
  if (status === "done")        return "x";
  if (status === "in_progress") return "~";
  return " ";
}

function priLabel(p) {
  const pl = (p || "").toLowerCase();
  if (pl === "critical" || pl === "high") return "🔴";
  if (pl === "medium")                    return "🟡";
  return "🟢";
}

function todoLine(t) {
  const meta = [
    t.id        ? `id:${t.id}`         : null,
    t.dueDate   ? `due:${t.dueDate}`   : null,
    t.source    ? `src:${t.source}`    : null,
    t.vaultHint ? `para:${t.vaultHint}`: null,
  ].filter(Boolean).join(" ");

  let line = `- [${checkbox(t.status)}] ${t.text}${meta ? ` <!-- ${meta} -->` : ""}`;
  if (t.suggestion) line += `\n  > ${t.suggestion}`;
  return line;
}

function buildTodosMarkdown(state) {
  const todos   = state.todos || [];
  const updated = state.lastProcessedAt || new Date().toISOString();

  const active = todos.filter(t => t.status !== "done");
  const done   = todos.filter(t => t.status === "done");

  // Group active todos by priority tier
  const tiers = [
    { label: "Critical / High", match: p => ["critical","high"].includes((p||"").toLowerCase()) },
    { label: "Medium",           match: p => (p||"").toLowerCase() === "medium" },
    { label: "Low",              match: p => !["critical","high","medium"].includes((p||"").toLowerCase()) },
  ];

  const lines = [
    "---",
    "alfred: todos",
    `updated: ${updated}`,
    "---",
    "",
    "# Alfred TODOs",
    "",
    `> Synced: ${updated}  `,
    `> Active: ${active.length} | Done: ${done.length}`,
    "",
  ];

  let anyActive = false;
  for (const tier of tiers) {
    const items = active.filter(t => tier.match(t.priority));
    if (!items.length) continue;
    anyActive = true;
    const emoji = tier.label.startsWith("Critical") ? "🔴" : tier.label.startsWith("Medium") ? "🟡" : "🟢";
    lines.push(`## ${emoji} ${tier.label}`, "");
    for (const t of items) lines.push(todoLine(t));
    lines.push("");
  }

  if (!anyActive) {
    lines.push("_No active todos._", "");
  }

  if (done.length) {
    lines.push("## ✅ Done", "");
    for (const t of done) lines.push(todoLine(t));
    lines.push("");
  }

  return lines.join("\n");
}

function buildDailyMarkdown(state) {
  const date       = today();
  const updated    = state.lastProcessedAt || new Date().toISOString();
  const nudges     = (state.nudges || []).filter(n => !n.acked);
  const ackedNudges= (state.nudges || []).filter(n => n.acked);
  const active     = (state.todos || []).filter(t => t.status !== "done");
  const mode       = state.nowState?.mode    || "focus";
  const ctx        = state.nowState?.context || "";

  const lines = [
    "---",
    "alfred: daily",
    `date: ${date}`,
    `updated: ${updated}`,
    `mode: ${mode}`,
    "---",
    "",
    `# ${date}`,
    "",
    "## Summary",
    "",
    state.dailySummary || "_Not yet generated._",
    "",
    "## Mode",
    "",
    `**${mode.toUpperCase()}**${ctx ? " — " + ctx : ""}`,
    "",
    `## Active Tasks (${active.length})`,
    "",
  ];

  if (active.length) {
    const high = active.filter(t => ["critical","high"].includes((t.priority||"").toLowerCase()));
    const rest = active.filter(t => !["critical","high"].includes((t.priority||"").toLowerCase()));
    for (const t of [...high, ...rest].slice(0, 15)) {
      lines.push(`- [${checkbox(t.status)}] ${priLabel(t.priority)} ${t.text}`);
    }
    if (active.length > 15) lines.push(`- _…and ${active.length - 15} more_`);
  } else {
    lines.push("_No active tasks._");
  }

  lines.push("", "## Active Nudges", "");
  if (nudges.length) {
    for (const n of nudges) lines.push(`- **[${n.priority}]** ${n.text}`);
  } else {
    lines.push("_No active nudges._");
  }

  if (ackedNudges.length) {
    lines.push("", "## Acknowledged Nudges", "");
    for (const n of ackedNudges) lines.push(`- [x] ${n.text}`);
  }

  lines.push("", "---", "_Managed by Alfred — last synced: " + updated + "_", "");

  return lines.join("\n");
}

function buildSeenMeetingsMarkdown(state) {
  const ids     = state.seenMeetingIds || [];
  const updated = new Date().toISOString();

  const lines = [
    "---",
    "alfred: seen-meetings",
    `updated: ${updated}`,
    "---",
    "",
    "# Seen Meeting IDs",
    "",
    "Alfred uses this file to track which Granola meetings have been processed.",
    "**Do not delete** — Alfred reads this on startup to avoid reprocessing meetings.",
    "",
  ];

  if (ids.length) {
    for (const id of ids) lines.push(`- ${id}`);
  } else {
    lines.push("_(none yet)_");
  }

  lines.push("", `---`, `_Last updated: ${updated}_`, "");
  return lines.join("\n");
}

// ── Recovery: read seen meetings back from vault on startup ──────────────────

async function readSeenMeetingsFromVault(vaultPath) {
  const filePath = path.join(vaultPath, ALFRED_DIR, "seen-meetings.md");
  try {
    const content = await fs.promises.readFile(filePath, "utf8");
    const ids = [];
    for (const line of content.split("\n")) {
      const m = line.match(/^- (.+)$/);
      if (m && m[1] && !m[1].startsWith("_")) ids.push(m[1].trim());
    }
    return ids;
  } catch {
    return null; // file doesn't exist yet
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function createVaultStateSync({ settingsStore, stateStore }) {
  let debounceTimer = null;
  let _vaultPath    = null;

  function getVaultPath() {
    if (_vaultPath) return _vaultPath;
    const adapters = settingsStore.get().adapters || {};
    _vaultPath = adapters.vault?.config?.vaultPath || null;
    return _vaultPath;
  }

  async function writeFile(relPath, content) {
    const vp = getVaultPath();
    if (!vp) return;
    const fullPath = path.join(vp, relPath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, content, "utf8");
  }

  async function sync(state) {
    const vp = getVaultPath();
    if (!vp) return;

    try {
      await Promise.all([
        writeFile(path.join(ALFRED_DIR, "todos.md"),                  buildTodosMarkdown(state)),
        writeFile(path.join(ALFRED_DIR, `daily-${today()}.md`),       buildDailyMarkdown(state)),
        writeFile(path.join(ALFRED_DIR, "seen-meetings.md"),           buildSeenMeetingsMarkdown(state)),
      ]);
      console.log(`[VaultSync] → ${vp}/${ALFRED_DIR}/ (todos, daily, seen-meetings)`);
    } catch (err) {
      console.error("[VaultSync] Write error:", err.message);
    }
  }

  function scheduleSync(state) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => sync(state), DEBOUNCE_MS);
  }

  return {
    async start() {
      const vp = getVaultPath();

      // Startup recovery: if seenMeetingIds is empty, try to restore from vault
      if (vp) {
        const state = stateStore.get();
        if ((state.seenMeetingIds || []).length === 0) {
          const recovered = await readSeenMeetingsFromVault(vp);
          if (recovered && recovered.length > 0) {
            await stateStore.patch({ seenMeetingIds: recovered });
            console.log(`[VaultSync] Restored ${recovered.length} seen meeting ID(s) from vault`);
          }
        }
      }

      stateStore.onChange(state => scheduleSync(state));
      console.log(`[VaultSync] Active → ${vp || "(vault not configured)"}/${ALFRED_DIR}/`);
    },

    async syncNow() {
      await sync(stateStore.get());
    },

    stop() {
      clearTimeout(debounceTimer);
    },
  };
}

module.exports = { createVaultStateSync, ALFRED_DIR };
