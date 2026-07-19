const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  resolveFabricateRequest,
  listScenarios,
  createNudge,
} = require("../../src/demo/nudgeFabricator");
const { createStateStore } = require("../../src/state/stateStore");

test("resolveFabricateRequest scenario buildathon", () => {
  const r = resolveFabricateRequest({ scenario: "buildathon", replace: true });
  assert.equal(r.ok, true);
  assert.equal(r.nudges.length, 3);
  assert.equal(r.replace, true);
  assert.ok(r.nudges.every((n) => n.source === "demo" && n.fabricatedAt && !n.acked));
});

test("resolveFabricateRequest custom text clips to 40", () => {
  const long = "x".repeat(60);
  const r = resolveFabricateRequest({ text: long, priority: "medium" });
  assert.equal(r.ok, true);
  assert.equal(r.nudges.length, 1);
  assert.equal(r.nudges[0].text.length, 40);
  assert.equal(r.nudges[0].priority, "medium");
});

test("resolveFabricateRequest unknown scenario fails", () => {
  const r = resolveFabricateRequest({ scenario: "nope" });
  assert.equal(r.ok, false);
  assert.match(r.message, /Unknown scenario/);
});

test("listScenarios exposes packs", () => {
  const s = listScenarios();
  assert.ok(s.buzzer);
  assert.ok(s.critical);
  assert.ok(s.buildathon);
});

test("createNudge rejects empty text", () => {
  assert.equal(createNudge({ text: "  " }), null);
});

test("stateStore fabricate + clear demo nudges", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-demo-"));
  const store = createStateStore({ filePath: path.join(dir, "state.json") });
  await store.load();

  await store.patch({
    nudges: [{ id: "n_real", text: "Real work", priority: "high", acked: false, source: "granola" }],
  });

  const resolved = resolveFabricateRequest({ scenario: "buzzer", replace: true });
  const fab = await store.fabricateNudges(resolved.nudges, { replace: true });
  assert.equal(fab.ok, true);
  assert.equal(fab.added.length, 1);

  const active = store.getActiveNudges();
  assert.equal(active[0].source, "demo");
  assert.equal(active.some((n) => n.id === "n_real"), true);
  assert.equal(store.get().pendingBuzzer, true);

  const cleared = await store.clearDemoNudges();
  assert.equal(cleared.removed, 1);
  assert.deepEqual(store.getActiveNudges().map((n) => n.id), ["n_real"]);

  await fs.promises.rm(dir, { recursive: true, force: true });
});
