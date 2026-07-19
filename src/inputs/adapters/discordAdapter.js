/**
 * Discord input — Bot Gateway, mention-only → alfred inbox.
 *
 * Config (settings, never commit):
 *   botToken   (required)  Discord bot token
 *   guildId    (optional)  only this guild
 *   channelIds (optional)  allowlist; string[] or comma-separated string
 *
 * Mentions work without privileged Message Content Intent (see DISCORD_INTEGRATION.md).
 * Output actuator `discord-webhook` is separate (does not share this token).
 */

const { AdapterContract } = require("../adapterContract");
const { createNormalizedEvent } = require("../../core/eventContract");
const {
  createDiscordGateway,
  normalizeBotToken,
  botAuthHeader,
  isBotMentioned,
  stripBotMentions,
  API_BASE,
} = require("./discordGateway");

const SEEN_LIMIT = 500;

function parseChannelIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeConfig(config = {}) {
  return {
    botToken: normalizeBotToken(config.botToken || config.token || ""),
    guildId: config.guildId ? String(config.guildId).trim() : "",
    channelIds: parseChannelIds(config.channelIds),
  };
}

/**
 * Optional bootstrap from process env (never commit real tokens).
 * Prefer DISCORD_BOT_TOKEN. DISCORD_BOT_SECRET is accepted as an alias
 * but must be the **Bot token** from Developer Portal → Bot, not the
 * OAuth2 client secret.
 */
function configFromEnv(env = process.env) {
  const botToken = normalizeBotToken(
    env.DISCORD_BOT_TOKEN || env.DISCORD_BOT_SECRET || env.DISCORD_TOKEN || ""
  );
  if (!botToken) return null;
  return {
    botToken,
    guildId: (env.DISCORD_GUILD_ID || "").trim(),
    channelIds: parseChannelIds(env.DISCORD_CHANNEL_IDS || ""),
  };
}

function looksLikeBotToken(token) {
  // Classic bot tokens are three base64url segments: id.timestamp.hmac
  const parts = String(token || "").split(".");
  return parts.length === 3 && parts.every((p) => p.length >= 4);
}

class DiscordAdapter extends AdapterContract {
  /**
   * @param {{ fetchImpl?: typeof fetch, WebSocketImpl?: typeof WebSocket, createGateway?: Function }} [deps]
   */
  constructor(deps = {}) {
    super({
      id: "discord",
      label: "Discord",
      description:
        "Bot Gateway: @mentions of the bot become inbox items (todos/nudges) and vault notes.",
      configExample: {
        botToken: "",
        guildId: "",
        channelIds: [],
      },
      actions: [
        {
          id: "reconnect",
          label: "Reconnect gateway",
          description: "Drop and re-open the Discord Gateway connection.",
        },
        {
          id: "status",
          label: "Gateway status",
          description: "Show connection state and bot identity.",
        },
      ],
      eventTemplates: [
        {
          id: "mention-message",
          label: "Bot mention",
          description: "Simulate a message that @mentions Alfred (no live Discord needed).",
          payload: {
            eventType: "message-create",
            messageId: "demo-msg-001",
            guildId: "demo-guild",
            channelId: "demo-channel",
            author: "demo-user",
            authorId: "user-1",
            content: "Alfred, remind me to ship the Discord input adapter",
            mentionedBot: true,
          },
        },
      ],
    });
    this._fetch = deps.fetchImpl || ((...a) => globalThis.fetch(...a));
    this._WebSocket = deps.WebSocketImpl || globalThis.WebSocket;
    this._createGateway = deps.createGateway || createDiscordGateway;
    this._gateway = null;
    this._botUser = null;
    this._seenMessageIds = new Set();
    this._lastError = null;
  }

