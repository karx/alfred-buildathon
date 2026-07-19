const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeExtractResult,
  applyStarts,
} = require("../../src/processing/skillRunner");

// ── Normalizer (mirror of closes handling) ─────────────────────────

test("normalizeExtractResult returns starts: [] when LLM omits the field", () => {
  const result = normalizeExtractResult({
    actions: [{ text: "Ship deck", priority: "high" }],
    closes: [],
    summary: "Meeting notes",
  });
  assert.deepEqual(result.starts, []);
  assert.deepEqual(result.closes, []);
  assert.equal(result.actions.length, 1);
});

test("normalizeExtractResult returns starts: [] when result is null", () => {
  const result = normalizeExtractResult(null);
  assert.deepEqual(result.starts, []);
  assert.deepEqual(result.closes, []);
  assert.deepEqual(result.actions, []);
});

test("normalizeExtractResult keeps starts when LLM provides them", () => {
  const result = normalizeExtractResult({
    actions: [],
    closes: [],
    starts: ["t_abc12345"],
    summary: "Started work",
  });
  assert.deepEqual(result.starts, ["t_abc12345"]);
});

// ── Apply starts (mirror of closes-apply rules) ────────────────────

test("applyStarts moves a todo-status todo to in_progress", () => {
  const todos = [
    { id: "t_open0001", text: "Draft proposal", status: "todo" },
    { id: "t_other002", text: "Other task", status: "todo" },
  ];
  const { todos: next, accepted } = applyStarts(todos, ["t_open0001"], {
    startedBy: "discord",
  });
  const moved = next.find((t) => t.id === "t_open0001");
  const other = next.find((t) => t.id === "t_other002");
  assert.equal(moved.status, "in_progress");
  assert.equal(typeof moved.startedAt, "string");
  assert.equal(moved.startedBy, "discord");
  assert.equal(other.status, "todo");
  assert.deepEqual(accepted, ["t_open0001"]);
});

test("applyStarts does not demote in_progress or done, and ignores unknown IDs", () => {
  const todos = [
    { id: "t_active01", text: "Already going", status: "in_progress" },
    { id: "t_done0001", text: "Finished", status: "done" },
    { id: "t_open0001", text: "Still open", status: "todo" },
  ];
  const { todos: next, accepted } = applyStarts(
    todos,
    ["t_active01", "t_done0001", "t_unknown9", "t_open0001"],
    { startedBy: "vault" }
  );

  assert.equal(next.find((t) => t.id === "t_active01").status, "in_progress");
  assert.equal(next.find((t) => t.id === "t_done0001").status, "done");
  assert.equal(next.find((t) => t.id === "t_open0001").status, "in_progress");
  assert.equal(next.length, 3); // unknown id not inserted
  assert.deepEqual(accepted, ["t_open0001"]);
});
