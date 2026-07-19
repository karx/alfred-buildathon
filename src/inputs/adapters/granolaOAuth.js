const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { exec } = require("child_process");
const { URL, URLSearchParams } = require("url");

const CALLBACK_PORT = 3738;
const CALLBACK_PATH = "/oauth/callback";
const MCP_BASE = "https://mcp.granola.ai";

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generatePKCE() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function httpsGet(rawUrl) {
  return new Promise((resolve, reject) => {
    https.get(rawUrl, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, data, headers: res.headers }); }
      });
    }).on("error", reject);
  });
}

function httpsPost(rawUrl, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    const contentType = typeof body === "string" && body.includes("=")
      ? "application/x-www-form-urlencoded"
      : "application/json";

    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Content-Length": Buffer.byteLength(bodyStr),
        ...extraHeaders,
      },
    };

    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, data, headers: res.headers }); }
      });
    });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

async function discoverEndpoints() {
  // Try MCP resource metadata discovery
  const resourceMeta = await httpsGet(`${MCP_BASE}/.well-known/oauth-protected-resource`);
  let authServerBase = MCP_BASE;

  if (resourceMeta.status === 200 && Array.isArray(resourceMeta.data.authorization_servers)) {
    authServerBase = resourceMeta.data.authorization_servers[0].replace(/\/$/, "");
  }

  const authMeta = await httpsGet(`${authServerBase}/.well-known/oauth-authorization-server`);
  if (authMeta.status !== 200) {
    throw new Error(`OAuth discovery failed (${authMeta.status}): could not reach ${authServerBase}/.well-known/oauth-authorization-server`);
  }

  return authMeta.data;
}

async function registerClient(registrationEndpoint) {
  const res = await httpsPost(registrationEndpoint, {
    client_name: "Alfred",
    redirect_uris: [`http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });

  if (!res.data || !res.data.client_id) {
    throw new Error(`Dynamic client registration failed: ${JSON.stringify(res.data)}`);
  }

  return res.data;
}

function waitForCallback(timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    let server;
    const timer = setTimeout(() => {
      server && server.close();
      reject(new Error("OAuth timeout — browser flow not completed within 5 minutes"));
    }, timeoutMs);

    server = http.createServer((req, res) => {
      const parsed = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (parsed.pathname !== CALLBACK_PATH) { res.end(); return; }

      const code = parsed.searchParams.get("code");
      const error = parsed.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html" });
      if (error) {
        res.end(`<html><body><h2>Alfred: Authorization failed</h2><p>${error}</p><p>You can close this tab.</p></body></html>`);
      } else {
        res.end(`<html><body><h2>Alfred: Connected to Granola!</h2><p>You can close this tab.</p></body></html>`);
      }

      clearTimeout(timer);
      server.close();

      if (error) reject(new Error(`OAuth error: ${error}`));
      else resolve(code);
    });

    server.listen(CALLBACK_PORT, (err) => {
      if (err) { clearTimeout(timer); reject(err); }
    });
  });
}

async function exchangeCode(tokenEndpoint, clientId, code, verifier) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`,
    code_verifier: verifier,
  });

  const res = await httpsPost(tokenEndpoint, params.toString());
  if (!res.data || !res.data.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function runOAuthFlow() {
  const endpoints = await discoverEndpoints();

  if (!endpoints.registration_endpoint) {
    throw new Error("Authorization server does not support Dynamic Client Registration");
  }

  const clientReg = await registerClient(endpoints.registration_endpoint);
  const { verifier, challenge } = generatePKCE();

  const authUrl = new URL(endpoints.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientReg.client_id);
  authUrl.searchParams.set("redirect_uri", `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log(`[Granola OAuth] Opening browser: ${authUrl.toString()}`);
  exec(`open "${authUrl.toString()}"`);

  const code = await waitForCallback();
  const tokens = await exchangeCode(endpoints.token_endpoint, clientReg.client_id, code, verifier);

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    clientId: clientReg.client_id,
    tokenEndpoint: endpoints.token_endpoint,
  };
}

module.exports = { runOAuthFlow, httpsPost };
