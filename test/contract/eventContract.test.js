const test = require("node:test");
const assert = require("node:assert/strict");
const { createNormalizedEvent, validateNormalizedEvent } = require("../../src/core/eventContract");

test("createNormalizedEvent creates a valid event", () => {
  const event = createNormalizedEvent({
    source: "vault",
    type: "vault.file.changed",
    payload: { path: "/tmp/test.md" },
  });

  const result = validateNormalizedEvent(event);
  assert.equal(result.ok, true);
  assert.equal(event.source, "vault");
});

test("validateNormalizedEvent rejects unsupported source", () => {
  const event = createNormalizedEvent({
    source: "unknown",
    type: "thing.happened",
    payload: {},
  });

  const result = validateNormalizedEvent(event);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /unsupported event.source/);
});
