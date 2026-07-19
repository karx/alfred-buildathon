const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStateStore } = require("../../src/state/stateStore");
const { createOutputHub } = require("../../src/outputs/outputHub");
const { createSkillRunner } = require("../../src/processing/skillRunner");

async function withRunner(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-skill-ev-"));
  const stateStore = createStateStore({ filePath: path.join(dir, "state.json") });
  await stateStore.load();
  const outputHub = createOutputHub();
  const events = [];
  outputHub.onPublish((e) => events.push(e));
  const skillRunner = createSkillRunner({ stateStore, outputHub });
  try {
    await fn({ skillRunner, stateStore, events });
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("runSkill emits alfred.skill.started and alfred.skill.done with skillId/trigger/timestamp", async () => {
  await withRunner(async ({ skillRunner, events }) => {
    await skillRunner.runSkill("daily-notes", { trigger: "manual" });
    const started = events.find((e) => e.channel === "alfred.skill.started");
    const done = events.find((e) => e.channel === "alfred.skill.done");
    assert.ok(started, `channels: ${events.map((e) => e.channel).join(",")}`);
    assert.ok(done);
    assert.equal(started.skillId, "daily-notes");
    assert.equal(started.trigger, "manual");
    assert.equal(typeof started.timestamp, "string");
    assert.equal(done.skillId, "daily-notes");
    assert.equal(done.trigger, "manual");
    assert.equal(typeof done.timestamp, "string");
    assert.ok("summary" in done);
  });
});

test("runSkill emits alfred.skill.error on failure", async () => {
  await withRunner(async ({ skillRunner, events, stateStore }) => {
    // Force daily-notes body to throw after started
    const orig = stateStore.patch.bind(stateStore);
    stateStore.patch = async (p) => {
      if (p.processingLog && String(p.processingLog).includes("daily-notes")) {
        throw new Error("boom daily-notes");
      }
      return orig(p);
    };
    await skillRunner.runSkill("daily-notes", { trigger: "schedule" });
    const errEv = events.find((e) => e.channel === "alfred.skill.error");
    assert.ok(errEv, `channels: ${events.map((e) => e.channel).join(",")}`);
    assert.equal(errEv.skillId, "daily-notes");
    assert.match(errEv.error || "", /boom/);
    assert.equal(stateStore.get().activeSkill, null);
  });
});
