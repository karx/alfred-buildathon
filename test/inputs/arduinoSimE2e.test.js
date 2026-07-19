const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStateStore } = require("../../src/state/stateStore");
const { createSettingsStore } = require("../../src/settings/settingsStore");
const { createOutputHub } = require("../../src/outputs/outputHub");
const { createInputHub } = require("../../src/inputs/inputHub");
const { createLocalServer } = require("../../src/server/localServer");
const { createPipeline } = require("../../src/pipeline/pipeline");
const { resolveFabricateRequest } = require("../../src/demo/nudgeFabricator");

const SECRET = "dev-secret";
const DEVICE_ID = "sim-desk-01";

function isNudgeAckEvent(event) {
  if (!event || event.source !== "arduino-in") return false;
  if (event.type === "arduino-in.hardware.nudge-ack") return true;
  if (event.type === "arduino-in.hardware.button") {
    const btn = String(event.payload?.button || "").toLowerCase();
    return btn === "nudge-ack" || btn === "ack";
  }
  return false;
}

function isNudgeFabricateEvent(event) {
  if (!event || event.source !== "arduino-in") return false;
  return (
    event.type === "arduino-in.hardware.nudge-fabricate" ||
    event.type === "arduino-in.hardware.demo-nudge"
  );
}

/**
 * Minimal desk-companion stack: settings + state + inputHub + pipeline + localServer
 * with the same arduino-in control-plane handlers as app.js (ack / fabricate).
 */
