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

const gatewayBase = "https://gateway.ai.cloudflare.com/v1/aa644d98f2377007f0fa98abcafe3d21/tram-chu/google-ai-studio";

async function testGateway() {
  const keysStr = env.GEMINI_API_KEYS || env.GEMINI_API_KEY || "";
  const keyList = keysStr.split(/[\n,;]+/).map(k => k.trim()).filter(Boolean);
  const testKey = keyList[0];

  console.log(`Using key: ${testKey?.slice(0, 12)}...`);
  console.log(`Token: ${env.CLOUDFLARE_API_TOKEN?.slice(0, 8)}...`);

  try {
    const probeUrl = `${gatewayBase}/v1beta/models?key=${encodeURIComponent(testKey)}`;
    const res = await fetch(probeUrl, {
      headers: {
        "cf-aig-authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`
      },
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json().catch(() => null);
    console.log(`HTTP Status: ${res.status}`);
    if (res.ok) {
      console.log("SUCCESS! Authenticated Gateway reached Google Gemini!");
      console.log(`Available models count: ${data?.models?.length || 0}`);
    } else {
      console.log("Error payload:", JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testGateway();
