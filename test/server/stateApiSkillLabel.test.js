const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStateStore } = require("../../src/state/stateStore");
const { createSettingsStore } = require("../../src/settings/settingsStore");
const { createOutputHub } = require("../../src/outputs/outputHub");
const { createLocalServer } = require("../../src/server/localServer");

test("GET /api/state display shows active skill label truncated to 20 chars", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-skill-label-"));
  const settingsStore = createSettingsStore({ filePath: path.join(dir, "settings.json") });
  const stateStore = createStateStore({ filePath: path.join(dir, "state.json") });
  await settingsStore.load();
  await stateStore.load();
  await stateStore.patch({
    processingStatus: "idle",
    activeSkill: { id: "garden-kb", label: "Garden Knowledgebase" },
    nudges: [],
  });

  const server = createLocalServer({
    settingsStore,
    stateStore,
    outputHub: createOutputHub(),
    adapterManager: { listAdapters: () => [] },
  });
  const port = 23000 + Math.floor(Math.random() * 500);
  await server.start(port);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`);
    const body = await res.json();
    assert.equal(body.led, "red");
    assert.equal(body.display, "Garden Knowledgebase".slice(0, 20));
    assert.ok(body.display.length <= 20);
    assert.notEqual(body.display, "Processing...");
  } finally {
    await server.stop();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});
