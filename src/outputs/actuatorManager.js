const { createActuatorRegistry } = require("./actuatorRegistry");

/**
 * Composable actuator fan-out.
 * Each connected actuator gets the same context; none blocks the others.
 */
function createActuatorManager({ settingsStore, stateStore, outputHub }) {
  const registry = createActuatorRegistry({ settingsStore, stateStore, outputHub });
  let started = false;

  function savedActuators() {
    return settingsStore.get().actuators || {};
  }

  function buildContext() {
    return {
      getState: () => stateStore.get(),
      onStateChange: (fn) => stateStore.onChange(fn),
      onChannel: (fn) => outputHub.onPublish(fn),
      publish: (event) => outputHub.publish(event),
      settingsStore,
      stateStore,
      outputHub,
    };
  }

  return {
    listActuators() {
      const saved = savedActuators();
      return registry.list().map((actuator) => ({
        id: actuator.id,
        label: actuator.label,
        description: actuator.description,
        connected: Boolean(saved[actuator.id]),
        config: saved[actuator.id]?.config || null,
        configExample: actuator.configExample,
        actions: actuator.actions || [],
        channels: actuator.channels || [],
        triggers: actuator.triggers || [],
        runtime: actuator.status(),
      }));
    },

    getActuator(id) {
      return registry.get(id);
    },

    async test(id, config = {}) {
      const actuator = registry.get(id);
      if (!actuator) return { ok: false, message: `Unknown actuator: ${id}` };
      return actuator.test(config);
    },

    async connect(id, config = {}) {
      const actuator = registry.get(id);
      if (!actuator) return { ok: false, message: `Unknown actuator: ${id}` };

      const result = await actuator.connect(config);
      if (!result.ok) return result;

      if (!result.pending && settingsStore.updateActuator) {
        await settingsStore.updateActuator(id, {
          config: actuator.config || config,
          connectedAt: new Date().toISOString(),
        });
      }

      if (started) {
        await actuator.stop();
        await actuator.start(buildContext());
      }

      return result;
    },

    async disconnect(id) {
      const actuator = registry.get(id);
      if (!actuator) return { ok: false, message: `Unknown actuator: ${id}` };
      await actuator.disconnect();
      if (settingsStore.removeActuator) await settingsStore.removeActuator(id);
      return { ok: true, message: `${id} disconnected` };
    },

    async runAction(id, actionId, payload = {}) {
      const actuator = registry.get(id);
      if (!actuator) return { ok: false, status: 404, message: `Unknown actuator: ${id}` };
      return actuator.runAction(actionId, payload);
    },

    async start() {
      started = true;
      const ctx = buildContext();
      const saved = savedActuators();

      for (const actuator of registry.list()) {
        try {
          const state = saved[actuator.id];
          if (state?.config) {
            const result = await actuator.connect(state.config);
            if (!result.ok) {
              console.error(`[Actuator] ${actuator.id} restore failed: ${result.message}`);
              continue;
            }
          }
          // Start even without saved config if actuator allows zero-config (e.g. local log)
          if (actuator.config || actuator.triggers?.includes("always")) {
            await actuator.start(ctx);
            console.log(`[Actuator] started ${actuator.id}`);
          } else if (!state?.config && Object.keys(actuator.configExample || {}).length === 0) {
            await actuator.connect({});
            await actuator.start(ctx);
            console.log(`[Actuator] started ${actuator.id} (zero-config)`);
          }
        } catch (err) {
          console.error(`[Actuator] ${actuator.id} start error:`, err.message);
        }
      }
    },

    async stop() {
      started = false;
      for (const actuator of registry.list()) {
        try {
          await actuator.stop();
        } catch (err) {
          console.error(`[Actuator] ${actuator.id} stop error:`, err.message);
        }
      }
    },
  };
}

module.exports = { createActuatorManager };
