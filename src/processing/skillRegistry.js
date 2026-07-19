/**
 * Named skill registry — SKILLS_DESIGN.md Phase 1.
 * Embedded hops (runnable) + ADHD-pack stubs (not runnable yet).
 */

const EMBEDDED_SKILL_IDS = [
  "garden-kb",
  "create-todos",
  "reprioritize",
  "generate-nudges",
  "daily-notes",
];

/** @type {Array<{
 *   id: string,
 *   label: string,
 *   description: string,
 *   trigger: "schedule"|"event"|"intent",
 *   defaultEnabled: boolean,
 *   runnable: boolean,
 *   stub?: boolean,
 *   source?: string,
 *   schedule?: string,
 *   intervalMs?: number,
 * }>} */
const SKILL_REGISTRY = [
  // ── Embedded Alfred hops (runnable) ─────────────────────────────
  {
    id: "garden-kb",
    label: "Garden Knowledgebase",
    description: "Assign PARA vaultHint paths to open todos missing filing.",
    trigger: "schedule",
    defaultEnabled: true,
    runnable: true,
    source: "alfred",
    schedule: "0 8,20 * * *",
  },
  {
    id: "create-todos",
    label: "Create TODOs",
    description: "Extract concrete actions from inbox items (hopExtract).",
    trigger: "event",
    defaultEnabled: true,
    runnable: true,
    source: "alfred",
  },
  {
    id: "reprioritize",
    label: "Reprioritize",
    description: "Re-rank open todos by urgency and impact.",
    trigger: "event",
    defaultEnabled: true,
    runnable: true,
    source: "alfred",
  },
  {
    id: "generate-nudges",
    label: "Generate Nudges",
    description: "Produce short hardware-display nudges for high-priority todos.",
    trigger: "event",
    defaultEnabled: true,
    runnable: true,
    source: "alfred",
  },
  {
    id: "daily-notes",
    label: "Daily Notes",
    description: "Update the daily summary narrative from today's activity.",
    trigger: "schedule",
    defaultEnabled: true,
    runnable: true,
    source: "alfred",
    schedule: "0 21 * * *",
  },

  // ── ADHD Chief-of-Staff pack (stubs — not runnable yet) ─────────
  {
    id: "daily-triage",
    label: "Daily Triage",
    description: "ADHD CoS lane assignment (top-3, 70% cap). Stub.",
    trigger: "schedule",
    defaultEnabled: true,
    runnable: false,
    stub: true,
    source: "adhd-cos",
    schedule: "30 8 * * *",
  },
  {
    id: "gtd",
    label: "Get Things Done",
    description: "Periodic GTD sweep when open todos exist. Stub.",
    trigger: "schedule",
    defaultEnabled: true,
    runnable: false,
    stub: true,
    source: "adhd-cos",
    intervalMs: 1_800_000,
  },
  {
    id: "interruption-recovery",
    label: "Interruption Recovery",
    description: "Recover context after meetings or mode toggles. Stub.",
    trigger: "event",
    defaultEnabled: true,
    runnable: false,
    stub: true,
    source: "adhd-cos",
  },
  {
    id: "task-activation",
    label: "Task Activation",
    description: "Break a todo into micro-steps + first 30s action. Stub.",
    trigger: "intent",
    defaultEnabled: true,
    runnable: false,
    stub: true,
    source: "adhd-cos",
  },
  {
    id: "sparring-mode",
    label: "Sparring Mode",
    description: "Interactive sparring session with Alfred. Stub.",
    trigger: "intent",
    defaultEnabled: true,
    runnable: false,
    stub: true,
    source: "adhd-cos",
  },
  {
    id: "focus-companion",
    label: "Focus Companion",
    description: "Companion support during focus sessions. Stub.",
    trigger: "intent",
    defaultEnabled: false,
    runnable: false,
    stub: true,
    source: "adhd-cos",
  },
  {
    id: "delegation-router",
    label: "Delegation Router",
    description: "Route Delegate: suggestions to candidates. Stub.",
    trigger: "intent",
    defaultEnabled: true,
    runnable: false,
    stub: true,
    source: "adhd-cos",
  },
  {
    id: "shutdown-review",
    label: "Shutdown Review",
    description: "End-of-day shutdown ritual. Stub.",
    trigger: "intent",
    defaultEnabled: false,
    runnable: false,
    stub: true,
    source: "adhd-cos",
  },
  {
    id: "evidence-coping",
    label: "Evidence-Guided Coping",
    description: "Coping prompts grounded in past evidence. Stub.",
    trigger: "intent",
    defaultEnabled: false,
    runnable: false,
    stub: true,
    source: "adhd-cos",
  },
  {
    id: "ethical-gamification",
    label: "Ethical Gamification",
    description: "Light positive reinforcement on todo.done. Stub.",
    trigger: "event",
    defaultEnabled: false,
    runnable: false,
    stub: true,
    source: "adhd-cos",
  },
];

const byId = new Map(SKILL_REGISTRY.map((s) => [s.id, s]));

function getSkill(id) {
  return byId.get(id) || null;
}

function listSkills() {
  return SKILL_REGISTRY.map((s) => ({ ...s }));
}

function isRunnable(id) {
  const s = byId.get(id);
  return Boolean(s && s.runnable);
}

/** Default settings.skills block from registry defaults. */
function defaultSkillSettings() {
  const out = {};
  for (const s of SKILL_REGISTRY) {
    const entry = { enabled: s.defaultEnabled };
    if (s.schedule) entry.schedule = s.schedule;
    if (s.intervalMs) entry.intervalMs = s.intervalMs;
    out[s.id] = entry;
  }
  return out;
}

module.exports = {
  SKILL_REGISTRY,
  EMBEDDED_SKILL_IDS,
  getSkill,
  listSkills,
  isRunnable,
  defaultSkillSettings,
};
