"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { chromium } = require("playwright");

async function main() {
  const slotId = process.argv[2] || "1";
  const rawDir = process.env.GEMINI_WEB_USER_DATA_DIR || path.join(__dirname, "..", ".cache", "gemini-web-profiles");
  const userDataDir = path.isAbsolute(rawDir) ? rawDir : path.resolve(__dirname, "..", rawDir);
  const slotDir = path.join(userDataDir, `slot-${slotId}`);

  fs.mkdirSync(slotDir, { recursive: true });

  const lockFiles = ["lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"];
  for (const lf of lockFiles) {
    const p = path.join(slotDir, lf);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }

  console.log(`\n===============================================================`);
  console.log(` Dang mo Chrome (Profile Slot ${slotId})...`);
  console.log(` Thu muc profile: ${slotDir}`);
  console.log(`===============================================================\n`);

  const context = await chromium.launchPersistentContext(slotDir, {
    headless: false,
    channel: "chrome",
    viewport: null,
    permissions: ["clipboard-read", "clipboard-write"],
    ignoreDefaultArgs: ["--enable-automation", "--no-sandbox"],
    args: [
      "--disable-blink-features=AutomationControlled",
      "--start-maximized",
      "--no-default-browser-check",
      "--no-first-run"
    ]
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.bringToFront();
  await page.goto("https://gemini.google.com/app", { waitUntil: "domcontentloaded", timeout: 60000 });

  console.log("-> Cua so Chrome da mo.");
  console.log("-> Hay dang nhap tai khoan Google tren cua so do.");
  console.log("-> Khi dang nhap xong va thay avatar tai khoan,");
  console.log("   hay DONG cua so Chrome lai de luu phien dang nhap.\n");

  await new Promise((resolve) => {
    context.on("close", resolve);
    page.on("close", () => {
      if (context.pages().length === 0) resolve();
    });
  });

  console.log("\n[OK] Trinh duyet da dong. Profile da luu phien dang nhap thanh cong.");
}

main().catch((err) => {
  console.error("Loi:", err.message);
  process.exit(1);
});
