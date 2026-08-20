"use strict";

// Configure the Cloudflare Pages project from the local .env files.
//
//   node scripts/configure-cloudflare.js --dry-run
//   node scripts/configure-cloudflare.js
//
// Values are read and sent by this script alone; they never pass through a shell.
// That is the point. `set -a; . ./.env` expands "$" inside values, and the scrypt
// password hash is "scrypt$salt$hash" - sourcing it that way silently truncated a
// 116-character hash to 27 and produced a deployment where the correct admin
// password was rejected. Nothing here prints a value: only names and lengths.

const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PROJECT = process.env.CF_PAGES_PROJECT || "tram-chu-web";
const dryRun = process.argv.includes("--dry-run");

// Plain variables are visible in the dashboard; secrets are write-only there.
const PLAIN = {
  R2_BUCKET: "novel-storage",
  R2_ARCHIVE_BUCKET: "novel-archive",
  R2_PUBLIC_BASE_URL: "https://cdn.tram-chu.online",
  GITHUB_REPOSITORY: "PhucPM89/AutoTranslate"
};
const PLAIN_FROM_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];
const SECRETS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LIBRARY_SESSION_SECRET",
  "LIBRARY_UPLOAD_PASSWORD_HASH",
  "GITHUB_DISPATCH_TOKEN"
];

// READER_CDN_ENABLED is deliberately never set: it switches real readers onto the
// CDN and stays off until that path is signed off by hand.
const NEVER_SET = ["READER_CDN_ENABLED", "GEMINI_API_KEY"];

// A dotenv parser that does not expand anything.
function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function loadEnv() {
  return { ...parseEnvFile(path.join(ROOT, ".env")), ...parseEnvFile(path.join(ROOT, ".env.local")) };
}

// The session secret belongs to this deployment and nothing else, so it is
// generated here on first run and kept in .env.local so later runs are idempotent
// and local tests can mint a matching cookie.
function ensureSessionSecret(env) {
  if (env.LIBRARY_SESSION_SECRET_CF) return env.LIBRARY_SESSION_SECRET_CF;
  const secret = crypto.randomBytes(48).toString("base64url");
  const file = path.join(ROOT, ".env.local");
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\s*$/, "") : "";
  fs.writeFileSync(file, `${previous}\n\n# Session secret for the Cloudflare deployment.\nLIBRARY_SESSION_SECRET_CF=${secret}\n`);
  console.log("  đã sinh LIBRARY_SESSION_SECRET mới và lưu vào .env.local");
  return secret;
}

function githubToken(env) {
  if (env.GITHUB_DISPATCH_TOKEN) return env.GITHUB_DISPATCH_TOKEN;
  try {
    // Falls back to the signed-in gh CLI so the dispatch works without a manual
    // step. A dedicated fine-grained token is better: this one carries whatever
    // scopes the CLI login has, and dies when that login is revoked.
    return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

async function main() {
  const env = loadEnv();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) throw new Error("Thiếu CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN.");

  const resolved = { ...PLAIN };
  for (const name of PLAIN_FROM_ENV) resolved[name] = env[name] || "";
  const secretValues = {
    LIBRARY_SESSION_SECRET: ensureSessionSecret(loadEnv()),
    GITHUB_DISPATCH_TOKEN: githubToken(env)
  };
  for (const name of SECRETS) {
    if (!(name in secretValues)) secretValues[name] = env[name] || "";
  }

  const envVars = {};
  for (const [name, value] of Object.entries(resolved)) envVars[name] = { type: "plain_text", value };
  for (const name of SECRETS) envVars[name] = { type: "secret_text", value: secretValues[name] };

  console.log(`Project: ${PROJECT}\n`);
  console.log("Plain:");
  for (const name of Object.keys(resolved)) {
    console.log(`  ${resolved[name] ? "OK     " : "THIẾU  "} ${name}`);
  }
  console.log("\nSecret (chỉ in độ dài):");
  for (const name of SECRETS) {
    const value = secretValues[name];
    console.log(`  ${value ? "OK     " : "THIẾU  "} ${name}${value ? `  (${value.length} ký tự)` : ""}`);
  }

  const missing = [...Object.keys(resolved), ...SECRETS].filter((name) => !envVars[name].value);
  if (missing.length) throw new Error(`Thiếu giá trị: ${missing.join(", ")}`);

  // The hash has three "$"-separated fields; anything else means it was mangled
  // on its way here, which is exactly the bug this script exists to prevent.
  const hash = secretValues.LIBRARY_UPLOAD_PASSWORD_HASH;
  if (hash.split("$").length !== 3) {
    throw new Error(`LIBRARY_UPLOAD_PASSWORD_HASH sai định dạng (${hash.split("$").length} phần, cần 3). Giá trị đã bị shell biến dạng?`);
  }

  for (const name of NEVER_SET) {
    if (name in envVars) throw new Error(`${name} không được cấu hình ở đây.`);
  }
  console.log(`\nKhông đặt: ${NEVER_SET.join(", ")}`);

  if (dryRun) {
    console.log("\nDRY RUN — không gửi gì.");
    return;
  }

  const body = {
    deployment_configs: {
      production: {
        compatibility_date: "2026-08-01",
        // Required: the admin login verifies scrypt through node:crypto.
        compatibility_flags: ["nodejs_compat"],
        r2_buckets: {
          NOVEL_STORAGE: { name: "novel-storage" },
          NOVEL_ARCHIVE: { name: "novel-archive" }
        },
        env_vars: envVars
      }
    }
  };

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${PROJECT}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const result = await response.json();
  if (!result.success) {
    throw new Error(`Cloudflare từ chối: ${(result.errors || []).map((e) => `${e.code} ${e.message}`).join("; ")}`);
  }

  const production = result.result.deployment_configs.production;
  console.log("\nĐã cấu hình:");
  console.log(`  compatibility : ${production.compatibility_date} ${JSON.stringify(production.compatibility_flags)}`);
  console.log(`  r2 bindings   : ${Object.keys(production.r2_buckets || {}).join(", ")}`);
  console.log(`  biến          : ${Object.keys(production.env_vars || {}).length}`);
  console.log(`  READER_CDN_ENABLED: ${"READER_CDN_ENABLED" in (production.env_vars || {}) ? "CÓ — sai" : "không"}`);
}

main().catch((error) => {
  console.error(`CONFIGURE FAILED: ${error.message}`);
  process.exit(1);
});
