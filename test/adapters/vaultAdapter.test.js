const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { VaultAdapter } = require("../../src/inputs/adapters/vaultAdapter");

test("VaultAdapter test fails without vaultPath", async () => {
  const adapter = new VaultAdapter();
  const result = await adapter.test({});
  assert.equal(result.ok, false);
  assert.match(result.message, /vaultPath is required/);
});

test("VaultAdapter connects to a readable directory", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-vault-"));
  const adapter = new VaultAdapter();
  const result = await adapter.connect({ vaultPath: dir, extensions: [".md"] });
  assert.equal(result.ok, true);
  await adapter.stop();
});
