"use strict";

const fs = require("fs");
const path = require("path");

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

const ROOT = path.join(__dirname, "..");
const env = {
  ...parseEnvFile(path.join(ROOT, ".env")),
  ...parseEnvFile(path.join(ROOT, ".env.local")),
  ...process.env
};

const { createArchiveStorage } = require("../server/storage/index");

async function checkKeys() {
  const driver = createArchiveStorage(env);
  console.log("Reading config/api-keys.json from R2...");
  const raw = await driver.get("config/api-keys.json");
  if (!raw) {
    console.log("No config/api-keys.json found in R2");
    return;
  }
  const keys = JSON.parse(raw.toString("utf8"));
  console.log(`Found ${keys.length} keys in R2:`);

  const gatewayUrl = "https://gateway.ai.cloudflare.com/v1/aa644d98f2377007f0fa98abcafe3d21/tram-chu/google-ai-studio";
  const cfToken = env.CLOUDFLARE_API_TOKEN;

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const masked = k.slice(0, 10) + "..." + k.slice(-6);
    console.log(`\nTesting Key #${i + 1} (${masked}):`);

    // 1. Test via Gateway
    const url = `${gatewayUrl}/v1beta/models?key=${encodeURIComponent(k)}`;
    try {
      const resp = await fetch(url, {
        headers: { "cf-aig-authorization": `Bearer ${cfToken}` },
        signal: AbortSignal.timeout(10000)
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok) {
        console.log(`  🟢 Gateway: SUCCESS (200 OK, models: ${data?.models?.length || 0})`);
      } else {
        console.log(`  🔴 Gateway Error (${resp.status}):`, data?.error?.message || data);
      }
    } catch (err) {
      console.log(`  🔴 Fetch exception:`, err.message);
    }
  }
}

checkKeys().catch(console.error);