  async test(config = {}) {
    const merged = { ...configFromEnv(), ...config };
    const cfg = normalizeConfig(merged);
    if (!cfg.botToken) {
      return {
        ok: false,
        message:
          "botToken is required. Set config.botToken or env DISCORD_BOT_TOKEN (Developer Portal → Bot → Token). Do not use the OAuth2 Client Secret.",
        configExample: this.configExample,
      };
    }

    if (!looksLikeBotToken(cfg.botToken)) {
      return {
        ok: false,
        message:
          "Value does not look like a Discord bot token (expected three segments like AAAA.BBBB.CCCC). " +
          "DISCORD_BOT_SECRET / client secret will not work — copy the Bot Token from Developer Portal → Bot.",
      };
    }

    try {
      const res = await this._fetch(`${API_BASE}/users/@me`, {
        headers: { Authorization: botAuthHeader(cfg.botToken) },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          message: `Discord auth failed (HTTP ${res.status})${text ? `: ${text.slice(0, 120)}` : ""}. Check botToken (not OAuth client secret) and enable Message Content Intent.`,
        };
      }
      const user = await res.json();
      return {
        ok: true,
        message: `Bot OK: ${user.username}${user.discriminator && user.discriminator !== "0" ? `#${user.discriminator}` : ""}`,
        metadata: {
          botId: user.id,
          botUsername: user.username,
          guildId: cfg.guildId || null,
          channelCount: cfg.channelIds.length,
        },
      };
    } catch (err) {
      return { ok: false, message: `Discord reachability error: ${err.message}` };
    }
  }

  async connect(config = {}) {
    const merged = { ...configFromEnv(), ...config };
    const result = await this.test(merged);
    if (!result.ok) return result;
    this.config = normalizeConfig(merged);
    this._botUser = result.metadata
      ? { id: result.metadata.botId, username: result.metadata.botUsername }
      : null;
    return {
      ok: true,
      message: `Discord connected as ${result.metadata?.botUsername || "bot"}`,
    };
  }

  async start(publish) {
    await super.start(publish);
    if (!this.config?.botToken) {
      const fromEnv = configFromEnv();
      if (fromEnv?.botToken) {
        const result = await this.connect(fromEnv);
        if (!result.ok) {
          console.error(`[Discord] env connect failed: ${result.message}`);
          return;
        }
        console.log(`[Discord] Connected from environment (${result.message})`);
      } else {
        console.warn(
          "[Discord] start skipped — not connected (set botToken in Settings or DISCORD_BOT_TOKEN in .env)"
        );
        return;
      }
    }
    await this._startGateway();
  }

  async stop() {
    await this._stopGateway();
    await super.stop();
  }

  async _startGateway() {
    await this._stopGateway();
    this._lastError = null;

    this._gateway = this._createGateway({
      token: this.config.botToken,
      fetchImpl: this._fetch,
      WebSocketImpl: this._WebSocket,
      onReady: (user) => {
        this._botUser = user;
      },
      onDispatch: async (eventName, data) => {
        if (eventName !== "MESSAGE_CREATE") return;
        try {
          await this._handleMessageCreate(data);
        } catch (err) {
          console.error("[Discord]", err.message);
          this._lastError = err.message;
        }
      },
      log: (m) => console.log(`[Discord] ${m}`),
    });

    try {
      await this._gateway.start();
      console.log("[Discord] Gateway started");
    } catch (err) {
      this._lastError = err.message;
      console.error("[Discord] Gateway start failed:", err.message);
      // Do not throw — other adapters must still start
    }
  }

  async _stopGateway() {
    if (this._gateway) {
      try {
        await this._gateway.stop();
      } catch {
        /* ignore */
      }
      this._gateway = null;
    }
  }

  _passesFilters(msg) {
    const cfg = this.config || {};
    if (cfg.guildId) {
      const gid = msg.guild_id || msg.guildId;
      if (gid && gid !== cfg.guildId) return false;
    }
    if (cfg.channelIds?.length) {
      const cid = msg.channel_id || msg.channelId;
      if (!cfg.channelIds.includes(cid)) return false;
    }
    return true;
  }

  _rememberMessage(id) {
    if (!id) return false;
    if (this._seenMessageIds.has(id)) return false;
    this._seenMessageIds.add(id);
    if (this._seenMessageIds.size > SEEN_LIMIT) {
      const first = this._seenMessageIds.values().next().value;
      this._seenMessageIds.delete(first);
    }
    return true;
  }

