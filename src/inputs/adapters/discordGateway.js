/**
 * Minimal Discord Gateway (v10) client for MESSAGE_CREATE.
 * No discord.js — uses global WebSocket (Node 22+) and fetch.
 */

const GATEWAY_VERSION = 10;
const API_BASE = `https://discord.com/api/v${GATEWAY_VERSION}`;

/**
 * GUILDS | GUILD_MESSAGES | DIRECT_MESSAGES
 *
 * Avoid MESSAGE_CONTENT (1<<15) by default — it is a privileged intent and
 * causes Gateway close 4014 until enabled in the Developer Portal.
 * Discord still sends message content for messages that @mention the bot
 * and for DMs, which is enough for mention-only inbox routing.
 *
 * To enable full channel history content later, OR in (1 << 15) and toggle
 * Message Content Intent in the portal.
 */
const DEFAULT_INTENTS = (1 << 0) | (1 << 9) | (1 << 12);

function normalizeBotToken(token) {
  const t = String(token || "").trim();
  if (!t) return "";
  return t.replace(/^Bot\s+/i, "");
}

function botAuthHeader(token) {
  return `Bot ${normalizeBotToken(token)}`;
}

/**
 * @param {object} opts
 * @param {string} opts.token
 * @param {number} [opts.intents]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {typeof WebSocket} [opts.WebSocketImpl]
 * @param {(eventName: string, data: object) => void|Promise<void>} [opts.onDispatch]
 * @param {(user: object) => void} [opts.onReady]
 * @param {(msg: string) => void} [opts.log]
 */
function createDiscordGateway(opts = {}) {
  const fetchImpl = opts.fetchImpl || ((...a) => globalThis.fetch(...a));
  const WebSocketImpl = opts.WebSocketImpl || globalThis.WebSocket;
  const log = opts.log || ((m) => console.log(`[Discord Gateway] ${m}`));
  const intents = opts.intents ?? DEFAULT_INTENTS;

  let ws = null;
  let heartbeatTimer = null;
  let lastSeq = null;
  let sessionId = null;
  let botUser = null;
  let stopped = true;
  let reconnectTimer = null;
  let identifyPayload = null;

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function send(op, d) {
    if (!ws || ws.readyState !== WebSocketImpl.OPEN) return;
    ws.send(JSON.stringify({ op, d }));
  }

  function startHeartbeat(intervalMs) {
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      send(1, lastSeq);
    }, intervalMs);
  }

  function identify() {
    send(2, {
      token: normalizeBotToken(opts.token),
      intents,
      properties: {
        os: process.platform || "unknown",
        browser: "alfred-buildathon",
        device: "alfred-buildathon",
      },
    });
  }

  async function handleMessage(raw) {
    let packet;
    try {
      packet = JSON.parse(raw);
    } catch {
      return;
    }

    if (packet.s != null) lastSeq = packet.s;

    switch (packet.op) {
      case 10: // Hello
        startHeartbeat(packet.d.heartbeat_interval);
        identify();
        break;
      case 11: // Heartbeat ACK
        break;
      case 9: // Invalid session
        log("Invalid session — re-identifying shortly");
        setTimeout(() => {
          if (!stopped) identify();
        }, 2000);
        break;
      case 7: // Reconnect
        log("Server requested reconnect");
        await reconnect();
        break;
      case 0: // Dispatch
        await onDispatch(packet.t, packet.d);
        break;
      default:
        break;
    }
  }

  async function onDispatch(eventName, data) {
    if (eventName === "READY") {
      sessionId = data.session_id;
      botUser = data.user || null;
      log(`Ready as ${botUser?.username || "?"} (${botUser?.id || "?"})`);
      if (opts.onReady) opts.onReady(botUser);
      return;
    }
    if (opts.onDispatch) {
      await opts.onDispatch(eventName, data);
    }
  }

  async function connectSocket(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocketImpl(url);
      let opened = false;

      socket.addEventListener("open", () => {
        opened = true;
        log("WebSocket open");
        resolve(socket);
      });

      socket.addEventListener("message", (ev) => {
        const data = typeof ev.data === "string" ? ev.data : String(ev.data);
        handleMessage(data).catch((err) => log(`dispatch error: ${err.message}`));
      });

      socket.addEventListener("close", (ev) => {
        log(`WebSocket closed (${ev.code || "?"} ${ev.reason || ""})`.trim());
        clearHeartbeat();
        ws = null;
        if (!stopped) scheduleReconnect();
      });

      socket.addEventListener("error", (err) => {
        const msg = err?.message || "WebSocket error";
        log(msg);
        if (!opened) reject(new Error(msg));
      });
    });
  }

  function scheduleReconnect() {
    clearReconnect();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!stopped) {
        log("Reconnecting…");
        start().catch((err) => log(`reconnect failed: ${err.message}`));
      }
    }, 5000);
  }

  async function reconnect() {
    await stopSocketOnly();
    if (!stopped) await start();
  }

  async function stopSocketOnly() {
    clearHeartbeat();
    clearReconnect();
    if (ws) {
      try {
        ws.close(1000, "stop");
      } catch {
        /* ignore */
      }
      ws = null;
    }
  }

  async function start() {
    stopped = false;
    identifyPayload = opts.token;
    if (!normalizeBotToken(identifyPayload)) {
      throw new Error("bot token required");
    }
    if (!WebSocketImpl) {
      throw new Error("WebSocket is not available in this runtime");
    }

    await stopSocketOnly();
    stopped = false;

    const res = await fetchImpl(`${API_BASE}/gateway/bot`, {
      headers: { Authorization: botAuthHeader(opts.token) },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`gateway/bot HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
    }
    const body = await res.json();
    const baseUrl = body.url;
    if (!baseUrl) throw new Error("gateway/bot missing url");

    const url = `${baseUrl}?v=${GATEWAY_VERSION}&encoding=json`;
    ws = await connectSocket(url);
  }

  async function stop() {
    stopped = true;
    await stopSocketOnly();
  }

  return {
    start,
    stop,
    getBotUser: () => botUser,
    getSessionId: () => sessionId,
    isConnected: () => Boolean(ws && ws.readyState === WebSocketImpl.OPEN),
  };
}

/**
 * True if the message @mentions the bot (mentions array or raw <@id> markup).
 */
function isBotMentioned(message, botUserId) {
  if (!botUserId || !message) return false;
  const mentions = message.mentions || [];
  if (mentions.some((m) => m.id === botUserId)) return true;
  const content = message.content || "";
  return content.includes(`<@${botUserId}>`) || content.includes(`<@!${botUserId}>`);
}

/** Strip bot mention tokens from content for cleaner inbox text. */
function stripBotMentions(content, botUserId) {
  if (!content) return "";
  let out = String(content);
  if (botUserId) {
    out = out
      .replace(new RegExp(`<@!?${botUserId}>`, "g"), "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return out;
}

module.exports = {
  createDiscordGateway,
  normalizeBotToken,
  botAuthHeader,
  isBotMentioned,
  stripBotMentions,
  DEFAULT_INTENTS,
  API_BASE,
};
