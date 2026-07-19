const test = require("node:test");
const assert = require("node:assert/strict");
const { ActuatorContract } = require("../../src/outputs/actuatorContract");
const { createOutputHub } = require("../../src/outputs/outputHub");

test("ActuatorContract tracks unsubs on stop", async () => {
  let unsubCalled = false;
  const a = new ActuatorContract({
    id: "t",
    label: "T",
    description: "test",
  });
  await a.start({});
  a.track(() => {
    unsubCalled = true;
  });
  await a.stop();
  assert.equal(unsubCalled, true);
  assert.equal(a.started, false);
});

test("outputHub fans out to multiple listeners (composable)", async () => {
  const hub = createOutputHub({ recentEventLimit: 10 });
  const seen = [];
  hub.onPublish(async (e) => seen.push(["a", e.channel]));
  hub.onPublish(async (e) => seen.push(["b", e.channel]));
  await hub.publish({ channel: "alfred.processing.done", timestamp: new Date().toISOString() });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen.map((x) => x[1]), ["alfred.processing.done", "alfred.processing.done"]);
});
