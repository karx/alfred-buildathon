const path = require("path");
const fs = require("fs");

// Load .env from project root
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const { createAlfredApp } = require("./app");

const app = createAlfredApp();

process.on("SIGINT", async () => {
  console.log("\nStopping Alfred...");
  await app.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await app.stop();
  process.exit(0);
});

app.start().catch((error) => {
  console.error("Alfred failed to start:", error);
  process.exit(1);
});
