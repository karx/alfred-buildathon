const path = require("path");
const { createSettingsStore } = require("./settings/settingsStore");
const { createStateStore } = require("./state/stateStore");
const { createInputHub } = require("./inputs/inputHub");
const { createOutputHub } = require("./outputs/outputHub");
const { createActuatorManager } = require("./outputs/actuatorManager");
const { createPipeline } = require("./pipeline/pipeline");
const { createLocalServer } = require("./server/localServer");
const { createAuditLog } = require("./verification/auditLog");
const { createSkillRunner } = require("./processing/skillRunner");
const { createKnowledgeBase } = require("./processing/knowledgeBase");
const { resolveFabricateRequest } = require("./demo/nudgeFabricator");

const INBOX_SOURCES = new Set(["granola", "vault"]);
const POLL_INTERVAL_MS = Number(process.env.ALFRED_POLL_MS) || 60000;

function isNudgeAckEvent(event) {
  if (!event || event.source !== "arduino-in") return false;
  if (event.type === "arduino-in.hardware.nudge-ack") return true;
  // Physical ACK button: { eventType: "button", button: "nudge-ack"|"ack" }
  if (event.type === "arduino-in.hardware.button") {
    const btn = String(event.payload?.button || "").toLowerCase();
    return btn === "nudge-ack" || btn === "ack";
  }
  return false;
}

function isNudgeFabricateEvent(event) {
  if (!event || event.source !== "arduino-in") return false;
  return event.type === "arduino-in.hardware.nudge-fabricate"
    || event.type === "arduino-in.hardware.demo-nudge";
}

function createAlfredApp({ projectRoot = path.join(__dirname, "..") } = {}) {
  const settingsStore = createSettingsStore({
    filePath: path.join(projectRoot, "config/settings.local.json"),
  });
  const stateStore = createStateStore({
    filePath: path.join(projectRoot, "config/state.json"),
  });

  let inputHub;
  let outputHub;
  let actuatorManager;
  let pipeline;
  let server;
  let skillRunner;

  return {
    async start() {
      const settings = await settingsStore.load();
      await stateStore.load();

      outputHub = createOutputHub({ recentEventLimit: settings.recentEventLimit });
      inputHub = createInputHub({ settingsStore, stateStore });
      actuatorManager = createActuatorManager({ settingsStore, stateStore, outputHub });
      pipeline = createPipeline({ inputHub, outputHub });
      skillRunner = createSkillRunner({ stateStore, outputHub });
      const knowledgeBase = createKnowledgeBase({ settingsStore });

      const inputHitLog = inputHub.getHitLog();

      server = createLocalServer({
        settingsStore,
        stateStore,
        skillRunner,
        adapterManager: inputHub.getAdapterManager(),
        actuatorManager,
        outputHub,
        inputHitLog,
        auditLog: createAuditLog({ filePath: path.join(projectRoot, "config/verification.audit.jsonl") }),
      });

      // Mirror input hits onto SSE so /demo + /settings see them live
      if (inputHitLog) {
        inputHitLog.onHit((hit) => {
          outputHub.publish({
            channel: "alfred.input.hit",
            timestamp: hit.timestamp,
            hit,
          }).catch(() => {});
        });
      }

      // Wire: input events → state / skill runner
      inputHub.subscribe(async (event) => {
        // Hardware nudge-ack: ack the active State API nudge (or explicit nudgeId)
        if (event.source === "arduino-in" && isNudgeAckEvent(event)) {
          const nudgeId = event.payload?.nudgeId || null;
          const result = await stateStore.ackNudge(nudgeId);
          console.log(`[App] Hardware nudge-ack: ${result.message}`);
          await outputHub.publish({
            channel: "alfred.nudge.acked",
            timestamp: new Date().toISOString(),
            ok: result.ok,
            nudgeId: result.ackedId,
            source: "arduino-in",
            response: event.payload?.response || "acknowledged",
          });
          return;
        }

        // Hardware/demo: fabricate a nudge on demand
        if (event.source === "arduino-in" && isNudgeFabricateEvent(event)) {
          const resolved = resolveFabricateRequest({
            scenario: event.payload?.scenario,
            text: event.payload?.text,
            priority: event.payload?.priority,
            replace: event.payload?.replace,
            source: "demo",
          });
          if (!resolved.ok) {
            console.warn(`[App] Hardware nudge-fabricate rejected: ${resolved.message}`);
            await outputHub.publish({
              channel: "alfred.nudge.fabricate-error",
              timestamp: new Date().toISOString(),
              message: resolved.message,
            });
            return;
          }
          const result = await stateStore.fabricateNudges(resolved.nudges, { replace: resolved.replace });
          console.log(`[App] Hardware nudge-fabricate: ${result.message}`);
          await outputHub.publish({
            channel: "alfred.nudge.fabricated",
            timestamp: new Date().toISOString(),
            count: result.added?.length || 0,
            nudgeIds: (result.added || []).map((n) => n.id),
            source: "arduino-in",
          });
          return;
        }

        if (!INBOX_SOURCES.has(event.source)) return;

        const item = {
          source: event.source,
          type: event.type,
          timestamp: event.timestamp,
          payload: event.payload,
        };

        // Persist Granola meetings to vault KB immediately
        if (event.source === "granola" && event.type === "granola.meeting.new") {
          knowledgeBase.writeMeetingNote(event.payload).catch((e) =>
            console.error("[KB] Write error:", e.message)
          );
        }

        await stateStore.addInboxItem(item);
        skillRunner.processNewItems([item]).catch((e) =>
          console.error("[App] Skill runner error:", e.message)
        );
      });

      const port = Number(process.env.ALFRED_PORT) || settings.port;
      await pipeline.start();
      await inputHub.start();
      await actuatorManager.start();
      skillRunner.startPeriodic(POLL_INTERVAL_MS);
      await server.start(port);

      console.log(`Alfred state loaded. TODOs: ${(stateStore.get().todos || []).length}, Nudges: ${(stateStore.get().nudges || []).filter((n) => !n.acked).length}`);
    },

    async stop() {
      if (skillRunner) skillRunner.stopPeriodic();
      if (actuatorManager) await actuatorManager.stop();
      if (server) await server.stop();
      if (inputHub) await inputHub.stop();
      if (pipeline) await pipeline.stop();
    },
  };
}

module.exports = { createAlfredApp };
