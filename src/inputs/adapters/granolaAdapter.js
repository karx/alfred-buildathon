const https = require("https");
const { AdapterContract } = require("../adapterContract");
const { createNormalizedEvent } = require("../../core/eventContract");
const { runOAuthFlow } = require("./granolaOAuth");

const MCP_ENDPOINT = "https://mcp.granola.ai/mcp";
const MCP_VERSION = "2024-11-05";

class GranolaAdapter extends AdapterContract {
  constructor({ stateStore, settingsStore } = {}) {
    super({
      id: "granola",
      label: "Granola",
      description: "Pulls meeting notes from Granola periodically via MCP. Requires browser OAuth on first connect.",
      configExample: {
        pollIntervalMs: 60000,
      },
      actions: [
        {
          id: "poll-now",
          label: "Poll Now",
          description: "Immediately pull latest meetings from Granola.",
        },
      ],
    });
    this.stateStore = stateStore;
    this.settingsStore = settingsStore;
    this.pollTimer = null;
    this.mcpRequestId = 0;
    this.mcpSessionId = null;
  }

  // ── MCP JSON-RPC ──────────────────────────────────────────────

  mcpPost(body) {
    const token = this.config?.oauthToken?.accessToken;
    if (!token) throw new Error("No Granola access token");

    const bodyStr = JSON.stringify(body);
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Content-Length": Buffer.byteLength(bodyStr),
      Authorization: `Bearer ${token}`,
    };
    if (this.mcpSessionId) headers["Mcp-Session-Id"] = this.mcpSessionId;

