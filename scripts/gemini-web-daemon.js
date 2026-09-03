"use strict";

const { spawn } = require("child_process");
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

const { checkGeminiWebReady, closeGeminiWeb } = require("../server/gemini-web");
const { createStorage } = require("../server/storage");

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const CONTROL_KEY = "jobs/gemini-web-control.json";
const DAEMON_STATUS_KEY = "jobs/gemini-web-daemon-status.json";
const REST_DAY = String(flag("--rest-day", process.env.GEMINI_WEB_REST_DAY || "none")).toLowerCase();
const DEFAULT_SESSION_MINUTES = Math.max(15, Number(flag("--minutes", process.env.GEMINI_WEB_SESSION_MINUTES || process.env.TRANSLATE_RUN_MINUTES || 300)));
const RESTART_DELAY_MS = Math.max(5000, Number(process.env.GEMINI_WEB_RESTART_DELAY_MS || 15000));
const PREFLIGHT = !args.includes("--no-preflight");
const FORWARD_ARGS = args.filter((arg, index) => {
  const previous = args[index - 1];
  return !["--rest-day", "--minutes"].includes(arg) && !["--rest-day", "--minutes"].includes(previous) && arg !== "--no-preflight";
});

function daySlug(date = new Date()) {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()];
}

function msUntilNextDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - date.getTime());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readStorageJson(storage, key) {
  try {
    const raw = await storage.get(key);
    if (!raw) return null;
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }
}

function normalizeControl(control = {}) {
  control = control || {};
  const defaultSlots = { "1": true, "2": false, "3": false };
  const rawSlots = control.slots && typeof control.slots === "object" ? control.slots : defaultSlots;
  const bool = (value, defaultValue = true) => {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (["false", "0", "off", "no"].includes(normalized)) return false;
    if (["true", "1", "on", "yes"].includes(normalized)) return true;
    return defaultValue;
  };
  return {
    schema: 1,
    enabled: bool(control.enabled, true),
    headless: bool(control.headless, true),
    protectiveMode: bool(control.protectiveMode, true),
    lowResourceMode: bool(control.lowResourceMode, true),
    spacingMs: Math.max(3000, Number(control.spacingMs || process.env.GEMINI_WEB_SPACING_MS || 8000)),
    jitterMs: Math.max(0, Number(control.jitterMs || process.env.GEMINI_WEB_JITTER_MS || 1500)),
    sessionMinutes: Math.max(15, Number(control.sessionMinutes || DEFAULT_SESSION_MINUTES)),
    pauseUntilEpochMs: Math.max(0, Number(control.pauseUntilEpochMs || 0)),
    slots: {
      "1": bool(rawSlots["1"], true),
      "2": bool(rawSlots["2"], false),
      "3": bool(rawSlots["3"], false)
    },
    updatedAt: control.updatedAt || ""
  };
}

async function readControl(storage) {
  return normalizeControl(await readStorageJson(storage, CONTROL_KEY));
}

async function writeDaemonStatus(storage, status) {
  try {
    await storage.put(
      DAEMON_STATUS_KEY,
      JSON.stringify({
        schema: 1,
        provider: "gemini-web",
        owner: `${process.env.COMPUTERNAME || "local"}:${process.pid}`,
        updatedAt: new Date().toISOString(),
        ...status
      }),
      { cacheControl: "private, no-store" }
    );
  } catch (error) {
    console.warn(`[gemini-web-daemon] Unable to write daemon status: ${error.message}`);
  }
}

async function preflight() {
  if (!PREFLIGHT) return;
  const status = await checkGeminiWebReady();
  console.log(`[gemini-web-daemon] Gemini Web ready: ${status.url}`);
  await closeGeminiWeb();
}

