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
  ACTION_STRIKE: "ACTION_STRIKE",             // Đòn đánh tay không, chưởng pháp, quyền pháp
  ACTION_MOVE: "ACTION_MOVE",                 // Thân pháp, bộ pháp, né tránh, di chuyển
  ACTION_DAMAGE: "ACTION_DAMAGE",             // Phản hồi sát thương, thổ huyết, bị đánh văng
  WEAPON_DRAW: "WEAPON_DRAW",                 // Tuốt kiếm, rút đao, triệu hồi pháp bảo
  WEAPON_STRIKE: "WEAPON_STRIKE",             // Chiêu thức vũ khí, kiếm quang, đao khí
  WEAPON_INTENT: "WEAPON_INTENT",             // Kiếm ý, kiếm tâm, nhân kiếm hợp nhất
  TEA_PREPARATION: "TEA_PREPARATION",         // Pha trà, đun nước, nâng chén, đặt chén
  TEA_DISCOURSE: "TEA_DISCOURSE",             // Thưởng trà luận đạo, đàm đạo thế sự
  ZEN_STATE: "ZEN_STATE",                     // Tâm cảnh thanh tịnh, đốn ngộ, rũ bỏ bụi trần

  // Wave A Style Slots
  ALCHEMY_AROMA: "ALCHEMY_AROMA",             // Hương thơm đan dược, dược hương
  ALCHEMY_FLAME: "ALCHEMY_FLAME",             // Luyện đan, hỏa diễm, lò đan
  ALCHEMY_POTENCY: "ALCHEMY_POTENCY",         // Ngưng đan, đan văn, dược lực
  BEAST_CONTRACT: "BEAST_CONTRACT",           // Trận pháp khế ước linh thú, huyết khế
  BEAST_ROAR: "BEAST_ROAR",                   // Hung thú gầm thét, yêu khí cuồn cuộn
  BEAST_EVOLUTION: "BEAST_EVOLUTION",         // Linh thú tiến giai, huyết mạch áp chế
  CULINARY_DELICACY: "CULINARY_DELICACY",     // Mỹ tửu, trân tu mỹ vị, bàn tiệc
  CULINARY_SENSATION: "CULINARY_SENSATION",   // Cảm giác vị giác, vào miệng tan chảy, chén tạc chén thù
  CYBER_INTERFACE: "CYBER_INTERFACE",         // Giao diện thần kinh não bộ, thực tế ảo
  CYBER_MECHA: "CYBER_MECHA",                 // Cơ giáp chiến đấu, hình chiếu 3D, nghĩa thể
  ARRAY_NODE: "ARRAY_NODE",                   // Trận nhãn, kích hoạt đại trận, bát quái xoay vần
  TALISMAN_ACTIVATION: "TALISMAN_ACTIVATION", // Bùa chú tự bốc cháy, phù lục, phù văn lưu chuyển
  INSCRIPTION_LEGACY: "INSCRIPTION_LEGACY",   // Ngọc giản ghi lại, bia đá cổ, lạc ấn truyền thừa
  MERIDIAN_ACUPOINT: "MERIDIAN_ACUPOINT",     // Ngân châm phong huyệt, khai thông kinh mạch
  HEALING_PURGE: "HEALING_PURGE",             // Bức xuất độc tố, khí huyết bình phục
  NECROPOLIS_ATMOSPHERE: "NECROPOLIS_ATMOSPHERE", // Cổ mộ, quan quách ngàn năm, thi khí, cạm bẫy
  SOUL_TOKEN_STATE: "SOUL_TOKEN_STATE",       // Mệnh bài nứt vỡ, hồn đăng phụt tắt, tổ miếu chấn động
  SPATIAL_VOID: "SPATIAL_VOID",               // Khe nứt không gian, hư không sụp đổ, bí cảnh khai mở
  AUCTION_EVENT: "AUCTION_EVENT"              // Toàn trường tĩnh lặng, tiếng búa chốt giá, giá trên trời
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
