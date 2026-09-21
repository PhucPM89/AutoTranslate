"use strict";

const crypto = require("node:crypto");
const { evaluateTranslationQuality } = require("./translation-quality");

const REVIEW_VERSION = "semantic-v2";
const SEMANTIC_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["pass", "repair", "retranslate"] },
    scores: {
      type: "object",
      properties: {
        accuracy: { type: "number" }, completeness: { type: "number" },
        fluency: { type: "number" }, terminology: { type: "number" }
      },
      required: ["accuracy", "completeness", "fluency", "terminology"],
      additionalProperties: false
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" }, severity: { type: "string", enum: ["minor", "major", "critical"] },
          sourceQuote: { type: "string" }, draftQuote: { type: "string" },
          suggestedTranslation: { type: "string" }, explanation: { type: "string" }
        },
        required: ["type", "severity", "sourceQuote", "draftQuote", "suggestedTranslation", "explanation"],
        additionalProperties: false
      }
    }
  },
  required: ["decision", "scores", "issues"],
  additionalProperties: false
};
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
    lastError: "",
    forceReplacePublished: false
  };
}

function mergeReviewEntries(queue, candidates, { bookId, revision, now = new Date().toISOString() } = {}) {
  const current = queue && typeof queue === "object" ? queue : {};
  const versionChanged = current.reviewVersion && current.reviewVersion !== REVIEW_VERSION;
  const byChapter = new Map(
    (Array.isArray(current.entries) ? current.entries : [])
      .filter((entry) => Number.isInteger(Number(entry?.chapterNumber)))
      .map((entry) => [Number(entry.chapterNumber), { ...entry }])
  );

  for (const candidate of candidates || []) {
    const next = createReviewEntry({ ...candidate, revision: candidate.revision || revision, now });
    next.forceReplacePublished = Boolean(candidate.forceReplacePublished);
    const previous = byChapter.get(next.chapterNumber);
    // The same exact Hachimi output keeps its durable checkpoint. A changed
    // chapter gets a fresh review even when its chapter number is unchanged.
    if (!previous || previous.fingerprint !== next.fingerprint) {
      byChapter.set(next.chapterNumber, next);
      continue;
    }
    // A new semantic pipeline invalidates attempts and leases produced by the
    // old reviewer. Already-approved output and protected Gemini chapters are
    // durable checkpoints and must never be reopened only because code changed.
    if (versionChanged && !["approved", "skipped_gemini"].includes(previous.state)) {
      byChapter.set(next.chapterNumber, next);
    }
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

function buildSemanticReviewPrompt({ bookTitle, chapterNumber, sourceTitle = "", draftTitle = "", source, draft, glossary = {}, previousContext = "", storyBible = null, recentContext = [] }) {
  const matchedGlossary = Object.fromEntries(
    Object.entries(glossary || {})
      .filter(([zh]) => String(source || "").includes(zh))
      .slice(0, 150)
  );
  return [
    "Bạn là tổng biên tập bản dịch tiểu thuyết Trung Quốc sang tiếng Việt.",
    "Nhiệm vụ của bạn là tìm lỗi để ngăn bản dịch chưa đạt chuẩn xuất bản lọt qua, không phải xác nhận cho xong. Không mặc định bản nháp đúng chỉ vì đọc trôi chảy ở mức tổng thể.",
    "Hãy đối chiếu BẢN GỐC với BẢN NHÁP theo nghĩa từng câu, không chỉ kiểm tra văn phong.",
    "Kiểm tra cả TIÊU ĐỀ và nội dung: đủ ý, đúng chủ thể/hành động/phủ định/số lượng, xưng hô, giới tính, tên riêng và thuật ngữ.",
    "Không được đánh pass nếu bản nháp đảo nhân vật, gán nhầm lời thoại, lược ý hoặc thêm ý.",
    "Tuyệt đối không tự sửa lỗi logic, phương vị hay mâu thuẫn vốn có của tác giả. Nếu bản nháp dịch đúng câu gốc (ví dụ 身后 là 'phía sau') thì không được bắt đổi thành ý khác chỉ để hợp logic với câu bên cạnh; chỉ có thể ghi chú biên tập ngoài bản dịch.",
    "Rà tuần tự từ đầu đến cuối, đối chiếu từng đoạn trước khi kết luận. Đặc biệt tìm: sai chủ thể/tân ngữ, đảo phủ định, sai số lượng, sai nghĩa động từ/thành ngữ, từ Hán-Việt dùng sai, câu dịch từng chữ khó hiểu, lỗi chính tả và chi tiết bị thêm hoặc bỏ.",
    "Văn phong trôi chảy tổng thể không bù được một câu sai nghĩa. Một từ chọn sai làm người đọc hiểu sai sự việc phải là major, không phải minor.",
    "Về tiếng Việt, phải bắt các kết hợp từ và trật tự câu dịch máy như 'hét lớn hướng về', 'nghi vấn lên tiếng', 'não ngơ ra', lặp chủ ngữ, dùng từ sai sắc thái hoặc câu đọc lên không giống văn xuôi Việt tự nhiên. Chỉ pass khi không còn câu khó hiểu hay gượng đáng sửa.",
    "Mỗi issue phải có sourceQuote và draftQuote ngắn, chép nguyên văn chính xác từ hai văn bản, cùng suggestedTranslation và explanation theo đúng ngữ cảnh. Không được bịa trích dẫn.",
    "Chỉ trả về JSON thuần theo đúng schema sau:",
    JSON.stringify({
      decision: "pass|repair|retranslate",
      scores: { accuracy: 0, completeness: 0, fluency: 0, terminology: 0 },
      issues: [{ type: "", severity: "minor|major|critical", sourceQuote: "", draftQuote: "", suggestedTranslation: "", explanation: "" }]
    }),
    "Ngưỡng pass: cả bốn điểm >= 9.0 và issues phải rỗng. Chỉ nêu tối đa 3-4 issue quan trọng nhất thực sự đáng sửa; không hạ điểm vì sở thích văn phong cá nhân. Mỗi issue viết explanation ngắn gọn súc tích dưới 30 từ.",
    `Truyện: ${bookTitle || "Không rõ"}; chương: ${chapterNumber}`,
    `TIÊU ĐỀ GỐC: ${sourceTitle || ""}`,
    `TIÊU ĐỀ BẢN NHÁP: ${draftTitle || ""}`,
    `Glossary bắt buộc: ${JSON.stringify(matchedGlossary)}`,
    storyBible ? `Story bible đã duyệt (không được tự ý mâu thuẫn):\n${JSON.stringify({ characters: (storyBible.characters || []).slice(-120), worldTerms: (storyBible.worldTerms || []).slice(-120) })}` : "",
    recentContext?.length ? `Tóm tắt các chương gần nhất đã duyệt:\n${JSON.stringify(recentContext.slice(-8))}` : "",
    previousContext ? `Ngữ cảnh chương trước (chỉ để phân giải nhân vật/xưng hô):\n${String(previousContext).slice(-3000)}` : "",
    `BẢN GỐC:\n${source || ""}`,
    `BẢN NHÁP GEMINI:\n${draft || ""}`
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
    throw new Error("Groq trả semantic review không đúng schema.");
  }

  const scores = {};
  for (const field of ["accuracy", "completeness", "fluency", "terminology"]) {
    const score = Number(parsed.scores?.[field]);
    if (!Number.isFinite(score) || score < 0 || score > 10) throw new Error(`Điểm ${field} không hợp lệ.`);
    scores[field] = score;
  }
  const reportedIssues = (Array.isArray(parsed.issues) ? parsed.issues : []).slice(0, 20).map((issue) => ({
    ...issue,
    sourceQuote: String(issue?.sourceQuote || "").trim(),
    draftQuote: String(issue?.draftQuote || "").trim(),
    suggestedTranslation: String(issue?.suggestedTranslation || "").trim(),
    explanation: String(issue?.explanation || "").trim()
  }));
  const quoteKey = (value) => String(value || "")
    .normalize("NFC")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();
  const sourceKey = quoteKey(source);
  const draftKey = quoteKey(draft);
  const issues = reportedIssues.filter((issue) => {
    const sourceQuote = quoteKey(issue.sourceQuote);
    const draftQuote = quoteKey(issue.draftQuote);
    return sourceQuote.length >= 2 && draftQuote.length >= 2 && sourceKey.includes(sourceQuote) && draftKey.includes(draftQuote);
  });
  if (parsed.decision !== "pass" && reportedIssues.length && !issues.length) {
    throw new Error("Semantic review không có issue nào với trích dẫn kiểm chứng được.");
  }
  const canPass = Object.values(scores).every((score) => score >= 9.0) && issues.length === 0;

  if (parsed.decision === "pass" && !canPass) {
    throw new Error("Semantic review tự mâu thuẫn: decision=pass nhưng điểm hoặc issue không đạt.");
  }

  let correctedTranslation = String(parsed.correctedTranslation || "").trim();
  if (parsed.decision !== "pass") {
    if (correctedTranslation) {
      const quality = evaluateTranslationQuality(source, correctedTranslation);
      if (quality.qaRequired) throw new Error(`Bản Groq sửa không hợp lệ: ${quality.qaIssues.join("; ")}`);
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

function buildSemanticRepairPrompt({ bookTitle, chapterNumber, sourceTitle = "", draftTitle = "", source, draft, glossary = {}, issues = [], storyBible = null, previousContext = "" }) {
  const matchedGlossary = Object.fromEntries(Object.entries(glossary || {}).filter(([zh]) => String(source || "").includes(zh)).slice(0, 150));
  return [
    "Bạn là dịch giả kiêm biên tập viên Trung - Việt. Hãy sửa TIÊU ĐỀ và tạo TOÀN BỘ bản dịch hoàn chỉnh cho chương dưới đây.",
    "Sửa mọi lỗi semantic đã nêu; giữ đủ ý từng câu, đúng chủ thể, lời thoại, phủ định, số lượng và xưng hô.",
    "Không sửa mâu thuẫn vốn có của nguyên tác và không làm theo suggestedTranslation nào trái với chữ gốc. Phương vị như 身后 phải giữ là 'phía sau', 面前 phải giữ là 'trước mặt'.",
    "Biên tập thành văn xuôi Việt tự nhiên, không giữ nguyên thành ngữ/cụm bốn chữ Trung Quốc dưới dạng Hán-Việt. Tránh các lối dịch máy như 'hữu khí vô lực', 'kinh nghi', 'nghi hoặc lên tiếng', 'kinh hoảng bất an', 'nhắm trúng', 'quấn lấy', 'hướng về phía ... nói'. Hãy diễn đạt đúng nghĩa bằng từ Việt thông dụng theo ngữ cảnh.",
    "Đọc lại toàn bộ bản trả về như một biên tập viên tiếng Việt: bỏ lặp từ, chủ ngữ thừa, kết hợp từ gượng và câu bám trật tự tiếng Trung. Không được làm văn hoa hơn nguyên tác hoặc tự thêm chi tiết.",
    "Chỉ trả bản sửa theo đúng hai thẻ sau; không dùng JSON hay code fence để dấu ngoặc kép trong hội thoại không làm hỏng dữ liệu:",
    "<TITLE>Tiêu đề tiếng Việt hoàn chỉnh</TITLE>\n<CONTENT>Toàn bộ nội dung tiếng Việt hoàn chỉnh</CONTENT>",
    `Truyện: ${bookTitle || "Không rõ"}; chương: ${chapterNumber}`,
    `Lỗi cần sửa: ${JSON.stringify(issues)}`,
    `Glossary bắt buộc: ${JSON.stringify(matchedGlossary)}`,
    `TIÊU ĐỀ GỐC: ${sourceTitle || ""}`,
    `TIÊU ĐỀ BẢN NHÁP: ${draftTitle || ""}`,
    storyBible ? `Story bible: ${JSON.stringify({ characters: (storyBible.characters || []).slice(-120), worldTerms: (storyBible.worldTerms || []).slice(-120) })}` : "",
    previousContext ? `Ngữ cảnh trước: ${String(previousContext).slice(-3000)}` : "",
    `BẢN GỐC:\n${source || ""}`,
    `BẢN NHÁP CẦN SỬA:\n${draft || ""}`
  ].filter(Boolean).join("\n\n");
}

function parseSemanticRepair(value, { source = "" } = {}) {
  const raw = String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed;
  const tagged = raw.match(/<TITLE>([\s\S]*?)<\/TITLE>\s*<CONTENT>([\s\S]*?)<\/CONTENT>/i);
  if (tagged) {
    parsed = { title: tagged[1], content: tagged[2] };
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch {
      const object = raw.match(/\{[\s\S]*\}/);
      if (object) parsed = JSON.parse(object[0]);
    }
  }
  if (!parsed && raw.length >= 300 && !/I (?:can't|cannot)|tôi không thể giúp|không thể đáp ứng/iu.test(raw)) {
    parsed = { title: "Bản dịch đã biên tập", content: raw };
  }
  const title = String(parsed?.title || "").trim();
  const content = String(parsed?.content || "").trim();
  if (!title || !content) throw new Error("Groq trả bản sửa không đúng schema title/content.");
  const titleQuality = evaluateTranslationQuality("", title);
  const contentQuality = evaluateTranslationQuality(source, content);
  const issues = [...titleQuality.qaIssues.map((item) => `Tiêu đề: ${item}`), ...contentQuality.qaIssues];
  if (issues.length) throw new Error(`Bản Groq sửa không hợp lệ: ${issues.join("; ")}`);
  return { title, content };
}

module.exports = {
  REVIEW_VERSION,
  SEMANTIC_REVIEW_SCHEMA,
  reviewQueueKey,
  contentFingerprint,
  createReviewEntry,
  mergeReviewEntries,
  claimNextReview,
  settleReview,
  buildSemanticReviewPrompt,
  buildSemanticRepairPrompt,
  parseSemanticRepair,
  parseSemanticReview
};
