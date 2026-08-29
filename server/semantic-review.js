"use strict";

const crypto = require("node:crypto");
const { evaluateTranslationQuality } = require("./translation-quality");

const REVIEW_VERSION = "semantic-v1";
const REVIEW_STATES = new Set(["pending", "processing", "batch_processing", "retrying", "approved", "failed", "skipped_gemini"]);

function reviewQueueKey(bookId) {
  return `jobs/${bookId}/semantic-review.json`;
}

function contentFingerprint({ revision, chapterNumber, translationVersion, content }) {
  return crypto.createHash("sha256")
    .update([revision, chapterNumber, translationVersion || "", content || ""].join("\u0000"))
    .digest("hex")
    .slice(0, 24);
}

function createReviewEntry({ revision, chapterNumber, translationVersion, content, now = new Date().toISOString() }) {
  return {
    chapterNumber: Number(chapterNumber),
    revision: Number(revision),
    translationVersion: String(translationVersion || ""),
    fingerprint: contentFingerprint({ revision, chapterNumber, translationVersion, content }),
    state: "pending",
    attempts: 0,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
    leaseOwner: "",
    leaseUntil: "",
    lastError: ""
  };
}

function mergeReviewEntries(queue, candidates, { bookId, revision, now = new Date().toISOString() } = {}) {
  const current = queue && typeof queue === "object" ? queue : {};
  const byChapter = new Map(
    (Array.isArray(current.entries) ? current.entries : [])
      .filter((entry) => Number.isInteger(Number(entry?.chapterNumber)))
      .map((entry) => [Number(entry.chapterNumber), { ...entry }])
  );

  for (const candidate of candidates || []) {
    const next = createReviewEntry({ ...candidate, revision: candidate.revision || revision, now });
    const previous = byChapter.get(next.chapterNumber);
    // The same exact Hachimi output keeps its durable checkpoint. A changed
    // chapter gets a fresh review even when its chapter number is unchanged.
    if (!previous || previous.fingerprint !== next.fingerprint) byChapter.set(next.chapterNumber, next);
  }

  return {
    schema: 1,
    reviewVersion: REVIEW_VERSION,
    bookId: bookId || current.bookId || "",
    revision: Number(revision || current.revision || 1),
    updatedAt: now,
    entries: [...byChapter.values()].sort((a, b) => a.chapterNumber - b.chapterNumber)
  };
}

function claimNextReview(queue, { owner, now = Date.now(), leaseMs = 10 * 60_000 } = {}) {
  if (!queue || !Array.isArray(queue.entries)) return null;
  const nowIso = new Date(now).toISOString();
  const entry = queue.entries.find((item) => {
    if (!item || !REVIEW_STATES.has(item.state)) return false;
    if (item.state === "pending") return true;
    if (item.state === "retrying") return !item.availableAt || Date.parse(item.availableAt) <= now;
    if (item.state === "processing") return !item.leaseUntil || Date.parse(item.leaseUntil) <= now;
    return false;
  });
  if (!entry) return null;
  entry.state = "processing";
  entry.attempts = Number(entry.attempts || 0) + 1;
  entry.leaseOwner = String(owner || "semantic-reviewer");
  entry.leaseUntil = new Date(now + leaseMs).toISOString();
  entry.updatedAt = nowIso;
  queue.updatedAt = nowIso;
  return entry;
}

