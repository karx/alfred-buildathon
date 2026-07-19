const { createAdapterManager } = require("./adapterManager");

function createInputHub({ settingsStore, stateStore }) {
  const subscribers = new Set();
  const adapterManager = createAdapterManager({ settingsStore, stateStore });

  async function publish(event) {
    for (const subscriber of subscribers) {
      await subscriber(event);
    }
  }

  return {
    async start() {
      await adapterManager.start(publish);
    },

    async stop() {
      await adapterManager.stop();
      subscribers.clear();
    },

    subscribe(handler) {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },

    async publish(event) {
      await publish(event);
    },

    getAdapterManager() {
      return adapterManager;
    },
  };
}

module.exports = { createInputHub };