  /**
   * Map a Discord MESSAGE_CREATE (or simulate payload) → normalized event, or null to skip.
   */
  buildEventFromMessage(msg, { botUserId } = {}) {
    const botId = botUserId || this._botUser?.id;
    const messageId = msg.id || msg.messageId;
    const author = msg.author || {};
    const authorId = author.id || msg.authorId || "";
    const authorName = author.username || msg.author || "unknown";
    const isBot = Boolean(author.bot || msg.authorBot);

    if (isBot) return null;
    if (!this._passesFilters(msg)) return null;

    // Live gateway: require real @mention. Templates may set mentionedBot: true.
    const mentioned =
      msg.mentionedBot === true || isBotMentioned(msg, botId) || isBotMentioned({
        mentions: msg.mentions,
        content: msg.content,
      }, botId);

    if (!mentioned) return null;
    if (!this._rememberMessage(messageId)) return null;

    const rawContent = msg.content || "";
    const content = stripBotMentions(rawContent, botId) || rawContent.trim();

    return createNormalizedEvent({
      source: this.id,
      type: "discord.message.mention",
      payload: {
        messageId,
        channelId: msg.channel_id || msg.channelId || "",
        guildId: msg.guild_id || msg.guildId || "",
        author: authorName,
        authorId,
        content,
        rawContent,
        mentionedBot: true,
      },
    });
  }

  async _handleMessageCreate(msg) {
    const event = this.buildEventFromMessage(msg);
    if (!event) return;
    if (this.publish) {
      await this.publish(event);
      console.log(
        `[Discord] mention from ${event.payload.author}: ${String(event.payload.content).slice(0, 80)}`
      );
    }
  }

  /**
   * Settings simulate / external push (optional).
   * Accepts template-shaped payload or raw-ish Discord message fields.
   */
  async ingest(payload = {}) {
    if (!this.config && !payload) {
      return { ok: false, message: "not connected" };
    }

    // Template shape
    const msg = {
      id: payload.messageId || payload.id || `ingest-${Date.now()}`,
      channel_id: payload.channelId || payload.channel_id,
      guild_id: payload.guildId || payload.guild_id,
      content: payload.content || "",
      author: {
        id: payload.authorId || "simulate-user",
        username: payload.author || "simulate-user",
        bot: false,
      },
      mentions: payload.mentions || [],
      mentionedBot: payload.mentionedBot === true || payload.eventType === "message-create",
    };

    // For simulate without live bot id, allow mentionedBot flag
    const event = this.buildEventFromMessage(msg, {
      botUserId: this._botUser?.id || "simulate-bot",
    });

    // If mentionedBot was set but bot id unknown, still allow through after filters
    if (!event && (payload.mentionedBot || payload.eventType === "message-create")) {
      if (!this._passesFilters(msg)) {
        return { ok: false, message: "filtered by guildId/channelIds" };
      }
      if (!this._rememberMessage(msg.id)) {
        return { ok: false, message: "duplicate messageId" };
      }
      const forced = createNormalizedEvent({
        source: this.id,
        type: "discord.message.mention",
        payload: {
          messageId: msg.id,
          channelId: msg.channel_id || "",
          guildId: msg.guild_id || "",
          author: msg.author.username,
          authorId: msg.author.id,
          content: stripBotMentions(msg.content, this._botUser?.id) || msg.content,
          rawContent: msg.content,
          mentionedBot: true,
        },
      });
      if (this.publish) await this.publish(forced);
      return { ok: true, message: "Simulated mention published", event: forced };
    }

    if (!event) {
      return { ok: false, message: "ignored (not a bot mention, bot author, filtered, or duplicate)" };
    }
    if (this.publish) await this.publish(event);
    return { ok: true, message: "Discord message published", event };
  }

  async runAction(actionId) {
    if (actionId === "status") {
      return {
        ok: true,
        message: this._gateway?.isConnected()
          ? `Connected as ${this._botUser?.username || "?"}`
          : "Gateway not connected",
        metadata: {
          connected: Boolean(this._gateway?.isConnected()),
          botId: this._botUser?.id || null,
          botUsername: this._botUser?.username || null,
          guildId: this.config?.guildId || null,
          channelIds: this.config?.channelIds || [],
          lastError: this._lastError,
          seenCount: this._seenMessageIds.size,
        },
      };
    }

    if (actionId === "reconnect") {
      if (!this.config?.botToken) {
        return { ok: false, message: "Connect with botToken first" };
      }
      try {
        await this._startGateway();
        return { ok: true, message: "Gateway reconnected" };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    }

    return { ok: false, message: `Unknown action: ${actionId}` };
  }
}

module.exports = {
  DiscordAdapter,
  normalizeConfig,
  parseChannelIds,
  configFromEnv,
  looksLikeBotToken,
};
