const { VaultAdapter } = require("./adapters/vaultAdapter");
const { SlackAdapter } = require("./adapters/slackAdapter");
const { DiscordAdapter } = require("./adapters/discordAdapter");
const { ArduinoInAdapter } = require("./adapters/arduinoInAdapter");
const { GranolaAdapter } = require("./adapters/granolaAdapter");

function createAdapterRegistry({ stateStore, settingsStore } = {}) {
  const adapters = [
    new VaultAdapter(),
    new GranolaAdapter({ stateStore, settingsStore }),
    new DiscordAdapter(),
    new SlackAdapter(),
    new ArduinoInAdapter(),
  ];

  return {
    list() {
      return adapters;
    },

    get(id) {
      return adapters.find((adapter) => adapter.id === id) || null;
    },
  };
}

module.exports = { createAdapterRegistry };
