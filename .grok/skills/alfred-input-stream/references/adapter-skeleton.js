/**
 * Alfred input adapter skeleton — copy into:
 *   src/inputs/adapters/<name>Adapter.js
 *
 * Then:
 *   1. Register in adapterRegistry.js
 *   2. Add id to VALID_SOURCES in eventContract.js
 *   3. Wire INBOX_SOURCES / control branch in app.js if needed
 *   4. Refine classifyItem / hopExtract in skillRunner.js if inbox
 */

const { AdapterContract } = require("../adapterContract");
const { createNormalizedEvent } = require("../../core/eventContract");

class ExampleAdapter extends AdapterContract {
  constructor(/* { stateStore, settingsStore } = {} */) {
    super({
      id: "example", // kebab-case; must be in VALID_SOURCES
      label: "Example",
      description: "Short description shown in Settings.",
      configExample: {
        // plain fields render in Settings automatically
        apiKey: "",
        pollIntervalMs: 60000,
      },
      actions: [
        // {
        //   id: "poll-now",
        //   label: "Poll Now",
        //   description: "Fetch latest items immediately.",
        // },
      ],
      eventTemplates: [
        // {
        //   id: "sample",
        //   label: "Sample event",
        //   description: "Simulated payload for Settings ingest.",
        //   payload: { eventType: "sample", title: "Hello" },
        // },
      ],
    });
    this.timer = null;
    // this.stateStore = stateStore;
  }

  async test(config = {}) {
    if (!config.apiKey) {
      return { ok: false, message: "apiKey is required", configExample: this.configExample };
    }
    return { ok: true, message: "Example config accepted" };
  }

  async connect(config = {}) {
    const result = await this.test(config);
    if (!result.ok) return result;
    this.config = { pollIntervalMs: 60000, ...config };
    return { ok: true, message: "Example connected" };
  }

  async start(publish) {
    await super.start(publish);
    // Pull pattern: poll on interval
    // const ms = this.config?.pollIntervalMs || 60000;
    // this.timer = setInterval(() => this.poll().catch((e) => console.error("[Example]", e.message)), ms);
    // await this.poll();
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await super.stop();
  }

  /**
   * Push pattern: POST /api/adapters/example/ingest
   */
  async ingest(payload = {}, { headers = {} } = {}) {
    if (!this.config) {
      return { ok: false, status: 409, message: "Example adapter is not connected" };
    }

    // Optional shared secret:
    // const expected = this.config.sharedSecret;
    // const got = headers["x-alfred-secret"];
    // if (expected && got !== expected) {
    //   return { ok: false, status: 401, message: "Invalid shared secret" };
    // }

    const event = createNormalizedEvent({
      source: this.id,
      type: `${this.id}.item.new`,
      payload: {
        title: payload.title || "Untitled",
        ...payload,
      },
    });

    if (this.publish) await this.publish(event);

    return {
      ok: true,
      status: 202,
      message: "Example event accepted",
      event,
    };
  }

  async runAction(actionId, _payload = {}) {
    if (actionId === "poll-now") {
      await this.poll();
      return { ok: true, message: "Poll complete" };
    }
    return { ok: false, status: 404, message: `Unknown action: ${actionId}` };
  }

  async poll() {
    if (!this.config || !this.publish) return;
    // const items = await fetchFromApi(this.config);
    // for (const item of items) {
    //   if (alreadySeen(item.id)) continue;
    //   await this.publish(createNormalizedEvent({
    //     source: this.id,
    //     type: `${this.id}.item.new`,
    //     payload: item,
    //   }));
    //   await markSeen(item.id);
    // }
  }
}

module.exports = { ExampleAdapter };
