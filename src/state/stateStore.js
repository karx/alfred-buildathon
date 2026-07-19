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

    async setTodoStatus(todoId, status) {
      const VALID = new Set(["todo", "in_progress", "done"]);
      if (!VALID.has(status)) return { ok: false, message: `invalid status: ${status}` };
      let found = false;
      const next = state.todos.map((t) => {
        if (t.id !== todoId) return t;
        found = true;
        return { ...t, status, updatedAt: new Date().toISOString() };
      });
      if (!found) return { ok: false, message: `todo ${todoId} not found` };
      state = { ...state, todos: next };
      await persist();
      notify();
      return { ok: true, todo: next.find((t) => t.id === todoId) };
    },

    /** Active (unacked) nudges, highest-priority first (as shown on hardware). */
    getActiveNudges() {
      return (state.nudges || []).filter((n) => !n.acked);
    },

    /**
     * Insert fabricated/demo nudges for on-demand demos.
     * @param {Array} nudges - fully formed nudge objects
     * @param {{ replace?: boolean }} opts - if replace, drop unacked demo nudges first
     */
    async fabricateNudges(nudges = [], { replace = false } = {}) {
      if (!Array.isArray(nudges) || !nudges.length) {
        return { ok: false, message: "No nudges to fabricate", added: [], state };
      }

      let existing = state.nudges || [];
      if (replace) {
        // Remove unacked demo/fabricated nudges; keep real + already-acked
        existing = existing.filter((n) => n.acked || (n.source !== "demo" && !n.fabricatedAt));
      }

      // Prepend so fabricated become the active (first) hardware display items
      const next = [...nudges, ...existing].slice(0, 50);
      state = {
        ...state,
        nudges: next,
        pendingBuzzer: true,
        lastProcessedAt: new Date().toISOString(),
      };
      await persist();
      notify();
      return {
        ok: true,
        message: `Fabricated ${nudges.length} nudge(s)`,
        added: nudges,
        activeCount: next.filter((n) => !n.acked).length,
        state,
      };
    },

    /** Clear unacked fabricated/demo nudges only (leave real ones). */
    async clearDemoNudges() {
      const before = (state.nudges || []).length;
      const next = (state.nudges || []).filter(
        (n) => n.acked || (n.source !== "demo" && !n.fabricatedAt)
      );
      const removed = before - next.length;
      state = {
        ...state,
        nudges: next,
        pendingBuzzer: next.some((n) => !n.acked) ? state.pendingBuzzer : false,
      };
      await persist();
      notify();
      return { ok: true, removed, message: `Cleared ${removed} demo nudge(s)`, state };
    },

    /**
     * Apply a full backstage demo stage (todos + nudges + mode + summary).
     * @param {object} app - from buildStageApplication()
     */
    async applyDemoStage(app = {}) {
      let todos = state.todos || [];
      let nudges = state.nudges || [];

      if (app.resetDemo) {
        todos = todos.filter((t) => t.source !== "demo" && !t.fabricatedAt);
        nudges = nudges.filter((n) => n.source !== "demo" && !n.fabricatedAt);
      } else {
        if (Array.isArray(app.todos)) {
          if (app.replaceTodos !== false) {
            const keep = todos.filter((t) => t.source !== "demo" && !t.fabricatedAt);
            todos = [...app.todos, ...keep];
          } else {
            todos = [...app.todos, ...todos];
          }
        }
        if (app.clearNudges) {
          nudges = nudges.filter((n) => n.acked || (n.source !== "demo" && !n.fabricatedAt));
        }
        if (Array.isArray(app.nudges) && app.nudges.length) {
          const keep = nudges.filter((n) => n.acked || (n.source !== "demo" && !n.fabricatedAt));
          nudges = [...app.nudges, ...keep].slice(0, 50);
        }
      }

      const patch = {
        todos,
        nudges,
        pendingBuzzer: Boolean(app.pendingBuzzer),
        processingStatus: app.processingStatus || "idle",
        lastProcessedAt: app.lastProcessedAt || new Date().toISOString(),
      };
      if (app.nowState) patch.nowState = app.nowState;
      if (app.dailySummary !== undefined) patch.dailySummary = app.dailySummary;
      if (app.processingLog !== undefined) patch.processingLog = app.processingLog;

      state = { ...state, ...patch };
      await persist();
      notify();
      return {
        ok: true,
        message: "Demo stage applied",
        todoCount: todos.length,
        activeNudges: nudges.filter((n) => !n.acked).length,
        nowState: state.nowState,
        state,
      };
    },

    /**
     * Acknowledge a nudge. If nudgeId is omitted, acks the current top
     * unacked nudge — the one exposed by GET /api/state.
     * Returns { state, ackedId, ok, message }.
     */
    async ackNudge(nudgeId) {
      const active = (state.nudges || []).filter((n) => !n.acked);
      const targetId = nudgeId || active[0]?.id || null;

      if (!targetId) {
        return { ok: false, ackedId: null, message: "No active nudge to acknowledge", state };
      }

      const exists = (state.nudges || []).some((n) => n.id === targetId);
      if (!exists) {
        return { ok: false, ackedId: null, message: `Unknown nudgeId: ${targetId}`, state };
      }

      state = {
        ...state,
        nudges: state.nudges.map((n) => (n.id === targetId ? { ...n, acked: true } : n)),
        pendingBuzzer: false,
      };
      await persist();
      notify();
      return { ok: true, ackedId: targetId, message: `Acknowledged nudge ${targetId}`, state };
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
