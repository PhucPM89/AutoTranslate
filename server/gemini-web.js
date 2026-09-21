"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const DEFAULT_URL = "https://gemini.google.com/app";
const GPT_URL = "https://chatgpt.com/";
const GPT_INPUT_SELECTOR = "#prompt-textarea, div.ProseMirror[contenteditable='true'], textarea";
const GPT_SEND_SELECTOR = "button[data-testid='send-button'], button[aria-label*='Send'], button[aria-label*='Gửi']";
const GPT_RESPONSE_SELECTOR = "[data-message-author-role='assistant'] .markdown, [data-message-author-role='assistant']";
const DEFAULT_INPUT_SELECTOR = [
  "rich-textarea [contenteditable='true']",
  "div[contenteditable='true'][role='textbox']",
  "textarea",
  "[aria-label*='Enter a prompt']",
  "[aria-label*='Nhập']"
].join(", ");
const DEFAULT_SEND_SELECTOR = [
  "button[aria-label*='Send']",
  "button[aria-label*='Submit']",
  "button[aria-label*='Gửi']",
  "button:has([data-testid='send-button'])",
  "button:has-text('Submit')"
].join(", ");
const DEFAULT_RESPONSE_SELECTOR = [
  "model-response message-content",
  "model-response",
  "[data-test-id='model-response'] message-content",
  "[data-test-id='model-response']",
  ".model-response-text message-content",
  "model-response .markdown.markdown-main-panel",
  "model-response .markdown.md-content",
  "[data-test-id='model-response'] .markdown"
].join(", ");

const GEMINI_UI_LINE_RE = /^(?:gemini said|show thinking|thinking|sources|drafts|show code|hide code|copy code|copy|run|share|retry|modify response|edit in gemini|more drafts|use code with caution|content_copy|thumb_up|thumb_down|more_vert|google search|xem mã|ẩn mã|sao chép mã|sao chép|chạy|chia sẻ|thử lại|sửa trong gemini)$/iu;
const CODE_LANGUAGE_LINE_RE = /^(?:python|py|javascript|js|typescript|ts|json|html|css|bash|shell|powershell|plaintext|text|markdown|xml|yaml|yml)$/iu;
const RESPONSE_META_LINE_RE = /^(?:bản dịch tiếng việt .*?(?:sẵn sàng|hoàn chỉnh)|\[file-tag:[^\]]+\])$/iu;
const LEADING_RESPONSE_META_RE = /^(?:your text file is ready|bản dịch tiếng việt .{0,260}?(?:sẵn sàng|hoàn thành|hoàn chỉnh)[.!?。]?)\s*/iu;

let profilePool = [];
let waitQueue = [];
let nextProfileId = 1;

function defaultUserDataDir(site = "gemini") {
  return path.join(os.homedir(), ".epub-translator", `${site}-web-profiles`);
}

