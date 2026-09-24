#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const { getConfig, acquireProfile, closeGeminiWeb } = require("../server/gemini-web");

async function main() {
  const slotId = Math.max(1, Number(process.argv[2] || 1));
  const config = getConfig({ site: "gpt", headless: false, background: false, maxProfiles: Math.max(1, slotId) });
  const slot = await acquireProfile(config, slotId);
  await slot.page.goto(config.url, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
  console.log(`[gpt-web-login] Chrome đã mở ${slot.page.url()}`);
  console.log("[gpt-web-login] Hãy đăng nhập ChatGPT trong cửa sổ Chrome, mở đúng Project dịch truyện nếu muốn dùng Project Instructions.");
  console.log("[gpt-web-login] Khi thấy ô nhập tin nhắn, quay lại cửa sổ này và nhấn Enter để lưu profile.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => rl.question("Nhấn Enter sau khi đăng nhập xong... ", resolve));
  rl.close();
  await closeGeminiWeb();
  console.log("[gpt-web-login] Đã lưu profile ChatGPT.");
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(() => closeGeminiWeb());
