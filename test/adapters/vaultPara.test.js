const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { VaultAdapter } = require("../../src/inputs/adapters/vaultAdapter");

test("VaultAdapter initializes a PARA knowledge base", async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "alfred-kb-parent-"));
  const vaultPath = path.join(root, "AlfredVault");
  const adapter = new VaultAdapter();

  const result = await adapter.runAction("initialize-para", {
    config: {
      vaultPath,
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
    }
  });

  assert.equal(result.ok, true);
  for (const folder of ["0 Inbox", "1 Projects", "2 Areas", "3 Resources", "4 Archive", "Templates", "Daily", "Assets"]) {
    const stats = await fs.promises.stat(path.join(vaultPath, folder));
    assert.equal(stats.isDirectory(), true);
  }
  const readme = await fs.promises.readFile(path.join(vaultPath, "README.md"), "utf8");
  assert.match(readme, /Alfred Knowledge Base/);
  const template = await fs.promises.readFile(path.join(vaultPath, "Templates", "Audio Capture.md"), "utf8");
  assert.match(template, /Audio Capture/);
});
