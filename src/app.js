const path = require("path");
const { createSettingsStore } = require("./settings/settingsStore");
const { createStateStore } = require("./state/stateStore");
const { createInputHub } = require("./inputs/inputHub");
const { createOutputHub } = require("./outputs/outputHub");
const { createPipeline } = require("./pipeline/pipeline");
const { createLocalServer } = require("./server/localServer");
const { createAuditLog } = require("./verification/auditLog");
const { createSkillRunner } = require("./processing/skillRunner");
const { createKnowledgeBase } = require("./processing/knowledgeBase");

const INBOX_SOURCES = new Set(["granola", "vault"]);
const POLL_INTERVAL_MS = Number(process.env.ALFRED_POLL_MS) || 60000;

function createAlfredApp({ projectRoot = path.join(__dirname, "..") } = {}) {
  const settingsStore = createSettingsStore({
    filePath: path.join(projectRoot, "config/settings.local.json"),
  });
  const stateStore = createStateStore({
    filePath: path.join(projectRoot, "config/state.json"),
  });

  let inputHub;
  let outputHub;
  let pipeline;
  let server;
  let skillRunner;

  return {
    async start() {
      const settings = await settingsStore.load();
      await stateStore.load();

      outputHub = createOutputHub({ recentEventLimit: settings.recentEventLimit });
      inputHub = createInputHub({ settingsStore, stateStore });
      pipeline = createPipeline({ inputHub, outputHub });
      skillRunner = createSkillRunner({ stateStore, outputHub });
      const knowledgeBase = createKnowledgeBase({ settingsStore });

      server = createLocalServer({
        settingsStore,
        stateStore,
        skillRunner,
        adapterManager: inputHub.getAdapterManager(),
        outputHub,
        auditLog: createAuditLog({ filePath: path.join(projectRoot, "config/verification.audit.jsonl") }),
      });

      // Wire: new events from inbox sources → skill runner
      inputHub.subscribe(async (event) => {
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
      skillRunner.startPeriodic(POLL_INTERVAL_MS);
      await server.start(port);

      console.log(`Alfred state loaded. TODOs: ${(stateStore.get().todos || []).length}, Nudges: ${(stateStore.get().nudges || []).filter((n) => !n.acked).length}`);
    },

    async stop() {
      if (skillRunner) skillRunner.stopPeriodic();
      if (server) await server.stop();
      if (inputHub) await inputHub.stop();
      if (pipeline) await pipeline.stop();
    },
  };
}

module.exports = { createAlfredApp };
