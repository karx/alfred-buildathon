const fs = require("fs");
const path = require("path");
const { getSkill, defaultSkillSettings } = require("../processing/skillRegistry");

const DEFAULT_SETTINGS = {
  appName: "Finalizing Alfred",
  port: 3737,
  adapters: {},
  actuators: {},
  skills: defaultSkillSettings(),
  recentEventLimit: 100,
};

function mergeSkillSettings(saved = {}) {
  const defaults = defaultSkillSettings();
  const merged = { ...defaults };
  for (const [id, val] of Object.entries(saved)) {
    if (!defaults[id]) continue; // drop unknown ids on load
    merged[id] = { ...defaults[id], ...val };
  }
  return merged;
}

function createSettingsStore({ filePath = path.join(process.cwd(), "config/settings.local.json") } = {}) {
  let settings = {
    ...DEFAULT_SETTINGS,
    skills: defaultSkillSettings(),
  };

  async function persist() {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(settings, null, 2));
  }

  return {
    async load() {
      if (!fs.existsSync(filePath)) {
        await persist();
        return settings;
      }

      const content = await fs.promises.readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      settings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        adapters: parsed.adapters || {},
        actuators: parsed.actuators || {},
        skills: mergeSkillSettings(parsed.skills || {}),
      };
      return settings;
    },

    get() {
      return settings;
    },

    async update(patch) {
      settings = {
        ...settings,
        ...patch,
      };
      if (patch.skills) {
        settings.skills = mergeSkillSettings(patch.skills);
      }
      await persist();
      return settings;
    },

    getSkillSettings() {
      return settings.skills || defaultSkillSettings();
    },

    isSkillEnabled(id) {
      const skill = getSkill(id);
      if (!skill) return false;
      const entry = (settings.skills || {})[id];
      if (entry && typeof entry.enabled === "boolean") return entry.enabled;
      return skill.defaultEnabled;
    },

    async updateSkill(id, patch = {}) {
      if (!getSkill(id)) {
        throw new Error(`Unknown skill: ${id}`);
      }
      const prev = (settings.skills && settings.skills[id]) || {
        enabled: getSkill(id).defaultEnabled,
      };
      settings = {
        ...settings,
        skills: {
          ...settings.skills,
          [id]: { ...prev, ...patch },
        },
      };
      await persist();
      return settings.skills[id];
    },

    async updateAdapter(id, adapterState) {
      settings = {
        ...settings,
        adapters: {
          ...settings.adapters,
          [id]: adapterState,
        },
      };
      await persist();
      return settings.adapters[id];
    },

    async removeAdapter(id) {
      const nextAdapters = { ...settings.adapters };
      delete nextAdapters[id];
      settings = {
        ...settings,
        adapters: nextAdapters,
      };
      await persist();
    },

    async updateActuator(id, actuatorState) {
      settings = {
        ...settings,
        actuators: {
          ...settings.actuators,
          [id]: actuatorState,
        },
      };
      await persist();
      return settings.actuators[id];
    },

    async removeActuator(id) {
      const next = { ...settings.actuators };
      delete next[id];
      settings = { ...settings, actuators: next };
      await persist();
    },
  };
}

module.exports = { createSettingsStore, DEFAULT_SETTINGS };
