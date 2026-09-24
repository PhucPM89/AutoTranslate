#!/usr/bin/env node
"use strict";

// Local-only reviewer. The cloud/API translation worker remains independent.
const fs = require("node:fs");
const path = require("node:path");
for (const name of [".env", ".env.local"]) {
  const file = path.join(process.cwd(), name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

const { createStorage, LAYOUT } = require("../server/storage");
const { contentFingerprint } = require("../server/semantic-review");
const { evaluateTranslationQuality } = require("../server/translation-quality");
const { reviewTranslationWithGeminiWeb } = require("../server/web-translation-review");
const { translateWithGptWeb, translateWithGeminiWeb, closeGeminiWeb } = require("../server/gemini-web");
const { buildRewritePrompt, buildSelfAuditPrompt, parseFullTranslation, getBookTranslationProfile, validateProfileTerms, segmentSource } = require("../server/gpt-web-rewrite");
const { createSeedRegistry, applyCuratedTerms, selectTermsForChapter, selectPendingTermsForChapter, extractTermCandidates, buildTermPlanPrompt, parseTermPlan, mergeConfirmedTerms } = require("../server/chapter-glossary");
const { EntityMemory, TerminologyMemory } = require("../server/post-edit-memory");
const { postEditChapter } = require("../server/neural-post-editor");

const storage = createStorage();
const args = process.argv.slice(2);
const WEB_PROVIDER = String(process.env.WEB_REVIEW_PROVIDER || "gemini").toLowerCase() === "gpt" ? "gpt" : "gemini";
const translateWeb = WEB_PROVIDER === "gpt" ? translateWithGptWeb : translateWithGeminiWeb;
const WEB_LABEL = WEB_PROVIDER === "gpt" ? "ChatGPT Web" : "Gemini Web";
const ENV_PREFIX = WEB_PROVIDER === "gpt" ? "GPT_WEB" : "GEMINI_WEB";
const value = (name, fallback = "") => { const index = args.indexOf(name); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const BOOK_ID = value("--book", process.env[`${ENV_PREFIX}_REVIEW_BOOK`] || process.env.GPT_WEB_REVIEW_BOOK || "fanqie-7027679289931729920");
const MAX_CHAPTERS = Math.max(1, Math.min(20, Number(value("--max-chapters", process.env[`${ENV_PREFIX}_REVIEW_BATCH_SIZE`] || 5))));
const CONTINUOUS = args.includes("--continuous");
const DRY_RUN = args.includes("--dry-run");
const IDLE_MS = Math.max(5000, Number(process.env[`${ENV_PREFIX}_REVIEW_IDLE_MS`] || 30000));
const RESCAN_MS = Math.max(60_000, Number(process.env[`${ENV_PREFIX}_REVIEW_RESCAN_MS`] || 6 * 60 * 60_000));
const START_CHAPTER = Math.max(1, Number(process.env[`${ENV_PREFIX}_REVIEW_START_CHAPTER`] || 575));
const START_OVERRIDE = Number(value("--start-chapter", "")) || 0;
const REVIEW_VERSION = `${WEB_PROVIDER}-web-postedit-v5`;
const MAX_REVIEW_ROUNDS = Math.max(2, Math.min(12, Number(process.env[`${ENV_PREFIX}_REVIEW_MAX_ROUNDS`] || 8)));
const LOCAL_REVIEW_STATE_DIR = path.join(process.cwd(), ".cache", `${WEB_PROVIDER}-web-review-state`);
const RATE_STATE_PATH = path.join(LOCAL_REVIEW_STATE_DIR, "rate-state.json");
const MIN_REQUEST_INTERVAL_MS = Math.max(5000, Number(process.env[`${ENV_PREFIX}_MIN_REQUEST_INTERVAL_MS`] || (WEB_PROVIDER === "gpt" ? 120000 : 8000)));
const RATE_LIMIT_COOLDOWN_MS = Math.max(30000, Number(process.env[`${ENV_PREFIX}_RATE_LIMIT_BACKOFF_MS`] || (WEB_PROVIDER === "gpt" ? 900000 : 60000)));
const CHECKPOINT_KEY = `jobs/${BOOK_ID}/${WEB_PROVIDER}-web-review-checkpoint.json`;
const LEGACY_CHECKPOINT_KEY = `jobs/${BOOK_ID}/web-review-checkpoint.json`;
const STATUS_KEY = `jobs/${BOOK_ID}/${WEB_PROVIDER}-web-review-status.json`;
const VERIFICATION_ONLY_FEEDBACK = "Đây là vòng XÁC MINH sau khi đã áp bản vá. Chỉ báo lỗi sai nghĩa/thiếu ý/thêm ý/sai chủ thể/phủ định/số lượng hoặc lỗi hình thức chắc chắn còn tồn tại. Không đổi văn phong, từ đồng nghĩa, cách xưng hô hay thuật ngữ chỉ vì có một phương án khác. Nếu không còn lỗi vật chất, bắt buộc trả decision=pass.";
const SEMANTIC_AUDIT_FEEDBACK = "Đây là lượt KIỂM CHỨNG NGỮ NGHĨA CUỐI, độc lập với các vòng trước. Bỏ qua độ văn hoa. Hãy rà tuần tự mọi 我/你/他/她/它, cụm chỉ vị trí như 身边, mọi phủ định, con số/đơn vị/cấp bậc, câu bị thiếu/thêm và tất cả lần lặp của cùng tên kỹ năng/vật phẩm. Chỉ patch lỗi chắc chắn. Không tạo tên thuật ngữ mới. Chỉ PASS sau khi đã thực hiện đủ checklist này.";
const LOCKED_TERMS = [
  { source: "物品栏扩展石", target: "Đá Mở Rộng Túi Đồ" },
  { source: "物品栏", target: "Túi đồ" }
];

async function readRaw(key) { return storage.get(key); }
async function readJson(key) { const raw = await readRaw(key); return raw ? JSON.parse(raw.toString("utf8")) : null; }
async function putJson(key, value, options = {}) { return storage.put(key, JSON.stringify(value), { cacheControl: key.startsWith("jobs/") ? "private, no-store" : undefined, ...options }); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function loggedWait(ms, label) {
  let remaining = ms;
  while (remaining > 0) {
    if (remaining >= 60000) {
      console.log(`  [${label}] Còn khoảng ${Math.ceil(remaining / 60000)} phút; checkpoint và production vẫn an toàn.`);
      const step = Math.min(60000, remaining);
      await sleep(step);
      remaining -= step;
    } else {
      console.log(`  [${label}] Chờ ${Math.ceil(remaining / 1000)}s; checkpoint và production vẫn an toàn.`);
      const step = Math.min(5000, remaining);
      await sleep(step);
      remaining -= step;
    }
  }
}
function readRateState() {
  try { return JSON.parse(fs.readFileSync(RATE_STATE_PATH, "utf8")); } catch { return {}; }
}
function writeRateState(patch) {
  fs.mkdirSync(LOCAL_REVIEW_STATE_DIR, { recursive: true });
  fs.writeFileSync(RATE_STATE_PATH, JSON.stringify({ ...readRateState(), ...patch, updatedAt: new Date().toISOString() }, null, 2));
}
async function waitForWebSlot(label) {
  const state = readRateState();
  const now = Date.now();
  const readyAt = Math.max(Number(state.lastSentAt || 0) + MIN_REQUEST_INTERVAL_MS, Number(state.blockedUntil || 0));
  if (readyAt > now) await loggedWait(readyAt - now, `${label} · ĐIỀU TIẾT ${WEB_LABEL.toUpperCase()}`);
  writeRateState({ lastSentAt: Date.now(), blockedUntil: 0 });
}
function recordRateLimit() {
  const blockedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  writeRateState({ blockedUntil });
  return RATE_LIMIT_COOLDOWN_MS;
}
function stamp() { return new Date().toLocaleString("vi-VN", { hour12: false }); }
function line(value, max = 240) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
function banner(title) {
  console.log("\n" + "=".repeat(72));
  console.log(`[${stamp()}] ${title}`);
  console.log("=".repeat(72));
}

function fingerprint(document) {
  return contentFingerprint({
    revision: document.revision,
    chapterNumber: document.chapterNumber,
    translationVersion: document.translationVersion,
    content: document.content
  });
}

function validateFinal(original, title, content, chapterTerms = []) {
  const issues = [
    ...evaluateTranslationQuality(original.content, content).qaIssues,
    ...evaluateTranslationQuality("", title).qaIssues.map((item) => `Tiêu đề: ${item}`)
  ];
  if (issues.length) throw new Error(`Bản sau review không qua quality gate: ${issues.join("; ")}`);
  validateProfileTerms(original.content, content, getBookTranslationProfile(BOOK_ID), chapterTerms);
}

async function saveCheckpoint(checkpoint, patch = {}) {
  Object.assign(checkpoint, patch, { updatedAt: new Date().toISOString() });
  if (DRY_RUN) return;
  await putJson(CHECKPOINT_KEY, checkpoint);
}

async function processChapterLegacy(index, checkpoint, chapterNumber) {
  const revision = Number(index.revision || 1);
  const key = LAYOUT.chapter(BOOK_ID, revision, chapterNumber);
  const originalKey = LAYOUT.chapterOriginal(BOOK_ID, revision, chapterNumber);
  const [head, raw, original] = await Promise.all([storage.head(key), readRaw(key), readJson(originalKey)]);
  if (!head?.etag || !raw || !original?.content) return { state: "missing" };
  const chapter = JSON.parse(raw.toString("utf8"));
  const isCompleted = chapter.translationStatus === "completed" || chapter.status === "completed" || (!chapter.translationStatus && Boolean(chapter.content && chapter.content.trim().length > 50));
  if (!chapter.content || !isCompleted) return { state: "not_ready" };
  const beforeFingerprint = fingerprint(chapter);
  console.log(`\n[ĐANG RÀ] Storage ${chapterNumber} | ${chapter.title || original.title}`);
  console.log(`  Bản hiện tại : ${chapter.provider || "không rõ"} / ${chapter.model || "không rõ"} / ${chapter.translationVersion || "không rõ"}`);
  console.log(`  Fingerprint  : ${beforeFingerprint}`);
  if (chapter.gptWebReview?.fingerprint === beforeFingerprint && ["passed", "patched"].includes(chapter.gptWebReview?.status)) {
    console.log(`  [BỎ QUA] GPT đã rà ngày ${chapter.gptWebReview.reviewedAt || "không rõ"}; nội dung chưa thay đổi.`);
    return { state: "already_reviewed" };
  }

  if (DRY_RUN) {
    console.log("  [DRY-RUN] Chương cần được GPT Web rà soát.");
    return { state: "pending", fingerprint: beforeFingerprint };
  }
  console.log("  [GPT WEB] Đang gửi nguyên tác + bản dịch để đối chiếu từng câu...");
  const startedAt = Date.now();
  let candidateTitle = chapter.title;
  let candidateContent = chapter.content;
  let reviewRounds = 0;
  let validationAttempts = 0;
  let qualityFeedback = "";
  const allIssues = [];
  let finalReview;
  let semanticAuditStarted = false;
  fs.mkdirSync(LOCAL_REVIEW_STATE_DIR, { recursive: true });
  const localStatePath = path.join(LOCAL_REVIEW_STATE_DIR, `${BOOK_ID}-${chapterNumber}.json`);
  try {
    const saved = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
    if (saved.schema === 5 && saved.inputFingerprint === beforeFingerprint && saved.candidateContent) {
      candidateTitle = saved.candidateTitle || candidateTitle;
      candidateContent = saved.candidateContent;
      allIssues.push(...(Array.isArray(saved.issues) ? saved.issues : []));
      semanticAuditStarted = Boolean(saved.semanticAuditStarted);
      console.log(`  [TIẾP TỤC BẢN TẠM] Khôi phục ${allIssues.length} patch đã qua kiểm tra từ cache local.`);
    }
  } catch {}
  const saveLocalCandidate = () => fs.writeFileSync(localStatePath, JSON.stringify({
    schema: 5,
    bookId: BOOK_ID,
    chapterNumber,
    inputFingerprint: beforeFingerprint,
    candidateTitle,
    candidateContent,
    issues: allIssues,
    semanticAuditStarted,
    updatedAt: new Date().toISOString()
  }, null, 2));
  while (reviewRounds < MAX_REVIEW_ROUNDS) {
    reviewRounds += 1;
    console.log(`  [VÒNG RÀ ${reviewRounds}] Đang kiểm tra toàn bộ bản ${reviewRounds === 1 ? "hiện tại" : "sau vá"}...`);
    const reviewed = await reviewTranslationWithGeminiWeb({
      sourceTitle: original.title,
      source: original.content,
      draftTitle: candidateTitle,
      draft: candidateContent,
      lockedTerms: LOCKED_TERMS,
      patchHistory: allIssues,
      validationFeedback: qualityFeedback
    }, {
      profileSlotId: 1,
      translate: translateWeb,
      operationTimeoutMs: Number(process.env.GPT_WEB_OPERATION_TIMEOUT_MS || 240000),
      maxValidationAttempts: 6,
      retryDelayMs: 3000,
      onValidationRetry: ({ attempt, error, retryDelayMs }) => console.warn(`  [CHƯA HỢP LỆ] Lần ${attempt}/6: ${error.message}` + `\n  [THỬ LẠI PHẢN HỒI] Sau ${Math.round(retryDelayMs / 1000)} giây...`)
    });
    validationAttempts += reviewed.validationAttempts;
    console.log(`  [PHẢN HỒI VÒNG ${reviewRounds}] ${reviewed.decision.toUpperCase()}; ${reviewed.issues.length} lỗi.`);
    for (const rejected of reviewed.rejectedIssues || []) {
      console.warn(`  [BỎ PATCH ${rejected.index}] ${line(rejected.reason)}; không áp dụng, sẽ rà lại nếu cần.`);
    }
    for (const [index, issue] of reviewed.issues.entries()) {
      console.log(`  ┌ Lỗi ${allIssues.length + index + 1} [${String(issue.severity || "unknown").toUpperCase()}]`);
      console.log(`  │ Gốc   : ${line(issue.sourceQuote)}`);
      console.log(`  │ Trước : ${line(issue.before)}`);
      console.log(`  │ Sau   : ${line(issue.after)}`);
      console.log(`  └ Lý do : ${line(issue.reason)}`);
    }
    try {
      validateFinal(original, reviewed.title, reviewed.content);
      qualityFeedback = "";
    } catch (error) {
      candidateTitle = reviewed.title;
      candidateContent = reviewed.content;
      if (reviewed.decision === "patch") allIssues.push(...reviewed.issues);
      saveLocalCandidate();
      qualityFeedback = `Quality gate còn phát hiện lỗi: ${error.message}. Hãy trả decision=patch và sửa chính xác các lỗi này, kể cả dấu câu/định dạng.`;
      console.warn(`  [QUALITY GATE CHƯA ĐẠT] ${error.message}`);
      console.warn(`  [RÀ LẠI] Gửi lỗi hình thức trở lại GPT Web; còn ${Math.max(0, MAX_REVIEW_ROUNDS - reviewRounds)} vòng, chưa ghi production.`);
      continue;
    }
    if (reviewed.decision === "pass") {
      if (!semanticAuditStarted) {
        semanticAuditStarted = true;
        qualityFeedback = SEMANTIC_AUDIT_FEEDBACK;
        saveLocalCandidate();
        console.log("  [KIỂM CHỨNG CUỐI] PASS sơ bộ; bắt đầu lượt chuyên kiểm tra chủ thể, phủ định, số lượng và thuật ngữ.");
        continue;
      }
      finalReview = reviewed;
      candidateTitle = reviewed.title;
      candidateContent = reviewed.content;
      break;
    }
    allIssues.push(...reviewed.issues);
    candidateTitle = reviewed.title;
    candidateContent = reviewed.content;
    qualityFeedback = VERIFICATION_ONLY_FEEDBACK;
    saveLocalCandidate();
    console.log(`  [ĐÃ VÁ TẠM] ${reviewed.issues.length} lỗi; chưa ghi production. Bắt đầu rà lại toàn bộ...`);
  }
  if (!finalReview) {
    throw new Error(`Reviewer chưa hội tụ sau ${MAX_REVIEW_ROUNDS} vòng; đã lưu bản vá tạm ở local để lượt sau tiếp tục và giữ nguyên production.`);
  }
  const wasPatched = allIssues.length > 0 || candidateTitle !== chapter.title;
  const reviewed = {
    ...finalReview,
    title: candidateTitle,
    content: candidateContent,
    decision: wasPatched ? "patch" : "pass",
    issues: allIssues,
    validationAttempts
  };
  console.log(`  [CHẤP NHẬN] PASS sau ${reviewRounds} vòng rà, ${validationAttempts} lần phản hồi hợp lệ/không hợp lệ, ${Math.round((Date.now() - startedAt) / 1000)} giây.`);
  console.log("  [QUALITY GATE] Đạt; GPT không còn báo lỗi và kiểm tra hình thức cũng đạt.");

  // API may publish a newer translation while the browser is reviewing.
  const latestRaw = await readRaw(key);
  const latest = latestRaw && JSON.parse(latestRaw.toString("utf8"));
  if (!latest || fingerprint(latest) !== beforeFingerprint) {
    console.warn("  [XUNG ĐỘT] API đã thay đổi chương trong lúc rà; bỏ kết quả và sẽ rà lại bản mới.");
    return { state: "changed_during_review" };
  }

  const now = new Date().toISOString();
  const updated = {
    ...chapter,
    title: reviewed.title,
    content: reviewed.content,
    paragraphs: reviewed.content.split("\n").map((part) => part.trim()).filter(Boolean),
    characters: reviewed.content.length,
    updatedAt: now,
    qaReviewed: true,
    qaRequired: false,
    qaStatus: reviewed.decision === "pass" ? "web_review_passed" : "web_review_patched",
    gptWebReview: {
      version: "gpt-web-evidence-patch-v1",
      status: reviewed.decision === "pass" ? "passed" : "patched",
      fingerprint: beforeFingerprint,
      reviewedAt: now,
      provider: reviewed.provider,
      model: reviewed.model,
      reviewRounds,
      validationAttempts,
      issues: reviewed.issues
    }
  };
  await putJson(key, updated, { ifMatch: head.etag });
  console.log("  [SYNC PRODUCTION] PUT có ETag thành công; đang GET kiểm chứng...");
  const verified = await readJson(key);
  const outputFingerprint = fingerprint(verified);
  // A patch changes content, so tag the resulting fingerprint for future skips.
  if (verified.gptWebReview?.fingerprint !== outputFingerprint) {
    const retagHead = await storage.head(key);
    verified.gptWebReview.inputFingerprint = beforeFingerprint;
    verified.gptWebReview.fingerprint = outputFingerprint;
    await putJson(key, verified, { ifMatch: retagHead.etag });
  }
  console.log(`  [HOÀN TẤT] Production đã xác minh: ${reviewed.decision === "pass" ? "không cần sửa" : `đã áp dụng ${reviewed.issues.length} bản vá`}.`);
  try { fs.unlinkSync(localStatePath); } catch {}
  return { state: reviewed.decision === "pass" ? "passed" : "patched", issues: reviewed.issues.length };
}

async function callGptFull(prompt, label, expectedSegmentIds = [], newConversation = false) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await waitForWebSlot(label);
      const result = await translateWeb(prompt, {
        profileSlotId: 1,
        direct: true,
        newConversation,
        operationTimeoutMs: Number(process.env[`${ENV_PREFIX}_OPERATION_TIMEOUT_MS`] || 240000)
      });
      return { ...parseFullTranslation(result.text, expectedSegmentIds), provider: result.provider, model: result.model, attempts: attempt };
    } catch (error) {
      lastError = error;
      const rateLimited = /giới hạn lượt gửi|rate.?limit|too many requests/i.test(error.message);
      const delay = rateLimited ? recordRateLimit() : Math.min(30000, 3000 * attempt);
      console.warn(`  [${label} RETRY ${attempt}/6] ${line(error.message)}; thử lại sau ${Math.round(delay / 1000)} giây.`);
      if (attempt < 6) {
        if (rateLimited) await loggedWait(delay, `CHỜ ${WEB_LABEL.toUpperCase()} GỠ GIỚI HẠN`);
        else await sleep(delay);
      }
    }
  }
  throw lastError;
}

async function callGptText(prompt, label) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await waitForWebSlot(label);
      const result = await translateWeb(prompt, { profileSlotId: 1, direct: true, operationTimeoutMs: Number(process.env[`${ENV_PREFIX}_OPERATION_TIMEOUT_MS`] || 240000) });
      return { text: result.text, attempts: attempt };
    } catch (error) {
      lastError = error;
      const rateLimited = /giới hạn lượt gửi|rate.?limit|too many requests/i.test(error.message);
      const delay = rateLimited ? recordRateLimit() : 3000 * attempt;
      console.warn(`  [${label} RETRY ${attempt}/4] ${line(error.message)}; thử lại sau ${delay / 1000} giây.`);
      if (attempt < 4) {
        if (rateLimited) await loggedWait(delay, `CHỜ ${WEB_LABEL.toUpperCase()} GỠ GIỚI HẠN`);
        else await sleep(delay);
      }
    }
  }
  throw lastError;
}

