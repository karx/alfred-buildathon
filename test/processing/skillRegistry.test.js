const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  SKILL_REGISTRY,
  getSkill,
  listSkills,
  isRunnable,
  EMBEDDED_SKILL_IDS,
} = require("../../src/processing/skillRegistry");
const { createSettingsStore } = require("../../src/settings/settingsStore");

test("SKILL_REGISTRY exposes embedded hops as named skills", () => {
  const expected = ["garden-kb", "create-todos", "reprioritize", "generate-nudges", "daily-notes"];
  assert.deepEqual(EMBEDDED_SKILL_IDS.slice().sort(), expected.slice().sort());

  for (const id of expected) {
    const skill = getSkill(id);
    assert.ok(skill, `missing skill ${id}`);
    assert.equal(skill.id, id);
    assert.equal(typeof skill.label, "string");
    assert.ok(skill.label.length > 0);
    assert.equal(typeof skill.description, "string");
    assert.ok(["schedule", "event", "intent"].includes(skill.trigger));
    assert.equal(typeof skill.defaultEnabled, "boolean");
    assert.equal(skill.runnable, true);
  }
});

test("ADHD-pack skills are present but stub / not runnable", () => {
  const adhdIds = [
    "daily-triage",
    "gtd",
    "interruption-recovery",
    "task-activation",
    "sparring-mode",
    "focus-companion",
    "delegation-router",
    "shutdown-review",
    "evidence-coping",
    "ethical-gamification",
  ];
  for (const id of adhdIds) {
    const skill = getSkill(id);
    assert.ok(skill, `missing ADHD skill ${id}`);
    assert.equal(skill.runnable, false);
    assert.ok(skill.stub === true || skill.source === "adhd-cos");
  }
  const all = listSkills();
  assert.ok(all.length >= expectedEmbeddedPlusAdhd());
});

function expectedEmbeddedPlusAdhd() {
  return 5 + 10;
}

test("listSkills returns registry entries with id/label/trigger/defaultEnabled", () => {
  const all = listSkills();
  assert.ok(Array.isArray(all));
  assert.ok(all.length >= 5);
  for (const s of all) {
    assert.equal(typeof s.id, "string");
    assert.equal(typeof s.label, "string");
    assert.equal(typeof s.description, "string");
    assert.ok(["schedule", "event", "intent"].includes(s.trigger));
    assert.equal(typeof s.defaultEnabled, "boolean");
  }
  assert.equal(isRunnable("garden-kb"), true);
  assert.equal(isRunnable("sparring-mode"), false);
  assert.equal(isRunnable("nope"), false);
});

test("settings skills block round-trips; disabled skill reports enabled false; unknown ids rejected", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-skills-settings-"));
  const store = createSettingsStore({ filePath: path.join(dir, "settings.json") });
  await store.load();

  // Defaults applied for known skills
  const defaults = store.getSkillSettings();
  assert.equal(defaults["garden-kb"].enabled, true);

  await store.updateSkill("garden-kb", { enabled: false });
  assert.equal(store.get().skills["garden-kb"].enabled, false);
  assert.equal(store.isSkillEnabled("garden-kb"), false);
  assert.equal(store.isSkillEnabled("create-todos"), true); // default on

  // Reload from disk
  const store2 = createSettingsStore({ filePath: path.join(dir, "settings.json") });
  await store2.load();
  assert.equal(store2.get().skills["garden-kb"].enabled, false);

  await assert.rejects(
    () => store.updateSkill("not-a-skill", { enabled: true }),
    /unknown skill/i
  );

  await fs.promises.rm(dir, { recursive: true, force: true });
});
