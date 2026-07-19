const fs = require("fs");
const path = require("path");

const DEFAULT_SETTINGS = {
  appName: "Finalizing Alfred",
  port: 3737,
  adapters: {},
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
      settings = {
        ...DEFAULT_SETTINGS,
        ...JSON.parse(content),
        adapters: JSON.parse(content).adapters || {},
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
  };
}

module.exports = { createSettingsStore, DEFAULT_SETTINGS };
