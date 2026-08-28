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

async function testLiveApi() {
  console.log("1. Logging into https://tram-chu.online/api/admin/login...");
  
  const loginRes = await fetch("https://tram-chu.online/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://tram-chu.online"
    },
    body: JSON.stringify({ password: "admin" }) // will check if password matches or try password from setup
  });

  console.log("Login status:", loginRes.status);
  const cookie = loginRes.headers.get("set-cookie");
  console.log("Cookie received:", cookie ? cookie.split(";")[0] : "(none)");

  if (cookie) {
    console.log("\n2. Calling /api/admin/keys with ping...");
    const pingRes = await fetch("https://tram-chu.online/api/admin/keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": cookie.split(";")[0],
        "Origin": "https://tram-chu.online"
      },
      body: JSON.stringify({ action: "ping" })
    });
    console.log("Ping HTTP Status:", pingRes.status);
    const data = await pingRes.json();
    console.log("Healthy keys:", data.healthyKeys, "/", data.totalKeys);
    console.log("Keys detail:\n", JSON.stringify(data.keys, null, 2));
  }
}

testLiveApi().catch(console.error);
