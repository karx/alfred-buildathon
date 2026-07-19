const { validateNormalizedEvent } = require("../core/eventContract");

function createPipeline({ inputHub, outputHub }) {
  let unsubscribe = null;

  async function handleInputEvent(event) {
    const validation = validateNormalizedEvent(event);

    if (!validation.ok) {
      await outputHub.publish({
        channel: "pipeline.error",
        timestamp: new Date().toISOString(),
        error: "Invalid normalized event",
        details: validation.errors,
        event,
      });
      return;
    }

    await outputHub.publish({
      channel: "pipeline.event",
      timestamp: new Date().toISOString(),
      event,
    });
  }

  return {
    async start() {
      unsubscribe = inputHub.subscribe(handleInputEvent);
    },

    async stop() {
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    },
  };
}

module.exports = { createPipeline };
