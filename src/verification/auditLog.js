const fs = require("fs");
const path = require("path");

function createAuditLog({ filePath = path.join(process.cwd(), "config/verification.audit.jsonl") } = {}) {
  return {
    async record(entry) {
      const normalized = {
        id: `verify_${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...entry,
      };
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.appendFile(filePath, `${JSON.stringify(normalized)}\n`);
      return normalized;
    },
  };
}

module.exports = { createAuditLog };