function settleReview(queue, chapterNumber, result, { now = Date.now(), maxAttempts = 4 } = {}) {
  const entry = queue?.entries?.find((item) => Number(item.chapterNumber) === Number(chapterNumber));
  if (!entry) throw new Error(`Không tìm thấy chương ${chapterNumber} trong semantic-review queue.`);
  const nowIso = new Date(now).toISOString();
  entry.leaseOwner = "";
  entry.leaseUntil = "";
  entry.updatedAt = nowIso;

  if (result?.approved) {
    entry.state = "approved";
    entry.approvedAt = nowIso;
    entry.reviewModel = String(result.model || "");
    entry.decision = String(result.decision || "pass");
    entry.scores = result.scores || {};
    entry.issues = Array.isArray(result.issues) ? result.issues.slice(0, 20) : [];
    entry.lastError = "";
  } else if (result?.retryable) {
    // Provider quota/outage is not a bad chapter and must never exhaust that
    // chapter's retry budget.
    entry.attempts = Math.max(0, Number(entry.attempts || 0) - 1);
    entry.state = "retrying";
    entry.lastError = String(result?.error || "Provider tạm thời chưa sẵn sàng").slice(0, 500);
    entry.availableAt = new Date(now + Math.max(30_000, Number(result.retryAfterMs || 15 * 60_000))).toISOString();
  } else {
    const attempts = Number(entry.attempts || 0);
    entry.state = attempts >= maxAttempts ? "failed" : "retrying";
    entry.lastError = String(result?.error || "Semantic review thất bại").slice(0, 500);
    entry.availableAt = new Date(now + Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1))).toISOString();
  }
  queue.updatedAt = nowIso;
  return entry;
}

function buildSemanticReviewPrompt({ bookTitle, chapterNumber, source, draft, glossary = {}, previousContext = "", storyBible = null, recentContext = [] }) {
  const matchedGlossary = Object.fromEntries(
    Object.entries(glossary || {})
      .filter(([zh]) => String(source || "").includes(zh))
      .slice(0, 150)
  );
  return [
    "Bạn là tổng biên tập bản dịch tiểu thuyết Trung Quốc sang tiếng Việt.",
    "Hãy đối chiếu BẢN GỐC với BẢN NHÁP theo nghĩa từng câu, không chỉ kiểm tra văn phong.",
    "Kiểm tra: đủ ý, đúng chủ thể/hành động/phủ định/số lượng, xưng hô, giới tính, tên riêng và thuật ngữ.",
    "Không được đánh pass nếu bản nháp đảo nhân vật, gán nhầm lời thoại, lược ý hoặc thêm ý.",
    "Đây chỉ là lượt đánh giá. Luôn để correctedTranslation rỗng; hệ thống sẽ gọi lượt sửa văn bản riêng nếu cần.",
    "Chỉ trả về JSON thuần theo schema:",
    JSON.stringify({
      decision: "pass|repair|retranslate",
      scores: { accuracy: 0, completeness: 0, fluency: 0, terminology: 0 },
      issues: [{ type: "", severity: "minor|major|critical", explanation: "" }],
      correctedTranslation: "",
      chapterSummary: "Tóm tắt sự kiện/chủ thể quan trọng trong tối đa 120 từ",
      storyBibleUpdates: { characters: [{ name: "", aliases: [], gender: "male|female|unknown", role: "", relationships: [], notes: "" }], worldTerms: [{ term: "", meaning: "" }] },
      translationMemoryUpdates: [{ zh: "cụm từ có thật trong bản gốc", vi: "cụm tương ứng có thật trong bản dịch" }]
    }),
    "Ngưỡng pass: accuracy >= 9, completeness >= 9, terminology >= 9, không có lỗi major/critical.",
    `Truyện: ${bookTitle || "Không rõ"}; chương: ${chapterNumber}`,
    `Glossary bắt buộc: ${JSON.stringify(matchedGlossary)}`,
    storyBible ? `Story bible đã duyệt (không được tự ý mâu thuẫn):\n${JSON.stringify({ characters: (storyBible.characters || []).slice(-120), worldTerms: (storyBible.worldTerms || []).slice(-120) })}` : "",
    recentContext?.length ? `Tóm tắt các chương gần nhất đã duyệt:\n${JSON.stringify(recentContext.slice(-8))}` : "",
    previousContext ? `Ngữ cảnh chương trước (chỉ để phân giải nhân vật/xưng hô):\n${String(previousContext).slice(-3000)}` : "",
    `BẢN GỐC:\n${source || ""}`,
    `BẢN NHÁP HACHIMI:\n${draft || ""}`
  ].filter(Boolean).join("\n\n");
}

