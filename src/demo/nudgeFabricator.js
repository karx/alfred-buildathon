const crypto = require("crypto");

/** Named demo packs for on-stage / on-demand hardware demos. */
const SCENARIOS = {
  critical: [
    { text: "Finalize Arduino firmware", priority: "high" },
  ],
  buildathon: [
    { text: "Ship Alfred demo now", priority: "high" },
    { text: "Test Granola end-to-end", priority: "high" },
    { text: "Prep live demo script", priority: "medium" },
  ],
  meeting: [
    { text: "Wrap meeting — capture notes", priority: "high" },
  ],
  focus: [
    { text: "Protect focus block 25m", priority: "medium" },
  ],
  queue: [
    { text: "Do the next critical task", priority: "high" },
    { text: "Clear inbox before noon", priority: "medium" },
    { text: "Book team offsite", priority: "low" },
  ],
  buzzer: [
    { text: "DEMO NUDGE — press ACK", priority: "high" },
  ],
};

function makeNudgeId() {
  return "n_demo_" + crypto.randomBytes(4).toString("hex");
}

/**
 * Build a single nudge object ready for state.
 * text is clipped to 40 chars (hardware display budget).
 */
function createNudge({ text, priority = "high", id, source = "demo" } = {}) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  return {
    id: id || makeNudgeId(),
    text: trimmed.slice(0, 40),
    priority: ["high", "medium", "low"].includes(priority) ? priority : "high",
    acked: false,
    source: source || "demo",
    fabricatedAt: new Date().toISOString(),
  };
}

/**
 * Resolve fabricate request body into nudge objects.
 *
 * Body shapes:
 *   { scenario: "buildathon" }
 *   { text: "Ship it", priority: "high" }
 *   { nudges: [{ text, priority }] }
 *   { scenario: "buildathon", text: "extra custom" }  // scenario + optional custom
 */
function resolveFabricateRequest(body = {}) {
  const replace = Boolean(body.replace);
  const source = body.source || "demo";
  const list = [];

  if (Array.isArray(body.nudges) && body.nudges.length) {
    for (const n of body.nudges) {
      const nudge = createNudge({ ...n, source });
      if (nudge) list.push(nudge);
    }
  }

  if (body.scenario) {
    const pack = SCENARIOS[String(body.scenario).toLowerCase()];
    if (!pack) {
      return {
        ok: false,
        message: `Unknown scenario "${body.scenario}". Valid: ${Object.keys(SCENARIOS).join(", ")}`,
        nudges: [],
        replace,
      };
    }
    for (const n of pack) {
      const nudge = createNudge({ ...n, source });
      if (nudge) list.push(nudge);
    }
  }

  if (body.text) {
    const nudge = createNudge({
      text: body.text,
      priority: body.priority || "high",
      id: body.id,
      source,
    });
    if (nudge) list.push(nudge);
  }

  if (!list.length) {
    return {
      ok: false,
      message: 'Provide scenario, text, or nudges[]. Scenarios: ' + Object.keys(SCENARIOS).join(", "),
      nudges: [],
      replace,
      scenarios: Object.keys(SCENARIOS),
    };
  }

  return { ok: true, nudges: list, replace, message: `Fabricated ${list.length} nudge(s)` };
}

function listScenarios() {
  return Object.fromEntries(
    Object.entries(SCENARIOS).map(([id, nudges]) => [
      id,
      nudges.map((n) => ({ text: n.text, priority: n.priority })),
    ])
  );
}

module.exports = {
  SCENARIOS,
  createNudge,
  resolveFabricateRequest,
  listScenarios,
  makeNudgeId,
};
