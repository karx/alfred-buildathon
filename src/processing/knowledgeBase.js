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
    const owner = meeting.owner
      ? `${meeting.owner.name || ""}${meeting.owner.email ? ` <${meeting.owner.email}>` : ""}`.trim()
      : "";
    const sharedLine = meeting.sharedWithMe
      ? `- Shared with me: yes${owner ? ` (owner: ${owner})` : ""}`
      : owner
        ? `- Owner: ${owner}`
        : null;

    const content = [
      `# ${title}`,
      "",
      `- Date: ${date}`,
      `- Source: Granola`,
      `- Meeting ID: ${meeting.meetingId || meeting.id || ""}`,
      sharedLine,
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
    ]
      .filter((line) => line !== null)
      .join("\n");

    await fs.promises.writeFile(filePath, content, "utf8");
    console.log(`[KB] Wrote meeting note: ${filename}`);
  }

  /**
   * Write-through for Discord bot mentions (inbox routing companion).
   * @param {{ messageId?: string, author?: string, content?: string, channelId?: string, guildId?: string }} msg
   */
  async function writeDiscordNote(msg = {}) {
    const config = getVaultConfig();
    if (!config) return;

    const inboxFolder = path.join(config.vaultPath, config.para?.inbox || "0 Inbox");
    await fs.promises.mkdir(inboxFolder, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const author = msg.author || "unknown";
    const snippet = safeFilename((msg.content || "mention").slice(0, 40)) || "mention";
    const filename = `${date} Discord ${safeFilename(author)} ${snippet}.md`;
    const filePath = path.join(inboxFolder, filename);

    // Dedup by message id in any existing note is ideal; for simplicity skip if same path exists
    if (fs.existsSync(filePath)) return;

    // Also skip if a note for this messageId already exists (different snippet)
    if (msg.messageId) {
      try {
        const files = await fs.promises.readdir(inboxFolder);
        for (const f of files) {
          if (!f.endsWith(".md") || !f.includes("Discord")) continue;
          const body = await fs.promises.readFile(path.join(inboxFolder, f), "utf8");
          if (body.includes(`Message ID: ${msg.messageId}`)) return;
        }
      } catch {
        /* ignore scan errors */
      }
    }

    const content = [
      `# Discord · ${author}`,
      "",
      `- Date: ${date}`,
      `- Source: Discord`,
      `- Message ID: ${msg.messageId || ""}`,
      `- Channel: ${msg.channelId || ""}`,
      `- Guild: ${msg.guildId || ""}`,
      `- Author: ${author}${msg.authorId ? ` (${msg.authorId})` : ""}`,
      "",
      "## Message",
      msg.content || msg.rawContent || "(empty)",
      "",
      "## Actions",
      "- [ ] ",
      "",
    ].join("\n");

    await fs.promises.writeFile(filePath, content, "utf8");
    console.log(`[KB] Wrote Discord note: ${filename}`);
  }

  return { writeMeetingNote, writeDiscordNote };
}

module.exports = { createKnowledgeBase };
