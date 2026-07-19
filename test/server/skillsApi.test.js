const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStateStore } = require("../../src/state/stateStore");
const { createSettingsStore } = require("../../src/settings/settingsStore");
const { createOutputHub } = require("../../src/outputs/outputHub");
const { createLocalServer } = require("../../src/server/localServer");

async function withSkillsApi(fn, { makeSkillRunner } = {}) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-skills-api-"));
  const settingsStore = createSettingsStore({ filePath: path.join(dir, "settings.json") });
  const stateStore = createStateStore({ filePath: path.join(dir, "state.json") });
  await settingsStore.load();
  await stateStore.load();
  const outputHub = createOutputHub();
  const runner = makeSkillRunner
    ? makeSkillRunner(stateStore)
    : {
        async runGarden() {
          await stateStore.patch({
            processingLog: "[Garden] Filed 0 todo(s) into PARA.",
            skillLastRan: {
              ...(stateStore.get().skillLastRan || {}),
              "garden-kb": new Date().toISOString(),
            },
          });
        },
        async processNewItems() {
          await stateStore.patch({ processingLog: "processNewItems called" });
        },
        isRunning() {
          return false;
        },
      };

  const server = createLocalServer({
    settingsStore,
    stateStore,
    outputHub,
    skillRunner: runner,
    adapterManager: { listAdapters: () => [] },
  });
  const port = 22000 + Math.floor(Math.random() * 1000);
  await server.start(port);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseUrl, stateStore, settingsStore });
  } finally {
    await server.stop();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("GET /api/skills lists registry + enabled state + lastRan", async () => {
  await withSkillsApi(async ({ baseUrl, stateStore, settingsStore }) => {
    await settingsStore.updateSkill("garden-kb", { enabled: false });
    await stateStore.patch({
      skillLastRan: { "garden-kb": "2026-07-20T12:00:00.000Z" },
    });

    const res = await fetch(`${baseUrl}/api/skills`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.skills));
    const garden = body.skills.find((s) => s.id === "garden-kb");
    assert.ok(garden);
    assert.equal(garden.enabled, false);
    assert.equal(garden.lastRan, "2026-07-20T12:00:00.000Z");
    assert.equal(garden.runnable, true);
    assert.ok(garden.label);

    const stub = body.skills.find((s) => s.id === "sparring-mode");
    assert.ok(stub);
    assert.equal(stub.runnable, false);
  });
});

test("POST /api/skills/:id/run-now fires garden-kb via skillRunner", async () => {
  let gardenCalls = 0;
  await withSkillsApi(
    async ({ baseUrl, stateStore }) => {
      const res = await fetch(`${baseUrl}/api/skills/garden-kb/run-now`, { method: "POST" });
      assert.equal(res.status, 202);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(gardenCalls, 1);
      // Allow async handler to finish
      await new Promise((r) => setTimeout(r, 50));
      assert.match(stateStore.get().processingLog || "", /Garden/i);
    },
    {
      makeSkillRunner: (stateStore) => ({
        async runGarden() {
          gardenCalls++;
          await stateStore.patch({
            processingLog: "[Garden] Filed 0 todo(s) into PARA.",
          });
        },
        isRunning() {
          return false;
        },
      }),
    }
  );
});

test("POST /api/skills/:id/run-now returns 404 on unknown id", async () => {
  await withSkillsApi(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/skills/not-real/run-now`, { method: "POST" });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.ok, false);
  });
});

test("POST /api/skills/:id/run-now returns 409 while pipeline busy", async () => {
  await withSkillsApi(
    async ({ baseUrl }) => {
      const res = await fetch(`${baseUrl}/api/skills/garden-kb/run-now`, { method: "POST" });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.match(body.message || "", /busy|processing|running/i);
    },
    {
      makeSkillRunner: () => ({
        isRunning() {
          return true;
        },
        async runGarden() {
          throw new Error("should not run");
        },
      }),
    }
  );
});

test("POST /api/skills/:id/run-now rejects stub skills", async () => {
  await withSkillsApi(async ({ baseUrl }) => {
    const res = await fetch(`${baseUrl}/api/skills/sparring-mode/run-now`, { method: "POST" });
    assert.ok(res.status === 409 || res.status === 501);
    const body = await res.json();
    assert.equal(body.ok, false);
  });
});
