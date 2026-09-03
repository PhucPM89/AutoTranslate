"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

async function testFetch(url) {
  console.log("Fetching:", url);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    console.log("Status:", res.status);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const text = new TextDecoder("utf-8").decode(buf);
      console.log("Text length:", text.length);
      console.log("Snippet:\n", text.slice(0, 500));
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

async function main() {
  await testFetch("https://www.uukanshu.cc/book/mayishensuanzi/93.html");
}

main().catch(console.error);
