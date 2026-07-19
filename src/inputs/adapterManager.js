const { createAdapterRegistry } = require("./adapterRegistry");

function createAdapterManager({ settingsStore, stateStore }) {
  const registry = createAdapterRegistry({ stateStore, settingsStore });
  let publishFn = null;
  let started = false;

  function savedAdapters() {
    return settingsStore.get().adapters || {};
  }

  function adapterState(id) {
    return savedAdapters()[id] || null;
  }

  return {
    listAdapters() {
      const saved = savedAdapters();
      return registry.list().map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
        description: adapter.description,
        connected: Boolean(saved[adapter.id]),
        config: saved[adapter.id]?.config || null,
        configExample: adapter.configExample,
        actions: adapter.actions || [],
        eventTemplates: adapter.eventTemplates || [],
        runtime: adapter.status(),
      }));
    },

    getAdapter(id) {
      return registry.get(id);
    },

    async test(id, config = {}) {
      const adapter = registry.get(id);
      if (!adapter) return { ok: false, message: `Unknown adapter: ${id}` };
      return adapter.test(config);
    },

    async connect(id, config = {}) {
      const adapter = registry.get(id);
      if (!adapter) return { ok: false, message: `Unknown adapter: ${id}` };

      const result = await adapter.connect(config);
      if (!result.ok) return result;

      // Skip persisting if adapter handles its own config persistence (e.g. async OAuth)
      if (!result.pending) {
        await settingsStore.updateAdapter(id, {
          config: adapter.config || config,
          connectedAt: new Date().toISOString(),
        });
      }

      if (started && publishFn) {
        await adapter.stop();
        await adapter.start(publishFn);
      }

      return result;
    },

    async disconnect(id) {
      const adapter = registry.get(id);
      if (!adapter) return { ok: false, message: `Unknown adapter: ${id}` };
      await adapter.disconnect();
      await settingsStore.removeAdapter(id);
      return { ok: true, message: `${id} disconnected` };
    },

    async ingest(id, payload, meta = {}) {
      const adapter = registry.get(id);
      if (!adapter) return { ok: false, status: 404, message: `Unknown adapter: ${id}` };
      if (typeof adapter.ingest !== "function") {
        return { ok: false, status: 405, message: `${id} does not support direct ingest` };
      }
      return adapter.ingest(payload, meta);
    },

    async runAction(id, actionId, payload = {}) {
      const adapter = registry.get(id);
      if (!adapter) return { ok: false, status: 404, message: `Unknown adapter: ${id}` };
      if (typeof adapter.runAction !== "function") {
        return { ok: false, status: 405, message: `${id} does not support actions` };
      }
      return adapter.runAction(actionId, payload);
    },

    async start(publish) {
      publishFn = publish;
      started = true;

      for (const adapter of registry.list()) {
        const state = adapterState(adapter.id);
        if (state?.config) {
          const result = await adapter.connect(state.config);
          if (!result.ok) {
            console.error(`Adapter ${adapter.id} failed to restore: ${result.message}`);
            continue;
          }
        }
        await adapter.start(publishFn);
      }
    },

    async stop() {
      started = false;
      for (const adapter of registry.list()) {
        await adapter.stop();
      }
      publishFn = null;
    },
  };
}

module.exports = { createAdapterManager };
