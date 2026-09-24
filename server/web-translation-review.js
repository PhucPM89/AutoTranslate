"use strict";

function buildWebReviewPrompt({ sourceTitle = "", source = "", draftTitle = "", draft = "", validationFeedback = "", lockedTerms = [], patchHistory = [] } = {}) {
  const termRules = normalizeLockedTerms(lockedTerms);
  return [
    "Bạn là biên tập viên kiểm định bản dịch tiểu thuyết Trung-Việt.",
    "Mục tiêu duy nhất là bảo toàn nội dung nguyên tác. Đối chiếu toàn bộ nguyên tác với BẢN DỊCH HIỆN TẠI theo từng câu. Không biên tập lại để văn hoa hơn.",
    "Kiểm tra có hệ thống theo thứ tự: (1) ai làm gì với ai, đặc biệt 我/你/他/她/它 và các cụm chỉ vị trí; (2) phủ định, điều kiện, quan hệ nhân quả; (3) số lượng, cấp bậc, đơn vị; (4) câu hoặc mệnh đề bị thiếu/thêm; (5) lời thoại và câu trần thuật; (6) cùng một thuật ngữ lặp lại có được dịch nhất quán hay không.",
    "Không tự đặt cách dịch mới cho tên riêng, kỹ năng, vật phẩm hoặc thuật ngữ khi đề bài không cung cấp bảng thuật ngữ khóa. Nếu thấy chúng không nhất quán, chỉ nêu lỗi khi có thể chọn lại đúng một cách dịch đã tồn tại và sát nghĩa trực tiếp; không sáng tạo tên kiểu mới.",
    "Danh từ thông thường phải dịch sang tiếng Việt dễ hiểu theo đúng trật tự tiếng Việt. Cấm phiên âm Hán-Việt máy móc kiểu ghép từng âm và viết hoa toàn bộ cụm.",
    termRules.length ? `BẢNG THUẬT NGỮ KHÓA (bắt buộc dùng đúng, không tạo biến thể):\n${termRules.map(({ source, target }) => `${source} = ${target}`).join("\n")}` : "",
    patchHistory.length ? `CÁC BẢN VÁ ĐÃ ĐƯỢC CHẤP NHẬN (không đổi ngược hoặc viết lại chỉ vì văn phong):\n${patchHistory.slice(-30).map((item) => `${String(item.sourceQuote || "").slice(0, 100)} => ${String(item.after || "").slice(0, 180)}`).join("\n")}` : "",
    "Nếu không có lỗi vật chất, trả decision=pass. Nếu có lỗi, chỉ tạo tối đa 8 bản vá chắc chắn nhất và nhỏ nhất. sourceQuote và before PHẢI sao chép nguyên văn bằng copy/paste, không dịch lại, không rút gọn bằng dấu ba chấm. before phải xuất hiện đúng một lần trong BẢN DỊCH HIỆN TẠI. after bắt buộc là tiếng Việt hoàn chỉnh; tuyệt đối không chép nguyên tác tiếng Trung vào after. Không thay từ đồng nghĩa, không đổi đại từ đang nhất quán và không viết lại đoạn không có lỗi.",
    "Đầu ra phải parse được bằng JSON.parse. Bên trong mọi giá trị chuỗi, bắt buộc viết dấu ngoặc kép thẳng dưới dạng \\u0022; không đặt ký tự ngoặc kép thẳng chưa escape vào sourceQuote, before, after hoặc reason. Ký tự xuống dòng trong chuỗi phải viết thành \\n.",
    "Chỉ trả JSON thuần theo schema sau:",
    JSON.stringify({ decision: "pass|patch", correctedTitle: "", titleSourceQuote: "", issues: [{ severity: "minor|major|critical", sourceQuote: "", before: "", after: "", reason: "" }] }),
    `TIÊU ĐỀ GỐC:\n${sourceTitle}`,
    `TIÊU ĐỀ API:\n${draftTitle}`,
    `NGUYÊN TÁC:\n${source}`,
    validationFeedback ? `PHẢN HỒI TỪ BỘ KIỂM TRA JSON LẦN TRƯỚC:\n${validationFeedback}\nHãy trả lại toàn bộ JSON đã sửa đúng yêu cầu.` : "",
    `BẢN DỊCH HIỆN TẠI:\n${draft}`
  ].filter(Boolean).join("\n\n");
}

function parseJson(text) {
  const raw = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Gemini Web không trả JSON review hợp lệ.");
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    try { return JSON.parse(repairUnescapedJsonQuotes(match[0])); } catch {}
    const position = Number(String(error.message).match(/position\s+(\d+)/i)?.[1] || 0);
    const near = match[0].slice(Math.max(0, position - 80), position + 120).replace(/\s+/g, " ");
    throw new Error(`JSON review lỗi cú pháp (${error.message}); dài ${match[0].length} ký tự; gần: ${near}`);
  }
}

