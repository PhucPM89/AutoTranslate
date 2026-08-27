"use strict";

/**
 * StyleSlot Definitions & Metadata Registry (Wave B.5)
 * 
 * Formalizes the metadata and semantic constraints for all StyleSlots in the system.
 * StyleSlots are NOT arbitrary strings; they define explicit semantic types,
 * multiplicity limits, mergeability rules, text role permissions, and conflict policies.
 */

const SEMANTIC_TYPES = Object.freeze({
  ACTION: "ACTION",
  OBJECT: "OBJECT",
  EVENT: "EVENT",
  STATE: "STATE",
  AFFECT: "AFFECT",
  ATMOSPHERE: "ATMOSPHERE",
  RHYTHM: "RHYTHM",
  REGISTER: "REGISTER",
  DIALOGUE: "DIALOGUE",
  NARRATIVE: "NARRATIVE"
});

const CONFLICT_POLICIES = Object.freeze({
  WIN_OR_ABSTAIN: "WIN_OR_ABSTAIN",       // Single winner chosen by composite score; ties abstain
  ORTHOGONAL_MERGE: "ORTHOGONAL_MERGE",   // Independent/complementary contributions co-exist up to maxMultiplicity
  COMPOSITE_SCORE: "COMPOSITE_SCORE",     // Standard competitive ranking
  EXPANSION_SATURATION: "EXPANSION_SATURATION" // Bounded by semantic expansion budget
});

/**
 * Factory for StyleSlotDefinition.
 */
function defineStyleSlot({
  id,
  semanticType = SEMANTIC_TYPES.ACTION,
  canMerge = false,
  canCompete = true,
  maxMultiplicity = 1,
  allowedTextRoles = ["ACTION", "DESCRIPTION", "DIALOGUE", "EXPOSITION", "INCANTATION", "INNER_THOUGHT"],
  requiredEvidence = [],
  conflictPolicy = CONFLICT_POLICIES.COMPOSITE_SCORE,
  description = ""
}) {
  return Object.freeze({
    id: String(id),
    semanticType,
    canMerge: Boolean(canMerge),
    canCompete: Boolean(canCompete),
    maxMultiplicity: Number(maxMultiplicity),
    allowedTextRoles: Object.freeze([...allowedTextRoles]),
    requiredEvidence: Object.freeze([...requiredEvidence]),
    conflictPolicy,
    description: String(description || "")
  });
}

