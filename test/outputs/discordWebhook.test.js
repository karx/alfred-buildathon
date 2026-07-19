const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DiscordWebhookActuator,
  isDiscordWebhookUrl,
  fingerprintState,
} = require("../../src/outputs/actuators/discordWebhookActuator");

const VALID_URL =
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV";

function mockFetch(impl) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    if (typeof impl === "function") return impl(url, opts);
    return { ok: true, status: 204, text: async () => "" };
  };
  return { fetchImpl, calls };
}

test("isDiscordWebhookUrl accepts discord webhook URLs", () => {
  assert.equal(isDiscordWebhookUrl(VALID_URL), true);
  assert.equal(
    isDiscordWebhookUrl("https://discordapp.com/api/webhooks/1/token_here"),
    true
  );
  assert.equal(isDiscordWebhookUrl("https://example.com/hook"), false);
  assert.equal(isDiscordWebhookUrl("not-a-url"), false);
  assert.equal(isDiscordWebhookUrl(""), false);
});

test("test() rejects missing or bad webhookUrl", async () => {
  const a = new DiscordWebhookActuator();
  const missing = await a.test({});
  assert.equal(missing.ok, false);
  assert.match(missing.message, /webhookUrl/i);

  const bad = await a.test({ webhookUrl: "https://example.com/x" });
  assert.equal(bad.ok, false);

  const ok = await a.test({ webhookUrl: VALID_URL });
  assert.equal(ok.ok, true);
});

test("connect stores config; send-test posts embed via fetch", async () => {
  const { fetchImpl, calls } = mockFetch();
  const a = new DiscordWebhookActuator({ fetchImpl });

  const connected = await a.connect({ webhookUrl: VALID_URL });
  assert.equal(connected.ok, true);
  assert.equal(a.config.webhookUrl, VALID_URL);

  const result = await a.runAction("send-test");
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, VALID_URL);
  assert.equal(calls[0].opts.method, "POST");

  const body = JSON.parse(calls[0].opts.body);
  assert.ok(Array.isArray(body.embeds));
  assert.equal(body.embeds[0].title, "Alfred · test");
  assert.match(body.embeds[0].description, /send-test/i);
});

test("send-test fails gracefully when Discord returns error", async () => {
  const { fetchImpl } = mockFetch(async () => ({
    ok: false,
    status: 401,
    text: async () => "unauthorized",
  }));
  const a = new DiscordWebhookActuator({ fetchImpl });
  await a.connect({ webhookUrl: VALID_URL });
  const result = await a.runAction("send-test");
  assert.equal(result.ok, false);
  assert.match(result.message, /401/);
});

test("mapStateToPayload builds rich embed from state", () => {
  const a = new DiscordWebhookActuator();
  const payload = a.mapStateToPayload({
    nowState: { mode: "focus", context: "deep work" },
    processingStatus: "idle",
    pendingBuzzer: true,
    todos: [{ id: "1", status: "todo" }, { id: "2", status: "done" }],
    nudges: [
      { id: "n1", text: "Stand up", acked: false },
      { id: "n2", text: "Old", acked: true },
    ],
    dailySummary: "Ship the webhook",
  });

  assert.equal(payload.embeds[0].title, "Alfred · focus");
  assert.match(payload.embeds[0].description, /Stand up/);
  assert.match(payload.embeds[0].description, /Open todos:\*\* 1/);
  assert.match(payload.embeds[0].description, /Active nudges:\*\* 1/);
  assert.match(payload.embeds[0].description, /Ship the webhook/);
});

test("fingerprintState changes when nudge appears", () => {
  const base = {
    nowState: { mode: "focus", context: "" },
    processingStatus: "idle",
    pendingBuzzer: false,
    todos: [],
    nudges: [],
    inbox: [],
  };
  const withNudge = {
    ...base,
    nudges: [{ id: "n1", text: "Hi", acked: false }],
    pendingBuzzer: true,
  };
  assert.notEqual(fingerprintState(base), fingerprintState(withNudge));
  assert.equal(fingerprintState(base), fingerprintState({ ...base }));
});

test("state subscription delivers after debounce; ignores unrelated until change", async () => {
  const { fetchImpl, calls } = mockFetch();
  const a = new DiscordWebhookActuator({ fetchImpl });
  a.debounceMs = 20;

  await a.connect({ webhookUrl: VALID_URL });

  const listeners = new Set();
  await a.start({
    onStateChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    publish: async () => {},
  });

  const state1 = {
    nowState: { mode: "focus", context: "" },
    processingStatus: "idle",
    pendingBuzzer: false,
    todos: [],
    nudges: [],
    inbox: [],
  };

  for (const fn of listeners) fn(state1);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 1);
  const firstBody = JSON.parse(calls[0].opts.body);
  assert.equal(firstBody.embeds[0].title, "Alfred · focus");

  // Identical fingerprint → no second post
  for (const fn of listeners) fn(state1);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 1);

  // Mode change → new post
  for (const fn of listeners) {
    fn({ ...state1, nowState: { mode: "break", context: "" } });
  }
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].opts.body).embeds[0].title, "Alfred · break");

  await a.stop();
});

test("stop clears debounce timer and unsubscribes", async () => {
  const { fetchImpl, calls } = mockFetch();
  const a = new DiscordWebhookActuator({ fetchImpl });
  a.debounceMs = 200;

  await a.connect({ webhookUrl: VALID_URL });
  let unsubbed = false;
  await a.start({
    onStateChange: (fn) => {
      fn({
        nowState: { mode: "focus", context: "" },
        processingStatus: "idle",
        pendingBuzzer: false,
        todos: [],
        nudges: [],
        inbox: [],
      });
      return () => {
        unsubbed = true;
      };
    },
    publish: async () => {},
  });

  await a.stop();
  assert.equal(unsubbed, true);
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(calls.length, 0);
});
