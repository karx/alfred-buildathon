const test = require("node:test");
const assert = require("node:assert/strict");
const { createInputHitLog } = require("../../src/inputs/inputHitLog");
const { createInputHub } = require("../../src/inputs/inputHub");
const { createNormalizedEvent } = require("../../src/core/eventContract");

test("inputHitLog records events and trims payload", () => {
  const log = createInputHitLog({ limit: 5 });
  const hit = log.recordEvent({
    id: "evt_1",
    source: "arduino-in",
    type: "arduino-in.hardware.nudge-ack",
    timestamp: new Date().toISOString(),
    payload: { eventType: "nudge-ack", response: "acknowledged", noise: "skip-me" },
  });

  assert.equal(hit.ok, true);
  assert.equal(hit.source, "arduino-in");
  assert.equal(hit.payload.eventType, "nudge-ack");
  assert.equal(hit.payload.noise, undefined);
  assert.equal(log.getRecent().length, 1);
});

test("inputHitLog records failed HTTP ingest", () => {
  const log = createInputHitLog();
  const hit = log.recordIngest({
    adapterId: "arduino-in",
    payload: { eventType: "button" },
    result: { ok: false, status: 401, message: "Invalid Arduino shared secret" },
    path: "/api/adapters/arduino-in/ingest",
  });
  assert.equal(hit.ok, false);
  assert.equal(hit.status, 401);
  assert.equal(hit.transport, "http");
});

test("inputHitLog respects ring limit", () => {
  const log = createInputHitLog({ limit: 3 });
  for (let i = 0; i < 5; i++) log.record({ source: "x", type: "t" + i });
  assert.equal(log.size(), 3);
  assert.equal(log.getRecent()[0].type, "t4");
});

test("inputHub logs every publish", async () => {
  const hub = createInputHub({
    settingsStore: { get: () => ({ adapters: {} }) },
    stateStore: null,
  });
  const events = [];
  hub.subscribe(async (e) => events.push(e));

  const event = createNormalizedEvent({
    source: "vault",
    type: "vault.file.changed",
    payload: { relativePath: "0 Inbox/note.md", changeType: "change" },
  });
  await hub.publish(event);

  const hits = hub.getHitLog().getRecent();
  assert.equal(hits.length, 1);
  assert.equal(hits[0].source, "vault");
  assert.equal(hits[0].type, "vault.file.changed");
  assert.equal(events.length, 1);
});