async function withArduinoSim(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-arduino-sim-"));
  const settingsStore = createSettingsStore({ filePath: path.join(dir, "settings.json") });
  const stateStore = createStateStore({ filePath: path.join(dir, "state.json") });
  await settingsStore.load();
  await stateStore.load();

  const outputHub = createOutputHub();
  const inputHub = createInputHub({ settingsStore, stateStore });
  const adapterManager = inputHub.getAdapterManager();
  const inputHitLog = inputHub.getHitLog();
  const pipeline = createPipeline({ inputHub, outputHub });

  inputHitLog.onHit((hit) => {
    outputHub
      .publish({ channel: "alfred.input.hit", timestamp: hit.timestamp, hit })
      .catch(() => {});
  });

  inputHub.subscribe(async (event) => {
    if (event.source === "arduino-in" && isNudgeAckEvent(event)) {
      const nudgeId = event.payload?.nudgeId || null;
      await stateStore.ackNudge(nudgeId);
      return;
    }
    if (event.source === "arduino-in" && isNudgeFabricateEvent(event)) {
      const resolved = resolveFabricateRequest({
        scenario: event.payload?.scenario,
        text: event.payload?.text,
        priority: event.payload?.priority,
        replace: event.payload?.replace,
        source: "demo",
      });
      if (resolved.ok) {
        await stateStore.fabricateNudges(resolved.nudges, { replace: resolved.replace });
      }
    }
  });

  await pipeline.start();
  await adapterManager.connect("arduino-in", {
    deviceId: DEVICE_ID,
    sharedSecret: SECRET,
    transport: "http",
  });
  await inputHub.start();

  const server = createLocalServer({
    settingsStore,
    stateStore,
    outputHub,
    adapterManager,
    inputHitLog,
  });
  const port = 21000 + Math.floor(Math.random() * 1000);
  await server.start(port);
  const baseUrl = `http://127.0.0.1:${port}`;

  async function ingest(payload) {
    const res = await fetch(`${baseUrl}/api/adapters/arduino-in/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-alfred-secret": SECRET,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  async function getState() {
    const res = await fetch(`${baseUrl}/api/state`);
    assert.equal(res.status, 200);
    return res.json();
  }

  try {
    await fn({ baseUrl, stateStore, ingest, getState });
  } finally {
    await server.stop();
    await inputHub.stop();
    await pipeline.stop();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("sim audio-in: ingest accepted; /api/state stays idle projection", async () => {
  await withArduinoSim(async ({ ingest, getState }) => {
    const { body } = await ingest({
      eventType: "audio-in",
      source: "desk-mic",
      transcript: "hello alfred",
      confidence: 0.9,
    });
    assert.equal(body.ok, true);
    const state = await getState();
    assert.equal(state.processingStatus, "idle");
    assert.equal(state.nudgeCount, 0);
    assert.equal(state.led, "green");
  });
});

test("sim mode-toggle: ingest accepted; hardware projection unchanged (control-plane event)", async () => {
  await withArduinoSim(async ({ ingest, getState }) => {
    const before = await getState();
    const { body } = await ingest({
      eventType: "mode-toggle",
      mode: "sparring",
      enabled: true,
    });
    assert.equal(body.ok, true);
    const after = await getState();
    assert.equal(after.processingStatus, before.processingStatus);
    assert.equal(after.nudgeCount, before.nudgeCount);
  });
});

test("sim nudge-fabricate: pendingBuzzer edge-triggers then clears after /api/state read", async () => {
  await withArduinoSim(async ({ ingest, getState, stateStore }) => {
    const { body } = await ingest({
      eventType: "nudge-fabricate",
      scenario: "buzzer",
      replace: true,
    });
    assert.equal(body.ok, true);

    // Edge-trigger set on fabricate (stateStore.fabricateNudges)
    assert.equal(stateStore.get().pendingBuzzer, true);

    const projected = await getState();
    assert.equal(projected.buzzer, true);
    assert.equal(projected.led, "red");
    assert.ok(projected.nudgeId);
    assert.ok(projected.nudgeText);
    assert.ok(projected.nudgeCount >= 1);
    assert.ok(projected.display.length <= 20);

    // Read path clears pendingBuzzer (stateStore.clearBuzzer)
    assert.equal(stateStore.get().pendingBuzzer, false);

    // Level: buzzer stays true while unacked nudges remain
    const second = await getState();
    assert.equal(second.buzzer, true);
    assert.equal(second.nudgeId, projected.nudgeId);
  });
});

test("sim nudge-ack without nudgeId: clears active nudge from /api/state", async () => {
  await withArduinoSim(async ({ ingest, getState }) => {
    await ingest({ eventType: "nudge-fabricate", scenario: "critical", replace: true });
    const active = await getState();
    assert.ok(active.nudgeId);

    const { body } = await ingest({
      eventType: "nudge-ack",
      response: "acknowledged",
    });
    assert.equal(body.ok, true);

    const after = await getState();
    assert.equal(after.nudgeCount, 0);
    assert.equal(after.nudgeId, null);
    assert.equal(after.buzzer, false);
    assert.equal(after.led, "green");
  });
});

test("sim nudge-ack with explicit nudgeId: acks that nudge only", async () => {
  await withArduinoSim(async ({ ingest, getState, stateStore }) => {
    await stateStore.patch({
      nudges: [
        { id: "n_first", text: "First", priority: "high", acked: false },
        { id: "n_second", text: "Second", priority: "medium", acked: false },
      ],
      pendingBuzzer: true,
    });

    const { body } = await ingest({
      eventType: "nudge-ack",
      response: "acknowledged",
      nudgeId: "n_second",
    });
    assert.equal(body.ok, true);

    const after = await getState();
    assert.equal(after.nudgeId, "n_first");
    assert.equal(after.nudgeCount, 1);
    assert.equal(stateStore.get().pendingBuzzer, false);
  });
});

test("sim button sparring: ingest accepted; no hardware projection change", async () => {
  await withArduinoSim(async ({ ingest, getState }) => {
    const { body } = await ingest({
      eventType: "button",
      button: "sparring",
      state: "pressed",
    });
    assert.equal(body.ok, true);
    const state = await getState();
    assert.equal(state.nudgeCount, 0);
    assert.equal(state.led, "green");
  });
});

test("sim custom-template: ingest accepted; idle /api/state", async () => {
  await withArduinoSim(async ({ ingest, getState }) => {
    const { body } = await ingest({
      eventType: "custom-template",
      name: "example",
      value: true,
    });
    assert.equal(body.ok, true);
    const state = await getState();
    assert.equal(state.processingStatus, "idle");
    assert.equal(state.nudgeId, null);
  });
});
