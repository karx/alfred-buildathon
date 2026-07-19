const test = require("node:test");
const assert = require("node:assert/strict");
const { ArduinoInAdapter } = require("../../src/inputs/adapters/arduinoInAdapter");

test("ArduinoInAdapter requires deviceId", async () => {
  const adapter = new ArduinoInAdapter();
  const result = await adapter.test({});
  assert.equal(result.ok, false);
  assert.match(result.message, /deviceId is required/);
});

test("ArduinoInAdapter ingests HTTP payload and publishes normalized event", async () => {
  const adapter = new ArduinoInAdapter();
  const events = [];
  await adapter.connect({ deviceId: "desk-controller-01", sharedSecret: "dev-secret" });
  await adapter.start(async (event) => events.push(event));

  const result = await adapter.ingest(
    { eventType: "button", button: "sparring", state: "pressed" },
    { headers: { "x-alfred-secret": "dev-secret" } }
  );

  assert.equal(result.ok, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].source, "arduino-in");
  assert.equal(events[0].type, "arduino-in.hardware.button");
  assert.equal(events[0].payload.button, "sparring");
});

test("ArduinoInAdapter rejects invalid shared secret", async () => {
  const adapter = new ArduinoInAdapter();
  await adapter.connect({ deviceId: "desk-controller-01", sharedSecret: "dev-secret" });
  const result = await adapter.ingest({ eventType: "button" }, { headers: { "x-alfred-secret": "wrong" } });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("ArduinoInAdapter publishes nudge-ack without nudgeId (acks active State API nudge)", async () => {
  const adapter = new ArduinoInAdapter();
  const events = [];
  await adapter.connect({ deviceId: "desk-controller-01", sharedSecret: "dev-secret" });
  await adapter.start(async (event) => events.push(event));

  const result = await adapter.ingest(
    { eventType: "nudge-ack", response: "acknowledged" },
    { headers: { "x-alfred-secret": "dev-secret" } }
  );

  assert.equal(result.ok, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "arduino-in.hardware.nudge-ack");
  assert.equal(events[0].payload.response, "acknowledged");
  assert.equal(events[0].payload.nudgeId, undefined);
});

test("ArduinoInAdapter publishes nudge-ack button", async () => {
  const adapter = new ArduinoInAdapter();
  const events = [];
  await adapter.connect({ deviceId: "desk-controller-01", sharedSecret: "dev-secret" });
  await adapter.start(async (event) => events.push(event));

  const result = await adapter.ingest(
    { eventType: "button", button: "nudge-ack", state: "pressed" },
    { headers: { "x-alfred-secret": "dev-secret" } }
  );

  assert.equal(result.ok, true);
  assert.equal(events[0].type, "arduino-in.hardware.button");
  assert.equal(events[0].payload.button, "nudge-ack");
});
