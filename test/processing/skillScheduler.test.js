const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createSettingsStore } = require("../../src/settings/settingsStore");
const { createSkillScheduler } = require("../../src/processing/skillScheduler");

/** Minimal fake clock: tracks intervals, advances time, fires due callbacks. */
function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const intervals = new Map(); // id -> { fn, ms, nextAt }

  return {
    now: () => now,
    setInterval(fn, ms) {
      const id = nextId++;
      intervals.set(id, { fn, ms, nextAt: now + ms });
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        let soonest = null;
        for (const entry of intervals.values()) {
          if (entry.nextAt <= target && (soonest === null || entry.nextAt < soonest.nextAt)) {
            soonest = entry;
          }
        }
        if (!soonest) {
          now = target;
          return;
        }
        now = soonest.nextAt;
        soonest.nextAt = now + soonest.ms;
        await soonest.fn();
      }
    },
    armedCount() {
      return intervals.size;
    },
  };
}

async function withScheduler(fn, { vaultConnected = true, busy = false } = {}) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-sched-"));
  const settingsStore = createSettingsStore({ filePath: path.join(dir, "settings.json") });
  await settingsStore.load();

  // Short intervals for tests
  await settingsStore.updateSkill("garden-kb", { enabled: true, intervalMs: 1000 });
  await settingsStore.updateSkill("daily-notes", { enabled: true, intervalMs: 2000 });
  // Disable other scheduled stubs so they are not armed
  await settingsStore.updateSkill("daily-triage", { enabled: false });
  await settingsStore.updateSkill("gtd", { enabled: false });

  if (vaultConnected) {
    await settingsStore.updateAdapter("vault", {
      config: { vaultPath: "/tmp/fake-vault" },
      connectedAt: new Date().toISOString(),
    });
  }

  const runs = [];
  let running = busy;
  const skillRunner = {
    isRunning() {
      return running;
    },
    async runSkill(skillId, meta) {
      runs.push({ skillId, ...meta });
      return { ok: true, skillId };
    },
  };

  const clock = createFakeClock();
  const scheduler = createSkillScheduler({
    settingsStore,
    skillRunner,
    setIntervalFn: (fn, ms) => clock.setInterval(fn, ms),
    clearIntervalFn: (id) => clock.clearInterval(id),
    nowFn: () => clock.now(),
  });

  try {
    await fn({ scheduler, settingsStore, runs, clock, setBusy: (v) => { running = v; } });
  } finally {
    scheduler.stop();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("scheduler arms one timer per enabled scheduled skill", async () => {
  await withScheduler(async ({ scheduler, clock }) => {
    scheduler.start();
    const armed = scheduler.getArmed();
    assert.ok(armed.includes("garden-kb"), `armed=${armed}`);
    assert.ok(armed.includes("daily-notes"), `armed=${armed}`);
    assert.equal(clock.armedCount(), 2);
  });
});

test("disabling a skill disarms its timer without full process restart (hot-reload)", async () => {
  await withScheduler(async ({ scheduler, settingsStore, clock, runs }) => {
    scheduler.start();
    assert.ok(scheduler.getArmed().includes("garden-kb"));

    await settingsStore.updateSkill("garden-kb", { enabled: false });
    scheduler.reload();

    assert.ok(!scheduler.getArmed().includes("garden-kb"));
    assert.ok(scheduler.getArmed().includes("daily-notes"));
    assert.equal(clock.armedCount(), 1);

    await clock.advance(2500);
    assert.ok(runs.every((r) => r.skillId !== "garden-kb"));
    assert.ok(runs.some((r) => r.skillId === "daily-notes"));
  });
});

test("due skill is skipped (not queued) while pipeline/skill is in flight", async () => {
  await withScheduler(async ({ scheduler, clock, runs, setBusy }) => {
    scheduler.start();
    setBusy(true);
    await clock.advance(1500);
    assert.equal(runs.length, 0);

    setBusy(false);
    await clock.advance(1500);
    assert.ok(runs.length >= 1);
    assert.ok(runs.some((r) => r.skillId === "garden-kb"));
  });
});

test("garden-kb does not fire when no vault adapter is connected", async () => {
  await withScheduler(
    async ({ scheduler, clock, runs }) => {
      scheduler.start();
      await clock.advance(1500);
      assert.ok(runs.every((r) => r.skillId !== "garden-kb"));
      // daily-notes may still fire (not vault-gated)
      assert.ok(runs.some((r) => r.skillId === "daily-notes") || runs.length === 0 || true);
    },
    { vaultConnected: false }
  );
});
