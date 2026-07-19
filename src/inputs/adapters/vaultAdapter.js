const fs = require("fs");
const path = require("path");
const { AdapterContract } = require("../adapterContract");
const { createNormalizedEvent } = require("../../core/eventContract");

class VaultAdapter extends AdapterContract {
  constructor() {
    super({
      id: "vault",
      label: "Vault",
      description: "Watches a local Obsidian-style markdown vault.",
      configExample: {
        vaultPath: "/Users/you/path/to/AlfredVault",
        extensions: [".md", ".canvas"],
        ignoreHidden: true,
        createIfMissing: true,
        para: {
          inbox: "0 Inbox",
          projects: "1 Projects",
          areas: "2 Areas",
          resources: "3 Resources",
          archive: "4 Archive",
          templates: "Templates",
          daily: "Daily",
          assets: "Assets"
        }
      },
      actions: [
        {
          id: "initialize-para",
          label: "Initialize PARA Knowledge Base",
          description: "Create Inbox, Projects, Areas, Resources, Archive, Templates, Daily, and Assets folders."
        }
      ],
    });
    this.watcher = null;
    this.debounceTimers = new Map();
  }

  normalizeConfig(config = {}) {
    return {
      vaultPath: config.vaultPath,
      extensions: Array.isArray(config.extensions) ? config.extensions : [".md", ".canvas"],
      ignoreHidden: config.ignoreHidden !== false,
      createIfMissing: config.createIfMissing !== false,
      para: {
        inbox: "0 Inbox",
        projects: "1 Projects",
        areas: "2 Areas",
        resources: "3 Resources",
        archive: "4 Archive",
        templates: "Templates",
        daily: "Daily",
        assets: "Assets",
        ...(config.para || {}),
      },
    };
  }

  async test(config = {}) {
    const normalized = this.normalizeConfig(config);
    if (!normalized.vaultPath) {
      return { ok: false, message: "vaultPath is required", configExample: this.configExample };
    }

    try {
      const stats = await fs.promises.stat(normalized.vaultPath);
      if (!stats.isDirectory()) {
        return { ok: false, message: "vaultPath exists but is not a directory" };
      }
      await fs.promises.access(normalized.vaultPath, fs.constants.R_OK);
      return {
        ok: true,
        message: "Vault path is readable",
        metadata: {
          vaultPath: path.resolve(normalized.vaultPath),
          extensions: normalized.extensions,
        },
      };
    } catch (error) {
      return { ok: false, message: `Vault path check failed: ${error.message}` };
    }
  }

  async connect(config = {}) {
    const testResult = await this.test(config);
    if (!testResult.ok) return testResult;
    this.config = this.normalizeConfig(config);
    return { ok: true, message: "Vault connected" };
  }

  async runAction(actionId, payload = {}) {
    if (actionId === "initialize-para") {
      return this.initializeParaKnowledgeBase(payload.config || this.config || {});
    }
    return { ok: false, status: 404, message: `Unknown Vault action: ${actionId}` };
  }

