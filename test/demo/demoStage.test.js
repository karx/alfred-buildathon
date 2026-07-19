const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveStagePack, buildStageApplication, listStagePacks } = require("../../src/demo/demoStage");
const { createStateStore } = require("../../src/state/stateStore");

test("listStagePacks includes full and hardware", () => {
  const packs = listStagePacks();
  assert.ok(packs.full);
  assert.ok(packs.hardware);
  assert.ok(packs.reset);
});

test("resolveStagePack full builds complete world", () => {
  const r = resolveStagePack("full");
  assert.equal(r.ok, true);
  assert.ok(r.pack.todos.length >= 3);
  assert.ok(r.pack.nudges.length >= 1);
  assert.equal(r.pack.mode, "focus");
  assert.ok(r.pack.dailySummary);
});

test("applyDemoStage full then reset", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-stage-"));
  const store = createStateStore({ filePath: path.join(dir, "state.json") });
  await store.load();

  await store.patch({
    todos: [{ id: "t_real", text: "Real todo", status: "todo", source: "granola" }],
    nudges: [],
  });

  const full = resolveStagePack("full");
  const app = buildStageApplication(full.pack);
  const applied = await store.applyDemoStage(app);
  assert.equal(applied.ok, true);
  assert.ok(applied.activeNudges >= 1);
  assert.ok(applied.todoCount >= 4);
  assert.equal(store.get().nowState.mode, "focus");
  assert.ok(store.get().dailySummary.length > 10);
  assert.ok(store.get().todos.some((t) => t.id === "t_real"));

  const reset = resolveStagePack("reset");
  await store.applyDemoStage(buildStageApplication(reset.pack));
  assert.equal(store.getActiveNudges().length, 0);
  assert.ok(store.get().todos.every((t) => t.source !== "demo"));
  assert.ok(store.get().todos.some((t) => t.id === "t_real"));

  await fs.promises.rm(dir, { recursive: true, force: true });
});

test("unknown pack fails", () => {
  const r = resolveStagePack("nope");
  assert.equal(r.ok, false);
});
