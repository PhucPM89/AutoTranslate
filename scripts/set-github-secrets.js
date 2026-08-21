"use strict";

// Copy the secrets the workflows need from the local .env files into GitHub
// Actions repository secrets.
//
//   node scripts/set-github-secrets.js --dry-run     # bao gi se duoc dat
//   node scripts/set-github-secrets.js               # dat that
//
// Requires `gh auth login` to have been run first - this script never asks for a
// credential and never stores one.
//
// Values are piped to `gh` over stdin rather than passed as an argument, because
// process arguments are readable by other processes on the machine. Nothing here
// prints a value: only the name and its character count.

const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_ARCHIVE_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY"
];

const OPTIONAL = ["GEMINI_API_KEYS", "GEMINI_MODEL", "GEMINI_FALLBACK_MODELS", "GEMINI_CHUNK_SIZE", "SITE_CONTACT_EMAIL"];

const ROOT = path.join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

function loadEnvFiles() {
  const values = {};
  // .env.local wins over .env, matching how the rest of the tooling is run.
  for (const name of [".env", ".env.local"]) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
      if (value) values[match[1]] = value;
    }
  }
  // A real environment variable beats a file, so CI can override.
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    if (process.env[name]) values[name] = process.env[name];
  }
  return values;
}

function repoSlug() {
  const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: ROOT, encoding: "utf8" }).trim();
  const match = remote.match(/github\.com[/:]([^/]+\/[^/.]+)/);
  if (!match) throw new Error(`Không đọc được repo từ remote: ${remote}`);
  return match[1];
}

function requireAuth() {
  const result = spawnSync("gh", ["auth", "status"], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error("gh chưa đăng nhập. Chạy trước:\n  gh auth login --hostname github.com --git-protocol https --web");
    process.exit(1);
  }
}

function setSecret(repo, name, value) {
  // --body is deliberately not used: arguments are visible in the process list.
  const result = spawnSync("gh", ["secret", "set", name, "--repo", repo], {
    input: value,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    // gh echoes the name but not the value on failure, so this is safe to print.
    throw new Error(`gh secret set ${name} thất bại: ${(result.stderr || "").trim().slice(0, 200)}`);
  }
}

function main() {
  const values = loadEnvFiles();
  const missing = REQUIRED.filter((name) => !values[name]);

  console.log(dryRun ? "DRY RUN — không đặt gì.\n" : "");
  const repo = repoSlug();
  console.log(`Repo: ${repo}\n`);

  console.log("Bắt buộc:");
  for (const name of REQUIRED) {
    const value = values[name];
    console.log(`  ${value ? "OK     " : "THIẾU  "} ${name}${value ? `  (${value.length} ký tự)` : ""}`);
  }
  console.log("\nTuỳ chọn:");
  for (const name of OPTIONAL) {
    const value = values[name];
    console.log(`  ${value ? "OK     " : "-      "} ${name}${value ? `  (${value.length} ký tự)` : ""}`);
  }

  if (missing.length) {
    console.error(`\nThiếu ${missing.length} biến bắt buộc trong .env / .env.local: ${missing.join(", ")}`);
    console.error("Thêm vào file rồi chạy lại. Đừng dán giá trị vào chỗ khác.");
    process.exit(1);
  }

  if (dryRun) {
    console.log(`\nSẽ đặt ${REQUIRED.length + OPTIONAL.filter((n) => values[n]).length} secret.`);
    return;
  }

  requireAuth();
  let done = 0;
  for (const name of [...REQUIRED, ...OPTIONAL]) {
    if (!values[name]) continue;
    setSecret(repo, name, values[name]);
    done += 1;
    console.log(`  đã đặt ${name}`);
  }
  console.log(`\nXong: ${done} secret. Kiểm tra: gh secret list --repo ${repo}`);
}

main();
