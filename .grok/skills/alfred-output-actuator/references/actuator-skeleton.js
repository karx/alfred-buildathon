/**
 * Copy to: src/outputs/actuators/<name>Actuator.js
 * Register in: src/outputs/actuatorRegistry.js
 */

const { ActuatorContract } = require("../actuatorContract");

class ExampleActuator extends ActuatorContract {
  constructor() {
    super({
      id: "example-out",
      label: "Example Out",
      description: "Pushes a short text when Alfred finishes processing.",
      configExample: {
        url: "https://example.com/hook",
        // keep required fields ≤ 3
      },
      actions: [
        {
          id: "send-test",
          label: "Send test",
          description: "Deliver a sample payload so you can verify the destination.",
        },
      ],
      channels: ["alfred.processing.done"],
      triggers: ["channel", "manual"],
    });
    this._lastSentAt = 0;
    this.debounceMs = 1500;
  }

  async test(config = {}) {
    if (!config.url) {
      return { ok: false, message: "url is required", configExample: this.configExample };
    }
    try {
      // eslint-disable-next-line no-new
      new URL(config.url);
    } catch {
      return { ok: false, message: "url is not a valid URL" };
    }
    return { ok: true, message: "Example Out config ok" };
  }

  async connect(config = {}) {
    const result = await this.test(config);
    if (!result.ok) return result;
    this.config = { ...config };
    return { ok: true, message: "Example Out connected" };
  }

  async start(ctx) {
    await super.start(ctx);

    this.track(
      ctx.onChannel(async (evt) => {
        try {
          if (!this.channels.includes(evt.channel)) return;
          await this.deliver({
            text: `Alfred processing done · todos=${evt.todoCount ?? "?"} nudges=${evt.nudgeCount ?? "?"}`,
            channel: evt.channel,
          });
        } catch (err) {
          console.error(`[${this.id}]`, err.message);
          await ctx.publish({
            channel: "alfred.actuator.error",
            timestamp: new Date().toISOString(),
            actuatorId: this.id,
            message: err.message,
          }).catch(() => {});
        }
      })
    );
  }

  async deliver(payload) {
    if (!this.config?.url) return { ok: false, message: "not configured" };

    const now = Date.now();
    if (now - this._lastSentAt < this.debounceMs && payload.channel !== "test") {
      return { ok: true, message: "debounced" };
    }
    this._lastSentAt = now;

    const res = await fetch(this.config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "alfred",
        actuator: this.id,
        ...payload,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    if (this._ctx?.publish) {
      await this._ctx.publish({
        channel: "alfred.actuator.sent",
        timestamp: new Date().toISOString(),
        actuatorId: this.id,
        ok: true,
      });
    }

    return { ok: true };
  }

  async runAction(actionId) {
    if (actionId === "send-test") {
      await this.deliver({ text: "Alfred test — ignore", channel: "test" });
      return { ok: true, message: "Test payload sent" };
    }
    return { ok: false, message: `Unknown action: ${actionId}` };
  }
}

module.exports = { ExampleActuator };
