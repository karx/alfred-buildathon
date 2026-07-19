/**
 * Register output / actuator modules here.
 * Keep list small; each entry is a composable fan-out target.
 *
 * Built-in projections that predate this registry (still live):
 *   - SSE (/events)           — localServer outputHub.onPublish
 *   - Hardware GET /api/state — localServer projection
 *   - vaultStateSync          — stateStore.onChange → vault/Alfred/*
 *   - knowledgeBase           — write-through on granola meetings
 *
 * New actuators implement ActuatorContract and are listed below.
 */

const { DiscordWebhookActuator } = require("./actuators/discordWebhookActuator");

function createActuatorRegistry({ stateStore, settingsStore, outputHub } = {}) {
  const actuators = [
    new DiscordWebhookActuator(),
  ];

  // silence unused until an actuator needs constructor deps
  void stateStore;
  void settingsStore;
  void outputHub;

  return {
    list() {
      return actuators;
    },

    get(id) {
      return actuators.find((a) => a.id === id) || null;
    },
  };
}

module.exports = { createActuatorRegistry };
