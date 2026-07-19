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
