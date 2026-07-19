const test = require("node:test");
const assert = require("node:assert/strict");
const { DiscordAdapter } = require("../../src/inputs/adapters/discordAdapter");

test("DiscordAdapter asks for botToken or publicKey", async () => {
  const adapter = new DiscordAdapter();
  const result = await adapter.test({});
  assert.equal(result.ok, false);
  assert.match(result.message, /botToken/);
});

test("DiscordAdapter accepts scaffold bot config", async () => {
  const adapter = new DiscordAdapter();
  const result = await adapter.connect({ botToken: "Bot test", guildId: "guild-1", channelIds: ["channel-1"] });
  assert.equal(result.ok, true);
});