// ChatGPT Web occasionally copies dialogue quotes into JSON strings without
// escaping them. A quote inside a string is structural only when the next
// non-space character is a JSON delimiter; all other quotes are content.
function repairUnescapedJsonQuotes(raw) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (!inString) {
      result += char;
      if (char === '"') inString = true;
      continue;
    }
    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }
    if (char !== '"') {
      result += char;
      continue;
    }
    let next = index + 1;
    while (/\s/.test(raw[next] || "")) next += 1;
    const nextChar = raw[next] || "";
    let structural = /[:}\]]/.test(nextChar);
    if (nextChar === ",") {
      let afterComma = next + 1;
      while (/\s/.test(raw[afterComma] || "")) afterComma += 1;
      structural = /["{\]]/.test(raw[afterComma] || "");
    }
    if (structural) {
      result += char;
      inString = false;
    } else {
      result += '\\"';
    }
  }
  return result;
}

function applyWebReview({ sourceTitle = "", source = "", draftTitle = "", draft = "", response, lockedTerms = [], patchHistory = [] } = {}) {
  const review = typeof response === "string" ? parseJson(response) : response;
  if (!review || !["pass", "patch"].includes(review.decision)) throw new Error("Gemini Web trả decision review không hợp lệ.");
  const issues = Array.isArray(review.issues) ? review.issues : [];
  if (review.decision === "pass" && issues.length) throw new Error("Gemini Web review mâu thuẫn: pass nhưng vẫn có issue.");
  if (review.decision === "patch" && !issues.length && !String(review.correctedTitle || "").trim()) throw new Error("Gemini Web yêu cầu patch nhưng không cung cấp bản vá.");

  let content = String(draft);
  const acceptedIssues = [];
  const rejectedIssues = [];
  for (const [index, issue] of issues.entries()) {
    try {
      const sourceQuote = String(issue?.sourceQuote || "").trim();
      const before = String(issue?.before || "");
      const after = String(issue?.after || "");
      if (!sourceQuote || !containsEvidence(source, sourceQuote)) throw new Error(`không có bằng chứng trong nguyên tác: ${sourceQuote.slice(0, 120)}`);
      if (!before || before === after) throw new Error("không thay đổi nội dung");
      assertNotPatchReversal(sourceQuote, before, after, patchHistory);
      const beforeHan = countHan(before);
      const afterHan = countHan(after);
      if (afterHan > beforeHan) throw new Error(`làm tăng chữ Hán từ ${beforeHan} lên ${afterHan}`);
      if (afterHan >= 4 && afterHan / Math.max(1, Array.from(after).length) > 0.2) {
        throw new Error(`after chứa quá nhiều tiếng Trung (${afterHan} chữ Hán)`);
      }
      if (normalizeEvidence(after) === normalizeEvidence(sourceQuote)) {
        throw new Error("chép nguyên tác tiếng Trung vào after");
      }
      assertDialoguePunctuation(sourceQuote, after);
      assertSceneBreaks(before, after);
      assertLockedTerms(sourceQuote, after, lockedTerms);
      const occurrences = content.split(before).length - 1;
      if (occurrences !== 1) throw new Error(`before xuất hiện ${occurrences} lần, cần đúng 1`);
      content = content.replace(before, after);
      acceptedIssues.push(issue);
    } catch (error) {
      rejectedIssues.push({ index: index + 1, reason: error.message, issue });
    }
  }

  let title = String(draftTitle);
  const correctedTitle = String(review.correctedTitle || "").trim();
  if (correctedTitle && correctedTitle !== title) {
    const evidence = String(review.titleSourceQuote || "").trim();
    if (!evidence || !containsEvidence(sourceTitle, evidence)) throw new Error("Bản vá tiêu đề thiếu bằng chứng nguyên tác.");
    title = correctedTitle;
  }
  if (review.decision === "patch" && acceptedIssues.length === 0 && title === String(draftTitle)) {
    const onlySettledRegions = patchHistory.length > 0 && rejectedIssues.length > 0 && rejectedIssues.every((item) =>
      /không thay đổi nội dung|vùng đã có bản vá được chấp nhận/.test(item.reason)
    );
    if (onlySettledRegions) {
      return { title, content, decision: "pass", issues: [], rejectedIssues };
    }
    const first = rejectedIssues[0];
    throw new Error(`Patch ${first?.index || 1} ${first?.reason || "không hợp lệ"}.`);
  }
  return { title, content, decision: review.decision, issues: acceptedIssues, rejectedIssues };
}

