const test = require("node:test");
const assert = require("node:assert/strict");
const { SlackAdapter } = require("../../src/inputs/adapters/slackAdapter");

test("SlackAdapter asks for signingSecret or botToken", async () => {
  const adapter = new SlackAdapter();
  const result = await adapter.test({});
  assert.equal(result.ok, false);
  assert.match(result.message, /signingSecret/);
});

test("SlackAdapter accepts scaffold config", async () => {
  const adapter = new SlackAdapter();
  const result = await adapter.connect({ signingSecret: "secret", botToken: "xoxb-test" });
  assert.equal(result.ok, true);
});
