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

async function testWithForwardedHeaders() {
  const gatewayUrl = "https://gateway.ai.cloudflare.com/v1/aa644d98f2377007f0fa98abcafe3d21/tram-chu/google-ai-studio";
  const cfToken = env.CLOUDFLARE_API_TOKEN;
  const key = env.GEMINI_API_KEY || env.GEMINI_API_KEYS.split(/[\n,;]+/)[0].trim();

  // Test with spoofed VN IP in X-Forwarded-For
  const url = `${gatewayUrl}/v1beta/models?key=${encodeURIComponent(key)}`;
  
  console.log("1. Testing normal Gateway call from local:");
  const res1 = await fetch(url, {
    headers: { "cf-aig-authorization": `Bearer ${cfToken}` }
  });
  console.log(`Status 1: ${res1.status}`);

  console.log("2. Testing Gateway with X-Forwarded-For (VN IP 113.160.0.1):");
  const res2 = await fetch(url, {
    headers: {
      "cf-aig-authorization": `Bearer ${cfToken}`,
      "x-forwarded-for": "113.160.0.1"
    }
  });
  const data2 = await res2.json().catch(() => null);
  console.log(`Status 2: ${res2.status}`, data2?.error?.message || data2);
}

testWithForwardedHeaders();