function getConfig(options = {}) {
  const site = options.site === "gpt" ? "gpt" : "gemini";
  const prefix = site === "gpt" ? "GPT_WEB" : "GEMINI_WEB";
  const rawDir = options.userDataDir || process.env[`${prefix}_USER_DATA_DIR`] || defaultUserDataDir(site);
  const userDataDir = path.isAbsolute(rawDir) ? rawDir : path.resolve(__dirname, "..", rawDir);
  return {
    site,
    url: options.url || process.env[`${prefix}_URL`] || (site === "gpt" ? GPT_URL : DEFAULT_URL),
    userDataDir,
    headless: String(options.headless ?? process.env[`${prefix}_HEADLESS`] ?? (site === "gpt" ? "false" : "true")) === "true",
    background: String(options.background ?? process.env[`${prefix}_BACKGROUND`] ?? (site === "gpt" ? "true" : "false")) !== "false",
    channel: options.channel || process.env[`${prefix}_BROWSER_CHANNEL`] || "chrome",
    timeoutMs: Number(options.timeoutMs || process.env[`${prefix}_TIMEOUT_MS`] || 180000),
    stableMs: Number(options.stableMs || process.env[`${prefix}_STABLE_MS`] || 4500),
    inputSelector: options.inputSelector || process.env[`${prefix}_INPUT_SELECTOR`] || (site === "gpt" ? GPT_INPUT_SELECTOR : DEFAULT_INPUT_SELECTOR),
    sendSelector: options.sendSelector || process.env[`${prefix}_SEND_SELECTOR`] || (site === "gpt" ? GPT_SEND_SELECTOR : DEFAULT_SEND_SELECTOR),
    responseSelector: options.responseSelector || process.env[`${prefix}_RESPONSE_SELECTOR`] || (site === "gpt" ? GPT_RESPONSE_SELECTOR : DEFAULT_RESPONSE_SELECTOR),
    protectiveMode: String(options.protectiveMode ?? process.env[`${prefix}_PROTECTIVE_MODE`] ?? "true") !== "false",
    lowResourceMode: String(options.lowResourceMode ?? process.env[`${prefix}_LOW_RESOURCE_MODE`] ?? "true") !== "false",
    maxProfiles: Math.max(1, Math.min(3, Number(options.maxProfiles || options.maxTabs || process.env[`${prefix}_CONCURRENCY`] || process.env[`${prefix}_MAX_PROFILES`] || process.env[`${prefix}_MAX_TABS`] || 1))),
    maxIdleProfiles: Math.max(1, Number(options.maxIdleProfiles || process.env[`${prefix}_MAX_IDLE_PROFILES`] || 1))
  };
}

async function createProfileSlot(id, config) {
  const slotDir = path.join(config.userDataDir, `slot-${id}`);
  fs.mkdirSync(slotDir, { recursive: true });

  const lockFiles = ["lockfile", "SingletonLock", "SingletonSocket", "SingletonCookie"];
  for (const lf of lockFiles) {
    const p = path.join(slotDir, lf);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }

  const { chromium } = require("playwright");
  const launchOptions = {
    headless: config.headless,
    viewport: { width: 960, height: 600 },
    permissions: ["clipboard-read", "clipboard-write"],
    ignoreDefaultArgs: ["--enable-automation", "--no-sandbox"],
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-breakpad",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-sync",
      "--disable-translate",
      "--mute-audio",
      "--no-default-browser-check",
      "--no-first-run",
      `--renderer-process-limit=${config.lowResourceMode ? 1 : 2}`,
      `--js-flags=--max-old-space-size=${config.lowResourceMode ? 160 : 256}`
    ]
  };
  if (config.lowResourceMode) {
    launchOptions.args.push(
      "--disable-gpu-compositing",
      "--disable-renderer-backgrounding",
      "--disable-features=CalculateNativeWinOcclusion,BackForwardCache,MediaRouter,OptimizationHints"
    );
  }
  if (!config.headless && config.background) {
    launchOptions.args.push(
      "--start-minimized",
      "--window-position=-32000,-32000",
      "--window-size=960,600"
    );
  }
  if (config.channel) launchOptions.channel = config.channel;

  const context = await chromium.launchPersistentContext(slotDir, launchOptions);
  const page = context.pages()[0] || (await context.newPage());
  if (!config.headless && config.background) hideWindowsBrowser(slotDir);

  // Block images, fonts, media, and trackers to drastically save RAM, CPU & disk I/O in headless mode
  if (config.headless) {
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      const url = route.request().url();
      if (
        type === "image" ||
        type === "media" ||
        type === "font" ||
        url.includes("google-analytics") ||
        url.includes("play.google.com/log") ||
        url.includes("fonts.googleapis.com") ||
        url.includes("fonts.gstatic.com")
      ) {
        return route.abort();
      }
      return route.continue();
    });
  }

  return {
    id,
    userDataDir: slotDir,
    context,
    page,
    inUse: true,
    lastUsed: Date.now()
  };
}

