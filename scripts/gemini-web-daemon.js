"use strict";

// Foreground supervisor for the selected local web reviewer.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

for (const name of [".env", ".env.local"]) {
  const file = path.join(__dirname, "..", name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

const { checkGptWebReady, checkGeminiWebReady, closeGeminiWeb } = require("../server/gemini-web");
const args = process.argv.slice(2);
const WEB_PROVIDER = String(process.env.WEB_REVIEW_PROVIDER || "gemini").toLowerCase() === "gpt" ? "gpt" : "gemini";
const WEB_LABEL = WEB_PROVIDER === "gpt" ? "ChatGPT Web" : "Gemini Web";
const ENV_PREFIX = WEB_PROVIDER === "gpt" ? "GPT_WEB" : "GEMINI_WEB";
const flag = (name, fallback = "") => { const index = args.indexOf(name); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const REST_DAY = String(flag("--rest-day", process.env[`${ENV_PREFIX}_REST_DAY`] || "none")).toLowerCase();
const RESTART_DELAY_MS = Math.max(5000, Number(process.env[`${ENV_PREFIX}_RESTART_DELAY_MS`] || 15000));
const PREFLIGHT = !args.includes("--no-preflight");
let child = null;

function daySlug(date = new Date()) { return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()]; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function msUntilNextDay(date = new Date()) { const next = new Date(date); next.setHours(24, 0, 0, 0); return Math.max(1000, next - date); }

async function preflight() {
  if (!PREFLIGHT) return;
  const checkReady = WEB_PROVIDER === "gpt" ? checkGptWebReady : checkGeminiWebReady;
  const status = await checkReady({ profileSlotId: 1, requireSignin: WEB_PROVIDER === "gemini" });
  console.log(`[web-review-daemon] ${WEB_LABEL} ready: ${status.url}`);
  await closeGeminiWeb();
}

function runWebTranslator() {
  const workerArgs = [
    path.join("scripts", "translate-worker.js"),
    "--continuous",
    "--minutes",
    process.env[`${ENV_PREFIX}_SESSION_MINUTES`] || "300",
    "--budget",
    process.env[`${ENV_PREFIX}_TRANSLATE_BUDGET`] || "10000",
    "--batch-size",
    "1"
  ];
  console.log(`[web-review-daemon] Start ${WEB_LABEL} translator: node ${workerArgs.join(" ")}`);
  return new Promise((resolve) => {
    child = spawn(process.execPath, workerArgs, {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        TRANSLATION_PROVIDER: WEB_PROVIDER === "gemini" ? "gemini-web" : "gpt-web",
        MULTI_BOOK: "false",
        GEMINI_WEB_CONCURRENCY: "1",
        GEMINI_WEB_MAX_PROFILES: "1"
      },
      stdio: "inherit"
    });
    child.on("exit", (code, signal) => { child = null; resolve({ code, signal }); });
  });
}

async function main() {
  let failures = 0;
  console.log(`[web-review-daemon] ${WEB_LABEL} chỉ chạy foreground từ file BAT; không có autostart hoặc dashboard control.`);
  await preflight();
  while (true) {
    if (REST_DAY !== "none" && daySlug() === REST_DAY) {
      const waitMs = msUntilNextDay();
      console.log(`[web-review-daemon] Ngày nghỉ ${REST_DAY}; chờ ${Math.ceil(waitMs / 60000)} phút.`);
      await sleep(waitMs);
      continue;
    }
    const result = await runWebTranslator();
    failures = result.code && result.code !== 0 ? failures + 1 : 0;
    const delay = Math.min(10 * 60_000, RESTART_DELAY_MS * Math.max(1, failures));
    console.log(`[web-review-daemon] ${WEB_LABEL} reviewer dừng: code=${result.code ?? ""} signal=${result.signal ?? ""}; thử lại sau ${Math.round(delay / 1000)} giây.`);
    await sleep(delay);
  }
}

async function shutdown() {
  if (child && !child.killed) child.kill("SIGTERM");
  await closeGeminiWeb().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (require.main === module) main().catch((error) => { console.error(`[web-review-daemon] FAILED: ${error.stack || error.message}`); process.exit(1); });

module.exports = { main };
