const { listSkills, isRunnable } = require("./skillRegistry");

const DEFAULT_GARDEN_MS = Number(process.env.ALFRED_GARDEN_MS) || 15 * 60 * 1000;

/**
 * Skill scheduler (SKILLS_DESIGN Phase 2).
 * Arms interval timers for enabled, runnable, schedule/interval skills.
 * Hot-reloads on reload(); serializes runs (skip if busy); garden skips without vault.
 */
function createSkillScheduler({
  settingsStore,
  skillRunner,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  nowFn = () => Date.now(),
  log = console.log,
} = {}) {
  const timers = new Map(); // skillId -> handle

  function isVaultConnected() {
    const adapters = (settingsStore.get().adapters) || {};
    const vault = adapters.vault;
    if (!vault) return false;
    return Boolean(vault.config?.vaultPath || vault.connectedAt);
  }

  function isBusy() {
    if (skillRunner && typeof skillRunner.isRunning === "function") {
      return skillRunner.isRunning();
    }
    return false;
  }

  function resolveIntervalMs(skill, cfg = {}) {
    if (typeof cfg.intervalMs === "number" && cfg.intervalMs > 0) return cfg.intervalMs;
    if (typeof skill.intervalMs === "number" && skill.intervalMs > 0) return skill.intervalMs;
    // garden-kb default matches legacy ALFRED_GARDEN_MS
    if (skill.id === "garden-kb") return DEFAULT_GARDEN_MS;
    // daily-notes: default once-ish per day if only cron known
    if (skill.id === "daily-notes" && skill.schedule) return 24 * 60 * 60 * 1000;
    return null;
  }

  async function fire(skillId) {
    if (!settingsStore.isSkillEnabled(skillId)) {
      return { skipped: true, reason: "disabled" };
    }
    if (isBusy()) {
      log(`[Scheduler] Skip ${skillId} — pipeline busy`);
      return { skipped: true, reason: "busy" };
    }
    if (skillId === "garden-kb" && !isVaultConnected()) {
      log(`[Scheduler] Skip garden-kb — no vault connected`);
      return { skipped: true, reason: "no-vault" };
    }
    if (!skillRunner || typeof skillRunner.runSkill !== "function") {
      return { skipped: true, reason: "no-runner" };
    }
    log(`[Scheduler] Run ${skillId}`);
    return skillRunner.runSkill(skillId, { trigger: "schedule" });
  }

  function clearAll() {
    for (const handle of timers.values()) clearIntervalFn(handle);
    timers.clear();
  }

  function armAll() {
    clearAll();
    const skillSettings = settingsStore.getSkillSettings
      ? settingsStore.getSkillSettings()
      : settingsStore.get().skills || {};

    for (const skill of listSkills()) {
      if (!isRunnable(skill.id)) continue;
      if (skill.trigger !== "schedule" && !skill.intervalMs) continue;
      if (!settingsStore.isSkillEnabled(skill.id)) continue;

      const cfg = skillSettings[skill.id] || {};
      const ms = resolveIntervalMs(skill, cfg);
      if (!ms) continue;

      const handle = setIntervalFn(() => {
        fire(skill.id).catch((err) => {
          log(`[Scheduler] ${skill.id} error: ${err.message}`);
        });
      }, ms);
      timers.set(skill.id, handle);
      log(`[Scheduler] Armed ${skill.id} every ${ms}ms`);
    }
  }

  return {
    start() {
      armAll();
    },
    stop() {
      clearAll();
    },
    reload() {
      armAll();
    },
    fire,
    getArmed() {
      return [...timers.keys()];
    },
    isVaultConnected,
    now: nowFn,
  };
}

module.exports = { createSkillScheduler, DEFAULT_GARDEN_MS };
