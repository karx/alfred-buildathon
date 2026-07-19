function createOutputHub({ recentEventLimit = 100 } = {}) {
  const listeners = new Set();
  const recent = [];

  async function publish(event) {
    recent.push(event);
    while (recent.length > recentEventLimit) recent.shift();

    for (const listener of listeners) {
      await listener(event);
    }
  }

  return {
    onPublish(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async publish(event) {
      await publish(event);
    },

    getRecent() {
      return [...recent];
    },
  };
}

module.exports = { createOutputHub };
