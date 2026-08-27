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
  AUCTION_EVENT: "AUCTION_EVENT",             // Toàn trường tĩnh lặng, tiếng búa chốt giá, giá trên trời

  // Wave B Style Slots (Semantic State & Environment)
  APOCALYPSE_HORDE: "APOCALYPSE_HORDE",       // Tang thi cuồng triều, mạt thế phế thổ
  GENETIC_LIMIT: "GENETIC_LIMIT",             // Phá vỡ khóa gen, tinh hạch dị thú
  ELEMENTAL_AWAKENING: "ELEMENTAL_AWAKENING", // Dị năng thức tỉnh, bùng nổ sức mạnh
  COSMIC_CHESS_BOARD: "COSMIC_CHESS_BOARD",   // Thiên địa vi bàn, chúng sinh vi tử
  CHESS_STRATEGY_MOVE: "CHESS_STRATEGY_MOVE", // Hạ cờ không hối, thắng bại đã phân, bỏ xe giữ tướng
  DIVINE_SENSE_SCAN: "DIVINE_SENSE_SCAN",     // Thần thức quét qua, thần niệm như triều
  SOUL_PRESSURE: "SOUL_PRESSURE",             // Uy áp giáng lâm, thức hải chấn động, linh hồn đau đớn
  DOMAIN_EXPANSION: "DOMAIN_EXPANSION",       // Lĩnh vực tuyệt đối mở rộng
  ELDRITCH_HORROR: "ELDRITCH_HORROR",         // Bất khả danh trạng, lời thì thầm điên loạn
  FORBIDDEN_GAZE: "FORBIDDEN_GAZE",           // Nhìn thẳng thần minh, chứng kiến cấm kỵ
  SANITY_COLLAPSE: "SANITY_COLLAPSE",         // Lý trí sụp đổ, ô nhiễm biến dị
  ELEGY_SOUL_CALL: "ELEGY_SOUL_CALL",         // Hồn quy lai hề, ngậm cười chín suối, âm dương cách biệt
  ELEGY_HEROIC_SPIRIT: "ELEGY_HEROIC_SPIRIT", // Anh hồn bất diệt, âm dung uyển tại
  FORENSIC_MYSTERY: "FORENSIC_MYSTERY",       // Án mạng mật thất, bằng chứng ngoại phạm, dấu vết tơ nhện
  FORENSIC_TRUTH: "FORENSIC_TRUTH",           // Chân tướng đại bạch
  GRIMOIRE_CURSE: "GRIMOIRE_CURSE",           // Ma pháp cấm chú, ma lực cuộn trào
  MAGIC_INCANTATION: "MAGIC_INCANTATION",     // Ngâm xướng chú ngữ, ma pháp trận, ma đạo thư
  IMPERIAL_PROCLAMATION: "IMPERIAL_PROCLAMATION", // Phụng thiên thừa vận, khâm thử
  IMPERIAL_SALUTATION: "IMPERIAL_SALUTATION", // Lãnh chỉ tạ ân, vạn tuế, đệ trình quốc thư
  KARMA_SAMSARA: "KARMA_SAMSARA",             // Tơ nhân quả, chém đứt nghiệp duyên, chín kiếp luân hồi
  DESTINED_DUEL: "DESTINED_DUEL",             // Túc huệ thức tỉnh, trận đấu định mệnh
  MANTRA_SEAL: "MANTRA_SEAL",                 // Bấm quyết niệm chú, miệng tụng chân ngôn, kết thủ ấn
  WORD_AS_LAW: "WORD_AS_LAW",                 // Ngôn xuất pháp tùy
  MUSICAL_PERFORMANCE: "MUSICAL_PERFORMANCE", // Tiếng đàn du dương, gảy dây đàn, Cao Sơn Lưu Thủy, khúc chung nhân tán
  MUSICAL_ATTACK: "MUSICAL_ATTACK",           // Âm ba giết địch, sóng âm hóa kiếm
  SUPERNATURAL_SPECTER: "SUPERNATURAL_SPECTER", // Lệ quỷ áo đỏ, mắt âm dương, minh hôn
  TAOIST_EXORCISM: "TAOIST_EXORCISM",         // Kiếm gỗ đào, máu chó mực, phù chú trừ tà
  NETHERWORLD_PARADE: "NETHERWORLD_PARADE",   // Âm binh mượn đường, thi biến cương thi
  TOPOGRAPHY_LANDSCAPE: "TOPOGRAPHY_LANDSCAPE", // Linh khí hóa vụ, mây mù đỉnh núi, động thiên phúc địa, vách đá
  SEVERED_VITALITY: "SEVERED_VITALITY",       // Sinh cơ đoạn tuyệt, tử khí ngập trời
  TRANSCENDENCE_TIME: "TRANSCENDENCE_TIME",   // Búng tay ngàn năm, cảnh còn người mất, nhìn hết phồn hoa
  SOLITARY_DAO: "SOLITARY_DAO",               // Đại đạo độc hành
  TRIBULATION_LIGHTNING: "TRIBULATION_LIGHTNING", // Mây kiếp cuồn cuộn, Tử Tiêu Thần Lôi, thiên kiếp giáng lâm
  CELESTIAL_PHENOMENON: "CELESTIAL_PHENOMENON", // Thiên địa dị tượng, vạn đạo ráng mây, đạo âm ngân vang
  REALM_BREAKTHROUGH: "REALM_BREAKTHROUGH",   // Phá vỡ bình cảnh, tâm ma xâm thực
  WAR_DRUMS: "WAR_DRUMS",                     // Trống trận dồn dập, chiêng thu quân
  WARFARE_CHARGE: "WARFARE_CHARGE",           // Thiên quân vạn mã xung phong, khói lửa ngập trời
  BLOODY_BATTLEFIELD: "BLOODY_BATTLEFIELD",   // Quyết tử huyết chiến sa trường
  TEMPORAL_MEASURE: "TEMPORAL_MEASURE",       // Ước lượng thời lượng cổ trang (nén nhang, tuần trà, nhịp thở, canh giờ)
  SOUNDSCAPE_EFFECT: "SOUNDSCAPE_EFFECT",     // Từ tượng thanh, âm thanh va chạm, nổ vang, rắc, phụt, keng, gió rít
  ATMOSPHERIC_DETAIL: "ATMOSPHERIC_DETAIL",   // Chi tiết cảm giác, ánh trăng, hương thơm, sương mù linh khí, hàn ý
  SOCIAL_ADDRESS: "SOCIAL_ADDRESS",           // Xưng hô đối thoại tôn ti, sư đồ, quân thần, tiền bối - vãn bối
  TITLE_HONORIFIC: "TITLE_HONORIFIC",         // Tôn xưng, chức vị tông môn, quan tước triều đình
  INNER_MONOLOGUE: "INNER_MONOLOGUE",         // Độc thoại nội tâm, suy tính thầm kín, cảm xúc nội tâm
  BANTER_RETORT: "BANTER_RETORT",             // Lời thoại mỉa mai, chế giễu, khiêu khích có Speaker+Listener+Relationship đã resolved
  MODERN_VERNACULAR: "MODERN_VERNACULAR",     // Localise urban slang, gaming, internet meme sang tiếng Việt
  AESTHETIC_ELEGANCE: "AESTHETIC_ELEGANCE"    // Nét thanh tao, dung mạo, xiêm y, thần thái cổ phong của mỹ nhân
});

