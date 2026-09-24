"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const HOST = "127.0.0.1";
const PORT = 53682;
const CALLBACK = `http://${HOST}:${PORT}/oauth2callback`;
const SCOPE = "https://www.googleapis.com/auth/drive";

function readEnvFile(file) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return { text, values };
}

function saveSecret(file, text, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  const next = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}${text.trim() ? "\n" : ""}${line}\n`;
  fs.writeFileSync(file, next, { encoding: "utf8", mode: 0o600 });
}

async function exchangeCode({ clientId, clientSecret, code }) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: CALLBACK })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google OAuth từ chối mã đăng nhập (${response.status}: ${data.error || "unknown"}).`);
  if (!data.refresh_token) throw new Error("Google không trả refresh token. Hãy thu hồi quyền ứng dụng rồi đăng nhập lại với prompt consent.");
  return data.refresh_token;
}

async function main() {
  const { text, values } = readEnvFile(ENV_FILE);
  const clientId = values.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = values.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Thiếu GOOGLE_DRIVE_CLIENT_ID hoặc GOOGLE_DRIVE_CLIENT_SECRET trong .env.local.");

  const state = crypto.randomBytes(24).toString("hex");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: CALLBACK,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  }).toString();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, CALLBACK);
      if (url.pathname !== "/oauth2callback") return response.writeHead(404).end("Not found");
      if (url.searchParams.get("state") !== state) throw new Error("OAuth state không hợp lệ.");
      const oauthError = url.searchParams.get("error");
      if (oauthError) throw new Error(`Google OAuth: ${oauthError}`);
      const code = url.searchParams.get("code");
      if (!code) throw new Error("Callback không có authorization code.");
      const refreshToken = await exchangeCode({ clientId, clientSecret, code });
      saveSecret(ENV_FILE, text, "GOOGLE_DRIVE_REFRESH_TOKEN", refreshToken);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<h2>Đã kết nối Google Drive.</h2><p>Bạn có thể đóng cửa sổ này và quay lại Codex.</p>");
      console.log("GOOGLE_DRIVE_LOGIN_OK");
      server.close();
    } catch (error) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`Đăng nhập thất bại: ${error.message}`);
      console.error(`GOOGLE_DRIVE_LOGIN_ERROR: ${error.message}`);
      server.close();
      process.exitCode = 1;
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`GOOGLE_DRIVE_AUTH_URL=${authUrl}`);
    console.log("Đang chờ bạn chấp thuận trong trình duyệt...");
  });
  setTimeout(() => {
    console.error("GOOGLE_DRIVE_LOGIN_TIMEOUT");
    server.close();
    process.exitCode = 1;
  }, 10 * 60 * 1000).unref();
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { readEnvFile, saveSecret, exchangeCode };
