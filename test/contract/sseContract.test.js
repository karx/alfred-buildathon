const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createStateStore } = require("../../src/state/stateStore");
const { createSettingsStore } = require("../../src/settings/settingsStore");
const { createOutputHub } = require("../../src/outputs/outputHub");
const { createLocalServer } = require("../../src/server/localServer");
const { createPipeline } = require("../../src/pipeline/pipeline");
const { createNormalizedEvent } = require("../../src/core/eventContract");

/** Frozen SSE channel names consumed by desk companion / UI. */
const REQUIRED_SSE_CHANNELS = [
  "alfred.state.updated",
  "alfred.input.hit",
  "pipeline.event",
  // Item 5 — deliberately extended for background skill visibility
  "alfred.skill.started",
  "alfred.skill.done",
  "alfred.skill.error",
];

function collectSse(baseUrl, { timeoutMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const channels = [];
    const req = http.get(`${baseUrl}/events`, (res) => {
      assert.equal(res.statusCode, 200);
      assert.match(res.headers["content-type"] || "", /text\/event-stream/);
      let buf = "";
      res.on("data", (chunk) => {
        buf += chunk.toString();
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.channel) channels.push(payload.channel);
          } catch {
            /* ignore */
          }
        }
      });
    });
    req.on("error", reject);
    setTimeout(() => {
      req.destroy();
      resolve(channels);
    }, timeoutMs);
  });
}

async function withSseServer(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-sse-"));
  const settingsStore = createSettingsStore({ filePath: path.join(dir, "settings.json") });
  const stateStore = createStateStore({ filePath: path.join(dir, "state.json") });
  await settingsStore.load();
  await stateStore.load();
  const outputHub = createOutputHub();
  const fakeInputHub = {
    subscribe(handler) {
      fakeInputHub._handler = handler;
      return () => {
        fakeInputHub._handler = null;
      };
    },
    async publish(event) {
      if (fakeInputHub._handler) await fakeInputHub._handler(event);
    },
  };
  const pipeline = createPipeline({ inputHub: fakeInputHub, outputHub });
  await pipeline.start();

  const server = createLocalServer({
    settingsStore,
    stateStore,
    outputHub,
    adapterManager: { listAdapters: () => [] },
  });
  const port = 20000 + Math.floor(Math.random() * 1000);
  await server.start(port);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await fn({ baseUrl, stateStore, outputHub, pipeline, fakeInputHub });
  } finally {
    await pipeline.stop();
    await server.stop();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("SSE stream emits alfred.state.updated when state changes", async () => {
  await withSseServer(async ({ baseUrl, stateStore }) => {
    const seenPromise = collectSse(baseUrl, { timeoutMs: 800 });
    // Allow SSE client to connect
    await new Promise((r) => setTimeout(r, 100));
    await stateStore.patch({ processingLog: "contract probe" });
    const channels = await seenPromise;
    assert.ok(
      channels.includes("alfred.state.updated"),
      `expected alfred.state.updated, got: ${channels.join(", ")}`
    );
  });
});

test("SSE stream emits alfred.input.hit and pipeline.event via outputHub / pipeline", async () => {
  await withSseServer(async ({ baseUrl, outputHub, fakeInputHub }) => {
    const seenPromise = collectSse(baseUrl, { timeoutMs: 800 });
    await new Promise((r) => setTimeout(r, 100));

    await outputHub.publish({
      channel: "alfred.input.hit",
      timestamp: new Date().toISOString(),
      hit: { source: "arduino-in", type: "arduino-in.hardware.button" },
    });

    await fakeInputHub.publish(
      createNormalizedEvent({
        source: "arduino-in",
        type: "arduino-in.hardware.button",
        payload: { button: "sparring" },
      })
    );

    const channels = await seenPromise;
    for (const name of ["alfred.input.hit", "pipeline.event"]) {
      assert.ok(channels.includes(name), `expected ${name}, got: ${channels.join(", ")}`);
    }
  });
});

test("frozen SSE channel catalog documents required names", () => {
  // Guardrail: these names are the contract. Item 5 extended deliberately with alfred.skill.*.
  for (const name of REQUIRED_SSE_CHANNELS) {
    assert.equal(typeof name, "string");
    assert.ok(name.length > 0);
  }
  assert.ok(REQUIRED_SSE_CHANNELS.includes("alfred.state.updated"));
  assert.ok(REQUIRED_SSE_CHANNELS.includes("alfred.input.hit"));
  assert.ok(REQUIRED_SSE_CHANNELS.some((c) => c.startsWith("pipeline.")));
  assert.ok(REQUIRED_SSE_CHANNELS.includes("alfred.skill.started"));
  assert.ok(REQUIRED_SSE_CHANNELS.includes("alfred.skill.done"));
  assert.ok(REQUIRED_SSE_CHANNELS.includes("alfred.skill.error"));
});
