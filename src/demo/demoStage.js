const crypto = require("crypto");
const { createNudge, SCENARIOS } = require("./nudgeFabricator");

function todoId(seed) {
  return "t_demo_" + crypto.createHash("md5").update(String(seed)).digest("hex").slice(0, 8);
}

function createTodo({ text, priority = "high", status = "todo", suggestion = "", vaultHint = "", source = "demo" }) {
  return {
    id: todoId(text),
    text,
    priority,
    status,
    suggestion,
    vaultHint,
    source,
    fabricatedAt: new Date().toISOString(),
  };
}

function boardTodos() {
  return [
    createTodo({ text: "Ship Alfred demo now", priority: "Critical", status: "todo", suggestion: "Do Now" }),
    createTodo({ text: "Test Granola end-to-end", priority: "Critical", status: "todo", suggestion: "Do Now" }),
    createTodo({ text: "Prepare live demo script", priority: "High", status: "in_progress", suggestion: "Draft beats" }),
    createTodo({ text: "Wire Arduino ACK path", priority: "High", status: "done", suggestion: "Verified" }),
    createTodo({ text: "Book team offsite", priority: "Low", status: "todo", suggestion: "Later" }),
  ];
}

/**
 * Full backstage demo packs — seed a complete working Alfred world.
 */
const STAGE_PACKS = {
  full: {
    label: "Full Working Demo",
    description: "Todos, active nudge, daily brief, focus mode — ready for /live + hardware",
    mode: "focus",
    context: "Buildathon demo",
    dailySummary:
      "Demo day: Alfred is tracking critical buildathon work, hardware ACK path, and Granola ingest. One high-priority nudge is live on the desk controller.",
    todos: [
      createTodo({
        text: "Finalize Arduino firmware for Alfred",
        priority: "Critical",
        status: "in_progress",
        suggestion: "Do Now: hardware ACK + LED path for the stage demo",
        vaultHint: "1 Projects/Alfred Buildathon Prep",
      }),
      createTodo({
        text: "Test Granola end-to-end with Alfred",
        priority: "Critical",
        status: "todo",
        suggestion: "Do Now: poll meetings, confirm vault notes land",
        vaultHint: "1 Projects/Granola Alfred Integration",
      }),
      createTodo({
        text: "Prepare live demo script for Alfred",
        priority: "High",
        status: "todo",
        suggestion: "Walkthrough: Settings → Live → hardware ACK",
        vaultHint: "1 Projects/Alfred Buildathon Prep",
      }),
      createTodo({
        text: "Send investor deck",
        priority: "Critical",
        status: "todo",
        suggestion: "Park until after demo block",
        vaultHint: "1 Projects/Fundraising",
      }),
      createTodo({
        text: "Book team offsite for August 2026",
        priority: "Low",
        status: "done",
        suggestion: "Completed earlier",
        vaultHint: "1 Projects/Team",
      }),
    ],
    nudges: [
      createNudge({ text: "DEMO NUDGE — press ACK", priority: "high" }),
      createNudge({ text: "Ship Alfred demo now", priority: "high" }),
    ],
    processingLog: "[demo] Full stage loaded — hardware ready",
  },

  hardware: {
    label: "Hardware Buzzer",
    description: "Single active nudge for LED/display/buzzer + ACK path",
    mode: "focus",
    context: "Hardware demo",
    dailySummary: "Hardware path live: /api/state shows the active nudge; press ACK on desk controller.",
    todos: [
      createTodo({
        text: "Demonstrate hardware nudge ACK",
        priority: "Critical",
        status: "in_progress",
        suggestion: "Watch LED go green after ACK",
      }),
    ],
    nudges: SCENARIOS.buzzer.map((n) => createNudge(n)),
    processingLog: "[demo] Hardware buzzer stage loaded",
  },

  meeting: {
    label: "In Meeting",
    description: "Blue LED meeting mode + wrap-up nudge",
    mode: "meeting",
    context: "Investor sync",
    dailySummary: "Currently in a meeting. Alfred will surface wrap-up capture when you leave meeting mode.",
    todos: [
      createTodo({
        text: "Capture meeting action items",
        priority: "High",
        status: "todo",
        suggestion: "After meeting: dump notes to vault",
      }),
      createTodo({
        text: "Send investor deck",
        priority: "Critical",
        status: "todo",
        suggestion: "Follow up post-call",
      }),
    ],
    nudges: SCENARIOS.meeting.map((n) => createNudge(n)),
    processingLog: "[demo] Meeting stage loaded",
  },

  focus: {
    label: "Focus Block",
    description: "Focus mode + protect-focus nudge",
    mode: "focus",
    context: "Deep work 25m",
    dailySummary: "Focus companion active. Protect the block; one soft nudge if attention drifts.",
    todos: [
      createTodo({
        text: "Deep work: Alfred demo polish",
        priority: "High",
        status: "in_progress",
        suggestion: "Stay on the critical path only",
      }),
    ],
    nudges: SCENARIOS.focus.map((n) => createNudge(n)),
    processingLog: "[demo] Focus stage loaded",
  },

  board: {
    label: "Task Board Only",
    description: "Rich TODO board for /live, no urgent buzzer",
    mode: "focus",
    context: "Planning",
    dailySummary: "Task board staged for walkthrough. No active hardware buzzer.",
    todos: boardTodos(),
    nudges: [],
    clearNudges: true,
    processingLog: "[demo] Task board stage loaded",
  },

  reset: {
    label: "Reset Demo Data",
    description: "Remove demo todos/nudges; restore idle focus",
    mode: "focus",
    context: "",
    dailySummary: "",
    todos: null,
    nudges: null,
    resetDemo: true,
    processingLog: "[demo] Demo data cleared",
  },
};

function listStagePacks() {
  return Object.fromEntries(
    Object.entries(STAGE_PACKS).map(([id, pack]) => [
      id,
      { label: pack.label, description: pack.description },
    ])
  );
}

function resolveStagePack(packId = "full") {
  const id = String(packId || "full").toLowerCase();
  const pack = STAGE_PACKS[id];
  if (!pack) {
    return {
      ok: false,
      message: `Unknown stage pack "${packId}". Valid: ${Object.keys(STAGE_PACKS).join(", ")}`,
      packs: listStagePacks(),
    };
  }

  return {
    ok: true,
    packId: id,
    label: pack.label,
    message: `Stage pack "${pack.label}" ready`,
    pack,
  };
}

function buildStageApplication(pack, { replaceTodos = true } = {}) {
  return {
    resetDemo: Boolean(pack.resetDemo),
    replaceTodos,
    clearNudges: Boolean(pack.clearNudges) || pack.nudges === null,
    nowState: { mode: pack.mode || "focus", context: pack.context || "" },
    dailySummary: pack.dailySummary != null ? pack.dailySummary : undefined,
    processingStatus: "idle",
    processingLog: pack.processingLog || "[demo] stage applied",
    todos: pack.todos,
    nudges: pack.nudges,
    pendingBuzzer: Array.isArray(pack.nudges) && pack.nudges.length > 0,
    lastProcessedAt: new Date().toISOString(),
  };
}

module.exports = {
  STAGE_PACKS,
  listStagePacks,
  resolveStagePack,
  buildStageApplication,
  createTodo,
};