function hideWindowsBrowser(profileDir) {
  if (process.platform !== "win32") return;
  const script = path.join(__dirname, "..", "scripts", "hide-browser-window.ps1");
  execFile("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", script,
    "-ProfileDir", profileDir
  ], { windowsHide: true }, () => {});
}

async function acquireProfile(config, preferredId = null) {
  profilePool = profilePool.filter((slot) => {
    try {
      return slot.context && !slot.page.isClosed();
    } catch {
      return false;
    }
  });

  const wantedId = Number(preferredId || 0);
  if (wantedId > 0) {
    const existing = profilePool.find((slot) => slot.id === wantedId && !slot.page.isClosed());
    if (existing) {
      if (!existing.inUse) {
        existing.inUse = true;
        return existing;
      }
      return new Promise((resolve) => {
        waitQueue.push({ preferredId: wantedId, resolve });
      });
    }
    if (wantedId <= config.maxProfiles) {
      const slot = await createProfileSlot(wantedId, config);
      profilePool.push(slot);
      nextProfileId = Math.max(nextProfileId, wantedId + 1);
      return slot;
    }
  }

  const idleSlot = profilePool.find((slot) => !slot.inUse && !slot.page.isClosed());
  if (idleSlot) {
    idleSlot.inUse = true;
    return idleSlot;
  }

  if (profilePool.length < config.maxProfiles) {
    const slot = await createProfileSlot(nextProfileId++, config);
    profilePool.push(slot);
    return slot;
  }

  return new Promise((resolve) => {
    waitQueue.push({ preferredId: 0, resolve });
  });
}

function releaseProfile(slot) {
  if (!slot) return;
  if (slot.page.isClosed()) {
    profilePool = profilePool.filter((s) => s !== slot);
  } else {
    slot.inUse = false;
    slot.lastUsed = Date.now();
  }
  trimIdleProfiles();

  while (waitQueue.length > 0) {
    const next = waitQueue.shift();
    const available = profilePool.find((s) =>
      !s.inUse &&
      !s.page.isClosed() &&
      (!next.preferredId || s.id === next.preferredId)
    );
    if (available) {
      available.inUse = true;
      next.resolve(available);
      return;
    }
    waitQueue.push(next);
    break;
  }
}

async function resetGeminiWebProfile(profileId) {
  const id = Number(profileId || 0);
  if (!id) return false;
  const slot = profilePool.find((item) => item.id === id);
  if (!slot) return false;
  profilePool = profilePool.filter((item) => item !== slot);
  try {
    await slot.context?.close().catch(() => {});
  } catch {}
  slot.inUse = false;
  return true;
}

