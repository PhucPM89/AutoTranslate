"use strict";

/**
 * Stylist Contribution Schema & Contracts (Phase 2A)
 * 
 * Defines the immutable contract for stylistic contributions proposed by domain providers
 * targeting specific Semantic Slots (StyleSlot).
 */

const { createSemanticSignature } = require("../contracts");

// Canonical Style Slots
const STYLE_SLOTS = Object.freeze({
  ACTION_STRIKE: "ACTION_STRIKE",       // Đòn đánh tay không, chưởng pháp, quyền pháp
  ACTION_MOVE: "ACTION_MOVE",           // Thân pháp, bộ pháp, né tránh, di chuyển
  ACTION_DAMAGE: "ACTION_DAMAGE",       // Phản hồi sát thương, thổ huyết, bị đánh văng
  WEAPON_DRAW: "WEAPON_DRAW",           // Tuốt kiếm, rút đao, triệu hồi pháp bảo
  WEAPON_STRIKE: "WEAPON_STRIKE",       // Chiêu thức vũ khí, kiếm quang, đao khí
  WEAPON_INTENT: "WEAPON_INTENT",       // Kiếm ý, kiếm tâm, nhân kiếm hợp nhất
  TEA_PREPARATION: "TEA_PREPARATION",   // Pha trà, đun nước, nâng chén, đặt chén
  TEA_DISCOURSE: "TEA_DISCOURSE",       // Thưởng trà luận đạo, đàm đạo thế sự
  ZEN_STATE: "ZEN_STATE"                // Tâm cảnh thanh tịnh, đốn ngộ, rũ bỏ bụi trần
});

/**
 * Creates an immutable StylistContribution.
 * 
 * @param {Object} spec
 * @returns {Object} StylistContribution
 */
function createStylistContribution({
  providerId = "",
  domain = "NEUTRAL",
  targetSlot = STYLE_SLOTS.ACTION_STRIKE,
  sourceSpanZh = "",
  candidateVi = "",
  semanticRequirements = {},
  semanticSignature = null,
  tone = "NEUTRAL", // FIERCE | SERENE | ELEVATED | NEUTRAL
  register = "VERNACULAR", // CLASSICAL_LITERARY | VERNACULAR | CASUAL_SPOKEN | SOLEMN_DECREE
  rhythmPreference = "FLOWING_BALANCED", // FAST_PUNCHY | FLOWING_BALANCED | LONG_LYRICAL
  lexicalPriority = 0.80,
  confidence = 1.0,
  forbiddenContexts = [],
  semanticExpansionCost = 0.0, // 0.0 (exact) to 1.0 (heavy expansion)
  introducedInformation = [],
  introducedMetaphor = false,
  introducedEmotion = null,
  provenance = ""
} = {}) {
  return Object.freeze({
    providerId: String(providerId),
    domain: String(domain),
    targetSlot: String(targetSlot),
    sourceSpanZh: String(sourceSpanZh || ""),
    candidateVi: String(candidateVi || "").trim(),
    semanticRequirements: Object.freeze({ ...semanticRequirements }),
    semanticSignature: semanticSignature || createSemanticSignature(),
    tone,
    register,
    rhythmPreference,
    lexicalPriority: Number(lexicalPriority.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    forbiddenContexts: Object.freeze([...forbiddenContexts]),
    semanticExpansionCost: Number(semanticExpansionCost.toFixed(3)),
    introducedInformation: Object.freeze([...introducedInformation]),
    introducedMetaphor: Boolean(introducedMetaphor),
    introducedEmotion: introducedEmotion ? String(introducedEmotion) : null,
    provenance: String(provenance || "")
  });
}

module.exports = {
  STYLE_SLOTS,
  createStylistContribution
};
