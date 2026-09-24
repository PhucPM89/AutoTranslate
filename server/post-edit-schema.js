"use strict";

/**
 * Neural Post-Editing Schema & Error Taxonomy
 * Defines standards for Quality Estimation, Error Span Detection, Targeted Editing, and Verification.
 */

const ERROR_TAXONOMY = {
  WRONG_MEANING: "Sai nghĩa từ/câu so với ngữ cảnh thực tế của tiểu thuyết",
  MISSING_INFORMATION: "Bỏ sót thông tin, tình tiết, số lượng hoặc trạng từ so với bản gốc",
  ADDED_INFORMATION: "Tự ý thêm thông tin, chi tiết hoặc cảm xúc không có trong nguyên tác",
  WRONG_SUBJECT: "Xác định sai chủ ngữ/chủ thể thực hiện hành động",
  WRONG_OBJECT: "Xác định sai tân ngữ/đối tượng tiếp nhận hành động",
  WRONG_PRONOUN: "Sai đại từ xưng hô (ta, ngươi, hắn, nàng, cô, nó...)",
  WRONG_REFERENCE: "Sai quan hệ chỉ định vị trí/đối tượng (ví dụ: bên cạnh ngươi bị dịch thành bên cạnh ta)",
  WRONG_TENSE_OR_ASPECT: "Sai thì hoặc trạng thái hoàn thành/tiếp diễn",
  IDIOM_MISTRANSLATION: "Dịch sai điển tích, thành ngữ, quán dụng ngữ Trung Quốc",
  LITERAL_TRANSLATION: "Dịch thô từng chữ (word-by-word) làm gượng gạo hoặc vô nghĩa",
  TERMINOLOGY_INCONSISTENCY: "Không nhất quán với bảng thuật ngữ đã thiết lập của tiểu thuyết",
  ENTITY_INCONSISTENCY: "Tên nhân vật, tổ chức, địa danh bị sai lệch hoặc biến dị",
  CHARACTER_INCONSISTENCY: "Tính cách, cách xưng hô của nhân vật bị mâu thuẫn trong ngữ cảnh",
  RELATIONSHIP_INCONSISTENCY: "Mối quan hệ nhân vật (sư đồ, huynh đệ, thù địch) bị lộn ngược",
  LITERARY_NUANCE: "Lệch sắc thái thể loại (kinh dị sinh tồn, hệ thống, tu chân...)",
  AWKWARD_VIETNAMESE: "Ngữ pháp gượng gạo, văn phong convert nặng",
  ENTITY_TYPE_MISCLASSIFICATION: "Nhầm lẫn loại thực thể: cụm từ/động từ/tính từ thường bị biến thành danh từ riêng, tên nhân vật, tên kỹ năng hoặc ngược lại"
};

const ERROR_SEVERITY = {
  MINOR: "minor",
  MAJOR: "major",
  CRITICAL: "critical"
};

const REVIEW_STATUS = {
  PASS: "PASS",
  MINOR_ISSUE: "MINOR_ISSUE",
  MAJOR_ISSUE: "MAJOR_ISSUE",
  CRITICAL_ISSUE: "CRITICAL_ISSUE",
  AMBIGUOUS: "AMBIGUOUS"
};

const REVIEW_PROVENANCE = {
  UNLABELED: "UNLABELED",
  HUMAN_REVIEWED: "HUMAN_REVIEWED",
  ADJUDICATED: "ADJUDICATED"
};

const VERIFIER_VERDICT = {
  ACCEPT: "ACCEPT",
  REJECT: "REJECT",
  RETRY_EXPANDED: "RETRY_EXPANDED"
};

/**
 * Repairs unescaped double quotes inside JSON strings.
 */
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

/**
 * Extracts and parses JSON safely from model response.
 */
function parseSafeJson(text) {
  if (!text) throw new Error("Empty response for JSON parsing");
  let cleaned = String(text).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (initialError) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in response: " + initialError.message);
    const jsonStr = match[0];
    try {
      return JSON.parse(jsonStr);
    } catch {
      try {
        return JSON.parse(repairUnescapedJsonQuotes(jsonStr));
      } catch (repairError) {
        throw new Error(`Failed to parse JSON even after repair: ${repairError.message}`);
      }
    }
  }
}

/**
 * Validates Checker/QE response schema.
 */
function validateCheckerOutput(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Checker output must be an object");
  const evalObj = obj.evaluation || {};
  const status = String(evalObj.status || obj.status || "PASS").toUpperCase();
  if (!Object.values(REVIEW_STATUS).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const errors = Array.isArray(obj.errors) ? obj.errors : [];
  for (const [idx, err] of errors.entries()) {
    if (!err || typeof err !== "object") throw new Error(`Error at index ${idx} must be an object`);
    if (!err.source_span && !err.target_span) {
      throw new Error(`Error at index ${idx} must have source_span or target_span`);
    }
  }

  return {
    evaluation: {
      semantic_accuracy: Math.max(0, Math.min(1, Number(evalObj.semantic_accuracy ?? 1.0))),
      context_accuracy: Math.max(0, Math.min(1, Number(evalObj.context_accuracy ?? 1.0))),
      entity_consistency: Math.max(0, Math.min(1, Number(evalObj.entity_consistency ?? 1.0))),
      terminology_consistency: Math.max(0, Math.min(1, Number(evalObj.terminology_consistency ?? 1.0))),
      reference_accuracy: Math.max(0, Math.min(1, Number(evalObj.reference_accuracy ?? 1.0))),
      naturalness: Math.max(0, Math.min(1, Number(evalObj.naturalness ?? 1.0))),
      overall_score: Math.max(0, Math.min(1, Number(evalObj.overall_score ?? 1.0))),
      status
    },
    errors: errors.map((err) => ({
      source_span: String(err.source_span || "").trim(),
      target_span: String(err.target_span || "").trim(),
      error_types: Array.isArray(err.error_types) ? err.error_types : (err.error_type ? [err.error_type] : ["WRONG_MEANING"]),
      severity: String(err.severity || "minor").toLowerCase(),
      reason: String(err.reason || "").trim(),
      suggested_replacement: String(err.suggested_replacement || err.replacement || "").trim()
    }))
  };
}

/**
 * Validates Verifier response schema.
 */
function validateVerifierOutput(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Verifier output must be an object");
  const verdict = String(obj.verdict || "ACCEPT").toUpperCase();
  if (!Object.values(VERIFIER_VERDICT).includes(verdict)) {
    throw new Error(`Invalid verifier verdict: ${verdict}`);
  }
  const checks = obj.checks || {};
  return {
    verdict,
    checks: {
      faithful_to_source: Boolean(checks.faithful_to_source ?? true),
      no_information_loss: Boolean(checks.no_information_loss ?? true),
      no_hallucination_added: Boolean(checks.no_hallucination_added ?? true),
      subject_object_preserved: Boolean(checks.subject_object_preserved ?? true),
      character_reference_preserved: Boolean(checks.character_reference_preserved ?? true),
      terminology_consistent: Boolean(checks.terminology_consistent ?? true),
      no_unnecessary_rewrite: Boolean(checks.no_unnecessary_rewrite ?? true)
    },
    rejection_reason: String(obj.rejection_reason || "").trim()
  };
}

module.exports = {
  ERROR_TAXONOMY,
  ERROR_SEVERITY,
  REVIEW_STATUS,
  REVIEW_PROVENANCE,
  VERIFIER_VERDICT,
  repairUnescapedJsonQuotes,
  parseSafeJson,
  validateCheckerOutput,
  validateVerifierOutput
};