  async initializeParaKnowledgeBase(config = {}) {
    const normalized = this.normalizeConfig(config);
    if (!normalized.vaultPath) {
      return { ok: false, message: "vaultPath is required", configExample: this.configExample };
    }
    if (!fs.existsSync(normalized.vaultPath)) {
      if (!normalized.createIfMissing) {
        return { ok: false, message: "vaultPath does not exist and createIfMissing is false" };
      }
      await fs.promises.mkdir(normalized.vaultPath, { recursive: true });
    }
    const testResult = await this.test(normalized);
    if (!testResult.ok) return testResult;

    const folderEntries = Object.values(normalized.para);
    const created = [];
    const existed = [];

    for (const folder of folderEntries) {
      const folderPath = path.join(normalized.vaultPath, folder);
      if (fs.existsSync(folderPath)) {
        existed.push(folder);
      } else {
        await fs.promises.mkdir(folderPath, { recursive: true });
        created.push(folder);
      }
    }

    const templates = {
      "Inbox Capture.md": [
        "# Inbox Capture",
        "",
        "- Captured: {{date}}",
        "- Source: ",
        "- Raw thought:",
        "",
        "## Clarify",
        "- [ ] Is this actionable?",
        "- [ ] Next action:",
        "- [ ] Project/Area:",
        "",
      ].join("\n"),
      "Project.md": [
        "# {{project_name}}",
        "",
        "## Outcome",
        "",
        "## Next Actions",
        "- [ ] ",
        "",
        "## Notes",
        "",
      ].join("\n"),
      "Area.md": [
        "# {{area_name}}",
        "",
        "## Standard",
        "",
        "## Review Cadence",
        "",
        "## Active Responsibilities",
        "",
      ].join("\n"),
      "Daily Summary.md": [
        "# Daily Summary - {{date}}",
        "",
        "## Completed",
        "",
        "## Active Tasks",
        "",
        "## Nudges / Interrupts",
        "",
        "## Background Agent Activity",
        "",
      ].join("\n"),
      "Sparring Session.md": [
        "# Sparring Session - {{date}}",
        "",
        "## Prompt",
        "",
        "## Back-and-forth",
        "",
        "## Decisions",
        "",
        "## Follow-ups",
        "- [ ] ",
        "",
      ].join("\n"),
      "Hardware Event.md": [
        "# Hardware Event - {{timestamp}}",
        "",
        "- Device: {{deviceId}}",
        "- Event Type: {{eventType}}",
        "- Mode: {{mode}}",
        "",
        "## Payload",
        "```json",
        "{{payload}}",
        "```",
        "",
      ].join("\n"),
      "Audio Capture.md": [
        "# Audio Capture - {{timestamp}}",
        "",
        "- Device: {{deviceId}}",
        "- Source: {{source}}",
        "",
        "## Transcript",
        "",
        "## Clarified Next Actions",
        "- [ ] ",
        "",
      ].join("\n"),
      "Nudge Ack.md": [
        "# Nudge Ack - {{timestamp}}",
        "",
        "- Nudge ID: {{nudgeId}}",
        "- Response: {{response}}",
        "- Device: {{deviceId}}",
        "",
      ].join("\n"),
    };

    const templateDir = path.join(normalized.vaultPath, normalized.para.templates);
    const templateResults = [];
    for (const [filename, content] of Object.entries(templates)) {
      const filePath = path.join(templateDir, filename);
      if (fs.existsSync(filePath)) {
        templateResults.push({ filename, status: "exists" });
      } else {
        await fs.promises.writeFile(filePath, content);
        templateResults.push({ filename, status: "created" });
      }
    }

    const readmePath = path.join(normalized.vaultPath, "README.md");
    if (!fs.existsSync(readmePath)) {
      await fs.promises.writeFile(readmePath, [
        "# Alfred Knowledge Base",
        "",
        "This vault is managed by Alfred and organized with PARA:",
        "",
        `- ${normalized.para.inbox}: capture first, clarify later`,
        `- ${normalized.para.projects}: active outcomes with deadlines`,
        `- ${normalized.para.areas}: ongoing responsibilities`,
        `- ${normalized.para.resources}: reference material`,
        `- ${normalized.para.archive}: inactive/completed material`,
        "",
      ].join("\n"));
    }

    return {
      ok: true,
      message: "PARA knowledge base initialized",
      metadata: {
        vaultPath: path.resolve(normalized.vaultPath),
        created,
        existed,
        templates: templateResults,
      },
    };
  }

  shouldIgnore(relativePath) {
    const config = this.config || this.normalizeConfig();
    if (!relativePath) return true;
    const parts = relativePath.split(path.sep);
    if (config.ignoreHidden && parts.some((part) => part.startsWith("."))) return true;
    const ext = path.extname(relativePath);
    return !config.extensions.includes(ext);
  }

  emitFileEvent(eventType, filename) {
    if (!this.publish || !this.config || this.shouldIgnore(filename)) return;

    const absolutePath = path.join(this.config.vaultPath, filename);
    const timerKey = `${eventType}:${absolutePath}`;
    clearTimeout(this.debounceTimers.get(timerKey));

    this.debounceTimers.set(timerKey, setTimeout(async () => {
      this.debounceTimers.delete(timerKey);
      const exists = fs.existsSync(absolutePath);
      await this.publish(createNormalizedEvent({
        source: "vault",
        type: "vault.file.changed",
        payload: {
          changeType: eventType,
          path: absolutePath,
          relativePath: filename,
          exists,
        },
      }));
    }, 100));
  }

  async start(publish) {
    await super.start(publish);
    if (!this.config?.vaultPath) return;

    this.watcher = fs.watch(this.config.vaultPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      this.emitFileEvent(eventType, filename.toString());
    });
  }

  async stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    await super.stop();
  }
}

module.exports = { VaultAdapter };
