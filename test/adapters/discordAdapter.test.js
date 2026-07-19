const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DiscordAdapter } = require("../../src/inputs/adapters/discordAdapter");
const {
  isBotMentioned,
  stripBotMentions,
  normalizeBotToken,
  botAuthHeader,
} = require("../../src/inputs/adapters/discordGateway");
const { createKnowledgeBase } = require("../../src/processing/knowledgeBase");

function mockFetchOk(user = { id: "bot-1", username: "AlfredBot", discriminator: "0" }) {
  return async (url) => {
    if (String(url).includes("/users/@me")) {
      return {
        ok: true,
        status: 200,
        json: async () => user,
        text: async () => "",
      };
    }
    return { ok: false, status: 404, text: async () => "no", json: async () => ({}) };
  };
}

test("normalizeBotToken strips Bot prefix", () => {
  assert.equal(normalizeBotToken("Bot abc"), "abc");
  assert.equal(botAuthHeader("abc"), "Bot abc");
});

test("isBotMentioned detects mentions array and markup", () => {
  assert.equal(
    isBotMentioned({ mentions: [{ id: "bot-1" }], content: "hi" }, "bot-1"),
    true
  );
  assert.equal(
    isBotMentioned({ mentions: [], content: "hey <@bot-1> please" }, "bot-1"),
    true
  );
  assert.equal(
    isBotMentioned({ mentions: [], content: "no mention" }, "bot-1"),
    false
  );
});

test("stripBotMentions removes mention tokens", () => {
  assert.equal(stripBotMentions("hey <@bot-1> ship it", "bot-1"), "hey ship it");
  assert.equal(stripBotMentions("<@!bot-1> todo", "bot-1"), "todo");
});

// Classic three-segment shape so looksLikeBotToken passes
const FAKE_BOT_TOKEN = "AAAaaa.BBBbbb.CCCcccDDDdddEEEeee";

test("test() requires botToken", async () => {
  const adapter = new DiscordAdapter({ fetchImpl: mockFetchOk() });
  const prev = process.env.DISCORD_BOT_TOKEN;
  const prevS = process.env.DISCORD_BOT_SECRET;
  delete process.env.DISCORD_BOT_TOKEN;
  delete process.env.DISCORD_BOT_SECRET;
  const result = await adapter.test({});
  if (prev !== undefined) process.env.DISCORD_BOT_TOKEN = prev;
  if (prevS !== undefined) process.env.DISCORD_BOT_SECRET = prevS;
  assert.equal(result.ok, false);
  assert.match(result.message, /botToken/i);
});

test("test() rejects client-secret shaped values", async () => {
  const adapter = new DiscordAdapter({ fetchImpl: mockFetchOk() });
  const result = await adapter.test({ botToken: "a".repeat(32) });
  assert.equal(result.ok, false);
  assert.match(result.message, /three segments|Bot Token/i);
});

test("test() validates bot via Discord API", async () => {
  const adapter = new DiscordAdapter({ fetchImpl: mockFetchOk() });
  const result = await adapter.test({ botToken: FAKE_BOT_TOKEN });
  assert.equal(result.ok, true);
  assert.match(result.message, /AlfredBot/);
  assert.equal(result.metadata.botId, "bot-1");
});

test("test() fails on 401", async () => {
  const adapter = new DiscordAdapter({
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
      json: async () => ({}),
    }),
  });
  const result = await adapter.test({ botToken: FAKE_BOT_TOKEN });
  assert.equal(result.ok, false);
  assert.match(result.message, /401/);
});

test("connect stores normalized config", async () => {
  const adapter = new DiscordAdapter({ fetchImpl: mockFetchOk() });
  const result = await adapter.connect({
    botToken: "Bot " + FAKE_BOT_TOKEN,
    guildId: "g1",
    channelIds: "c1, c2",
  });
  assert.equal(result.ok, true);
  assert.equal(adapter.config.botToken, FAKE_BOT_TOKEN);
  assert.deepEqual(adapter.config.channelIds, ["c1", "c2"]);
});

test("buildEventFromMessage ignores non-mentions and bots", async () => {
  const adapter = new DiscordAdapter({ fetchImpl: mockFetchOk() });
  await adapter.connect({ botToken: FAKE_BOT_TOKEN });
  adapter._botUser = { id: "bot-1", username: "AlfredBot" };

  assert.equal(
    adapter.buildEventFromMessage({
      id: "m1",
      content: "hello world",
      author: { id: "u1", username: "x", bot: false },
      mentions: [],
    }),
    null
  );

  assert.equal(
    adapter.buildEventFromMessage({
      id: "m2",
      content: "<@bot-1> hi",
      author: { id: "bot-1", username: "AlfredBot", bot: true },
      mentions: [{ id: "bot-1" }],
    }),
    null
  );
});