    return new Promise((resolve, reject) => {
      const url = new URL(MCP_ENDPOINT);
      const opts = {
        hostname: url.hostname,
        path: url.pathname,
        method: "POST",
        headers,
      };
      const req = https.request(opts, (res) => {
        if (res.headers["mcp-session-id"]) {
          this.mcpSessionId = res.headers["mcp-session-id"];
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode === 401) {
            reject(new Error("Granola token expired — reconnect in Settings"));
            return;
          }
          if (!data) { resolve(null); return; }

          const contentType = res.headers["content-type"] || "";
          if (contentType.includes("text/event-stream")) {
            // Parse SSE: collect all data: lines, return last parseable JSON-RPC message
            const messages = [];
            for (const line of data.split("\n")) {
              if (line.startsWith("data: ")) {
                try { messages.push(JSON.parse(line.slice(6))); } catch {}
              }
            }
            resolve(messages[messages.length - 1] || { raw: data });
          } else {
            try { resolve(JSON.parse(data)); }
            catch { resolve({ raw: data }); }
          }
        });
      });
      req.on("error", reject);
      req.write(bodyStr);
      req.end();
    });
  }

  async mcpCall(method, params = {}) {
    const id = ++this.mcpRequestId;
    const res = await this.mcpPost({ jsonrpc: "2.0", method, params, id });
    if (res?.error) throw new Error(`MCP ${method} error: ${res.error.message}`);
    return res?.result;
  }

  async initSession() {
    this.mcpSessionId = null;
    await this.mcpCall("initialize", {
      protocolVersion: MCP_VERSION,
      capabilities: {},
      clientInfo: { name: "Alfred", version: "0.1.0" },
    });
    // Send initialized notification (fire and forget — no id)
    this.mcpPost({ jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => {});
  }

  async callTool(name, args = {}) {
    const result = await this.mcpCall("tools/call", { name, arguments: args });
    const content = result?.content || [];
    const text = content.find((c) => c.type === "text")?.text || "";
    try { return JSON.parse(text); }
    catch { return text; }
  }

  // ── Polling ───────────────────────────────────────────────────

  async poll() {
    if (!this.config?.oauthToken) return;
    if (!this.publish) return;

    try {
      await this.initSession();
      const meetings = await this.callTool("list_meetings");
      const list = Array.isArray(meetings) ? meetings : (meetings?.meetings || []);

      const state = this.stateStore ? this.stateStore.get() : { seenMeetingIds: [] };
      const seen = new Set(state.seenMeetingIds || []);
      const newIds = list.filter((m) => m.id && !seen.has(m.id)).map((m) => m.id);

      if (newIds.length === 0) {
        console.log("[Granola] Poll: no new meetings");
        return;
      }

      console.log(`[Granola] Poll: ${newIds.length} new meeting(s)`);
      const full = await this.callTool("get_meetings", { meeting_ids: newIds });
      const fullList = Array.isArray(full) ? full : (full?.meetings || [full]);

      for (const meeting of fullList) {
        if (!meeting?.id) continue;
        if (this.stateStore) await this.stateStore.markMeetingSeen(meeting.id);

        const event = createNormalizedEvent({
          source: "granola",
          type: "granola.meeting.new",
          payload: {
            meetingId: meeting.id,
            title: meeting.title || "Untitled Meeting",
            date: meeting.date || meeting.created_at || new Date().toISOString(),
            attendees: meeting.attendees || [],
            summary: meeting.summary || meeting.ai_summary || "",
            notes: meeting.notes || meeting.content || "",
          },
        });

        await this.publish(event);
      }
    } catch (err) {
      console.error("[Granola] Poll error:", err.message);
    }
  }

  // ── AdapterContract ───────────────────────────────────────────

  async test(config = {}) {
    if (config.oauthToken?.accessToken) {
      return { ok: true, message: "Granola token present — will verify on next poll" };
    }
    return {
      ok: false,
      message: "No OAuth token. Click Connect to authorize via browser.",
    };
  }

  async connect(config = {}) {
    // Restore from saved config (has token already)
    if (config.oauthToken?.accessToken) {
      this.config = { pollIntervalMs: 60000, ...config };
      console.log("[Granola] Restored saved token");
      return { ok: true, message: "Granola reconnected with saved token" };
    }

    // Non-blocking OAuth: return immediately, complete in background
    const pollIntervalMs = config.pollIntervalMs || 60000;
    this.config = { pollIntervalMs, ...config };
    console.log("[Granola] Starting OAuth flow in background...");

    runOAuthFlow().then(async (oauthToken) => {
      this.config = { ...this.config, oauthToken };
      console.log("[Granola] OAuth complete, saving token...");

      if (this.settingsStore) {
        await this.settingsStore.updateAdapter("granola", {
          config: this.config,
          connectedAt: new Date().toISOString(),
        }).catch((e) => console.error("[Granola] Failed to save token:", e.message));
      }

      // Start polling now that we have a token
      if (this.pollTimer) clearInterval(this.pollTimer);
      if (this.publish) {
        this.pollTimer = setInterval(() => {
          this.poll().catch((e) => console.error("[Granola] Poll error:", e.message));
        }, this.config.pollIntervalMs);
        this.poll().catch((e) => console.error("[Granola] Initial poll error:", e.message));
      }
    }).catch((err) => {
      console.error("[Granola] OAuth failed:", err.message);
    });

    return {
      ok: true,
      pending: true,
      message: "Browser opened for Granola OAuth. Authorize in the browser — Alfred saves the token automatically. Refresh adapters after authorization to confirm.",
    };
  }

  async runAction(actionId) {
    if (actionId === "poll-now") {
      await this.poll();
      return { ok: true, message: "Poll triggered" };
    }
    return { ok: false, status: 404, message: `Unknown action: ${actionId}` };
  }

  async start(publish) {
    await super.start(publish);
    if (!this.config?.oauthToken) return;

    const interval = this.config.pollIntervalMs || 60000;
    console.log(`[Granola] Starting polling every ${interval / 1000}s`);

    // Initial poll
    this.poll().catch((e) => console.error("[Granola] Initial poll error:", e.message));

    this.pollTimer = setInterval(() => {
      this.poll().catch((e) => console.error("[Granola] Poll error:", e.message));
    }, interval);
  }

  async stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await super.stop();
  }
}

module.exports = { GranolaAdapter };
