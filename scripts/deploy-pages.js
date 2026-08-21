"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function loadEnv(file) {
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

const ROOT = path.join(__dirname, "..");
const env = { ...process.env, ...loadEnv(path.join(ROOT, ".env")), ...loadEnv(path.join(ROOT, ".env.local")) };

// First, build production assets
console.log("=== Building production bundle ===");
execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-client.js")], {
  cwd: ROOT,
  env,
  stdio: "inherit"
});

// Second, deploy to Cloudflare Pages
console.log("\n=== Deploying to Cloudflare Pages (tram-chu-web) ===");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(npx, ["wrangler", "pages", "deploy", "public", "--project-name", "tram-chu-web", "--branch", "main"], {
  cwd: ROOT,
  env,
  shell: true,
  stdio: "inherit"
});
