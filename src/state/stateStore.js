const fs = require("fs");
const path = require("path");

const DEFAULT_STATE = {
  processingStatus: "idle",
  processingLog: "",
  dailySummary: "",
  todos: [],
  nudges: [],
  nowState: { mode: "focus", context: "" },
  inbox: [],
  seenMeetingIds: [],
  seenVaultPaths: [],
  pendingBuzzer: false,
  lastProcessedAt: null,
};

function createStateStore({ filePath }) {
  let state = { ...DEFAULT_STATE };
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener(state);
  }

  async function persist() {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2));
  }

  return {
    async load() {
      if (!fs.existsSync(filePath)) {
        await persist();
        return state;
      }
      try {
        const content = await fs.promises.readFile(filePath, "utf8");
        state = { ...DEFAULT_STATE, ...JSON.parse(content) };
      } catch {
        state = { ...DEFAULT_STATE };
        await persist();
      }
      return state;
    },

    get() {
      return state;
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async patch(updates) {
      state = { ...state, ...updates };
      await persist();
      notify();
      return state;
    },

    async addInboxItem(item) {
      // Dedup vault events: skip if same path already queued
      if (item.source === "vault") {
        const vPath = item.payload?.relativePath;
        if (vPath && state.inbox.some((i) => i.source === "vault" && i.payload?.relativePath === vPath)) {
          return state;
        }
      }
      state = { ...state, inbox: [item, ...state.inbox].slice(0, 200) };
      await persist();
      notify();
      return state;
    },

    async drainInbox(processedItems) {
      const keys = new Set(processedItems.map((i) => `${i.source}:${i.timestamp}`));
      // Track vault paths that have been processed
      const newVaultPaths = processedItems
        .filter((i) => i.source === "vault" && i.payload?.relativePath)
        .map((i) => i.payload.relativePath);
      const seenVaultPaths = [...new Set([...(state.seenVaultPaths || []), ...newVaultPaths])].slice(-500);
      state = {
        ...state,
        inbox: state.inbox.filter((i) => !keys.has(`${i.source}:${i.timestamp}`)),
        seenVaultPaths,
      };
      await persist();
      notify();
    },

    async markMeetingSeen(meetingId) {
      if (!state.seenMeetingIds.includes(meetingId)) {
        state = { ...state, seenMeetingIds: [...state.seenMeetingIds, meetingId] };
        await persist();
      }
    },

    async ackNudge(nudgeId) {
      state = {
        ...state,
        nudges: state.nudges.map((n) => (n.id === nudgeId ? { ...n, acked: true } : n)),
      };
      await persist();
      notify();
      return state;
    },

    async clearBuzzer() {
      if (state.pendingBuzzer) {
        state = { ...state, pendingBuzzer: false };
        await persist();
      }
    },
  };
}

module.exports = { createStateStore, DEFAULT_STATE };
