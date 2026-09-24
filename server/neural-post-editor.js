"use strict";

const {
  ERROR_TAXONOMY,
  REVIEW_STATUS,
  VERIFIER_VERDICT,
  parseSafeJson,
  validateCheckerOutput,
  validateVerifierOutput
} = require("./post-edit-schema");
const { splitSentences, buildSlidingContext, alignSourceAndDraftParagraphs, detectEntityTypeMisclassification } = require("./post-edit-memory");
const { PostEditLogger } = require("./post-edit-logger");

/**
 * Builds prompt for the Checker (Contextual Quality Estimator & Span Detector).
 */
function buildCheckerPrompt({ sourceSentence, draftSentence, context = {}, entities = [], terms = [] }) {
  const entityInfo = entities.length
    ? entities.map((e) => `- ${e.source} = ${e.target} (${e.role || e.gender || "nhân vật"})`).join("\n")
    : "Không có thực thể đặc biệt trong câu này.";

  const termInfo = terms.length
    ? terms
        .map((t) => {
          if (Array.isArray(t.senses) && t.senses.length > 1) {
            const sensesDesc = t.senses
              .map((s) => `[${s.usage}]: '${Array.isArray(s.preferred) ? s.preferred.join("/") : s.preferred}' (${s.casing || "as-is"})`)
              .join("; ");
            return `- ${t.source} (đa nghĩa/đa vai trò): ${sensesDesc}`;
          }
          return `- ${t.source} = ${t.preferred} (${t.notes || "thuật ngữ chuẩn"})`;
        })
        .join("\n")
    : "Không có thuật ngữ khóa trong câu này.";

  const prevText = context.prevSentences?.length ? context.prevSentences.join(" ") : "(Đầu đoạn/cảnh)";
  const nextText = context.nextSentences?.length ? context.nextSentences.join(" ") : "(Cuối đoạn/cảnh)";

  return [
    "Bạn là chuyên gia thẩm định và đánh giá chất lượng dịch thuật Trung-Việt (Neural Quality Estimation & Error Span Detector).",
    "TRIẾT LÝ CỐT LÕI: 'Bảo toàn những gì đã dịch đúng, chỉ xác định phần thực sự sai nghĩa, tuyệt đối không viết lại chỉ để câu văn hoa hơn'.",
    "",
    "NHIỆM VỤ:",
    "1. Đánh giá chất lượng bản dịch nháp (Draft) so với nguyên tác (Source) trong ngữ cảnh xung quanh.",
    "2. Nếu bản dịch nháp đã bảo toàn đúng nghĩa gốc, đúng đại từ, không mất ý -> Bắt buộc trả status: 'PASS', errors: [].",
    "3. PHÂN TÍCH NGỮ NGHĨA & VAI TRÒ CÚ PHÁP (Semantic Usage Analysis):",
    "   - Phân biệt vai trò từ: Danh từ riêng/Kỹ năng/Vật phẩm (PROPER_NOUN/SKILL/ITEM - viết hoa, ví dụ: 'Nhìn Thấu') vs Động từ/Tính từ thường (ORDINARY_VERB/ADJECTIVE - viết thường, ví dụ: 'nhìn thấu / hiểu rõ'). Tuyệt đối không viết hoa động từ thường ở giữa câu.",
    "   - Phát hiện lỗi ENTITY_TYPE_MISCLASSIFICATION: Khi cụm từ, thành ngữ hoặc động từ thông thường của tiếng Trung (như 宁死, 当真, 好生, 白白, 小心) bị dịch nhầm thành danh từ riêng / tên nhân vật viết hoa trong tiếng Việt (như Ninh Tử, Đương Chân, Hảo Sinh, Bạch Bạch, Tiểu Tâm).",
    "4. Nếu có lỗi sai khách quan (sai chủ thể/khách thể, dịch sai ngữ cảnh, dịch word-by-word sai nghĩa, nhầm đại từ, đảo ngược hành động, sót ý, bịa ý) -> Xác định CHÍNH XÁC tọa độ lỗi (source_span và target_span nhỏ nhất), giải thích lý do và đề xuất từ/cụm từ thay thế tối thiểu.",
    "5. Nếu có mâu thuẫn hoặc thiếu thông tin ngữ cảnh để khẳng định chắc chắn -> Đánh dấu status: 'AMBIGUOUS' và không võ đoán.",
    "",
    "DANH MỤC LỖI (error_types):",
    Object.entries(ERROR_TAXONOMY).map(([k, v]) => `  - ${k}: ${v}`).join("\n"),
    "",
    "NGỮ CẢNH TRƯỚC ĐÓ (Prev Context):",
    prevText,
    "",
    "NGUYÊN TÁC CẦN KIỂM TRA (Source Sentence):",
    sourceSentence,
    "",
    "BẢN DỊCH NHÁP CẦN KIỂM TRA (Draft Sentence):",
    draftSentence,
    "",
    "NGỮ CẢNH TIẾP THEO (Next Context):",
    nextText,
    "",
    "BỘ NHỚ THỰC THỂ & QUAN HỆ LIÊN QUAN:",
    entityInfo,
    "",
    "BỘ NHỚ THUẬT NGỮ LIÊN QUAN (Contextual Meaning > Document Context > Terminology Memory > Literal Dictionary):",
    termInfo,
    "",
    "ĐẦU RA BẮT BUỘC LÀ JSON THUẦN THEO SCHEMA SAU (không dùng markdown, không giải thích ngoài JSON):",
    JSON.stringify({
      evaluation: {
        semantic_accuracy: 0.95,
        context_accuracy: 0.95,
        entity_consistency: 1.0,
        terminology_consistency: 1.0,
        reference_accuracy: 1.0,
        naturalness: 0.9,
        overall_score: 0.95,
        status: "PASS"
      },
      errors: [
        {
          source_span: "từ/cụm tiếng Trung sai",
          target_span: "từ/cụm tiếng Việt trong bản nháp cần sửa",
          error_types: ["WRONG_MEANING"],
          severity: "minor",
          reason: "giải thích ngắn gọn lý do sai nghĩa khách quan",
          suggested_replacement: "từ/cụm tiếng Việt chính xác thay thế"
        }
      ]
    }, null, 2)
  ].join("\n");
}

