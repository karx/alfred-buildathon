/**
 * Discord Webhook actuator — push Alfred state updates as rich embeds.
 * Config: webhookUrl (required), enabled (default true).
 * Never commit webhook URLs; store via Settings / connect API only.
 */

const { ActuatorContract } = require("../actuatorContract");

const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/i;

const EMBED_COLOR = 0x5865f2; // Discord blurple
const DEBOUNCE_MS = 2000;
const FETCH_TIMEOUT_MS = 8000;

function isDiscordWebhookUrl(url) {
  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    return false;
  }
  return DISCORD_WEBHOOK_RE.test(String(url).trim());
}

function activeNudges(state) {
  return (state?.nudges || []).filter((n) => !n.acked);
}

function openTodos(state) {
  return (state?.todos || []).filter((t) => t.status !== "done");
}

function fingerprintState(state) {
  const nudges = activeNudges(state)
    .map((n) => n.id || n.text || "")
    .join("|");
  const todos = openTodos(state)
    .map((t) => `${t.id}:${t.status}`)
    .join("|");
  return [
    state?.nowState?.mode || "",
    state?.nowState?.context || "",
    state?.processingStatus || "",
    state?.pendingBuzzer ? "1" : "0",
    state?.dailySummary || "",
    nudges,
    todos,
    String((state?.inbox || []).length),
  ].join("::");
}

class DiscordWebhookActuator extends ActuatorContract {
  /**
   * @param {{ fetchImpl?: typeof fetch }} [opts]
   */
  constructor({ fetchImpl } = {}) {
    super({
      id: "discord-webhook",
      label: "Discord Webhook",
      description:
        "Posts Alfred state updates to a Discord channel as rich embeds (title + body).",
      configExample: {
        webhookUrl: "https://discord.com/api/webhooks/ID/TOKEN",
        enabled: true,
      },
      actions: [
        {
          id: "send-test",
          label: "Send test",
          description: "Post a sample embed so you can verify the channel.",
        },
      ],
      channels: [],
      triggers: ["state", "manual"],
    });
    this._fetch = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.debounceMs = DEBOUNCE_MS;
    this._lastSentAt = 0;
    this._lastFingerprint = null;
    this._debounceTimer = null;
  }

  async test(config = {}) {
    const webhookUrl = config.webhookUrl || config.url;
    if (!webhookUrl) {
      return {
        ok: false,
        message: "webhookUrl is required",
        configExample: this.configExample,
      };
    }
    if (!isDiscordWebhookUrl(webhookUrl)) {
      return {
        ok: false,
        message:
          "webhookUrl must be a Discord webhook URL (https://discord.com/api/webhooks/...)",
      };
    }
    return { ok: true, message: "Discord Webhook config ok" };
  }

  async connect(config = {}) {
    const result = await this.test(config);
    if (!result.ok) return result;
    this.config = {
      webhookUrl: String(config.webhookUrl || config.url).trim(),
      enabled: config.enabled !== false,
    };
    return { ok: true, message: "Discord Webhook connected" };
  }

  async disconnect() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    return super.disconnect();
  }

  async start(ctx) {
    await super.start(ctx);

    this.track(
      ctx.onStateChange((state) => {
        this._scheduleStateDeliver(state).catch((err) => {
          console.error(`[${this.id}]`, err.message);
        });
      })
    );
  }

  async stop() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
    return super.stop();
  }

  /**
   * Debounce rapid state patches; skip identical fingerprints.
   */
  async _scheduleStateDeliver(state) {
    if (!this.config?.webhookUrl || this.config.enabled === false) return;

    if (this._debounceTimer) clearTimeout(this._debounceTimer);

    return new Promise((resolve) => {
      this._debounceTimer = setTimeout(async () => {
        this._debounceTimer = null;
        try {
          const fp = fingerprintState(state);
          if (fp === this._lastFingerprint) {
            resolve({ ok: true, message: "unchanged" });
            return;
          }
          await this.deliver(this.mapStateToPayload(state), { fingerprint: fp });
          resolve({ ok: true });
        } catch (err) {
          console.error(`[${this.id}]`, err.message);
          await this._publishError(err.message);
          resolve({ ok: false, message: err.message });
        }
      }, this.debounceMs);
    });
  }

  mapStateToPayload(state) {
    const mode = state?.nowState?.mode || "unknown";
    const context = state?.nowState?.context || "";
    const active = activeNudges(state);
    const todos = openTodos(state);
    const topNudge = active[0];
    const processing = state?.processingStatus || "idle";
    const buzzer = state.pendingBuzzer ? "yes" : "no";

    const lines = [
      `**Mode:** ${mode}${context ? ` · ${context}` : ""}`,
      `**Processing:** ${processing}`,
      `**Open todos:** ${todos.length}`,
      `**Active nudges:** ${active.length}`,
      `**Buzzer:** ${buzzer}`,
    ];

    if (topNudge?.text) {
      lines.push("", `**Top nudge:** ${String(topNudge.text).slice(0, 200)}`);
    }

    if (state?.dailySummary) {
      lines.push("", String(state.dailySummary).slice(0, 300));
    }

    return {
      embeds: [
        {
          title: `Alfred · ${mode}`,
          description: lines.join("\n").slice(0, 4000),
          color: EMBED_COLOR,
          timestamp: new Date().toISOString(),
          footer: { text: "alfred-buildathon · discord-webhook" },
        },
      ],
    };
  }

  mapTestPayload() {
    return {
      embeds: [
        {
          title: "Alfred · test",
          description:
            "Discord Webhook actuator is connected.\nThis is a **send-test** message — safe to ignore.",
          color: EMBED_COLOR,
          timestamp: new Date().toISOString(),
          footer: { text: "alfred-buildathon · send-test" },
        },
      ],
    };
  }

  /**
   * @param {object} body - Discord webhook JSON body
   * @param {{ skipDebounce?: boolean, fingerprint?: string|null }} [opts]
   */
  async deliver(body, opts = {}) {
    if (!this.config?.webhookUrl) {
      return { ok: false, message: "not configured" };
    }
    if (this.config.enabled === false && !opts.skipDebounce) {
      return { ok: false, message: "disabled" };
    }

    const res = await this._fetch(this.config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    // Discord returns 204 No Content on success
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`Discord HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }

    this._lastSentAt = Date.now();
    if (opts.fingerprint != null) this._lastFingerprint = opts.fingerprint;

    if (this._ctx?.publish) {
      await this._ctx
        .publish({
          channel: "alfred.actuator.sent",
          timestamp: new Date().toISOString(),
          actuatorId: this.id,
          ok: true,
        })
        .catch(() => {});
    }

    return { ok: true };
  }

  async _publishError(message) {
    if (!this._ctx?.publish) return;
    await this._ctx
      .publish({
        channel: "alfred.actuator.error",
        timestamp: new Date().toISOString(),
        actuatorId: this.id,
        message,
      })
      .catch(() => {});
  }

  async runAction(actionId) {
    if (actionId === "send-test") {
      if (!this.config?.webhookUrl) {
        return { ok: false, message: "Connect with webhookUrl first" };
      }
      try {
        await this.deliver(this.mapTestPayload(), { skipDebounce: true });
        return { ok: true, message: "Test embed sent to Discord" };
      } catch (err) {
        await this._publishError(err.message);
        return { ok: false, message: err.message };
      }
    }
    return { ok: false, message: `Unknown action: ${actionId}` };
  }
}

module.exports = {
  DiscordWebhookActuator,
  isDiscordWebhookUrl,
  fingerprintState,
  DEBOUNCE_MS,
};