// Full Canonical StyleSlot Definitions
const STYLE_SLOT_DEFINITIONS = Object.freeze({
  // --- Pilot & Core Combat Slots ---
  ACTION_STRIKE: defineStyleSlot({
    id: "ACTION_STRIKE",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["UNARMED_STRIKE_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Đòn đánh tay không, chưởng pháp, quyền pháp"
  }),
  ACTION_MOVE: defineStyleSlot({
    id: "ACTION_MOVE",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["MOVEMENT_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Thân pháp, bộ pháp, né tránh, di chuyển"
  }),
  ACTION_DAMAGE: defineStyleSlot({
    id: "ACTION_DAMAGE",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["DAMAGE_REACTION_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Phản hồi sát thương, thổ huyết, bị đánh văng"
  }),
  WEAPON_DRAW: defineStyleSlot({
    id: "WEAPON_DRAW",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["WEAPON_DRAW_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Tuốt kiếm, rút đao, triệu hồi pháp bảo"
  }),
  WEAPON_STRIKE: defineStyleSlot({
    id: "WEAPON_STRIKE",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["WEAPON_KEYWORD", "SLASH_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Chiêu thức vũ khí, kiếm quang, đao khí"
  }),
  WEAPON_INTENT: defineStyleSlot({
    id: "WEAPON_INTENT",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["INTENT_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Kiếm ý, kiếm tâm, nhân kiếm hợp nhất"
  }),
  TEA_PREPARATION: defineStyleSlot({
    id: "TEA_PREPARATION",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["TEA_ACTION_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Pha trà, đun nước, nâng chén, đặt chén"
  }),
  TEA_DISCOURSE: defineStyleSlot({
    id: "TEA_DISCOURSE",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "DIALOGUE"],
    requiredEvidence: ["TEA_DISCOURSE_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Thưởng trà luận đạo, đàm đạo thế sự"
  }),
  ZEN_STATE: defineStyleSlot({
    id: "ZEN_STATE",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["ZEN_MEDITATION_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Tâm cảnh thanh tịnh, đốn ngộ, rũ bỏ bụi trần"
  }),

  // --- Wave A Slots ---
  ALCHEMY_AROMA: defineStyleSlot({
    id: "ALCHEMY_AROMA",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["ALCHEMY_AROMA_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Hương thơm đan dược, dược hương"
  }),
  ALCHEMY_FLAME: defineStyleSlot({
    id: "ALCHEMY_FLAME",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ALCHEMY_FLAME_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Luyện đan, hỏa diễm, lò đan"
  }),
  ALCHEMY_POTENCY: defineStyleSlot({
    id: "ALCHEMY_POTENCY",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DESCRIPTION", "EXPOSITION"],
    requiredEvidence: ["PILL_POTENCY_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Ngưng đan, đan văn, dược lực"
  }),
  BEAST_CONTRACT: defineStyleSlot({
    id: "BEAST_CONTRACT",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BEAST_CONTRACT_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Trận pháp khế ước linh thú, huyết khế"
  }),
  BEAST_ROAR: defineStyleSlot({
    id: "BEAST_ROAR",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BEAST_ROAR_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Hung thú gầm thét, yêu khí cuồn cuộn"
  }),
  BEAST_EVOLUTION: defineStyleSlot({
    id: "BEAST_EVOLUTION",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BEAST_BLOODLINE_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Linh thú tiến giai, huyết mạch áp chế"
  }),
  CULINARY_DELICACY: defineStyleSlot({
    id: "CULINARY_DELICACY",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["FOOD_WINE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Mỹ tửu, trân tu mỹ vị, bàn tiệc"
  }),
  CULINARY_SENSATION: defineStyleSlot({
    id: "CULINARY_SENSATION",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["TASTE_SENSATION_VERB"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Cảm giác vị giác, vào miệng tan chảy, chén tạc chén thù"
  }),
  CYBER_INTERFACE: defineStyleSlot({
    id: "CYBER_INTERFACE",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["CYBER_INTERFACE_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Giao diện thần kinh não bộ, thực tế ảo"
  }),
  CYBER_MECHA: defineStyleSlot({
    id: "CYBER_MECHA",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["MECHA_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Cơ giáp chiến đấu, hình chiếu 3D, nghĩa thể"
  }),
  ARRAY_NODE: defineStyleSlot({
    id: "ARRAY_NODE",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ARRAY_FORMATION_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Trận nhãn, kích hoạt đại trận, bát quái xoay vần"
  }),
  TALISMAN_ACTIVATION: defineStyleSlot({
    id: "TALISMAN_ACTIVATION",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["TALISMAN_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Bùa chú tự bốc cháy, phù lục, phù văn lưu chuyển"
  }),
  INSCRIPTION_LEGACY: defineStyleSlot({
    id: "INSCRIPTION_LEGACY",
    semanticType: SEMANTIC_TYPES.OBJECT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DESCRIPTION", "EXPOSITION"],
    requiredEvidence: ["JADE_SLIP_STELE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Ngọc giản ghi lại, bia đá cổ, lạc ấn truyền thừa"
  }),
  MERIDIAN_ACUPOINT: defineStyleSlot({
    id: "MERIDIAN_ACUPOINT",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ACUPOINT_NEEDLE_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Ngân châm phong huyệt, khai thông kinh mạch"
  }),
  HEALING_PURGE: defineStyleSlot({
    id: "HEALING_PURGE",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["TOXIN_PURGE_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Bức xuất độc tố, khí huyết bình phục"
  }),
  NECROPOLIS_ATMOSPHERE: defineStyleSlot({
    id: "NECROPOLIS_ATMOSPHERE",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["TOMB_COFFIN_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Cổ mộ, quan quách ngàn năm, thi khí, cạm bẫy"
  }),
  SOUL_TOKEN_STATE: defineStyleSlot({
    id: "SOUL_TOKEN_STATE",
    semanticType: SEMANTIC_TYPES.OBJECT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["SOUL_TABLET_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Mệnh bài nứt vỡ, hồn đăng phụt tắt, tổ miếu chấn động"
  }),
  SPATIAL_VOID: defineStyleSlot({
    id: "SPATIAL_VOID",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["VOID_RIFT_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Khe nứt không gian, hư không sụp đổ, bí cảnh khai mở"
  }),
  AUCTION_EVENT: defineStyleSlot({
    id: "AUCTION_EVENT",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "DIALOGUE"],
    requiredEvidence: ["AUCTION_HAMMER_BID"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Toàn trường tĩnh lặng, tiếng búa chốt giá, giá trên trời"
  }),

  // --- Wave B Slots ---
  APOCALYPSE_HORDE: defineStyleSlot({
    id: "APOCALYPSE_HORDE",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ZOMBIE_HORDE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Tang thi cuồng triều, mạt thế phế thổ"
  }),
  GENETIC_LIMIT: defineStyleSlot({
    id: "GENETIC_LIMIT",
    semanticType: SEMANTIC_TYPES.OBJECT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["GENE_LOCK_CORE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Phá vỡ khóa gen, tinh hạch dị thú"
  }),
  ELEMENTAL_AWAKENING: defineStyleSlot({
    id: "ELEMENTAL_AWAKENING",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ABILITY_AWAKEN_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Dị năng thức tỉnh, bùng nổ sức mạnh"
  }),
  COSMIC_CHESS_BOARD: defineStyleSlot({
    id: "COSMIC_CHESS_BOARD",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["CHESSBOARD_METAPHOR"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Thiên địa vi bàn, chúng sinh vi tử"
  }),
  CHESS_STRATEGY_MOVE: defineStyleSlot({
    id: "CHESS_STRATEGY_MOVE",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["CHESS_MOVE_ACTION"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Hạ cờ không hối, thắng bại đã phân, bỏ xe giữ tướng"
  }),
  DIVINE_SENSE_SCAN: defineStyleSlot({
    id: "DIVINE_SENSE_SCAN",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["PSYCHIC_SWEEP_VERB"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Thần thức quét qua, thần niệm như triều"
  }),
  SOUL_PRESSURE: defineStyleSlot({
    id: "SOUL_PRESSURE",
    semanticType: SEMANTIC_TYPES.AFFECT,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["DIVINE_AURA_PRESSURE"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Uy áp giáng lâm, thức hải chấn động, linh hồn đau đớn"
  }),
  DOMAIN_EXPANSION: defineStyleSlot({
    id: "DOMAIN_EXPANSION",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["DOMAIN_EXPAND_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Lĩnh vực tuyệt đối mở rộng"
  }),
  ELDRITCH_HORROR: defineStyleSlot({
    id: "ELDRITCH_HORROR",
    semanticType: SEMANTIC_TYPES.AFFECT,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["UNNAMEABLE_HORROR_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Bất khả danh trạng, lời thì thầm điên loạn"
  }),
  FORBIDDEN_GAZE: defineStyleSlot({
    id: "FORBIDDEN_GAZE",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["GAZE_DEITY_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Nhìn thẳng thần minh, chứng kiến cấm kỵ"
  }),
  SANITY_COLLAPSE: defineStyleSlot({
    id: "SANITY_COLLAPSE",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["SANITY_MUTATION_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Lý trí sụp đổ, ô nhiễm biến dị"
  }),
  ELEGY_SOUL_CALL: defineStyleSlot({
    id: "ELEGY_SOUL_CALL",
    semanticType: SEMANTIC_TYPES.AFFECT,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "DIALOGUE"],
    requiredEvidence: ["SOUL_SUMMON_LAMENT"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Hồn quy lai hề, ngậm cười chín suối, âm dương cách biệt"
  }),
  ELEGY_HEROIC_SPIRIT: defineStyleSlot({
    id: "ELEGY_HEROIC_SPIRIT",
    semanticType: SEMANTIC_TYPES.AFFECT,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "EXPOSITION"],
    requiredEvidence: ["HEROIC_SPIRIT_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Anh hồn bất diệt, âm dung uyển tại"
  }),
  FORENSIC_MYSTERY: defineStyleSlot({
    id: "FORENSIC_MYSTERY",
    semanticType: SEMANTIC_TYPES.NARRATIVE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "EXPOSITION"],
    requiredEvidence: ["CRIME_CLUE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Án mạng mật thất, bằng chứng ngoại phạm, dấu vết tơ nhện"
  }),
  FORENSIC_TRUTH: defineStyleSlot({
    id: "FORENSIC_TRUTH",
    semanticType: SEMANTIC_TYPES.NARRATIVE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "DIALOGUE"],
    requiredEvidence: ["TRUTH_EXPOSED_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Chân tướng đại bạch"
  }),
  GRIMOIRE_CURSE: defineStyleSlot({
    id: "GRIMOIRE_CURSE",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["FORBIDDEN_CURSE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Ma pháp cấm chú, ma lực cuộn trào"
  }),
  MAGIC_INCANTATION: defineStyleSlot({
    id: "MAGIC_INCANTATION",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "INCANTATION"],
    requiredEvidence: ["CHANT_CIRCLE_TOME_ACTION"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Ngâm xướng chú ngữ, ma pháp trận, ma đạo thư"
  }),
  IMPERIAL_PROCLAMATION: defineStyleSlot({
    id: "IMPERIAL_PROCLAMATION",
    semanticType: SEMANTIC_TYPES.DIALOGUE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DIALOGUE", "EXPOSITION"],
    requiredEvidence: ["ROYAL_EDICT_FORMULA"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Phụng thiên thừa vận, khâm thử"
  }),
  IMPERIAL_SALUTATION: defineStyleSlot({
    id: "IMPERIAL_SALUTATION",
    semanticType: SEMANTIC_TYPES.DIALOGUE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DIALOGUE", "ACTION"],
    requiredEvidence: ["COURT_SALUTATION_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Lãnh chỉ tạ ân, vạn tuế, đệ trình quốc thư"
  }),
  KARMA_SAMSARA: defineStyleSlot({
    id: "KARMA_SAMSARA",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["KARMIC_THREAD_CYCLE"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Tơ nhân quả, chém đứt nghiệp duyên, chín kiếp luân hồi"
  }),
  DESTINED_DUEL: defineStyleSlot({
    id: "DESTINED_DUEL",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["DESTINED_AWAKENING_DUEL"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Túc huệ thức tỉnh, trận đấu định mệnh"
  }),
  MANTRA_SEAL: defineStyleSlot({
    id: "MANTRA_SEAL",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "INCANTATION"],
    requiredEvidence: ["HAND_SEAL_INCANTATION"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Bấm quyết niệm chú, miệng tụng chân ngôn, kết thủ ấn"
  }),
  WORD_AS_LAW: defineStyleSlot({
    id: "WORD_AS_LAW",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DIALOGUE"],
    requiredEvidence: ["WORD_AS_LAW_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Ngôn xuất pháp tùy"
  }),
  MUSICAL_PERFORMANCE: defineStyleSlot({
    id: "MUSICAL_PERFORMANCE",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["MELODIC_INSTRUMENT_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Tiếng đàn du dương, gảy dây đàn, Cao Sơn Lưu Thủy, khúc chung nhân tán"
  }),
  MUSICAL_ATTACK: defineStyleSlot({
    id: "MUSICAL_ATTACK",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION"],
    requiredEvidence: ["SONIC_WEAPON_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Âm ba giết địch, sóng âm hóa kiếm"
  }),
  SUPERNATURAL_SPECTER: defineStyleSlot({
    id: "SUPERNATURAL_SPECTER",
    semanticType: SEMANTIC_TYPES.AFFECT,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "ACTION"],
    requiredEvidence: ["SPECTER_GHOST_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Lệ quỷ áo đỏ, mắt âm dương, minh hôn"
  }),
  TAOIST_EXORCISM: defineStyleSlot({
    id: "TAOIST_EXORCISM",
    semanticType: SEMANTIC_TYPES.OBJECT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["EXORCISM_ARTIFACT_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Kiếm gỗ đào, máu chó mực, phù chú trừ tà"
  }),
  NETHERWORLD_PARADE: defineStyleSlot({
    id: "NETHERWORLD_PARADE",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["YIN_SOLDIERS_JIANGSHI_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Âm binh mượn đường, thi biến cương thi"
  }),
  TOPOGRAPHY_LANDSCAPE: defineStyleSlot({
    id: "TOPOGRAPHY_LANDSCAPE",
    semanticType: SEMANTIC_TYPES.ATMOSPHERE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["IMMORTAL_LANDSCAPE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Linh khí hóa vụ, mây mù đỉnh núi, động thiên phúc địa, vách đá"
  }),
  SEVERED_VITALITY: defineStyleSlot({
    id: "SEVERED_VITALITY",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["DEATH_AURA_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Sinh cơ đoạn tuyệt, tử khí ngập trời"
  }),
  TRANSCENDENCE_TIME: defineStyleSlot({
    id: "TRANSCENDENCE_TIME",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["TIME_DILATION_METAPHOR"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Búng tay ngàn năm, cảnh còn người mất, nhìn hết phồn hoa"
  }),
  SOLITARY_DAO: defineStyleSlot({
    id: "SOLITARY_DAO",
    semanticType: SEMANTIC_TYPES.STATE,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["SOLITARY_DAO_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Đại đạo độc hành"
  }),
  TRIBULATION_LIGHTNING: defineStyleSlot({
    id: "TRIBULATION_LIGHTNING",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["CELESTIAL_LIGHTNING_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Mây kiếp cuồn cuộn, Tử Tiêu Thần Lôi, thiên kiếp giáng lâm"
  }),
  CELESTIAL_PHENOMENON: defineStyleSlot({
    id: "CELESTIAL_PHENOMENON",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["CELESTIAL_MIRACLE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Thiên địa dị tượng, vạn đạo ráng mây, đạo âm ngân vang"
  }),
  REALM_BREAKTHROUGH: defineStyleSlot({
    id: "REALM_BREAKTHROUGH",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BREAKTHROUGH_DEMON_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Phá vỡ bình cảnh, tâm ma xâm thực"
  }),
  WAR_DRUMS: defineStyleSlot({
    id: "WAR_DRUMS",
    semanticType: SEMANTIC_TYPES.OBJECT,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["WAR_DRUM_GONG_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Trống trận dồn dập, chiêng thu quân"
  }),
  WARFARE_CHARGE: defineStyleSlot({
    id: "WARFARE_CHARGE",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ARMY_CHARGE_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Thiên quân vạn mã xung phong, khói lửa ngập trời"
  }),
  BLOODY_BATTLEFIELD: defineStyleSlot({
    id: "BLOODY_BATTLEFIELD",
    semanticType: SEMANTIC_TYPES.EVENT,
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BLOODY_WAR_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Quyết tử huyết chiến sa trường"
  })
});

/**
 * Retrieves StyleSlot definition or returns fallback.
 * 
 * @param {string} slotId
 * @returns {Object} StyleSlotDefinition
 */
function getSlotDefinition(slotId) {
  if (STYLE_SLOT_DEFINITIONS[slotId]) {
    return STYLE_SLOT_DEFINITIONS[slotId];
  }
  return defineStyleSlot({
    id: slotId || "GENERAL_SLOT",
    semanticType: SEMANTIC_TYPES.ACTION,
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Dynamic or custom slot"
  });
}

/**
 * Checks if a slot permits multi-contribution merging.
 */
function isSlotMergeable(slotId) {
  const def = getSlotDefinition(slotId);
  return def.canMerge;
}

/**
 * Gets the maximum multiplicity allowed for a slot.
 */
function getSlotMaxMultiplicity(slotId) {
  const def = getSlotDefinition(slotId);
  return def.maxMultiplicity;
}

module.exports = {
  SEMANTIC_TYPES,
  CONFLICT_POLICIES,
  STYLE_SLOT_DEFINITIONS,
  defineStyleSlot,
  getSlotDefinition,
  isSlotMergeable,
  getSlotMaxMultiplicity
};