async function callWebModel(prompt, label = "POST-EDIT") {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await waitForWebSlot(label);
      const result = await translateWeb(prompt, {
        profileSlotId: 1,
        direct: true,
        operationTimeoutMs: Number(process.env[`${ENV_PREFIX}_OPERATION_TIMEOUT_MS`] || 240000)
      });
      return result.text;
    } catch (error) {
      lastError = error;
      const rateLimited = /giới hạn lượt gửi|rate.?limit|too many requests/i.test(error.message);
      const delay = rateLimited ? recordRateLimit() : Math.min(30000, 3000 * attempt);
      console.warn(`  [${label} RETRY ${attempt}/4] ${line(error.message)}; thử lại sau ${Math.round(delay / 1000)} giây.`);
      if (attempt < 4) {
        if (rateLimited) await loggedWait(delay, `CHỜ ${WEB_LABEL.toUpperCase()} GỠ GIỚI HẠN`);
        else await sleep(delay);
      }
    }
  }
  throw lastError;
}

async function processChapter(index, checkpoint, chapterNumber) {
  const revision = Number(index.revision || 1);
  const key = LAYOUT.chapter(BOOK_ID, revision, chapterNumber);
  const originalKey = LAYOUT.chapterOriginal(BOOK_ID, revision, chapterNumber);
  const [head, raw, original] = await Promise.all([storage.head(key), readRaw(key), readJson(originalKey)]);
  if (!head?.etag || !raw || !original?.content) return { state: "missing" };
  const chapter = JSON.parse(raw.toString("utf8"));
  const isCompleted = chapter.translationStatus === "completed" || chapter.status === "completed" || (!chapter.translationStatus && Boolean(chapter.content && chapter.content.trim().length > 50));
  if (!chapter.content || !isCompleted) return { state: "not_ready" };
  const beforeFingerprint = fingerprint(chapter);
  console.log(`\n[HẬU KIỂM BẢN GHI API] Storage ${chapterNumber} | ${chapter.title || original.title}`);
  console.log(`  Bản API hiện tại: ${chapter.provider || "không rõ"} / ${chapter.model || "không rõ"}`);
  console.log(`  Fingerprint     : ${beforeFingerprint}`);
  const previousWebReview = chapter.webReview || chapter.gptWebReview;
  if (previousWebReview?.fingerprint === beforeFingerprint && previousWebReview?.version === REVIEW_VERSION) {
    console.log(`  [BỎ QUA] Bản ${WEB_LABEL} hậu kiểm v5 ngày ${previousWebReview.reviewedAt || "không rõ"}; nội dung chưa thay đổi.`);
    return { state: "already_reviewed" };
  }
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Chương có bản ghi API sẵn sàng cho ${WEB_LABEL} hậu kiểm v5.`);
    return { state: "pending", fingerprint: beforeFingerprint };
  }

  const startedAt = Date.now();

  // Initialize Entity & Terminology Memory from profile and checkpoint
  const entityMemory = new EntityMemory(checkpoint.entityMemory || {});
  const termMemory = new TerminologyMemory(checkpoint.termMemory || {});

  const profile = getBookTranslationProfile(BOOK_ID);
  for (const [source, target] of profile.terms || []) {
    termMemory.setTerm(source, {
      preferred: target,
      forbidden: profile.forbiddenTerms?.[source] || [],
      confidence: 1.0,
      notes: "Curated book profile"
    });
  }

  console.log(`  [HẬU KIỂM] Bắt đầu quy trình Neural Post-Editing (QE -> Span Detection -> Targeted Fix -> Verifier)...`);

  const result = await postEditChapter({
    sourceTitle: original.title,
    sourceContent: original.content,
    draftTitle: chapter.title,
    draftContent: chapter.content,
    entityMemory,
    termMemory,
    callModel: (prompt, label) => callWebModel(prompt, label),
    chapterNumber,
    bookId: BOOK_ID
  });

  console.log(`  [KẾT QUẢ] Hoàn tất hậu kiểm: ${result.modifications} câu được vi phẫu, tỷ lệ giữ nguyên ${result.summary.preservationRate}.`);

  // Final Quality Gate
  validateFinal(original, result.title, result.content);

  const latestRaw = await readRaw(key);
  const latest = latestRaw && JSON.parse(latestRaw.toString("utf8"));
  if (!latest || fingerprint(latest) !== beforeFingerprint) {
    console.warn(`  [XUNG ĐỘT] API đã cập nhật chương trong lúc ${WEB_LABEL} hậu kiểm; giữ bản production mới và sẽ làm lại.`);
    return { state: "changed_during_review" };
  }

  const now = new Date().toISOString();
  const updated = {
    ...chapter,
    title: result.title,
    content: result.content,
    paragraphs: result.content.split("\n").map((part) => part.trim()).filter(Boolean),
    characters: result.content.length,
    updatedAt: now,
    qaReviewed: true,
    qaRequired: false,
    qaStatus: result.modifications > 0 ? "web_postedit_patched" : "web_postedit_passed",
    webReview: {
      version: REVIEW_VERSION,
      status: result.modifications > 0 ? "targeted_postedit_applied" : "verified_pass",
      fingerprint: beforeFingerprint,
      inputFingerprint: beforeFingerprint,
      reviewedAt: now,
      provider: `${WEB_PROVIDER}-web`,
      modifications: result.modifications,
      summary: result.summary,
      genre: profile.genre
    }
  };
  await putJson(key, updated, { ifMatch: head.etag });
  console.log("  [SYNC PRODUCTION] Đã PUT bằng ETag; đang GET xác minh bản hậu kiểm...");
  const verified = await readJson(key);
  const outputFingerprint = fingerprint(verified);
  const retagHead = await storage.head(key);
  verified.webReview.fingerprint = outputFingerprint;
  await putJson(key, verified, { ifMatch: retagHead.etag });

  checkpoint.entityMemory = entityMemory.toJSON();
  checkpoint.termMemory = termMemory.toJSON();

  console.log(`  [HOÀN TẤT] Hậu kiểm + xác minh production trong ${Math.round((Date.now() - startedAt) / 1000)} giây.`);
  return { state: result.modifications > 0 ? "patched" : "passed", issues: result.modifications };
}

async function runBatch() {
  const index = await readJson(LAYOUT.bookIndex(BOOK_ID));
  if (!index?.chapters?.length) throw new Error(`Không tìm thấy index của ${BOOK_ID}.`);
  const chapterNumbers = index.chapters.map((item) => Number(item.n || item.chapterNumber)).filter(Number.isInteger).sort((a, b) => a - b);
  const checkpointCandidates = await Promise.all([
    readJson(CHECKPOINT_KEY),
    readJson(`jobs/${BOOK_ID}/gpt-web-review-checkpoint.json`),
    readJson(LEGACY_CHECKPOINT_KEY)
  ]);
  let checkpoint = checkpointCandidates.filter(Boolean).sort((a, b) => Number(b.scanCursor || 0) - Number(a.scanCursor || 0))[0]
    || { schema: 1, bookId: BOOK_ID, revision: Number(index.revision || 1), scanCursor: START_CHAPTER, cycles: 0, totals: {} };
  if (START_OVERRIDE) checkpoint.scanCursor = START_OVERRIDE;
  let position = chapterNumbers.findIndex((number) => number >= Number(checkpoint.scanCursor || chapterNumbers[0]));
  if (position < 0) position = 0;
  let reviewedCount = 0;
  let inspected = 0;
  const batchStats = { passed: 0, patched: 0, patches: 0, alreadyReviewed: 0, failed: 0 };
  banner(`BẮT ĐẦU BATCH ${WEB_LABEL.toUpperCase()} — ${BOOK_ID}`);
  console.log(`Phạm vi: từ storage ${chapterNumbers[position]} | Tối đa ${MAX_CHAPTERS} chương cần rà | Tổng sách: ${chapterNumbers.length}`);
  console.log(`Checkpoint: ${CHECKPOINT_KEY}${DRY_RUN ? " | CHẾ ĐỘ DRY-RUN, KHÔNG GHI" : ""}`);

  while (reviewedCount < MAX_CHAPTERS && inspected < chapterNumbers.length) {
    const chapterNumber = chapterNumbers[position];
    let result;
    try {
      result = await processChapter(index, checkpoint, chapterNumber);
    } catch (error) {
      batchStats.failed += 1;
      checkpoint.lastError = { chapterNumber, message: error.message, at: new Date().toISOString() };
      await saveCheckpoint(checkpoint);
      console.error(`\n[LỖI CHƯƠNG ${chapterNumber}] ${error.message}`);
      console.error("[AN TOÀN] Chưa cập nhật cursor; production của chương này được giữ nguyên.");
      throw error;
    }
    inspected += 1;
    delete checkpoint.lastError;
    if (["passed", "patched", "pending", "changed_during_review"].includes(result.state)) reviewedCount += 1;
    checkpoint.totals[result.state] = Number(checkpoint.totals[result.state] || 0) + 1;
    checkpoint.lastChapter = chapterNumber;
    checkpoint.lastResult = result;
    position = (position + 1) % chapterNumbers.length;
    if (position === 0) checkpoint.cycles = Number(checkpoint.cycles || 0) + 1;
    checkpoint.scanCursor = chapterNumbers[position];
    if (result.state === "passed") batchStats.passed += 1;
    if (result.state === "patched") {
      batchStats.patched += 1;
      batchStats.patches += Number(result.issues || 0);
    }
    if (result.state === "already_reviewed") batchStats.alreadyReviewed += 1;
    if (result.state !== "already_reviewed" || inspected % 50 === 0) await saveCheckpoint(checkpoint);
    console.log(`  [TIẾN ĐỘ BATCH] ${reviewedCount}/${MAX_CHAPTERS} chương mới · cursor kế tiếp ${checkpoint.scanCursor}`);
  }
  const summary = { reviewed: reviewedCount, inspected, cursor: checkpoint.scanCursor, ...batchStats, syncedAt: new Date().toISOString() };
  if (!DRY_RUN) await putJson(STATUS_KEY, { schema: 1, bookId: BOOK_ID, state: "batch_completed", ...summary });
  banner(DRY_RUN ? "DRY-RUN ĐÃ XONG — KHÔNG GHI PRODUCTION" : "BATCH ĐÃ XONG — ĐÃ ĐỒNG BỘ PRODUCTION");
  console.log(`Đã rà mới : ${summary.reviewed} chương (${summary.passed} pass, ${summary.patched} có sửa)`);
  console.log(`Bản vá     : ${summary.patches}`);
  console.log(`Đã kiểm tra: ${summary.inspected} chương (${summary.alreadyReviewed} chương đã tag được bỏ qua)`);
  console.log(`Cursor sau : ${summary.cursor}`);
  console.log(`Trạng thái : ${DRY_RUN ? "không lưu trong dry-run" : STATUS_KEY}`);
  return summary;
}

async function main() {
  do {
    const result = await runBatch();
    if (!CONTINUOUS) break;
    const waitMs = result.reviewed ? 5000 : Math.max(IDLE_MS, RESCAN_MS);
    console.log(`[CHỜ] Batch kế tiếp bắt đầu sau ${Math.round(waitMs / 1000)} giây. Nhấn Ctrl+C để dừng an toàn.`);
    await sleep(waitMs);
  } while (true);
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(() => closeGeminiWeb());
