const https = require("https");
const { AdapterContract } = require("../adapterContract");
const { createNormalizedEvent } = require("../../core/eventContract");
const { runOAuthFlow } = require("./granolaOAuth");

const MCP_ENDPOINT = "https://mcp.granola.ai/mcp";
const MCP_VERSION = "2024-11-05";
/** Granola MCP get_meetings accepts at most 10 IDs per call. */
const GET_MEETINGS_BATCH = 10;

class GranolaAdapter extends AdapterContract {
  constructor({ stateStore, settingsStore } = {}) {
    super({
      id: "granola",
      label: "Granola",
      description:
        "Pulls your Granola meeting notes and notes shared with you (personal scope), " +
        "plus folder/team notes when accessible. Uses MCP OAuth on first connect.",
      configExample: {
        pollIntervalMs: 60000,
        timeRange: "last_30_days",
      },
      actions: [
        {
          id: "poll-now",
          label: "Poll Now",
          description: "Immediately pull latest meetings (owned + shared with you) from Granola.",
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
      Accept: "application/json, text/event-stream",
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
          if (!data) {
            resolve(null);
            return;
          }

          const contentType = res.headers["content-type"] || "";
          if (contentType.includes("text/event-stream")) {
            const messages = [];
            for (const line of data.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  messages.push(JSON.parse(line.slice(6)));
                } catch {
                  /* skip non-JSON SSE lines */
                }
              }
            }
            resolve(messages[messages.length - 1] || { raw: data });
          } else {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ raw: data });
            }
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
    this.mcpPost({ jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => {});
  }

  async callTool(name, args = {}) {
    const result = await this.mcpCall("tools/call", { name, arguments: args });
    const content = result?.content || [];
    const text = content.find((c) => c.type === "text")?.text || "";
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // ── Parsing ───────────────────────────────────────────────────

  /**
   * Granola MCP returns XML-shaped strings from list_meetings / get_meetings.
   * Parse <meeting id="..." title="..." date="...">...</meeting> blocks.
   * Note creator (owner) appears as: Name (note creator) <email>
   */
  parseMeetingsXml(xml) {
    if (typeof xml !== "string" || !xml) return [];
    const meetings = [];
    const re = /<meeting\b([^>]*)>([\s\S]*?)<\/meeting>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const attrs = m[1] || "";
      const body = m[2] || "";
      const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
      const title = (attrs.match(/\btitle="([^"]+)"/) || [])[1] || "Untitled Meeting";
      const date = (attrs.match(/\bdate="([^"]+)"/) || [])[1] || new Date().toISOString();
      if (!id) continue;

      const attendees = [];
      let owner = null;
      const partMatch = body.match(/<known_participants>([\s\S]*?)<\/known_participants>/);
      if (partMatch) {
        const partRe = /([^\n<]+?)\s*<([^>]+)>/g;
        let p;
        while ((p = partRe.exec(partMatch[1])) !== null) {
          const rawName = p[1].trim();
          const email = p[2].trim();
          const isCreator = /\(note creator\)/i.test(rawName);
          const name = rawName.replace(/\s*\(note creator\)\s*/i, "").trim();
          const person = { name, email };
          if (isCreator) owner = person;
          attendees.push(person);
        }
      }

      const summaryMatch = body.match(/<summary>([\s\S]*?)<\/summary>/);
      const notesMatch = body.match(/<notes>([\s\S]*?)<\/notes>/);
      const transcriptMatch = body.match(/<transcript>([\s\S]*?)<\/transcript>/);
      meetings.push({
        id,
        title,
        date,
        owner,
        attendees,
        summary: summaryMatch ? summaryMatch[1].trim() : "",
        notes: notesMatch ? notesMatch[1].trim() : "",
        content: transcriptMatch ? transcriptMatch[1].trim() : "",
      });
    }
    return meetings;
  }

  parseMeetingPayload(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.meetings)) return raw.meetings;
    if (typeof raw === "string") return this.parseMeetingsXml(raw);
    return [];
  }

  parseFoldersPayload(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.folders)) return raw.folders;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.folders)) return parsed.folders;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* not JSON — try loose id extraction */
        const folders = [];
        const re = /"id"\s*:\s*"([^"]+)"/g;
        let m;
        while ((m = re.exec(raw)) !== null) {
          folders.push({ id: m[1] });
        }
        return folders;
      }
    }
    return [];
  }

  listMeetingsArgs(extra = {}) {
    const timeRange = this.config?.timeRange || "last_30_days";
    const args = { time_range: timeRange, ...extra };
    if (timeRange === "custom") {
      if (this.config?.customStart) args.custom_start = this.config.customStart;
      if (this.config?.customEnd) args.custom_end = this.config.customEnd;
    }
    return args;
  }

  async resolveAccountEmail() {
    try {
      const raw = await this.callTool("get_account_info");
      if (raw && typeof raw === "object" && raw.email) return String(raw.email).toLowerCase();
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.email) return String(parsed.email).toLowerCase();
        } catch {
          const m = raw.match(/"email"\s*:\s*"([^"]+)"/);
          if (m) return m[1].toLowerCase();
        }
      }
    } catch (err) {
      console.warn(`[Granola] get_account_info failed: ${err.message}`);
    }
    return null;
  }

  /**
   * Collect all accessible meetings: default list (owned + shared with you)
   * plus every accessible folder (shared private folders, team folders on paid plans).
   * Per Granola MCP docs, personal scope includes notes you own, notes shared
   * directly with you, and notes in private folders shared with you.
   */
  async listAllAccessibleMeetings() {
    const byId = new Map();

    const merge = (list, source) => {
      for (const meeting of list) {
        if (!meeting?.id) continue;
        const prev = byId.get(meeting.id);
        if (!prev) {
          byId.set(meeting.id, { ...meeting, sources: [source] });
        } else {
          prev.sources = [...new Set([...(prev.sources || []), source])];
          // Prefer richer metadata if a later fetch has more fields
          if (!prev.owner && meeting.owner) prev.owner = meeting.owner;
          if ((!prev.attendees || prev.attendees.length === 0) && meeting.attendees?.length) {
            prev.attendees = meeting.attendees;
          }
        }
      }
    };

    const rawList = await this.callTool("list_meetings", this.listMeetingsArgs());
    const defaultList = this.parseMeetingPayload(rawList);
    merge(defaultList, "personal");
    console.log(`[Granola] list_meetings (personal/shared): ${defaultList.length} meeting(s)`);

    // Paid plans: also walk folders so shared private folders and team spaces are covered.
    try {
      const rawFolders = await this.callTool("list_meeting_folders");
      const folders = this.parseFoldersPayload(rawFolders);
      console.log(`[Granola] list_meeting_folders: ${folders.length} folder(s)`);

      for (const folder of folders) {
        const folderId = folder.id || folder.folder_id;
        if (!folderId) continue;
        const folderLabel = folder.title || folder.name || folderId;
        try {
          const rawFolderList = await this.callTool(
            "list_meetings",
            this.listMeetingsArgs({ folder_id: folderId })
          );
          const folderMeetings = this.parseMeetingPayload(rawFolderList);
          merge(folderMeetings, `folder:${folderLabel}`);
          console.log(
            `[Granola] list_meetings folder "${folderLabel}": ${folderMeetings.length} meeting(s)`
          );
        } catch (err) {
          console.warn(`[Granola] list_meetings for folder ${folderId} failed:`, err.message);
        }
      }
    } catch (err) {
      // Free plans may lack folder tools; personal list still includes notes shared with you.
      console.warn(`[Granola] list_meeting_folders unavailable: ${err.message}`);
    }

    return [...byId.values()];
  }

  async fetchMeetingDetails(ids) {
    const full = [];
    for (let i = 0; i < ids.length; i += GET_MEETINGS_BATCH) {
      const batch = ids.slice(i, i + GET_MEETINGS_BATCH);
      const rawFull = await this.callTool("get_meetings", { meeting_ids: batch });
      full.push(...this.parseMeetingPayload(rawFull));
    }
    return full;
  }

  // ── Polling ───────────────────────────────────────────────────

  async poll() {
    if (!this.config?.oauthToken) return;
    if (!this.publish) return;

    try {
      await this.initSession();
      const accountEmail = await this.resolveAccountEmail();
      if (accountEmail) console.log(`[Granola] Account: ${accountEmail}`);

      const list = await this.listAllAccessibleMeetings();
      console.log(`[Granola] Accessible meetings (deduped): ${list.length}`);

      const state = this.stateStore ? this.stateStore.get() : { seenMeetingIds: [] };
      const seen = new Set(state.seenMeetingIds || []);
      const newIds = list.filter((m) => m.id && !seen.has(m.id)).map((m) => m.id);

      if (newIds.length === 0) {
        console.log(`[Granola] Poll: no new meetings (list=${list.length}, seen=${seen.size})`);
        return;
      }

      console.log(`[Granola] Poll: ${newIds.length} new meeting(s)`);
      const fullList = await this.fetchMeetingDetails(newIds);

      if (fullList.length === 0) {
        console.warn(
          `[Granola] get_meetings returned 0 docs for ${newIds.length} id(s); not marking seen — will retry next poll`
        );
        return;
      }

      // Overlay list metadata (sources, owner) onto full docs when missing
      const listById = new Map(list.map((m) => [m.id, m]));
      const returnedIds = new Set();

      for (const meeting of fullList) {
        if (!meeting?.id) continue;
        returnedIds.add(meeting.id);
        const meta = listById.get(meeting.id) || {};
        const owner = meeting.owner || meta.owner || null;
        const sources = meta.sources || ["personal"];
        const ownerEmail = owner?.email ? String(owner.email).toLowerCase() : null;
        // Shared with you if another user is note creator, or the note only appears via a folder.
        const sharedWithMe = Boolean(
          (accountEmail && ownerEmail && ownerEmail !== accountEmail) ||
            (sources.length === 1 && sources[0].startsWith("folder:"))
        );

        const event = createNormalizedEvent({
          source: "granola",
          type: "granola.meeting.new",
          payload: {
            meetingId: meeting.id,
            title: meeting.title || "Untitled Meeting",
            date: meeting.date || meeting.created_at || new Date().toISOString(),
            attendees: meeting.attendees?.length ? meeting.attendees : meta.attendees || [],
            summary: meeting.summary || meeting.ai_summary || "",
            notes: meeting.notes || meeting.content || "",
            owner: owner || null,
            sources,
            sharedWithMe,
          },
        });

        try {
          await this.publish(event);
        } catch (err) {
          console.error(`[Granola] Publish failed for ${meeting.id}:`, err.message);
          continue;
        }

        if (this.stateStore) await this.stateStore.markMeetingSeen(meeting.id);
      }

      const missing = newIds.filter((id) => !returnedIds.has(id));
      if (missing.length > 0) {
        console.warn(`[Granola] get_meetings omitted ${missing.length} id(s): ${missing.join(", ")}`);
      }
    } catch (err) {
      console.error("[Granola] Poll error:", err.message);
    }
  }

  // ── AdapterContract ───────────────────────────────────────────

  async test(config = {}) {
    if (config.oauthToken?.accessToken) {
      return {
        ok: true,
        message:
          "Granola token present — next poll pulls owned notes, notes shared with you, and accessible folders",
      };
    }
    return {
      ok: false,
      message: "No OAuth token. Click Connect to authorize via browser.",
    };
  }

  async connect(config = {}) {
    if (config.oauthToken?.accessToken) {
      this.config = { pollIntervalMs: 60000, timeRange: "last_30_days", ...config };
      console.log("[Granola] Restored saved token");
      return { ok: true, message: "Granola reconnected with saved token" };
    }

    const pollIntervalMs = config.pollIntervalMs || 60000;
    this.config = { pollIntervalMs, timeRange: "last_30_days", ...config };
    console.log("[Granola] Starting OAuth flow in background...");

    runOAuthFlow()
      .then(async (oauthToken) => {
        this.config = { ...this.config, oauthToken };
        console.log("[Granola] OAuth complete, saving token...");

        if (this.settingsStore) {
          await this.settingsStore
            .updateAdapter("granola", {
              config: this.config,
              connectedAt: new Date().toISOString(),
            })
            .catch((e) => console.error("[Granola] Failed to save token:", e.message));
        }

        if (this.pollTimer) clearInterval(this.pollTimer);
        if (this.publish) {
          this.pollTimer = setInterval(() => {
            this.poll().catch((e) => console.error("[Granola] Poll error:", e.message));
          }, this.config.pollIntervalMs);
          this.poll().catch((e) => console.error("[Granola] Initial poll error:", e.message));
        }
      })
      .catch((err) => {
        console.error("[Granola] OAuth failed:", err.message);
      });

    return {
      ok: true,
      pending: true,
      message:
        "Browser opened for Granola OAuth. Authorize in the browser — Alfred saves the token automatically. " +
        "MCP personal scope includes notes shared with you. Refresh adapters after authorization to confirm.",
    };
  }

  async runAction(actionId) {
    if (actionId === "poll-now") {
      await this.poll();
      return { ok: true, message: "Poll triggered (owned + shared + folders)" };
    }
    return { ok: false, status: 404, message: `Unknown action: ${actionId}` };
  }

  async start(publish) {
    await super.start(publish);
    if (!this.config?.oauthToken) return;

    const interval = this.config.pollIntervalMs || 60000;
    console.log(`[Granola] Starting polling every ${interval / 1000}s`);

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