function assertNotPatchReversal(sourceQuote, before, after, patchHistory) {
  const normalized = (value) => normalizeEvidence(value).toLocaleLowerCase("vi-VN");
  const quote = normalized(sourceQuote);
  const currentBefore = normalized(before);
  const currentAfter = normalized(after);
  for (const prior of Array.isArray(patchHistory) ? patchHistory : []) {
    const priorQuote = normalized(prior?.sourceQuote);
    if (!priorQuote || (!priorQuote.includes(quote) && !quote.includes(priorQuote))) continue;
    if (normalized(prior?.after) === currentBefore) {
      throw new Error("viết lại vùng đã có bản vá được chấp nhận");
    }
  }
}

function normalizeLockedTerms(lockedTerms) {
  return (Array.isArray(lockedTerms) ? lockedTerms : [])
    .map((term) => ({ source: String(term?.source || "").trim(), target: String(term?.target || "").trim() }))
    .filter((term) => term.source && term.target);
}

function assertLockedTerms(sourceQuote, after, lockedTerms) {
  const quote = normalizeEvidence(sourceQuote);
  const replacement = String(after || "").normalize("NFKC").toLocaleLowerCase("vi-VN");
  for (const term of normalizeLockedTerms(lockedTerms)) {
    if (!quote.includes(normalizeEvidence(term.source))) continue;
    if (!replacement.includes(term.target.normalize("NFKC").toLocaleLowerCase("vi-VN"))) {
      throw new Error(`vi phạm thuật ngữ khóa: ${term.source} phải là ${term.target}`);
    }
  }
}

function assertDialoguePunctuation(sourceQuote, after) {
  const sourceText = String(sourceQuote || "").trim();
  const replacement = String(after || "").trim();
  const sourceStartsDialogue = /^[“「『\"]/.test(sourceText);
  const sourceEndsDialogue = /[”」』\"]\s*[。！？!?]?$/.test(sourceText);
  if (sourceStartsDialogue && !/^[“\"]/.test(replacement)) {
    throw new Error("làm mất dấu mở lời thoại");
  }
  if (sourceEndsDialogue && !/[”\"]\s*[.!?…]*$/.test(replacement)) {
    throw new Error("làm mất dấu đóng lời thoại");
  }
}

function assertSceneBreaks(before, after) {
  const countBreaks = (value) => (String(value || "").match(/(?:\.{4,}|…{2,})/gu) || []).length;
  const beforeBreaks = countBreaks(before);
  const afterBreaks = countBreaks(after);
  if (afterBreaks < beforeBreaks) throw new Error("làm mất dấu ngắt cảnh");
}

function countHan(value) {
  return (String(value || "").match(/[\p{Script=Han}]/gu) || []).length;
}

function normalizeEvidence(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\u200B-\u200D\uFEFF]+/gu, "")
    .replace(/^[“”‘’'"「」『』《》]+|[“”‘’'"「」『』《》]+$/gu, "");
}

function containsEvidence(source, quote) {
  const haystack = normalizeEvidence(source);
  const needle = normalizeEvidence(quote);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  // Gemini sometimes changes Chinese comma/full-stop shapes while copying.
  const punctuationLight = (value) => value.replace(/[，。！？；：、,.!?;:]/gu, "");
  const lightNeedle = punctuationLight(needle);
  return Boolean(lightNeedle) && punctuationLight(haystack).includes(lightNeedle);
}

async function reviewTranslationWithGeminiWeb(input, options = {}) {
  const { translateWithGeminiWeb } = require("./gemini-web");
  const translate = options.translate || translateWithGeminiWeb;
  const configuredAttempts = Number(options.maxValidationAttempts ?? 3);
  const maxValidationAttempts = configuredAttempts <= 0 ? Infinity : Math.max(1, Math.min(100, configuredAttempts));
  let feedback = String(input.validationFeedback || "");
  let lastError;
  for (let attempt = 1; attempt <= maxValidationAttempts; attempt += 1) {
    try {
      const result = await translate(buildWebReviewPrompt({ ...input, validationFeedback: feedback }), {
        profileSlotId: options.profileSlotId,
        direct: true,
        operationTimeoutMs: options.operationTimeoutMs
      });
      return { ...applyWebReview({ ...input, response: result.text }), model: result.model, provider: result.provider, validationAttempts: attempt };
    } catch (error) {
      lastError = error;
      feedback = error.message;
      if (attempt < maxValidationAttempts) {
        const retryDelayMs = Math.min(60_000, Math.max(2000, Number(options.retryDelayMs || 3000)) * Math.min(attempt, 10));
        if (typeof options.onValidationRetry === "function") options.onValidationRetry({ attempt, error, retryDelayMs });
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  throw lastError;
}

module.exports = { buildWebReviewPrompt, applyWebReview, reviewTranslationWithGeminiWeb, containsEvidence, countHan, assertLockedTerms, assertDialoguePunctuation, assertSceneBreaks, assertNotPatchReversal, repairUnescapedJsonQuotes };
