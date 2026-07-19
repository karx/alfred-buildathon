const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStateStore } = require("../../src/state/stateStore");

async function withStore(fn) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-state-"));
  const filePath = path.join(dir, "state.json");
  const store = createStateStore({ filePath });
  await store.load();
  try {
    await fn(store);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

test("ackNudge with no id acks the active (first unacked) nudge", async () => {
  await withStore(async (store) => {
    await store.patch({
      nudges: [
        { id: "n_active", text: "Do the thing", priority: "high", acked: false },
        { id: "n_old", text: "Already done", priority: "low", acked: true },
        { id: "n_next", text: "Next up", priority: "medium", acked: false },
      ],
      pendingBuzzer: true,
    });

    const result = await store.ackNudge(null);
    assert.equal(result.ok, true);
    assert.equal(result.ackedId, "n_active");
    assert.equal(store.get().pendingBuzzer, false);

    const active = store.getActiveNudges();
    assert.equal(active.length, 1);
    assert.equal(active[0].id, "n_next");
  });
});

test("ackNudge with explicit id acks that nudge", async () => {
  await withStore(async (store) => {
    await store.patch({
      nudges: [
        { id: "n_1", text: "First", acked: false },
        { id: "n_2", text: "Second", acked: false },
      ],
    });

    const result = await store.ackNudge("n_2");
    assert.equal(result.ok, true);
    assert.equal(result.ackedId, "n_2");
    assert.deepEqual(
      store.getActiveNudges().map((n) => n.id),
      ["n_1"]
    );
  });
});

test("ackNudge with no active nudges fails cleanly", async () => {
  await withStore(async (store) => {
    await store.patch({ nudges: [{ id: "n_x", text: "done", acked: true }] });
    const result = await store.ackNudge(null);
    assert.equal(result.ok, false);
    assert.equal(result.ackedId, null);
  });
});
