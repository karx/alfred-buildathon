const { AdapterContract } = require("../adapterContract");

class DiscordAdapter extends AdapterContract {
  constructor() {
    super({
      id: "discord",
      label: "Discord",
      description: "Discord input adapter for an open community/chat ecosystem. First pass validates config; bot/gateway/webhook ingestion comes next.",
      configExample: {
        mode: "bot-gateway",
        botToken: "Bot ***",
        guildId: "",
        channelIds: [],
        publicKey: "",
      },
      eventTemplates: [
        {
          id: "message-create",
          label: "Message Create",
          description: "Future normalized Discord message input shape.",
          payload: {
            eventType: "message-create",
            guildId: "demo-guild",
            channelId: "demo-channel",
            author: "demo-user",
            content: "Alfred, capture this as a task"
          }
        }
      ],
    });
  }

  async test(config = {}) {
    if (!config.botToken && !config.publicKey) {
      return {
        ok: false,
        message: "Provide botToken for Gateway/Bot mode or publicKey for Interactions verification.",
        configExample: this.configExample,
      };
    }

    return {
      ok: true,
      message: "Discord config shape accepted. Network verification is pending.",
      metadata: {
        mode: config.mode || "bot-gateway",
        hasBotToken: Boolean(config.botToken),
        hasPublicKey: Boolean(config.publicKey),
        guildId: config.guildId || null,
        channelCount: Array.isArray(config.channelIds) ? config.channelIds.length : 0,
      },
    };
  }

  async connect(config = {}) {
    const result = await this.test(config);
    if (!result.ok) return result;
    this.config = { ...config };
    return { ok: true, message: "Discord adapter connected in scaffold mode" };
  }
}

module.exports = { DiscordAdapter };
