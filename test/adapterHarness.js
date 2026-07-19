const fs = require("fs");
const os = require("os");
const path = require("path");
const { createSettingsStore } = require("../src/settings/settingsStore");
const { createInputHub } = require("../src/inputs/inputHub");

function defaultConfig(adapterId) {
  if (adapterId === "vault") {
    return { vaultPath: process.cwd(), extensions: [".md", ".json"], ignoreHidden: true };
  }
  if (adapterId === "arduino-in") {
    return { deviceId: "harness-device", transport: "http", sharedSecret: "dev-secret" };
  }
  if (adapterId === "slack") {
    return { mode: "events-api", workspaceName: "harness", signingSecret: "secret", botToken: "xoxb-test" };
  }
  if (adapterId === "discord") {
    return { mode: "bot-gateway", botToken: "Bot test", guildId: "guild-harness", channelIds: ["channel-harness"] };
  }
  return {};
}

async function runHarness(adapterId, config = defaultConfig(adapterId)) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-harness-"));
  const settingsStore = createSettingsStore({ filePath: path.join(tmpDir, "settings.local.json") });
  await settingsStore.load();

  const inputHub = createInputHub({ settingsStore });
  const adapterManager = inputHub.getAdapterManager();
  const events = [];

  inputHub.subscribe(async (event) => events.push(event));
  await inputHub.start();

  const testResult = await adapterManager.test(adapterId, config);
  const connectResult = await adapterManager.connect(adapterId, config);

  if (adapterId === "arduino-in" && connectResult.ok) {
    for (const payload of [
      { eventType: "button", button: "sparring", state: "pressed" },
      { eventType: "audio-in", source: "desk-mic", transcript: "Captured audio transcript goes here", confidence: 0.9 },
      { eventType: "mode-toggle", mode: "sparring", enabled: true },
      { eventType: "nudge-ack", nudgeId: "nudge-demo-1", response: "acknowledged" },
    ]) {
      await adapterManager.ingest(
        adapterId,
        payload,
        { headers: { "x-alfred-secret": config.sharedSecret } }
      );
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 150));
  await inputHub.stop();

  return { adapterId, testResult, connectResult, events };
}

if (require.main === module) {
  const adapterId = process.argv[2];
  if (!adapterId) {
    console.error("Usage: npm run test:adapter -- <vault|discord|slack|arduino-in>");
    process.exit(1);
  }

  runHarness(adapterId)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runHarness };