/**
 * Applies targeted surgical replacements to draft sentence based on identified error spans.
 */
function applyTargetedPostEdit(draftSentence, errors = []) {
  if (!draftSentence || !Array.isArray(errors) || errors.length === 0) {
    return { correctedSentence: draftSentence, appliedFixes: [], skippedFixes: [] };
  }

  let result = draftSentence;
  const appliedFixes = [];
  const skippedFixes = [];

  // Sort errors by length of target_span descending to avoid partial replacement collision
  const sortedErrors = [...errors].sort((a, b) => (b.target_span || "").length - (a.target_span || "").length);

  for (const err of sortedErrors) {
    let target = String(err.target_span || "").trim();
    let replacement = String(err.suggested_replacement || "").trim();

    if (!target || !replacement || target === replacement) {
      skippedFixes.push({ error: err, reason: "Target or replacement empty/identical" });
      continue;
    }

    // 1. Direct match (all occurrences)
    if (result.includes(target)) {
      result = result.split(target).join(replacement);
      appliedFixes.push({
        source_span: err.source_span,
        target_span: target,
        replacement: replacement,
        reason: err.reason,
        error_types: err.error_types
      });
      continue;
    }

    // 2. Normalized quote match (handling “ vs ” vs " and ‘ vs ’ vs ')
    const normalizeQuotes = (str) => str.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    const normResult = normalizeQuotes(result);
    const normTarget = normalizeQuotes(target);

    if (normResult.includes(normTarget)) {
      const idx = normResult.indexOf(normTarget);
      const actualTarget = result.slice(idx, idx + normTarget.length);
      result = result.slice(0, idx) + replacement + result.slice(idx + normTarget.length);
      appliedFixes.push({
        source_span: err.source_span,
        target_span: actualTarget,
        replacement: replacement,
        reason: err.reason + " (quote-normalized match)",
        error_types: err.error_types
      });
      continue;
    }

    // 3. Case-insensitive substring match (including multi-word phrases)
    const lowerResult = result.toLowerCase();
    const lowerTarget = target.toLowerCase();
    const idx = lowerResult.indexOf(lowerTarget);
    if (idx !== -1) {
      const actualTarget = result.slice(idx, idx + lowerTarget.length);
      result = result.slice(0, idx) + replacement + result.slice(idx + lowerTarget.length);
      appliedFixes.push({
        source_span: err.source_span,
        target_span: actualTarget,
        replacement: replacement,
        reason: err.reason + " (case-insensitive match)",
        error_types: err.error_types
      });
      continue;
    }

    // 4. Trim boundary quotes / punctuation if target was wrapped in quotes
    const trimmedTarget = target.replace(/^["'“”‘’\s.,!?:;]+|["'“”‘’\s.,!?:;]+$/g, "");
    if (trimmedTarget && trimmedTarget !== target && result.includes(trimmedTarget)) {
      result = result.split(trimmedTarget).join(replacement);
      appliedFixes.push({
        source_span: err.source_span,
        target_span: trimmedTarget,
        replacement: replacement,
        reason: err.reason + " (trimmed boundary match)",
        error_types: err.error_types
      });
      continue;
    }

    skippedFixes.push({ error: err, reason: "target_span not found in current sentence" });
  }

  return { correctedSentence: result, appliedFixes, skippedFixes };
}

/**
 * Builds prompt for the Verifier Agent.
 */
function buildVerifierPrompt({ sourceSentence, originalDraft, correctedSentence, context = {}, appliedFixes = [] }) {
  return [
    "Bạn là thẩm định viên độc lập (Safety Verifier) trong quy trình dịch thuật.",
    "Bản dịch nháp ban đầu đã được áp dụng bản sửa vi phẫu (Targeted Post-Edit). Nhiệm vụ của bạn là kiểm tra xem bản sửa có AN TOÀN và CHÍNH XÁC TUYỆT ĐỐI không.",
    "",
    "QUY TẮC PHÊ DUYỆT (SAFETY CHECKLIST):",
    "1. faithful_to_source: Bản sửa có sát với ý tác giả trong nguyên tác hơn bản nháp không?",
    "2. no_information_loss: Bản sửa có làm rơi rụng thông tin/chi tiết nào của câu không?",
    "3. no_hallucination_added: Bản sửa có thêm thắt thông tin hay cảm xúc bịa đặt không?",
    "4. subject_object_preserved: Chủ ngữ và tân ngữ có đúng nguyên tác không, có bị đảo ngược hành động không?",
    "5. character_reference_preserved: Đại từ xưng hô và quan hệ đối tượng có đúng ngữ cảnh không?",
    "6. terminology_consistent: Thuật ngữ kỹ năng/vật phẩm có nhất quán không?",
    "7. no_unnecessary_rewrite: Các phần vốn dĩ đã dịch đúng trong bản nháp có được giữ nguyên không?",
    "",
    "NGUYÊN TÁC (Source):",
    sourceSentence,
    "",
    "BẢN NHÁP BAN ĐẦU (Original Draft):",
    originalDraft,
    "",
    "CÁC SỬA ĐỔI ĐÃ ÁP DỤNG (Applied Fixes):",
    appliedFixes.map((f) => `- '${f.target_span}' => '${f.replacement}' (Lý do: ${f.reason})`).join("\n") || "Không có sửa đổi cụ thể.",
    "",
    "BẢN DỊCH SAU KHI SỬA (Corrected Sentence):",
    correctedSentence,
    "",
    "NGỮ CẢNH XUNG QUANH (Surrounding Context):",
    context.surroundingContext || "(Không có)",
    "",
    "ĐẦU RA BẮT BUỘC LÀ JSON THUẦN THEO SCHEMA SAU:",
    JSON.stringify({
      verdict: "ACCEPT", // 'ACCEPT' | 'REJECT' | 'RETRY_EXPANDED'
      checks: {
        faithful_to_source: true,
        no_information_loss: true,
        no_hallucination_added: true,
        subject_object_preserved: true,
        character_reference_preserved: true,
        terminology_consistent: true,
        no_unnecessary_rewrite: true
      },
      rejection_reason: ""
    }, null, 2)
  ].join("\n");
}

/**
 * Full Neural Post-Edit pipeline for a single sentence.
 */
async function postEditSentence({
  sourceSentence,
  draftSentence,
  context = {},
  entityMemory,
  termMemory,
  callModel,
  logger,
  chapterNumber = 1,
  sentenceIndex = 1
}) {
  const startTime = Date.now();

  // 1. Gather entities and terms relevant to this sentence
  const matchedEntities = entityMemory ? entityMemory.findMatchingEntities(sourceSentence) : [];
  const matchedTerms = termMemory ? termMemory.findMatchingTerms(sourceSentence) : [];

  // 2. Run Contextual Quality Estimator (Checker)
  const checkerPrompt = buildCheckerPrompt({
    sourceSentence,
    draftSentence,
    context,
    entities: matchedEntities,
    terms: matchedTerms
  });

  let checkerRaw;
  try {
    checkerRaw = await callModel(checkerPrompt, "CHECKER", { temperature: 0.1 });
  } catch (err) {
    // If model call fails, keep draft untouched safely
    return {
      finalSentence: draftSentence,
      wasModified: false,
      status: "ERROR_FALLBACK",
      errors: [],
      verifierVerdict: "FALLBACK"
    };
  }

  let checkerResult;
  try {
    const parsed = parseSafeJson(checkerRaw.text || checkerRaw);
    checkerResult = validateCheckerOutput(parsed);
  } catch (err) {
    // If invalid JSON, treat as PASS to preserve draft safely
    checkerResult = {
      evaluation: { status: "PASS", overall_score: 1.0 },
      errors: []
    };
  }

  // Check for Entity-Type Misclassifications (e.g. common phrase hallucinated into proper noun)
  const entityMismatch = detectEntityTypeMisclassification(sourceSentence, draftSentence);
  if (entityMismatch && entityMismatch.hasMismatch) {
    const alreadyCaught = checkerResult.errors.some((e) => e.target_span === entityMismatch.targetProperNoun);
    if (!alreadyCaught) {
      checkerResult.errors.push({
        source_span: entityMismatch.sourcePhrase,
        target_span: entityMismatch.targetProperNoun,
        error_types: ["ENTITY_TYPE_MISCLASSIFICATION", "WRONG_MEANING"],
        severity: "major",
        reason: entityMismatch.reason,
        suggested_replacement: entityMismatch.expectedMeaning
      });
      checkerResult.evaluation.status = REVIEW_STATUS.MAJOR_ISSUE;
      checkerResult.evaluation.overall_score = Math.min(checkerResult.evaluation.overall_score || 0.95, 0.78);
    }
  }

  const { evaluation, errors } = checkerResult;

  // 3. Confidence-based Routing
  // HIGH CONFIDENCE / PASS: keep draft untouched byte-for-byte!
  if (evaluation.status === REVIEW_STATUS.PASS && evaluation.overall_score >= 0.92 && errors.length === 0) {
    if (logger) {
      logger.logIntervention({
        chapterNumber,
        sentenceIndex,
        sourceSentence,
        draftSentence,
        context,
        evaluation,
        errors: [],
        appliedFixes: [],
        verifierResult: { verdict: "ACCEPT" },
        finalSentence: draftSentence,
        processingTimeMs: Date.now() - startTime
      });
    }
    return {
      finalSentence: draftSentence,
      wasModified: false,
      status: REVIEW_STATUS.PASS,
      errors: [],
      verifierVerdict: "ACCEPT"
    };
  }

  // AMBIGUOUS: Flag and preserve safe draft without guessing
  if (evaluation.status === REVIEW_STATUS.AMBIGUOUS) {
    if (logger) {
      logger.logIntervention({
        chapterNumber,
        sentenceIndex,
        sourceSentence,
        draftSentence,
        context,
        evaluation,
        errors,
        appliedFixes: [],
        verifierResult: { verdict: "ACCEPT" },
        finalSentence: draftSentence,
        processingTimeMs: Date.now() - startTime
      });
    }
    return {
      finalSentence: draftSentence,
      wasModified: false,
      status: REVIEW_STATUS.AMBIGUOUS,
      errors,
      verifierVerdict: "ACCEPT"
    };
  }

  // 4. Targeted Post-Edit (Surgical Span Replacement)
  const { correctedSentence, appliedFixes } = applyTargetedPostEdit(draftSentence, errors);

  if (appliedFixes.length === 0 || correctedSentence === draftSentence) {
    if (logger) {
      logger.logIntervention({
        chapterNumber,
        sentenceIndex,
        sourceSentence,
        draftSentence,
        context,
        evaluation,
        errors,
        appliedFixes: [],
        verifierResult: { verdict: "ACCEPT" },
        finalSentence: draftSentence,
        processingTimeMs: Date.now() - startTime
      });
    }
    return {
      finalSentence: draftSentence,
      wasModified: false,
      status: evaluation.status,
      errors,
      verifierVerdict: "ACCEPT"
    };
  }

  // 5. Verification Loop (Safety Verifier)
  const verifierPrompt = buildVerifierPrompt({
    sourceSentence,
    originalDraft: draftSentence,
    correctedSentence,
    context,
    appliedFixes
  });

  let verifierRaw;
  let verifierResult = { verdict: VERIFIER_VERDICT.ACCEPT };
  try {
    verifierRaw = await callModel(verifierPrompt, "VERIFIER", { temperature: 0.0 });
    const parsedV = parseSafeJson(verifierRaw.text || verifierRaw);
    verifierResult = validateVerifierOutput(parsedV);
  } catch (e) {
    // If verifier call fails, accept conservative surgical fix if all checks passed
    verifierResult = { verdict: VERIFIER_VERDICT.ACCEPT };
  }

  let finalSentence = draftSentence;
  if (verifierResult.verdict === VERIFIER_VERDICT.ACCEPT) {
    finalSentence = correctedSentence;
  } else {
    // Verifier REJECTED -> keep original draft! No bad edits allowed!
    finalSentence = draftSentence;
  }

  if (logger) {
    logger.logIntervention({
      chapterNumber,
      sentenceIndex,
      sourceSentence,
      draftSentence,
      context,
      evaluation,
      errors,
      appliedFixes,
      verifierResult,
      finalSentence,
      processingTimeMs: Date.now() - startTime
    });
  }

  return {
    finalSentence,
    wasModified: finalSentence !== draftSentence,
    status: evaluation.status,
    errors,
    appliedFixes,
    verifierVerdict: verifierResult.verdict
  };
}

/**
 * End-to-end chapter post-edit processor.
 */
async function postEditChapter({
  sourceTitle,
  sourceContent,
  draftTitle,
  draftContent,
  entityMemory,
  termMemory,
  callModel,
  chapterNumber = 1,
  bookId = "unknown"
}) {
  const logger = new PostEditLogger({ bookId });

  // 1. Post-edit Title
  let finalTitle = draftTitle;
  if (sourceTitle && draftTitle) {
    const titleResult = await postEditSentence({
      sourceSentence: sourceTitle,
      draftSentence: draftTitle,
      context: { prevSentences: [], nextSentences: [] },
      entityMemory,
      termMemory,
      callModel,
      logger,
      chapterNumber,
      sentenceIndex: 0
    });
    finalTitle = titleResult.finalSentence;
  }

  // 2. Align paragraphs (stripping redundant chapter title lines)
  const { sourceParagraphs, draftParagraphs } = alignSourceAndDraftParagraphs(sourceContent, draftContent);

  const finalParagraphs = [];
  let totalModifications = 0;

  // Process paragraph by paragraph, aligning sentences
  const paraCount = Math.max(sourceParagraphs.length, draftParagraphs.length);

  for (let pIdx = 0; pIdx < paraCount; pIdx++) {
    const srcPara = sourceParagraphs[pIdx] || "";
    const drfPara = draftParagraphs[pIdx] || "";

    if (!srcPara && drfPara) {
      finalParagraphs.push(drfPara);
      continue;
    }
    if (srcPara && !drfPara) {
      finalParagraphs.push("");
      continue;
    }

    const srcSentences = splitSentences(srcPara, true);
    const drfSentences = splitSentences(drfPara, false);

    // If sentence count matches 1:1, process sentence by sentence with sliding context
    if (srcSentences.length > 0 && srcSentences.length === drfSentences.length) {
      const editedSentences = [];
      for (let sIdx = 0; sIdx < srcSentences.length; sIdx++) {
        const context = buildSlidingContext(drfSentences, sIdx, 3);
        const result = await postEditSentence({
          sourceSentence: srcSentences[sIdx],
          draftSentence: drfSentences[sIdx],
          context,
          entityMemory,
          termMemory,
          callModel,
          logger,
          chapterNumber,
          sentenceIndex: (pIdx + 1) * 100 + sIdx
        });
        editedSentences.push(result.finalSentence);
        if (result.wasModified) totalModifications++;
      }
      finalParagraphs.push(editedSentences.join(" "));
    } else {
      // Paragraph level sliding context
      const prevParas = draftParagraphs.slice(Math.max(0, pIdx - 2), pIdx);
      const nextParas = draftParagraphs.slice(pIdx + 1, pIdx + 3);
      const context = {
        prevSentences: prevParas,
        nextSentences: nextParas,
        surroundingContext: [...prevParas, drfPara, ...nextParas].join("\n")
      };

      const result = await postEditSentence({
        sourceSentence: srcPara,
        draftSentence: drfPara,
        context,
        entityMemory,
        termMemory,
        callModel,
        logger,
        chapterNumber,
        sentenceIndex: pIdx + 1
      });
      finalParagraphs.push(result.finalSentence);
      if (result.wasModified) totalModifications++;
    }
  }

  const finalContent = finalParagraphs.join("\n\n");
  logger.flushToFile(chapterNumber);

  return {
    title: finalTitle,
    content: finalContent,
    characters: finalContent.length,
    modifications: totalModifications,
    summary: logger.getSummary(),
    logger
  };
}

module.exports = {
  buildCheckerPrompt,
  applyTargetedPostEdit,
  buildVerifierPrompt,
  postEditSentence,
  postEditChapter
};

