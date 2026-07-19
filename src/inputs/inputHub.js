const { createAdapterManager } = require("./adapterManager");
const { createInputHitLog } = require("./inputHitLog");

function createInputHub({ settingsStore, stateStore, hitLogLimit = 200 } = {}) {
  const subscribers = new Set();
  const adapterManager = createAdapterManager({ settingsStore, stateStore });
  const hitLog = createInputHitLog({ limit: hitLogLimit });

  async function publish(event) {
    // Log every input hit before handlers (demo backstage + console)
    try {
      const hit = hitLog.recordEvent(event, { transport: "adapter" });
      const summary = hit.payload
        ? " " + JSON.stringify(hit.payload)
        : "";
      console.log(`[Input] ${hit.source} → ${hit.type}${summary}`);
    } catch (err) {
      console.error("[Input] hit log error:", err.message);
    }

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

    getHitLog() {
      return hitLog;
    },
  };
}

module.exports = { createInputHub };