function withOperationTimeout(work, timeoutMs, onTimeout, serviceName = "AI Web") {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return work();
  let timer = null;
  return new Promise((resolve, reject) => {
    let settled = false;
    timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      try {
        Promise.resolve(onTimeout?.()).catch(() => {});
      } catch {}
      const error = new Error(`${serviceName} quá thời gian xử lý; đã reset Chrome profile của slot này.`);
      error.code = "gemini_web_operation_timeout";
      error.status = 504;
      reject(error);
    }, timeoutMs);
    work().then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function trimIdleProfiles() {
  const config = getConfig();
  const idle = profilePool
    .filter((slot) => !slot.inUse && !slot.page.isClosed())
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  const keep = new Set(idle.slice(0, config.maxIdleProfiles).map((slot) => slot.id));
  for (const slot of idle) {
    if (keep.has(slot.id)) continue;
    profilePool = profilePool.filter((s) => s !== slot);
    slot.context?.close().catch(() => {});
  }
}

async function translateWithGeminiWeb(prompt, options = {}) {
  const isGpt = options.site === "gpt";
  const mockResponse = isGpt ? process.env.GPT_WEB_MOCK_RESPONSE : process.env.GEMINI_WEB_MOCK_RESPONSE;
  if (mockResponse) {
    return {
      text: mockResponse,
      model: isGpt ? "gpt-web-mock" : "gemini-web-mock",
      provider: isGpt ? "gpt-web" : "gemini-web",
      usage: null
    };
  }

  const config = getConfig(options);
  const slot = await acquireProfile(config, options.profileSlotId || options.slotId);

  try {
    const operationTimeoutMs = Number(options.operationTimeoutMs || process.env[`${isGpt ? "GPT_WEB" : "GEMINI_WEB"}_OPERATION_TIMEOUT_MS`] || Math.max(config.timeoutMs + 30000, 120000));
    return await withOperationTimeout(async () => {
      const page = slot.page;
      if (options.newConversation || !page.url().startsWith(new URL(config.url).origin)) {
        await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
      }
      if (options.newConversation) {
        const newChat = page.locator("a[aria-label*='New chat'], button[aria-label*='New chat'], a[aria-label*='Cuộc trò chuyện mới'], button[aria-label*='Cuộc trò chuyện mới']").first();
        if (await newChat.isVisible().catch(() => false)) {
          await newChat.click().catch(() => {});
          await page.waitForTimeout(500);
        }
      }
      if (!isGpt && options.selectModel !== false) {
        await selectGeminiModel(page, options.modelLabel || process.env.GEMINI_WEB_MODEL || "3.1 Pro");
      }
      const gotIt = page.locator("button:has-text('Got it'), button:has-text('Đã hiểu')").last();
      if (await gotIt.isVisible().catch(() => false)) await gotIt.click().catch(() => {});
      await assertNotBlocked(page, config, { includeSignin: options.requireSignin === true });
      await waitForComposer(page, config);

      const beforeTexts = await extractResponseTexts(page, config.responseSelector);
      const beforeCount = beforeTexts.length;
      await fillComposer(page, config.inputSelector, prompt);
      await page.waitForTimeout(800);
      await submitPrompt(page, config.sendSelector);

      const text = await waitForFreshResponse(page, {
        ...config,
        beforeCount,
        beforeTexts,
        prompt
      });

      return {
        text: options.direct ? text : cleanGeminiWebText(text),
        model: isGpt ? (process.env.GPT_WEB_MODEL_LABEL || "gpt-web") : (process.env.GEMINI_WEB_MODEL_LABEL || "gemini-web"),
        provider: isGpt ? "gpt-web" : "gemini-web",
        profileId: slot.id,
        usage: null
      };
    }, operationTimeoutMs, () => resetGeminiWebProfile(slot.id), isGpt ? "ChatGPT Web" : "Gemini Web");
  } finally {
    releaseProfile(slot);
  }
}

async function selectGeminiModel(page, wantedLabel) {
  const wanted = String(wantedLabel || "").trim();
  if (!wanted) return;
  const modelButton = page.locator("button").filter({ hasText: /(?:Flash-Lite|Flash|Pro)/ }).last();
  if (!await modelButton.isVisible().catch(() => false)) return;
  const current = (await modelButton.innerText().catch(() => "")).trim();
  if (current.includes(wanted)) return;
  await modelButton.click({ timeout: 10000 });
  const option = page.getByText(wanted, { exact: true }).last();
  await option.waitFor({ state: "visible", timeout: 10000 });
  await option.click({ timeout: 10000 });
  await page.waitForTimeout(400);
}

function translateWithGptWeb(prompt, options = {}) {
  return translateWithGeminiWeb(prompt, { ...options, site: "gpt" });
}

function checkGptWebReady(options = {}) {
  return checkGeminiWebReady({ ...options, site: "gpt" });
}

async function checkGeminiWebReady(options = {}) {
  const config = getConfig(options);
  const slot = await acquireProfile(config);
  try {
    const page = slot.page;
    await page.goto(config.url, { waitUntil: "domcontentloaded", timeout: config.timeoutMs });
    await assertNotBlocked(page, config, { includeSignin: options.requireSignin === true });
    await waitForComposer(page, config);
    return {
      ready: true,
      url: page.url(),
      userDataDir: slot.userDataDir,
      headless: config.headless,
      maxProfiles: config.maxProfiles,
      profileId: slot.id
    };
  } finally {
    releaseProfile(slot);
  }
}

async function waitForComposer(page, config) {
  try {
    const dismissBtns = page.locator("button:has-text('Tôi đồng ý'), button:has-text('Đồng ý'), button:has-text('Tiếp tục'), button:has-text('Bắt đầu'), button:has-text('I agree'), button:has-text('Accept all'), button:has-text('Got it'), button:has-text('Get started'), button:has-text('Continue')");
    const count = await dismissBtns.count();
    for (let i = 0; i < count; i++) {
      const btn = dismissBtns.nth(i);
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
      }
    }
  } catch {}

  try {
    await findVisibleLocator(page, config.inputSelector, config.timeoutMs);
  } catch (error) {
    await assertNotBlocked(page, config, { includeSignin: true });
    throw new Error(
      "Gemini Web chưa sẵn sàng. Nếu cần đăng nhập/kiểm tra thủ công, tạm đặt GEMINI_WEB_HEADLESS=false rồi chạy lại."
    );
  }
}

