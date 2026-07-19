const http = require("http");
const { createSettingsPage } = require("./settingsPage");
const { createLivePage } = require("./livePage");

function createLocalServer({ settingsStore, adapterManager, outputHub, auditLog, stateStore, skillRunner }) {
  let server = null;
  const sseClients = new Set();

  function sendJson(res, status, payload) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  function sendSse(res, payload) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  async function readBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1_000_000) {
          reject(new Error("Request body too large"));
          req.destroy();
        }
      });
      req.on("end", () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON body: ${error.message}`));
        }
      });
      req.on("error", reject);
    });
  }

  function notFound(res) {
    sendJson(res, 404, { ok: false, message: "Not found" });
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/settings") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(createSettingsPage());
      return;
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/live")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(createLivePage());
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, appName: settingsStore.get().appName || "Finalizing Alfred" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      sseClients.add(res);
      sendSse(res, { channel: "sse.connected", timestamp: new Date().toISOString() });
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events/recent") {
      sendJson(res, 200, { ok: true, events: outputHub.getRecent() });
      return;
    }

    // Hardware polling endpoint — computed from Alfred state
    if (req.method === "GET" && url.pathname === "/api/state") {
      const state = stateStore ? stateStore.get() : {};
      const nudges = (state.nudges || []).filter((n) => !n.acked);
      const isProcessing = state.processingStatus === "processing";
      const isInMeeting = state.nowState?.mode === "meeting";

      let led = "green";
      let display = "Finalizing Alfred";
      if (isProcessing) { led = "red"; display = "Processing..."; }
      else if (nudges.length > 0) { led = "red"; display = nudges[0].text.slice(0, 20); }
      else if (isInMeeting) { led = "blue"; display = (state.nowState?.context || "In meeting").slice(0, 20); }

      const buzzer = nudges.length > 0;
      if (buzzer && stateStore) stateStore.clearBuzzer().catch(() => {});

      sendJson(res, 200, {
        led,
        display,
        buzzer,
        processingStatus: state.processingStatus || "idle",
        lastUpdatedAt: state.lastProcessedAt || new Date().toISOString(),
      });
      return;
    }

    // Full Alfred state for /live dashboard
    if (req.method === "GET" && url.pathname === "/api/alfred/state") {
      const state = stateStore ? stateStore.get() : {};
      sendJson(res, 200, { ok: true, state });
      return;
    }

    // Manually trigger garden
    if (req.method === "POST" && url.pathname === "/api/alfred/garden") {
      if (skillRunner) skillRunner.runGarden().catch((e) => console.error("[Garden] Manual trigger error:", e.message));
      sendJson(res, 202, { ok: true, message: "Garden run triggered" });
      return;
    }

    // Manually trigger skill runner on queued inbox
    if (req.method === "POST" && url.pathname === "/api/alfred/process") {
      const state = stateStore ? stateStore.get() : {};
      const inbox = state.inbox || [];
      if (!inbox.length) { sendJson(res, 200, { ok: true, message: "Inbox empty, nothing to process" }); return; }
      // Fire async — respond immediately
      if (skillRunner) skillRunner.processNewItems(inbox.slice()).catch((e) => console.error("[App] Process trigger error:", e.message));
      sendJson(res, 202, { ok: true, message: `Processing ${inbox.length} inbox item(s)` });
      return;
    }

    // Set now-mode explicitly (focus / meeting / sparring)
    if (req.method === "POST" && url.pathname === "/api/alfred/set-mode") {
      const body = await readBody(req);
      const VALID_MODES = new Set(["focus", "meeting", "sparring"]);
      if (!body.mode || !VALID_MODES.has(body.mode)) {
        sendJson(res, 400, { ok: false, message: "mode must be focus|meeting|sparring" });
        return;
      }
      await stateStore.patch({ nowState: { mode: body.mode, context: body.context || "" } });
      if (outputHub) await outputHub.publish({ channel: "alfred.state.updated", timestamp: new Date().toISOString(), reason: "set-mode", mode: body.mode });
      sendJson(res, 200, { ok: true, nowState: stateStore.get().nowState });
      return;
    }

    // Nudge acknowledgement
    if (req.method === "POST" && url.pathname === "/api/alfred/nudge-ack") {
      const body = await readBody(req);
      if (!body.nudgeId) { sendJson(res, 400, { ok: false, message: "nudgeId required" }); return; }
      if (stateStore) await stateStore.ackNudge(body.nudgeId);
      if (outputHub) await outputHub.publish({ channel: "alfred.state.updated", timestamp: new Date().toISOString(), reason: "nudge-ack", nudgeId: body.nudgeId });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/adapters") {
      sendJson(res, 200, { ok: true, adapters: adapterManager.listAdapters() });
      return;
    }

    const adapterAction = url.pathname.match(/^\/api\/adapters\/([^/]+)\/(connect|test|disconnect)$/);
    if (req.method === "POST" && adapterAction) {
      const [, adapterId, action] = adapterAction;
      const body = await readBody(req);
      const config = body.config || {};
      const result = action === "connect"
        ? await adapterManager.connect(adapterId, config)
        : action === "disconnect"
          ? await adapterManager.disconnect(adapterId)
          : await adapterManager.test(adapterId, config);

      await auditLog.record({ kind: "adapter-action", adapterId, action, ok: Boolean(result.ok), message: result.message });
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    const adapterCustomAction = url.pathname.match(/^\/api\/adapters\/([^/]+)\/actions\/([^/]+)$/);
    if (req.method === "POST" && adapterCustomAction) {
      const [, adapterId, actionId] = adapterCustomAction;
      const body = await readBody(req);
      const result = await adapterManager.runAction(adapterId, actionId, body);
      await auditLog.record({ kind: "adapter-custom-action", adapterId, action: actionId, ok: Boolean(result.ok), message: result.message });
      sendJson(res, result.ok ? 200 : (result.status || 400), result);
      return;
    }

    const adapterIngest = url.pathname.match(/^\/api\/adapters\/([^/]+)\/ingest$/);
    if (req.method === "POST" && adapterIngest) {
      const [, adapterId] = adapterIngest;
      const payload = await readBody(req);
      const result = await adapterManager.ingest(adapterId, payload, { headers: req.headers });
      sendJson(res, result.status || (result.ok ? 202 : 400), result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/verification") {
      const body = await readBody(req);
      const entry = await auditLog.record({
        kind: "human-verification",
        adapterId: body.adapterId,
        result: body.result,
        notes: body.notes,
      });
      sendJson(res, 200, { ok: true, entry });
      return;
    }

    notFound(res);
  }

  let heartbeatTimer = null;

  // Trim state for SSE broadcast — omit large fields not needed by the UI
  function trimStateForSse(state) {
    const { inbox, seenMeetingIds, ...rest } = state;
    return rest;
  }

  return {
    async start(port = settingsStore.get().port || 3737) {
      // Wire outputHub events → SSE
      outputHub.onPublish((event) => {
        for (const client of sseClients) sendSse(client, event);
      });

      // Wire stateStore changes → SSE with embedded state (no second round-trip)
      if (stateStore) {
        stateStore.onChange((state) => {
          const payload = {
            channel: "alfred.state.updated",
            timestamp: new Date().toISOString(),
            state: trimStateForSse(state),
          };
          for (const client of sseClients) sendSse(client, payload);
        });
      }

      // Heartbeat every 20s to keep connections alive
      heartbeatTimer = setInterval(() => {
        const ping = { channel: "sse.heartbeat", timestamp: new Date().toISOString(), clients: sseClients.size };
        for (const client of sseClients) sendSse(client, ping);
      }, 20000);

      server = http.createServer((req, res) => {
        handle(req, res).catch((error) => {
          sendJson(res, 500, { ok: false, message: error.message });
        });
      });

      await new Promise((resolve) => server.listen(port, resolve));
      console.log(`Alfred listening on http://localhost:${port}`);
    },

    async stop() {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      for (const client of sseClients) client.end();
      sseClients.clear();
      if (server) await new Promise((resolve) => server.close(resolve));
      server = null;
    },
  };
}

module.exports = { createLocalServer };