test("buildEventFromMessage emits discord.message.mention", async () => {
  const adapter = new DiscordAdapter({ fetchImpl: mockFetchOk() });
  await adapter.connect({ botToken: FAKE_BOT_TOKEN });
  adapter._botUser = { id: "bot-1", username: "AlfredBot" };

  const event = adapter.buildEventFromMessage({
    id: "m3",
    channel_id: "ch-1",
    guild_id: "g-1",
    content: "<@bot-1> ship the adapter",
    author: { id: "u1", username: "alice", bot: false },
    mentions: [{ id: "bot-1" }],
  });

  assert.ok(event);
  assert.equal(event.source, "discord");
  assert.equal(event.type, "discord.message.mention");
  assert.equal(event.payload.messageId, "m3");
  assert.equal(event.payload.author, "alice");
  assert.match(event.payload.content, /ship the adapter/);
  assert.equal(event.payload.mentionedBot, true);

  // dedup
  assert.equal(
    adapter.buildEventFromMessage({
      id: "m3",
      content: "<@bot-1> again",
      author: { id: "u1", username: "alice", bot: false },
      mentions: [{ id: "bot-1" }],
    }),
    null
  );
});

test("channel allowlist filters messages", async () => {
  const adapter = new DiscordAdapter({ fetchImpl: mockFetchOk() });
  await adapter.connect({ botToken: FAKE_BOT_TOKEN, channelIds: ["allowed"] });
  adapter._botUser = { id: "bot-1", username: "AlfredBot" };

  assert.equal(
    adapter.buildEventFromMessage({
      id: "m4",
      channel_id: "other",
      content: "<@bot-1> no",
      author: { id: "u1", username: "a", bot: false },
      mentions: [{ id: "bot-1" }],
    }),
    null
  );

  const ok = adapter.buildEventFromMessage({
    id: "m5",
    channel_id: "allowed",
    content: "<@bot-1> yes",
    author: { id: "u1", username: "a", bot: false },
    mentions: [{ id: "bot-1" }],
  });
  assert.ok(ok);
});

test("ingest with injected no-op gateway publishes event", async () => {
  const published = [];
  const adapter = new DiscordAdapter({
    fetchImpl: mockFetchOk(),
    createGateway: () => ({
      start: async () => {},
      stop: async () => {},
      isConnected: () => true,
      getBotUser: () => ({ id: "bot-1", username: "AlfredBot" }),
    }),
  });
  await adapter.connect({ botToken: FAKE_BOT_TOKEN });
  await adapter.start(async (e) => published.push(e));

  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../fixtures/discord.mention.json"), "utf8")
  );
  const result = await adapter.ingest(fixture);
  assert.equal(result.ok, true);
  assert.equal(published.length, 1);
  assert.equal(published[0].type, "discord.message.mention");
  assert.match(published[0].payload.content, /Discord adapter/i);

  await adapter.stop();
});

test("runAction status reports metadata", async () => {
  const adapter = new DiscordAdapter({
    fetchImpl: mockFetchOk(),
    createGateway: () => ({
      start: async () => {},
      stop: async () => {},
      isConnected: () => true,
      getBotUser: () => ({ id: "bot-1", username: "AlfredBot" }),
    }),
  });
  await adapter.connect({ botToken: FAKE_BOT_TOKEN });
  await adapter.start(async () => {});
  const status = await adapter.runAction("status");
  assert.equal(status.ok, true);
  assert.equal(status.metadata.connected, true);
  await adapter.stop();
});

test("writeDiscordNote creates vault file", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alfred-discord-kb-"));
  const inbox = path.join(tmp, "0 Inbox");
  fs.mkdirSync(inbox, { recursive: true });

  const settingsStore = {
    get: () => ({
      adapters: {
        vault: { config: { vaultPath: tmp, para: { inbox: "0 Inbox" } } },
      },
    }),
  };
  const kb = createKnowledgeBase({ settingsStore });
  await kb.writeDiscordNote({
    messageId: "mid-99",
    author: "alice",
    content: "ship it",
    channelId: "c1",
    guildId: "g1",
  });

  const files = fs.readdirSync(inbox).filter((f) => f.includes("Discord"));
  assert.equal(files.length, 1);
  const body = fs.readFileSync(path.join(inbox, files[0]), "utf8");
  assert.match(body, /Message ID: mid-99/);
  assert.match(body, /ship it/);

  // idempotent by messageId
  await kb.writeDiscordNote({
    messageId: "mid-99",
    author: "alice",
    content: "ship it again differently",
    channelId: "c1",
  });
  assert.equal(fs.readdirSync(inbox).filter((f) => f.includes("Discord")).length, 1);

  fs.rmSync(tmp, { recursive: true, force: true });
});
