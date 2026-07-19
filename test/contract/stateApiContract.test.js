const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStateStore } = require("../../src/state/stateStore");
const { createSettingsStore } = require("../../src/settings/settingsStore");
const { createOutputHub } = require("../../src/outputs/outputHub");
const { createLocalServer } = require("../../src/server/localServer");

/** Frozen desk-companion projection fields (CURRENT_STATE.md §5 / ARDUINO_FIRMWARE.md). */
const STATE_API_FIELDS = [
  "led",
  "display",
  "buzzer",
  "nudgeId",
  "nudgeText",
  "nudgeCount",
  "processingStatus",
];

async function withStateApi(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-state-api-"));
  const settingsStore = createSettingsStore({ filePath: path.join(dir, "settings.json") });
  const stateStore = createStateStore({ filePath: path.join(dir, "state.json") });
  await settingsStore.load();
  await stateStore.load();
  const outputHub = createOutputHub();
  const server = createLocalServer({
    settingsStore,
    stateStore,
    outputHub,
    adapterManager: { listAdapters: () => [], ingest: async () => ({ ok: false }) },
  });
  const port = 19000 + Math.floor(Math.random() * 1000);
  await server.start(port);
  try {
    await fn({ baseUrl: `http://127.0.0.1:${port}`, stateStore });
  } finally {
    await server.stop();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

async function getState(baseUrl) {
  const res = await fetch(`${baseUrl}/api/state`);
  assert.equal(res.status, 200);
  return res.json();
}

test("GET /api/state exposes the frozen desk-companion field set", async () => {
  await withStateApi(async ({ baseUrl }) => {
    const body = await getState(baseUrl);
    for (const key of STATE_API_FIELDS) {
      assert.ok(key in body, `missing field: ${key}`);
    }
  });
});

test("GET /api/state field types match the hardware contract", async () => {
  await withStateApi(async ({ baseUrl, stateStore }) => {
    await stateStore.patch({
      processingStatus: "idle",
      nudges: [{ id: "n_contract", text: "Ship the deck tonight please", priority: "high", acked: false }],
    });

    const body = await getState(baseUrl);
    assert.equal(typeof body.led, "string");
    assert.equal(typeof body.display, "string");
    assert.equal(typeof body.buzzer, "boolean");
    assert.ok(body.nudgeId === null || typeof body.nudgeId === "string");
    assert.ok(body.nudgeText === null || typeof body.nudgeText === "string");
    assert.equal(typeof body.nudgeCount, "number");
    assert.equal(typeof body.processingStatus, "string");

    assert.equal(body.led, "red");
    assert.equal(body.nudgeId, "n_contract");
    assert.equal(body.nudgeText, "Ship the deck tonight please".slice(0, 40));
    assert.ok(body.display.length <= 20);
    assert.equal(body.nudgeCount, 1);
    assert.equal(body.buzzer, true);
    assert.equal(body.processingStatus, "idle");
  });
});

test("GET /api/state processing overrides nudge for LED/display", async () => {
  await withStateApi(async ({ baseUrl, stateStore }) => {
    await stateStore.patch({
      processingStatus: "processing",
      nudges: [{ id: "n_1", text: "Ignore me", acked: false }],
    });
    const body = await getState(baseUrl);
    assert.equal(body.led, "red");
    assert.equal(body.display, "Processing...");
    assert.equal(body.processingStatus, "processing");
  });
});
