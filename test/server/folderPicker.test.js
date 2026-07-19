const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { listDirectory, checkFolder, listRoots } = require("../../src/server/folderPicker");

test("listRoots returns at least one existing root", () => {
  const roots = listRoots();
  assert.ok(Array.isArray(roots));
  assert.ok(roots.length >= 1);
  assert.ok(fs.existsSync(roots[0]));
});

test("listDirectory lists subfolders under a temp dir", async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-browse-"));
  const sub = path.join(dir, "VaultChild");
  await fs.promises.mkdir(sub);
  await fs.promises.writeFile(path.join(dir, "note.md"), "x");

  try {
    const listing = await listDirectory(dir);
    assert.equal(listing.ok, true);
    assert.equal(listing.path, path.resolve(dir));
    assert.ok(listing.entries.some((e) => e.name === "VaultChild"));
    assert.ok(!listing.entries.some((e) => e.name === "note.md"));
    assert.ok(listing.parent);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("checkFolder reports missing vs readable vault-like folders", async () => {
  const missing = await checkFolder(path.join(os.tmpdir(), "definitely-not-a-vault-" + Date.now()));
  assert.equal(missing.ok, false);
  assert.equal(missing.exists, false);

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-vault-check-"));
  await fs.promises.mkdir(path.join(dir, "0 Inbox"));
  await fs.promises.mkdir(path.join(dir, ".obsidian"));
  try {
    const ok = await checkFolder(dir);
    assert.equal(ok.ok, true);
    assert.equal(ok.exists, true);
    assert.ok(ok.looksLikeVault);
    assert.ok(ok.markers.includes("0 Inbox"));
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
});

test("listDirectory home default works", async () => {
  const listing = await listDirectory("");
  assert.equal(listing.ok, true);
  assert.ok(listing.path);
  assert.ok(listing.home);
});
