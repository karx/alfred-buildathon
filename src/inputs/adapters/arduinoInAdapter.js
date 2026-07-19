const { AdapterContract } = require("../adapterContract");
const { createNormalizedEvent } = require("../../core/eventContract");

class ArduinoInAdapter extends AdapterContract {
  constructor() {
    super({
      id: "arduino-in",
      label: "Arduino In",
      description: "Receives custom open hardware events. Initial transport: local HTTP POST.",
      configExample: {
        deviceId: "desk-controller-01",
        transport: "http",
        sharedSecret: "dev-secret",
      },
      eventTemplates: [
        {
          id: "audio-in",
          label: "Audio In",
          description: "Simulate audio/transcript input from hardware microphone module.",
          payload: {
            eventType: "audio-in",
            source: "desk-mic",
            transcript: "Captured audio transcript goes here",
            confidence: 0.9
          }
        },
        {
          id: "mode-toggle",
          label: "Mode Toggle",
          description: "Toggle an Alfred mode from hardware, e.g. sparring mode.",
          payload: {
            eventType: "mode-toggle",
            mode: "sparring",
            enabled: true
          }
        },
        {
          id: "nudge-ack",
          label: "Nudge Ack",
          description: "Acknowledge or snooze a nudge from hardware.",
          payload: {
            eventType: "nudge-ack",
            nudgeId: "nudge-demo-1",
            response: "acknowledged"
          }
        },
        {
          id: "sparring-button",
          label: "Sparring Button",
          description: "Physical button press requesting an explicit interactive sparring session.",
          payload: {
            eventType: "button",
            button: "sparring",
            state: "pressed"
          }
        },
        {
          id: "template-custom",
          label: "Custom Template Event",
          description: "Starting point for adding more hardware event templates.",
          payload: {
            eventType: "custom-template",
            name: "example",
            value: true
          }
        }
      ],
    });
  }

  async test(config = {}) {
    if (!config.deviceId) {
      return {
        ok: false,
        message: "deviceId is required",
        configExample: this.configExample,
      };
    }

    return {
      ok: true,
      message: "Arduino In config accepted",
      metadata: {
        deviceId: config.deviceId,
        transport: config.transport || "http",
        hasSharedSecret: Boolean(config.sharedSecret),
        ingestUrl: "/api/adapters/arduino-in/ingest",
      },
    };
  }

  async connect(config = {}) {
    const result = await this.test(config);
    if (!result.ok) return result;
    this.config = {
      transport: "http",
      ...config,
    };
    return { ok: true, message: "Arduino In connected" };
  }

  async ingest(payload = {}, { headers = {} } = {}) {
    if (!this.config) {
      return { ok: false, status: 409, message: "Arduino In adapter is not connected" };
    }

    const expectedSecret = this.config.sharedSecret;
    const providedSecret = headers["x-alfred-secret"] || headers["X-Alfred-Secret"];
    if (expectedSecret && providedSecret !== expectedSecret) {
      return { ok: false, status: 401, message: "Invalid Arduino shared secret" };
    }

    const eventType = payload.eventType || payload.type || "event";
    const normalizedEvent = createNormalizedEvent({
      source: "arduino-in",
      type: `arduino-in.hardware.${eventType}`,
      payload: {
        deviceId: payload.deviceId || this.config.deviceId,
        ...payload,
      },
    });

    if (this.publish) await this.publish(normalizedEvent);

    return {
      ok: true,
      status: 202,
      message: "Arduino event accepted",
      event: normalizedEvent,
    };
  }
}

module.exports = { ArduinoInAdapter };