function parseSemanticReview(value, { source = "", draft = "" } = {}) {
  const raw = String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const object = raw.match(/\{[\s\S]*\}/);
    if (object) parsed = JSON.parse(object[0]);
  }
  if (!parsed || !["pass", "repair", "retranslate"].includes(parsed.decision)) {
    throw new Error("Gemini trả semantic review không đúng schema.");
  }

  const scores = {};
  for (const field of ["accuracy", "completeness", "fluency", "terminology"]) {
    const score = Number(parsed.scores?.[field]);
    if (!Number.isFinite(score) || score < 0 || score > 10) throw new Error(`Điểm ${field} không hợp lệ.`);
    scores[field] = score;
  }
  const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 20) : [];
  const hasSeriousIssue = issues.some((issue) => ["major", "critical"].includes(issue?.severity));
  const canPass = Object.values(scores).every((score) => score >= 9) && !hasSeriousIssue;

  if (parsed.decision === "pass" && !canPass) {
    throw new Error("Semantic review tự mâu thuẫn: decision=pass nhưng điểm hoặc issue không đạt.");
  }

  let correctedTranslation = String(parsed.correctedTranslation || "").trim();
  if (parsed.decision !== "pass") {
    if (correctedTranslation) {
      const quality = evaluateTranslationQuality(source, correctedTranslation);
      if (quality.qaRequired) throw new Error(`Bản Gemini sửa không hợp lệ: ${quality.qaIssues.join("; ")}`);
    }
  } else {
    correctedTranslation = String(draft || "").trim();
  }

  return {
    decision: parsed.decision,
    scores,
    issues,
    correctedTranslation,
    chapterSummary: String(parsed.chapterSummary || "").trim().slice(0, 1200),
    storyBibleUpdates: parsed.storyBibleUpdates && typeof parsed.storyBibleUpdates === "object" ? parsed.storyBibleUpdates : {},
    translationMemoryUpdates: Array.isArray(parsed.translationMemoryUpdates) ? parsed.translationMemoryUpdates.slice(0, 30) : []
  };
}

function buildSemanticRepairPrompt({ bookTitle, chapterNumber, source, draft, glossary = {}, issues = [], storyBible = null, previousContext = "" }) {
  const matchedGlossary = Object.fromEntries(Object.entries(glossary || {}).filter(([zh]) => String(source || "").includes(zh)).slice(0, 150));
  return [
    "Bạn là dịch giả kiêm biên tập viên Trung - Việt. Hãy tạo TOÀN BỘ bản dịch hoàn chỉnh cho chương dưới đây.",
    "Sửa mọi lỗi semantic đã nêu; giữ đủ ý từng câu, đúng chủ thể, lời thoại, phủ định, số lượng và xưng hô.",
    "Chỉ trả về văn bản tiếng Việt hoàn chỉnh, không JSON, không Markdown, không giải thích.",
    `Truyện: ${bookTitle || "Không rõ"}; chương: ${chapterNumber}`,
    `Lỗi cần sửa: ${JSON.stringify(issues)}`,
    `Glossary bắt buộc: ${JSON.stringify(matchedGlossary)}`,
    storyBible ? `Story bible: ${JSON.stringify({ characters: (storyBible.characters || []).slice(-120), worldTerms: (storyBible.worldTerms || []).slice(-120) })}` : "",
    previousContext ? `Ngữ cảnh trước: ${String(previousContext).slice(-3000)}` : "",
    `BẢN GỐC:\n${source || ""}`,
    `BẢN NHÁP CẦN SỬA:\n${draft || ""}`
  ].filter(Boolean).join("\n\n");
}

module.exports = {
  REVIEW_VERSION,
  reviewQueueKey,
  contentFingerprint,
  createReviewEntry,
  mergeReviewEntries,
  claimNextReview,
  settleReview,
  buildSemanticReviewPrompt,
  buildSemanticRepairPrompt,
  parseSemanticReview
};