async function fillComposer(page, selector, prompt) {
  const input = await findVisibleLocator(page, selector, 30000);
  try {
    await input.fill(prompt, { timeout: 30000 });
  } catch {
    await input.focus({ timeout: 10000 });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(() => {});
    await page.keyboard.press("Backspace").catch(() => {});
    await page.evaluate(
      async (text) => {
        await navigator.clipboard.writeText(text);
      },
      prompt
    );
    await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
  }
}

async function findVisibleLocator(page, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const candidates = page.locator(selector);
    const count = await candidates.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = candidates.nth(index);
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Không tìm thấy ô nhập đang hiển thị sau ${timeoutMs}ms.`);
}

async function submitPrompt(page, selector) {
  const button = page.locator(selector).last();
  try {
    await button.waitFor({ state: "visible", timeout: 15000 });
    await button.waitFor({ state: "attached", timeout: 15000 });
    const deadline = Date.now() + 15000;
    while (await button.isDisabled().catch(() => false)) {
      if (Date.now() >= deadline) throw new Error("Nút gửi vẫn bị vô hiệu hóa.");
      await page.waitForTimeout(250);
    }
    await button.click({ timeout: 15000 });
  } catch {
    await page.keyboard.press("Control+Enter").catch(async () => {
      await page.keyboard.press("Enter");
    });
  }
}

async function countResponses(page, selector) {
  return page.locator(selector).count().catch(() => 0);
}

async function waitForFreshResponse(page, { responseSelector, beforeCount, beforeTexts = [], timeoutMs, stableMs, prompt, site }) {
  const deadline = Date.now() + timeoutMs;
  const requiredStableMs = site === "gpt" ? stableMs : Math.max(8000, stableMs);
  let lastText = "";
  let lastChange = Date.now();

  while (Date.now() < deadline) {
    await assertNotBlocked(page, { protectiveMode: true, site });
    const texts = await extractResponseTexts(page, responseSelector);
    const freshTexts = texts.slice(Math.max(0, beforeCount));
    const previousLast = beforeTexts.at(-1) || "";
    // Gemini may reuse the existing response shell while streaming instead of
    // appending another model-response node. Count-only detection then waits
    // forever even though a new answer is already visible.
    const changedLast = texts.at(-1) && texts.at(-1) !== previousLast ? [texts.at(-1)] : [];
    const candidates = freshTexts.length ? freshTexts : changedLast;
    const current = chooseBestResponse(candidates, prompt);

    if (current && current !== lastText) {
      lastText = current;
      lastChange = Date.now();
    }

    const stillGenerating = await page.locator("button[data-testid='stop-button'], button[aria-label*='Stop'], button[aria-label*='Dừng'], button[aria-label*='Cancel'], button[aria-label*='Hủy']").evaluateAll((nodes) =>
      nodes.some((node) => {
        const style = window.getComputedStyle(node);
        return style.visibility !== "hidden" && style.display !== "none";
      })
    ).catch(() => false);

    if (lastText && !stillGenerating && Date.now() - lastChange >= requiredStableMs) {
      return lastText;
    }
    await page.waitForTimeout(800);
  }

  const diagnostic = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    body: (document.body?.innerText || "").slice(-800),
    responseNodes: [...document.querySelectorAll("body *")]
      .filter((node) => node.children.length === 0 && /Gemini said|\{\"ok\":true\}/i.test(node.textContent || ""))
      .slice(-8)
      .map((node) => [node.tagName, node.className, node.parentElement?.tagName, node.parentElement?.className])
  })).catch(() => ({}));
  throw new Error(`${site === "gpt" ? "ChatGPT Web" : "Gemini Web"} quá thời gian chờ bản dịch hoàn tất. ` +
    `Trang: ${diagnostic.url || "unknown"}; nodes: ${JSON.stringify(diagnostic.responseNodes || [])}; nội dung cuối: ${String(diagnostic.body || diagnostic.title || "").replace(/\s+/g, " ").slice(0, 800)}`);
}

async function assertNotBlocked(page, config = {}, options = {}) {
  if (config.protectiveMode === false) return;
  const blocker = await detectBlockingState(page, options).catch(() => null);
  if (!blocker) return;
  const error = new Error(blocker.message);
  error.code = "gemini_web_blocked";
  error.status = blocker.status || 429;
  error.cooldownMs = blocker.cooldownMs || 15 * 60_000;
  throw error;
}

async function detectBlockingState(page, options = {}) {
  const service = options.site === "gpt" ? "ChatGPT Web" : "Gemini Web";
  const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  const alertText = await page.locator('[role="alert"], [aria-live="assertive"], [data-testid*="error"], [class*="toast"], [class*="error-banner"]')
    .evaluateAll((nodes) => nodes.filter((node) => {
      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    }).map((node) => node.textContent || "").join("\n")).catch(() => "");
  const lowerBody = bodyText.toLowerCase();
  const lowerAlert = alertText.toLowerCase();
  const patterns = [
    { pattern: "unusual traffic", scope: lowerBody, message: `${service} báo lưu lượng bất thường`, status: 429 },
    { pattern: "captcha", scope: lowerBody, message: `${service} yêu cầu captcha/xác minh`, status: 403 },
    { pattern: "verify you are human", scope: lowerBody, message: `${service} yêu cầu xác minh người dùng`, status: 403 },
    { pattern: "too many requests", scope: lowerAlert, message: `${service} đang giới hạn lượt gửi`, status: 429 },
    { pattern: "try again later", scope: lowerAlert, message: `${service} yêu cầu thử lại sau`, status: 429 },
    { pattern: "quá nhiều yêu cầu", scope: lowerAlert, message: `${service} đang giới hạn lượt gửi`, status: 429 },
    { pattern: "thử lại sau", scope: lowerAlert, message: `${service} yêu cầu thử lại sau`, status: 429 }
  ];
  for (const item of patterns) {
    if (item.scope.includes(item.pattern)) return { message: `${item.message}; bằng chứng UI: ${alertText.trim().slice(0, 240) || item.pattern}.`, status: item.status, cooldownMs: 15 * 60_000 };
  }
  if (options.includeSignin && (lowerBody.includes("sign in") || lowerBody.includes("đăng nhập"))) {
    return {
      message: `${service} đang yêu cầu đăng nhập trước khi dịch tiếp.`,
      status: 403,
      cooldownMs: 30 * 60_000
    };
  }
  return null;
}

async function extractResponseTexts(page, selector) {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const clone = node.cloneNode(true);
        // Remove known Gemini UI chrome elements that pollute innerText
        const uiSelectors = [
          "button",                            // all buttons (Copy, Show code, Share, etc.)
          "[role='button']",
          ".code-block-decoration",            // code block headers
          ".code-block-actions",               // code block action bars
          "[class*='action']",                 // action containers
          "[class*='toolbar']",                // toolbars
          "[class*='header'][class*='code']",  // code headers
          "model-thoughts",                    // thinking section
          "[class*='thinking']",               // thinking containers
          "[class*='source']",                 // source citations
          "[class*='draft']",                  // draft tabs
          "[class*='footer']",                 // response footers
          ".response-actions",                 // response action bars
        ];
        for (const sel of uiSelectors) {
          try {
            clone.querySelectorAll(sel).forEach((el) => el.remove());
          } catch {}
        }
        // Detached clones have no rendered innerText layout. Preserve the DOM's
        // paragraph boundaries explicitly before reading their textContent.
        clone.querySelectorAll("br").forEach(el => el.replaceWith("\n"));
        clone.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, pre").forEach(el => el.append("\n\n"));
        return (clone.innerText || clone.textContent || "").trim();
      })
      .filter(Boolean)
  ).catch(() => [])
    .then((texts) => texts.map(stripGeminiUiText).filter((text) => text.length > 0));
}

function chooseBestResponse(texts, prompt) {
  const promptHead = String(prompt || "").slice(0, 120);
  return texts
    .map(stripGeminiUiText)
    .filter((text) => text.length > 20 && (!promptHead || !text.includes(promptHead)))
    .sort((a, b) => b.length - a.length)[0] || "";
}

function stripGeminiUiText(text) {
  const withoutFences = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*Gemini said\s*:?\s*/i, "")
    .replace(/```[a-z0-9_-]*\s*/gi, "")
    .replace(/```/g, "")
    .replace(/\[file-tag:[^\]]+\]\s*/giu, "")
    .replace(/^\s*(?:Show thinking|Thinking|Sources|Drafts)\s*$/gim, "")
    .replace(/^\s*(?:Show code|Hide code|Copy code|Use code|Use code with caution|Copy|Run|Share)\s*$/gim, "")
    .replace(/^\s*(?:Edit in Gemini|More drafts|Retry|Modify response)\s*$/gim, "")
    .replace(/^\s*(?:Xem mã|Ẩn mã|Sao chép mã|Chạy|Chia sẻ|Sao chép|Thử lại|Sửa trong Gemini)\s*$/gim, "")
    .replace(/^\s*(?:content_copy|thumb_up|thumb_down|more_vert)\s*$/gim, "");

  return withoutFences
    .split("\n")
    .map((line) => line.replace(LEADING_RESPONSE_META_RE, ""))
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (GEMINI_UI_LINE_RE.test(trimmed)) return false;
      if (CODE_LANGUAGE_LINE_RE.test(trimmed)) return false;
      if (RESPONSE_META_LINE_RE.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/^\s*(bản dịch|dịch)\s*:\s*/i, "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanGeminiWebText(text) {
  return stripGeminiUiText(text);
}

function detectGeminiUiGarbage(text) {
  const value = String(text || "");
  if (/```/.test(value)) return "code fence";
  const fileTag = value.match(/\[file-tag:[^\]]+\]/iu);
  if (fileTag) return fileTag[0];
  const leadingMeta = value.match(LEADING_RESPONSE_META_RE);
  if (leadingMeta) return leadingMeta[0].trim();
  if (/^\s*Gemini said\s*:?/im.test(value)) return "Gemini said";
  const badLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => GEMINI_UI_LINE_RE.test(line) || CODE_LANGUAGE_LINE_RE.test(line) || RESPONSE_META_LINE_RE.test(line));
  return badLine || "";
}

async function closeGeminiWeb() {
  const closing = profilePool.map(async (slot) => {
    try {
      if (slot.context) await slot.context.close().catch(() => {});
    } catch {}
  });
  await Promise.all(closing);
  profilePool = [];
  waitQueue = [];
}

module.exports = {
  translateWithGeminiWeb,
  translateWithGptWeb,
  checkGeminiWebReady,
  checkGptWebReady,
  closeGeminiWeb,
  resetGeminiWebProfile,
  cleanGeminiWebText,
  stripGeminiUiText,
  detectGeminiUiGarbage,
  getConfig,
  detectBlockingState,
  acquireProfile,
  releaseProfile
};
