const fs = require("fs");
const path = require("path");

function createKnowledgeBase({ settingsStore }) {
  function getVaultConfig() {
    const adapters = settingsStore.get().adapters || {};
    const vaultConfig = adapters.vault?.config;
    if (!vaultConfig?.vaultPath) return null;
    return vaultConfig;
  }

  function safeFilename(title) {
    return title.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  async function writeMeetingNote(meeting) {
    const config = getVaultConfig();
    if (!config) return;

    const inboxFolder = path.join(config.vaultPath, config.para?.inbox || "0 Inbox");
    await fs.promises.mkdir(inboxFolder, { recursive: true });

    const date = (meeting.date || meeting.created_at || new Date().toISOString()).slice(0, 10);
    const title = meeting.title || "Untitled Meeting";
    const filename = `${date} ${safeFilename(title)}.md`;
    const filePath = path.join(inboxFolder, filename);

    if (fs.existsSync(filePath)) return; // already written

    const attendees = (meeting.attendees || []).map((a) => `- ${a.name || a.email || a}`).join("\n") || "- (none)";
    const summary = meeting.summary || meeting.ai_summary || "(no summary)";
    const notes = meeting.notes || meeting.content || "";

    const content = [
      `# ${title}`,
      "",
      `- Date: ${date}`,
      `- Source: Granola`,
      `- Meeting ID: ${meeting.meetingId || meeting.id || ""}`,
      "",
      "## Attendees",
      attendees,
      "",
      "## Summary",
      summary,
      notes ? "\n## Notes\n" + notes : "",
      "",
      "## Actions",
      "- [ ] ",
      "",
    ].join("\n");

    await fs.promises.writeFile(filePath, content, "utf8");
    console.log(`[KB] Wrote meeting note: ${filename}`);
  }

  return { writeMeetingNote };
}

module.exports = { createKnowledgeBase };
