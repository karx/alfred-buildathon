const fs = require("fs");
const path = require("path");

const DEFAULT_SETTINGS = {
  appName: "Finalizing Alfred",
  port: 3737,
  adapters: {},
  actuators: {},
  recentEventLimit: 100,
};

function createSettingsStore({ filePath = path.join(process.cwd(), "config/settings.local.json") } = {}) {
  let settings = { ...DEFAULT_SETTINGS };

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
      await persist();
      return settings;
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