const {
  SEMANTIC_ROLES,
  SEMANTIC_TYPES,
  REALIZATION_DIMENSIONS,
  CONFLICT_POLICIES,
  STYLE_SLOT_DEFINITIONS,
  PROVIDER_SLOT_COMPATIBILITY_MAP,
  defineStyleSlot,
  getSlotDefinition,
  isSlotMergeable,
  getSlotMaxMultiplicity,
  getAllSlotDefinitions,
  validateProviderSlotCompatibility
} = require("./style-slot-definitions");

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
  dimension = "LEXICAL", // LEXICAL | AFFECTIVE | RHYTHMIC | ATMOSPHERIC
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
  introducedInterpretation = null,
  dialogueAct = null,
  surfaceRealization = true,
  semanticAssertions = [],
  provenance = ""
} = {}) {
  return Object.freeze({
    providerId: String(providerId),
    domain: String(domain),
    targetSlot: String(targetSlot),
    dimension: String(dimension || "LEXICAL"),
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
    introducedInterpretation: introducedInterpretation ? String(introducedInterpretation) : null,
    dialogueAct: dialogueAct ? String(dialogueAct) : null,
    surfaceRealization: Boolean(surfaceRealization),
    semanticAssertions: Object.freeze([...semanticAssertions]),
    provenance: String(provenance || "")
  });
}

module.exports = {
  STYLE_SLOTS,
  SEMANTIC_ROLES,
  SEMANTIC_TYPES,
  REALIZATION_DIMENSIONS,
  CONFLICT_POLICIES,
  STYLE_SLOT_DEFINITIONS,
  PROVIDER_SLOT_COMPATIBILITY_MAP,
  defineStyleSlot,
  getSlotDefinition,
  isSlotMergeable,
  getSlotMaxMultiplicity,
  getAllSlotDefinitions,
  validateProviderSlotCompatibility,
  createStylistContribution
};
