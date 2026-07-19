/**
 * Output / Actuator contract — mirror of input AdapterContract, for
 * mechanisms that project Alfred state outward (hardware, chat, vault, webhooks).
 *
 * Lifecycle: construct → test → connect → start(ctx) → stop → disconnect
 *
 * Context given to start():
 *   getState()           → current stateStore snapshot
 *   onStateChange(fn)    → subscribe to state patches; returns unsubscribe
 *   onChannel(fn)        → subscribe to outputHub events { channel, ... }; returns unsub
 *   publish(event)       → optional feedback into outputHub (e.g. alfred.actuator.sent)
 *   settingsStore        → read settings if needed
 */
class ActuatorContract {
  constructor({
    id,
    label,
    description,
    configExample = {},
    actions = [],
    // Channels this actuator cares about (documentation + filtering helpers)
    channels = [],
    // Does it need full state snapshots, channel bus, or both?
    triggers = ["state"], // "state" | "channel" | "manual"
  }) {
    if (!id) throw new Error("Actuator requires id");
    if (!label) throw new Error("Actuator requires label");

    this.id = id;
    this.label = label;
    this.description = description || "";
    this.configExample = configExample;
    this.actions = actions;
    this.channels = channels;
    this.triggers = triggers;
    this.config = null;
    this.started = false;
    this._ctx = null;
    this._unsubs = [];
  }

  async test(_config) {
    return { ok: false, message: `${this.id} test not implemented` };
  }

  async connect(config = {}) {
    this.config = config || {};
    return { ok: true, message: `${this.id} connected` };
  }

  async disconnect() {
    await this.stop();
    this.config = null;
    return { ok: true, message: `${this.id} disconnected` };
  }

  /**
   * @param {object} ctx — see file header
   */
  async start(ctx = {}) {
    this._ctx = ctx;
    this.started = true;
  }

  async stop() {
    for (const unsub of this._unsubs) {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    }
    this._unsubs = [];
    this._ctx = null;
    this.started = false;
  }

  /** Helper: track unsubscribers cleaned on stop */
  track(unsub) {
    if (typeof unsub === "function") this._unsubs.push(unsub);
    return unsub;
  }

  async runAction(actionId, payload = {}) {
    return { ok: false, message: `${this.id} action not implemented: ${actionId}`, payload };
  }

  /**
   * Optional: project current state to external form (for /api/state-like pulls).
   * Return null if this actuator is push-only.
   */
  project(_state) {
    return null;
  }

  status() {
    return {
      id: this.id,
      label: this.label,
      description: this.description,
      started: this.started,
      connected: Boolean(this.config),
      channels: this.channels,
      triggers: this.triggers,
      actions: this.actions,
      configExample: this.configExample,
    };
  }
}

module.exports = { ActuatorContract };
