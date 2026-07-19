const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
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
    let settled = false;
    const finish = (err, code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (server) {
        try { server.close(); } catch { /* ignore */ }
      }
      if (err) reject(err);
      else resolve(code);
    };

    const timer = setTimeout(() => {
      finish(new Error("OAuth timeout — browser flow not completed within 5 minutes"));
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

      if (error) finish(new Error(`OAuth error: ${error}`));
      else finish(null, code);
    });

    // listen errors (EADDRINUSE etc.) are emitted, not passed to the listen callback
    server.on("error", (err) => {
      finish(err);
    });

    server.listen(CALLBACK_PORT);
  });
}

/**
 * Open a URL in the default browser.
 * On Windows, never shell-interpolate the URL — `&` in query strings is a cmd
 * command separator and silently breaks `exec('start ... "https://...?a=1&b=2"')`.
 */
function openBrowser(url) {
  const platform = process.platform;
  let child;
  if (platform === "win32") {
    // spawn args are not parsed by cmd; empty title arg is required by `start`
    child = spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
  } else if (platform === "darwin") {
    child = spawn("open", [url], { detached: true, stdio: "ignore" });
  } else {
    child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  }
  child.on("error", (err) => {
    console.error(`[Granola OAuth] Failed to open browser: ${err.message}`);
  });
  child.unref();
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

/**
 * Prepare OAuth: discovery + DCR + listen on callback port.
 * Returns authUrl immediately so the UI can show a fallback link; complete()
 * waits for the browser redirect and exchanges the code.
 */
async function prepareOAuthFlow() {
  const endpoints = await discoverEndpoints();

  if (!endpoints.registration_endpoint) {
    throw new Error("Authorization server does not support Dynamic Client Registration");
  }

  const clientReg = await registerClient(endpoints.registration_endpoint);
  const { verifier, challenge } = generatePKCE();

  const authUrlObj = new URL(endpoints.authorization_endpoint);
  authUrlObj.searchParams.set("response_type", "code");
  authUrlObj.searchParams.set("client_id", clientReg.client_id);
  authUrlObj.searchParams.set("redirect_uri", `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`);
  authUrlObj.searchParams.set("code_challenge", challenge);
  authUrlObj.searchParams.set("code_challenge_method", "S256");
  const authUrl = authUrlObj.toString();

  // Listen before the browser opens so the redirect cannot race the server bind.
  const codePromise = waitForCallback();

  return {
    authUrl,
    async complete() {
      const code = await codePromise;
      const tokens = await exchangeCode(
        endpoints.token_endpoint,
        clientReg.client_id,
        code,
        verifier
      );
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
        clientId: clientReg.client_id,
        tokenEndpoint: endpoints.token_endpoint,
      };
    },
  };
}

async function runOAuthFlow() {
  const flow = await prepareOAuthFlow();
  console.log(`[Granola OAuth] Opening browser: ${flow.authUrl}`);
  openBrowser(flow.authUrl);
  return flow.complete();
}

module.exports = { runOAuthFlow, prepareOAuthFlow, openBrowser, httpsPost };
