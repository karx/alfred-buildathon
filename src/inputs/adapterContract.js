class AdapterContract {
  constructor({ id, label, description, configExample = {}, actions = [], eventTemplates = [] }) {
    if (!id) throw new Error("Adapter requires id");
    if (!label) throw new Error("Adapter requires label");

    this.id = id;
    this.label = label;
    this.description = description || "";
    this.configExample = configExample;
    this.actions = actions;
    this.eventTemplates = eventTemplates;
    this.config = null;
    this.publish = null;
    this.started = false;
  }

  async connect(config) {
    this.config = config || {};
    return { ok: true };
  }

  async disconnect() {
    await this.stop();
    this.config = null;
    return { ok: true };
  }

  async test(_config) {
    return { ok: false, message: `${this.id} test not implemented` };
  }

  async runAction(actionId, payload = {}) {
    return { ok: false, message: `${this.id} action not implemented: ${actionId}`, payload };
  }

  async start(publish) {
    this.publish = publish;
    this.started = true;
  }

  async stop() {
    this.publish = null;
    this.started = false;
  }

  status() {
    return {
      id: this.id,
      label: this.label,
      description: this.description,
      started: this.started,
      actions: this.actions,
      eventTemplates: this.eventTemplates,
    };
  }
}

module.exports = { AdapterContract };