function runWorker(control) {
  const maxProfiles = 3;
  const env = {
    ...process.env,
    TRANSLATION_PROVIDER: "gemini-web",
    GEMINI_WEB_HEADLESS: control.headless ? "true" : "false",
    GEMINI_WEB_PROTECTIVE_MODE: control.protectiveMode ? "true" : "false",
    GEMINI_WEB_LOW_RESOURCE_MODE: control.lowResourceMode ? "true" : "false",
    GEMINI_WEB_SPACING_MS: String(control.spacingMs),
    GEMINI_WEB_JITTER_MS: String(control.jitterMs),
    GEMINI_WEB_TIMEOUT_MS: process.env.GEMINI_WEB_TIMEOUT_MS || "60000",
    GEMINI_WEB_OPERATION_TIMEOUT_MS: process.env.GEMINI_WEB_OPERATION_TIMEOUT_MS || "75000",
    GEMINI_WEB_MAX_ATTEMPTS: process.env.GEMINI_WEB_MAX_ATTEMPTS || "3",
    GEMINI_WEB_MAX_IDLE_PROFILES: process.env.GEMINI_WEB_MAX_IDLE_PROFILES || "1",
    TRANSLATE_BATCH_SIZE: "1",
    TRANSLATE_CONCURRENCY: String(maxProfiles),
    GEMINI_TRANSLATE_CONCURRENCY: String(maxProfiles),
    GEMINI_WEB_CONCURRENCY: String(maxProfiles),
    GEMINI_WEB_MAX_PROFILES: String(maxProfiles),
    MULTI_BOOK: "true"
  };
  const workerArgs = [
    path.join("scripts", "translate-worker.js"),
    "--continuous",
    "--minutes",
    String(control.sessionMinutes),
    ...FORWARD_ARGS
  ];
  console.log(`[gemini-web-daemon] Start worker: node ${workerArgs.join(" ")}`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, workerArgs, {
      cwd: path.join(__dirname, ".."),
      env,
      stdio: "inherit"
    });
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function main() {
  const storage = createStorage();
  let failureCount = 0;
  console.log(`[gemini-web-daemon] 24/7 mode. Rest day: ${REST_DAY}. Default session: ${DEFAULT_SESSION_MINUTES} minutes.`);

  while (true) {
    const control = await readControl(storage);
    await writeDaemonStatus(storage, { state: "watching", control });

    if (!control.enabled || control.pauseUntilEpochMs > Date.now()) {
      const waitMs = control.pauseUntilEpochMs > Date.now()
        ? Math.min(30_000, Math.max(1000, control.pauseUntilEpochMs - Date.now()))
        : 30_000;
      await closeGeminiWeb();
      await writeDaemonStatus(storage, {
        state: control.enabled ? "paused_until" : "disabled",
        message: control.enabled ? "Gemini Web daemon đang tạm dừng theo lệnh dashboard." : "Gemini Web daemon đang tắt theo lệnh dashboard.",
        control
      });
      console.log(`[gemini-web-daemon] ${control.enabled ? "Paused" : "Disabled"} by dashboard. Sleep ${Math.round(waitMs / 1000)}s.`);
      await sleep(waitMs);
      continue;
    }

    if (REST_DAY !== "none" && daySlug() === REST_DAY) {
      const waitMs = msUntilNextDay();
      await closeGeminiWeb();
      await writeDaemonStatus(storage, { state: "rest_day", message: `Rest day active (${REST_DAY}).`, control });
      console.log(`[gemini-web-daemon] Rest day active (${REST_DAY}). Sleep ${Math.ceil(waitMs / 60000)} minutes.`);
      await sleep(waitMs);
      continue;
    }

    if (PREFLIGHT) {
      await writeDaemonStatus(storage, { state: "preflight", message: "Đang kiểm tra Gemini Web trước phiên dịch.", control });
      await preflight();
    }

    await writeDaemonStatus(storage, { state: "running", message: "Gemini Web worker đang chạy nền.", control });
    const result = await runWorker(control);
    const failed = result.code && result.code !== 0;
    failureCount = failed ? failureCount + 1 : 0;
    const delayMs = Math.min(10 * 60_000, RESTART_DELAY_MS * Math.max(1, failureCount));
    await writeDaemonStatus(storage, {
      state: "restarting",
      message: `Worker đã dừng; khởi động lại sau ${Math.round(delayMs / 1000)} giây.`,
      lastExitCode: result.code ?? null,
      lastExitSignal: result.signal ?? null,
      failureCount,
      control
    });
    console.log(`[gemini-web-daemon] Worker stopped: code=${result.code ?? ""} signal=${result.signal ?? ""}. Restart in ${Math.round(delayMs / 1000)}s.`);
    await sleep(delayMs);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[gemini-web-daemon] FAILED: ${error.message}`);
    process.exit(1);
  });
}
