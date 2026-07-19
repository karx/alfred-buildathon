const http = require("http");
const { createSettingsPage } = require("./settingsPage");
const { createLivePage } = require("./livePage");
const { createDemoPage } = require("./demoPage");
const { resolveFabricateRequest, listScenarios } = require("../demo/nudgeFabricator");
const { resolveStagePack, buildStageApplication, listStagePacks } = require("../demo/demoStage");
const { idleGreetingDisplay } = require("./idleGreeting");
const { listSkills, getSkill, isRunnable } = require("../processing/skillRegistry");

function createLocalServer({ settingsStore, adapterManager, actuatorManager, outputHub, auditLog, stateStore, skillRunner, skillScheduler, inputHitLog }) {
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

    if (req.method === "GET" && url.pathname === "/demo") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(createDemoPage());
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
      const activeNudge = nudges[0] || null;
      const isProcessing = state.processingStatus === "processing";
      const isInMeeting = state.nowState?.mode === "meeting";

      let led = "green";
      // Idle fallback: "Good Morning/Day/Evening - <random minified greeting>"
      let display = idleGreetingDisplay();
      if (isProcessing) { led = "red"; display = "Processing..."; }
      else if (activeNudge) { led = "red"; display = String(activeNudge.text || "").slice(0, 20); }
      else if (isInMeeting) { led = "blue"; display = (state.nowState?.context || "In meeting").slice(0, 20); }

      const buzzer = nudges.length > 0;
      // Edge-clear pendingBuzzer on read so the next poll does not re-chirp (await so contract is stable).
      if (buzzer && stateStore) await stateStore.clearBuzzer();

      sendJson(res, 200, {
        led,
        display,
        buzzer,
        // Hardware can POST nudge-ack with this id, or omit id to ack this active nudge.
        nudgeId: activeNudge?.id || null,
        nudgeText: activeNudge ? String(activeNudge.text || "").slice(0, 40) : null,
        nudgeCount: nudges.length,
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

    // Skills registry (Phase 1)
    if (req.method === "GET" && url.pathname === "/api/skills") {
      const lastRan = (stateStore && stateStore.get().skillLastRan) || {};
      const skills = listSkills().map((s) => ({
        ...s,
        enabled: settingsStore.isSkillEnabled
          ? settingsStore.isSkillEnabled(s.id)
          : s.defaultEnabled,
        lastRan: lastRan[s.id] || null,
      }));
      sendJson(res, 200, { ok: true, skills });
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/skills\/[^/]+\/run-now$/)) {
      const skillId = url.pathname.split("/")[3];
      const skill = getSkill(skillId);
      if (!skill) {
        sendJson(res, 404, { ok: false, message: `Unknown skill: ${skillId}` });
        return;
      }
      if (!isRunnable(skillId)) {
        sendJson(res, 501, { ok: false, message: `Skill is a stub / not runnable: ${skillId}` });
        return;
      }
      if (settingsStore.isSkillEnabled && !settingsStore.isSkillEnabled(skillId)) {
        sendJson(res, 409, { ok: false, message: `Skill disabled: ${skillId}` });
        return;
      }
      const busy =
        (skillRunner && typeof skillRunner.isRunning === "function" && skillRunner.isRunning()) ||
        (stateStore && stateStore.get().processingStatus === "processing");
      if (busy) {
        sendJson(res, 409, { ok: false, message: "Pipeline busy — skill run skipped" });
        return;
      }
      if (!skillRunner) {
        sendJson(res, 503, { ok: false, message: "Skill runner unavailable" });
        return;
      }
      const run =
        typeof skillRunner.runSkill === "function"
          ? () => skillRunner.runSkill(skillId, { trigger: "manual" })
          : skillId === "garden-kb"
            ? () => skillRunner.runGarden()
            : null;
      if (!run) {
        sendJson(res, 501, { ok: false, message: `No run-now handler for ${skillId}` });
        return;
      }
      run().catch((e) => console.error(`[Skill] run-now ${skillId}:`, e.message));
      sendJson(res, 202, { ok: true, message: `Skill ${skillId} triggered`, skillId });
      return;
    }

    if (req.method === "POST" && url.pathname.match(/^\/api\/skills\/[^/]+\/toggle$/)) {
      const skillId = url.pathname.split("/")[3];
      if (!getSkill(skillId)) {
        sendJson(res, 404, { ok: false, message: `Unknown skill: ${skillId}` });
        return;
      }
      const body = await readBody(req);
      const enabled = Boolean(body.enabled);
      try {
        const entry = await settingsStore.updateSkill(skillId, { enabled });
        if (skillScheduler && typeof skillScheduler.reload === "function") {
          skillScheduler.reload();
        }
        sendJson(res, 200, { ok: true, skillId, enabled: entry.enabled });
      } catch (err) {
        sendJson(res, 400, { ok: false, message: err.message });
      }
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

    // Nudge acknowledgement — nudgeId optional; omit to ack the active State API nudge
    if (req.method === "POST" && url.pathname === "/api/alfred/todo-status") {
      const body = await readBody(req);
      if (!body.id || !body.status) {
        sendJson(res, 400, { ok: false, message: "id and status required" });
        return;
      }
      const result = await stateStore.setTodoStatus(body.id, body.status);
      if (!result.ok) { sendJson(res, 404, result); return; }
      if (outputHub) await outputHub.publish({
        channel: "alfred.state.updated",
        timestamp: new Date().toISOString(),
        reason: "todo-status",
        todoId: body.id,
        status: body.status,
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/alfred/nudge-ack") {
      const body = await readBody(req);
      if (!stateStore) { sendJson(res, 503, { ok: false, message: "State store unavailable" }); return; }
      const result = await stateStore.ackNudge(body.nudgeId || null);
      if (outputHub && result.ok) {
        await outputHub.publish({
          channel: "alfred.state.updated",
          timestamp: new Date().toISOString(),
          reason: "nudge-ack",
          nudgeId: result.ackedId,
        });
      }
      sendJson(res, result.ok ? 200 : 404, {
        ok: result.ok,
        nudgeId: result.ackedId,
        message: result.message,
      });
      return;
    }

    // List demo nudge scenarios (for UI / docs)
    if (req.method === "GET" && url.pathname === "/api/alfred/nudge/scenarios") {
      sendJson(res, 200, { ok: true, scenarios: listScenarios() });
      return;
    }

    // Full backstage demo stage packs
    if (req.method === "GET" && url.pathname === "/api/alfred/demo/packs") {
      sendJson(res, 200, { ok: true, packs: listStagePacks() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/alfred/demo/stage") {
      if (!stateStore) { sendJson(res, 503, { ok: false, message: "State store unavailable" }); return; }
      const body = await readBody(req);
      const resolved = resolveStagePack(body.pack || body.stage || "full");
      if (!resolved.ok) {
        sendJson(res, 400, resolved);
        return;
      }
      const app = buildStageApplication(resolved.pack, {
        replaceTodos: body.replaceTodos !== false,
      });
      const result = await stateStore.applyDemoStage(app);
      if (outputHub) {
        await outputHub.publish({
          channel: "alfred.demo.stage",
          timestamp: new Date().toISOString(),
          pack: resolved.packId,
          label: resolved.label,
          todoCount: result.todoCount,
          activeNudges: result.activeNudges,
        });
      }
      sendJson(res, 200, {
        ok: true,
        message: `Loaded stage pack: ${resolved.label}`,
        pack: resolved.packId,
        label: resolved.label,
        todoCount: result.todoCount,
        activeNudges: result.activeNudges,
        nowState: result.nowState,
      });
      return;
    }

    // Fabricate / create nudges on demand (demo + custom)
    if (req.method === "POST" && url.pathname === "/api/alfred/nudge/fabricate") {
      if (!stateStore) { sendJson(res, 503, { ok: false, message: "State store unavailable" }); return; }
      const body = await readBody(req);
      const resolved = resolveFabricateRequest(body);
      if (!resolved.ok) {
        sendJson(res, 400, resolved);
        return;
      }
      const result = await stateStore.fabricateNudges(resolved.nudges, { replace: resolved.replace });
      if (outputHub && result.ok) {
        await outputHub.publish({
          channel: "alfred.nudge.fabricated",
          timestamp: new Date().toISOString(),
          count: result.added.length,
          nudgeIds: result.added.map((n) => n.id),
          scenario: body.scenario || null,
        });
      }
      sendJson(res, result.ok ? 201 : 400, {
        ok: result.ok,
        message: result.message,
        added: result.added,
        activeCount: result.activeCount,
        statePreview: {
          nudgeId: result.added[0]?.id || null,
          nudgeText: result.added[0]?.text || null,
        },
      });
      return;
    }

    // Clear only demo/fabricated unacked nudges
    if (req.method === "POST" && url.pathname === "/api/alfred/nudge/clear-demo") {
      if (!stateStore) { sendJson(res, 503, { ok: false, message: "State store unavailable" }); return; }
      const result = await stateStore.clearDemoNudges();
      if (outputHub) {
        await outputHub.publish({
          channel: "alfred.nudge.demo-cleared",
          timestamp: new Date().toISOString(),
          removed: result.removed,
        });
      }
      sendJson(res, 200, result);
      return;
    }

    // Input hit log — every adapter event + failed HTTP ingest attempts
    if (req.method === "GET" && url.pathname === "/api/alfred/input-hits") {
      const limit = Number(url.searchParams.get("limit") || 100);
      const hits = inputHitLog ? inputHitLog.getRecent(limit) : [];
      sendJson(res, 200, { ok: true, count: hits.length, hits });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/alfred/input-hits/clear") {
      if (inputHitLog) inputHitLog.clear();
      sendJson(res, 200, { ok: true, message: "Input hit log cleared" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/adapters") {
      sendJson(res, 200, { ok: true, adapters: adapterManager.listAdapters() });
      return;
    }

    // Discord bot install callback (code-grant friendly).
    // When "Requires OAuth2 Code Grant" is on, exchanging the code completes install.
    // Gateway still uses DISCORD_BOT_TOKEN — we only exchange to finalize guild join.
    if (
      req.method === "GET" &&
      (url.pathname === "/api/adapters/discord/oauth/callback" ||
        url.pathname === "/api/adapters/discord/callback" ||
        url.pathname === "/oauth/discord/callback")
    ) {
      const guildId = url.searchParams.get("guild_id") || "";
      const err = url.searchParams.get("error");
      const errDesc = url.searchParams.get("error_description") || "";
      const code = url.searchParams.get("code") || "";
      const port = Number(process.env.ALFRED_PORT) || settingsStore.get().port || 3737;
      const redirectUri =
        process.env.DISCORD_REDIRECT_URI ||
        `http://localhost:${port}${url.pathname}`;
      const clientId = process.env.DISCORD_CLIENT_ID || "";
      const clientSecret =
        process.env.DISCORD_CLIENT_SECRET || process.env.DISCORD_BOT_SECRET || "";

      let exchangeOk = null;
      let exchangeMsg = "";
      if (!err && code && clientId && clientSecret) {
        try {
          const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          });
          const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(10000),
          });
          const tokenJson = await tokenRes.json().catch(() => ({}));
          exchangeOk = tokenRes.ok;
          exchangeMsg = tokenRes.ok
            ? "OAuth code exchanged (code-grant complete)."
            : `Token exchange failed HTTP ${tokenRes.status}: ${tokenJson.error || tokenJson.message || JSON.stringify(tokenJson).slice(0, 120)}`;
          console.log(
            `[Discord OAuth] token exchange ${tokenRes.ok ? "ok" : "fail"} guild=${guildId || "?"} ${exchangeMsg}`
          );
        } catch (e) {
          exchangeOk = false;
          exchangeMsg = `Token exchange error: ${e.message}`;
          console.error("[Discord OAuth]", exchangeMsg);
        }
      } else if (!err && code && !clientSecret) {
        exchangeMsg =
          "Got code but no DISCORD_CLIENT_SECRET / DISCORD_BOT_SECRET in .env — cannot complete code-grant exchange.";
        console.warn(`[Discord OAuth] ${exchangeMsg}`);
      }

      const ok = !err;
      const installed = Boolean(guildId);
      const title = !ok
        ? "Discord install failed"
        : installed
          ? "Discord bot installed"
          : "OAuth completed — bot may not be in a server";
      let body;
      if (!ok) {
        body = `<strong>${err}</strong>${errDesc ? `: ${errDesc}` : ""}`;
      } else if (installed) {
        body = `Bot authorized for guild <code>${guildId}</code>.
          ${exchangeMsg ? `<br>${exchangeMsg}` : ""}
          ${exchangeOk === false ? "<br><strong>Fix .env client secret / redirect match, then re-invite.</strong>" : ""}
          <br>Close this tab and <strong>@mention the bot</strong> in that server.
          <br>If the bot still doesn’t appear: Server Settings → Integrations, or re-run invite after exchange succeeds.`;
      } else {
        body = `Discord redirected back${code ? " with a code" : ""} but <strong>no <code>guild_id</code></strong>.
          ${exchangeMsg ? `<br>${exchangeMsg}` : ""}
          <ol>
            <li>Use Alfred’s minimal invite: <code>GET /api/adapters/discord/invite</code> (scope=<strong>bot only</strong>)</li>
            <li>Pick a <strong>server</strong> in the Discord dialog</li>
            <li>Confirm under Server Settings → Integrations</li>
          </ol>`;
      }
      console.log(
        `[Discord OAuth callback] ok=${ok} guild_id=${guildId || "(none)"} code=${code ? "yes" : "no"} exchange=${exchangeOk} error=${err || ""}`
      );
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
code{background:#f4f4f5;padding:.1rem .3rem;border-radius:4px}</style>
</head><body><h1>${title}</h1><p>${body}</p>
<p><a href="/api/adapters/discord/invite">Invite JSON</a> · <a href="/settings">Settings</a> · <a href="/demo">Demo</a></p></body></html>`);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/adapters/discord/invite") {
      const clientId =
        process.env.DISCORD_CLIENT_ID ||
        process.env.DISCORD_APPLICATION_ID ||
        "";
      const port = Number(process.env.ALFRED_PORT) || settingsStore.get().port || 3737;
      const redirectUri =
        process.env.DISCORD_REDIRECT_URI ||
        `http://localhost:${port}/api/adapters/discord/callback`;
      const permissions = process.env.DISCORD_BOT_PERMISSIONS || "66560";
      if (!clientId) {
        sendJson(res, 400, {
          ok: false,
          message: "Set DISCORD_CLIENT_ID in .env (Application ID from Developer Portal)",
          redirectUri,
        });
        return;
      }
      const inviteUrl =
        `https://discord.com/api/oauth2/authorize` +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&permissions=${encodeURIComponent(permissions)}` +
        `&scope=bot` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`;
      sendJson(res, 200, {
        ok: true,
        inviteUrl,
        redirectUri,
        instructions: [
          "Developer Portal → OAuth2 → Redirects: add the redirectUri exactly",
          "Open inviteUrl, pick a server, authorize",
          "You land on Alfred's localhost callback — bot is installed",
          "@mention the bot in Discord to feed Alfred inbox",
        ],
      });
      return;
    }

    // Output / actuator registry (composable fan-out)
    if (req.method === "GET" && url.pathname === "/api/actuators") {
      const list = actuatorManager ? actuatorManager.listActuators() : [];
      sendJson(res, 200, {
        ok: true,
        actuators: list,
        // Built-in projections that predate the registry
        builtins: [
          { id: "sse", label: "SSE /events", description: "Browser event stream from outputHub" },
          { id: "hardware-state", label: "GET /api/state", description: "Hardware LED/display/buzzer projection" },
          { id: "vault-sync", label: "Vault state sync", description: "Alfred/*.md mirror of todos/daily" },
          { id: "kb-meeting", label: "Meeting notes", description: "Write-through Granola → 0 Inbox" },
        ],
      });
      return;
    }

    const actuatorAction = url.pathname.match(/^\/api\/actuators\/([^/]+)\/(connect|test|disconnect)$/);
    if (req.method === "POST" && actuatorAction && actuatorManager) {
      const [, actuatorId, action] = actuatorAction;
      const body = await readBody(req);
      const config = body.config || {};
      const result = action === "connect"
        ? await actuatorManager.connect(actuatorId, config)
        : action === "disconnect"
          ? await actuatorManager.disconnect(actuatorId)
          : await actuatorManager.test(actuatorId, config);
      sendJson(res, result.ok ? 200 : 400, result);
      return;
    }

    const actuatorCustom = url.pathname.match(/^\/api\/actuators\/([^/]+)\/actions\/([^/]+)$/);
    if (req.method === "POST" && actuatorCustom && actuatorManager) {
      const [, actuatorId, actionId] = actuatorCustom;
      const body = await readBody(req);
      const result = await actuatorManager.runAction(actuatorId, actionId, body);
      sendJson(res, result.ok ? 200 : (result.status || 400), result);
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
      // Success is logged when the adapter publishes; failures (auth, not connected) never publish
      if (inputHitLog && !result.ok) {
        const hit = inputHitLog.recordIngest({
          adapterId,
          payload,
          result,
          path: url.pathname,
        });
        console.warn(`[Input] HTTP FAIL ${adapterId}: ${hit.message || result.message}`);
        if (outputHub) {
          outputHub.publish({
            channel: "alfred.input.hit",
            timestamp: hit.timestamp,
            hit,
          }).catch(() => {});
        }
      } else if (inputHitLog && result.ok && !result.event) {
        // Edge case: accepted without publish
        inputHitLog.recordIngest({ adapterId, payload, result, path: url.pathname });
      }
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
