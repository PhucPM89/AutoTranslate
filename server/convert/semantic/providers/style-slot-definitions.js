"use strict";

/**
 * StyleSlot Definitions & Semantic Metadata Registry (Wave B.5.1 Hardened)
 * 
 * Formalizes the metadata and semantic constraints for all StyleSlots in the system.
 * StyleSlots are NOT arbitrary strings and do NOT replace Semantic IR.
 * 
 * Each StyleSlot answers:
 * 1. Semantic Role: "What source semantic event/state/action is this realization serving?"
 * 2. Realization Dimensions: "What aspects of expression (lexical, rhythmic, affective, register, atmosphere) can this slot modulate?"
 * 3. Multiplicity & Policy: "Can multiple providers contribute or is it a single winner?"
 */

const SEMANTIC_ROLES = Object.freeze({
  ACTION: "ACTION",                         // Physical, martial, or incantation action
  OBJECT: "OBJECT",                         // Concrete, mythical, or talismanic artifact
  EVENT: "EVENT",                           // Environmental shift, phenomenon, or narrative milestone
  STATE: "STATE",                           // Spiritual, physiological, temporal, or spatial state
  AFFECT: "AFFECT",                         // Psychological, spiritual aura, or mood pressure
  ATMOSPHERE: "ATMOSPHERE",                 // Environmental scenery or background ambiance
  DIALOGUE_ACT: "DIALOGUE_ACT",             // Direct or formal spoken proclamation / address
  COGNITION: "COGNITION",                   // Thought, memory, decision, and inference realization
  NARRATIVE_FUNCTION: "NARRATIVE_FUNCTION"  // Structural forensic or revelation function
});

// Backwards compatibility alias
const SEMANTIC_TYPES = Object.freeze({
  ...SEMANTIC_ROLES,
  DIALOGUE: "DIALOGUE_ACT",
  NARRATIVE: "NARRATIVE_FUNCTION"
});

const REALIZATION_DIMENSIONS = Object.freeze({
  LEXICAL: "LEXICAL",                       // Exact terminology and classical vocabulary
  RHYTHMIC: "RHYTHMIC",                     // Cadence, punchiness, lyricism
  AFFECTIVE: "AFFECTIVE",                   // Emotion and mood shading
  REGISTER: "REGISTER",                     // Formality, solemnity, archaism
  ATMOSPHERIC: "ATMOSPHERIC",               // Evocative ambient texture
  DIALOGUE_STYLE: "DIALOGUE_STYLE"          // Spoken voice formality
});

const CONFLICT_POLICIES = Object.freeze({
  WIN_OR_ABSTAIN: "WIN_OR_ABSTAIN",         // Single winner chosen by composite score; ties abstain
  ORTHOGONAL_MERGE: "ORTHOGONAL_MERGE",     // Independent/complementary contributions co-exist up to maxMultiplicity
  COMPOSITE_SCORE: "COMPOSITE_SCORE",       // Standard competitive ranking
  EXPANSION_SATURATION: "EXPANSION_SATURATION" // Bounded by semantic expansion budget
});

/**
 * Factory for StyleSlotDefinition.
 */
function defineStyleSlot({
  id,
  semanticRole = SEMANTIC_ROLES.ACTION,
  semanticType = null, // for backwards compat
  realizationDimensions = [REALIZATION_DIMENSIONS.LEXICAL],
  canMerge = false,
  canCompete = true,
  maxMultiplicity = 1,
  allowedTextRoles = ["ACTION", "DESCRIPTION", "DIALOGUE", "EXPOSITION", "INCANTATION", "INNER_THOUGHT"],
  requiredEvidence = [],
  conflictPolicy = CONFLICT_POLICIES.COMPOSITE_SCORE,
  supportsNeutralContribution = true,
  description = "",
  sourceSemantics = ""
}) {
  const role = semanticRole || semanticType || SEMANTIC_ROLES.ACTION;
  return Object.freeze({
    id: String(id),
    semanticRole: role,
    semanticType: role, // backwards compatibility alias
    realizationDimensions: Object.freeze([...realizationDimensions]),
    canMerge: Boolean(canMerge),
    canCompete: Boolean(canCompete),
    maxMultiplicity: Number(maxMultiplicity),
    allowedTextRoles: Object.freeze([...allowedTextRoles]),
    requiredEvidence: Object.freeze([...requiredEvidence]),
    conflictPolicy,
    supportsNeutralContribution: Boolean(supportsNeutralContribution),
    description: String(description || ""),
    sourceSemantics: String(sourceSemantics || description || "")
  });
}

// Canonical StyleSlot Definitions (75 Slots)
const STYLE_SLOT_DEFINITIONS = Object.freeze({
  // =========================================================================
  // 1. ACTION SLOTS (16 Canonical Slots)
  // =========================================================================
  ACTION_STRIKE: defineStyleSlot({
    id: "ACTION_STRIKE",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.RHYTHMIC],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["UNARMED_STRIKE_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Đòn đánh tay không, chưởng pháp, quyền pháp",
    sourceSemantics: "Source expresses unarmed physical or martial combat strikes"
  }),
  ACTION_MOVE: defineStyleSlot({
    id: "ACTION_MOVE",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.RHYTHMIC],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["MOVEMENT_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Thân pháp, bộ pháp, né tránh, di chuyển",
    sourceSemantics: "Source expresses rapid bodily displacement or evasion"
  }),
  ACTION_DAMAGE: defineStyleSlot({
    id: "ACTION_DAMAGE",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["DAMAGE_REACTION_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Phản hồi sát thương, thổ huyết, bị đánh văng",
    sourceSemantics: "Source expresses physical injury reaction from combat"
  }),
  WEAPON_DRAW: defineStyleSlot({
    id: "WEAPON_DRAW",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["WEAPON_DRAW_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Tuốt kiếm, rút đao, triệu hồi pháp bảo",
    sourceSemantics: "Source expresses unsheathing or drawing an armed weapon"
  }),
  WEAPON_STRIKE: defineStyleSlot({
    id: "WEAPON_STRIKE",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.RHYTHMIC, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["WEAPON_KEYWORD", "SLASH_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Chiêu thức vũ khí, kiếm quang, đao khí",
    sourceSemantics: "Source expresses slashing or armed weapon strike"
  }),
  TEA_PREPARATION: defineStyleSlot({
    id: "TEA_PREPARATION",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["TEA_ACTION_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Pha trà, đun nước, nâng chén, đặt chén",
    sourceSemantics: "Source expresses tea brewing or ritual beverage handling"
  }),
  MERIDIAN_ACUPOINT: defineStyleSlot({
    id: "MERIDIAN_ACUPOINT",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ACUPOINT_NEEDLE_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Ngân châm phong huyệt, khai thông kinh mạch",
    sourceSemantics: "Source expresses acupoint needle insertion or meridian clearing"
  }),
  HEALING_PURGE: defineStyleSlot({
    id: "HEALING_PURGE",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["TOXIN_PURGE_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Bức xuất độc tố, khí huyết bình phục",
    sourceSemantics: "Source expresses internal toxin purging or healing stabilization"
  }),
  ARRAY_NODE: defineStyleSlot({
    id: "ARRAY_NODE",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ARRAY_FORMATION_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Trận nhãn, kích hoạt đại trận, bát quái xoay vần",
    sourceSemantics: "Source expresses activating or manipulating a Daoist array node"
  }),
  TALISMAN_ACTIVATION: defineStyleSlot({
    id: "TALISMAN_ACTIVATION",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["TALISMAN_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Bùa chú tự bốc cháy, phù lục, phù văn lưu chuyển",
    sourceSemantics: "Source expresses talisman ignition or rune circulation"
  }),
  BEAST_CONTRACT: defineStyleSlot({
    id: "BEAST_CONTRACT",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BEAST_CONTRACT_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Trận pháp khế ước linh thú, huyết khế",
    sourceSemantics: "Source expresses forming a soul or blood contract with a beast"
  }),
  MAGIC_INCANTATION: defineStyleSlot({
    id: "MAGIC_INCANTATION",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "INCANTATION"],
    requiredEvidence: ["CHANT_CIRCLE_TOME_ACTION"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Ngâm xướng chú ngữ, ma pháp trận, ma đạo thư",
    sourceSemantics: "Source expresses chanting spell incantations or magic book activation"
  }),
  MANTRA_SEAL: defineStyleSlot({
    id: "MANTRA_SEAL",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "INCANTATION"],
    requiredEvidence: ["HAND_SEAL_INCANTATION"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Bấm quyết niệm chú, miệng tụng chân ngôn, kết thủ ấn",
    sourceSemantics: "Source expresses forming hand mudras or chanting Daoist/Buddhist mantras"
  }),
  MUSICAL_ATTACK: defineStyleSlot({
    id: "MUSICAL_ATTACK",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.RHYTHMIC],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION"],
    requiredEvidence: ["SONIC_WEAPON_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Âm ba giết địch, sóng âm hóa kiếm",
    sourceSemantics: "Source expresses weaponized acoustic/soundwave combat attacks"
  }),
  WARFARE_CHARGE: defineStyleSlot({
    id: "WARFARE_CHARGE",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.RHYTHMIC, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ARMY_CHARGE_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Thiên quân vạn mã xung phong, khói lửa ngập trời",
    sourceSemantics: "Source expresses mass army charges or cavalry assault"
  }),
  CHESS_STRATEGY_MOVE: defineStyleSlot({
    id: "CHESS_STRATEGY_MOVE",
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["CHESS_MOVE_ACTION"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Hạ cờ không hối, thắng bại đã phân, bỏ xe giữ tướng",
    sourceSemantics: "Source expresses tactical Go piece placement or strategic sacrifice"
  }),

  // =========================================================================
  // 2. OBJECT / ENTITY SLOTS (5 Canonical Slots)
  // =========================================================================
  GENETIC_LIMIT: defineStyleSlot({
    id: "GENETIC_LIMIT",
    semanticRole: SEMANTIC_ROLES.OBJECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["GENE_LOCK_CORE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Phá vỡ khóa gen, tinh hạch dị thú",
    sourceSemantics: "Source denotes mutant crystal cores or biological gene locks"
  }),
  INSCRIPTION_LEGACY: defineStyleSlot({
    id: "INSCRIPTION_LEGACY",
    semanticRole: SEMANTIC_ROLES.OBJECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DESCRIPTION", "EXPOSITION"],
    requiredEvidence: ["JADE_SLIP_STELE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Ngọc giản ghi lại, bia đá cổ, lạc ấn truyền thừa",
    sourceSemantics: "Source denotes ancient jade slips, stone steles, or heritage inscriptions"
  }),
  SOUL_TOKEN_STATE: defineStyleSlot({
    id: "SOUL_TOKEN_STATE",
    semanticRole: SEMANTIC_ROLES.OBJECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["SOUL_TABLET_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Mệnh bài nứt vỡ, hồn đăng phụt tắt, tổ miếu chấn động",
    sourceSemantics: "Source denotes fracturing life slips or extinguishing soul lamps"
  }),
  TAOIST_EXORCISM: defineStyleSlot({
    id: "TAOIST_EXORCISM",
    semanticRole: SEMANTIC_ROLES.OBJECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["EXORCISM_ARTIFACT_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Kiếm gỗ đào, máu chó mực, phù chú trừ tà",
    sourceSemantics: "Source denotes Taoist exorcism artifacts like peachwood swords"
  }),
  WAR_DRUMS: defineStyleSlot({
    id: "WAR_DRUMS",
    semanticRole: SEMANTIC_ROLES.OBJECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["WAR_DRUM_GONG_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Trống trận dồn dập, chiêng thu quân",
    sourceSemantics: "Source denotes battlefield war drums or retreat gongs"
  }),

  // =========================================================================
  // 3. EVENT SLOTS (11 Canonical Slots)
  // =========================================================================
  AUCTION_EVENT: defineStyleSlot({
    id: "AUCTION_EVENT",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "DIALOGUE"],
    requiredEvidence: ["AUCTION_HAMMER_BID"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Toàn trường tĩnh lặng, tiếng búa chốt giá, giá trên trời",
    sourceSemantics: "Source describes auction bidding, gavel strikes, or auction hall reactions"
  }),
  SPATIAL_VOID: defineStyleSlot({
    id: "SPATIAL_VOID",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["VOID_RIFT_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Khe nứt không gian, hư không sụp đổ, bí cảnh khai mở",
    sourceSemantics: "Source describes localized spatial tearing, void fissures, or secret realm opening"
  }),
  APOCALYPSE_HORDE: defineStyleSlot({
    id: "APOCALYPSE_HORDE",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ZOMBIE_HORDE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Tang thi cuồng triều, mạt thế phế thổ",
    sourceSemantics: "Source describes zombie tide surge or wasteland collapse"
  }),
  ELEMENTAL_AWAKENING: defineStyleSlot({
    id: "ELEMENTAL_AWAKENING",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ABILITY_AWAKEN_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Dị năng thức tỉnh, bùng nổ sức mạnh",
    sourceSemantics: "Source describes supernatural ability awakening or power eruption"
  }),
  BEAST_EVOLUTION: defineStyleSlot({
    id: "BEAST_EVOLUTION",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BEAST_BLOODLINE_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Linh thú tiến giai, huyết mạch áp chế",
    sourceSemantics: "Source describes mythical beast advancement or bloodline rank suppression"
  }),
  REALM_BREAKTHROUGH: defineStyleSlot({
    id: "REALM_BREAKTHROUGH",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BREAKTHROUGH_DEMON_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Phá vỡ bình cảnh, tâm ma xâm thực",
    sourceSemantics: "Source describes cultivation bottleneck breakthrough or inner demon invasion"
  }),
  TRIBULATION_LIGHTNING: defineStyleSlot({
    id: "TRIBULATION_LIGHTNING",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["CELESTIAL_LIGHTNING_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Mây kiếp cuồn cuộn, Tử Tiêu Thần Lôi, thiên kiếp giáng lâm",
    sourceSemantics: "Source describes divine heavenly tribulation lightning descending"
  }),
  CELESTIAL_PHENOMENON: defineStyleSlot({
    id: "CELESTIAL_PHENOMENON",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["CELESTIAL_MIRACLE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Thiên địa dị tượng, vạn đạo ráng mây, đạo âm ngân vang",
    sourceSemantics: "Source describes cosmic omens, heavenly purple clouds, or divine resonance"
  }),
  DESTINED_DUEL: defineStyleSlot({
    id: "DESTINED_DUEL",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["DESTINED_AWAKENING_DUEL"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Túc huệ thức tỉnh, trận đấu định mệnh",
    sourceSemantics: "Source describes past-life memory awakening or destined fated battle"
  }),
  NETHERWORLD_PARADE: defineStyleSlot({
    id: "NETHERWORLD_PARADE",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["YIN_SOLDIERS_JIANGSHI_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Âm binh mượn đường, thi biến cương thi",
    sourceSemantics: "Source describes ghost soldier procession or corpse reanimation"
  }),
  BLOODY_BATTLEFIELD: defineStyleSlot({
    id: "BLOODY_BATTLEFIELD",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BLOODY_WAR_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Quyết tử huyết chiến sa trường",
    sourceSemantics: "Source describes brutal mortal combat bloodshed on the battlefield"
  }),

  // =========================================================================
  // 4. STATE SLOTS (12 Canonical Slots)
  // =========================================================================
  ZEN_STATE: defineStyleSlot({
    id: "ZEN_STATE",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["ZEN_MEDITATION_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Tâm cảnh thanh tịnh, đốn ngộ, rũ bỏ bụi trần",
    sourceSemantics: "Source describes enlightened meditation, stillness of mind, or spiritual release"
  }),
  WEAPON_INTENT: defineStyleSlot({
    id: "WEAPON_INTENT",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["INTENT_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Kiếm ý, kiếm tâm, nhân kiếm hợp nhất",
    sourceSemantics: "Source describes weapon intent resonance or swordsman unity state"
  }),
  ALCHEMY_POTENCY: defineStyleSlot({
    id: "ALCHEMY_POTENCY",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DESCRIPTION", "EXPOSITION"],
    requiredEvidence: ["PILL_POTENCY_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Ngưng đan, đan văn, dược lực",
    sourceSemantics: "Source describes pill condensation quality, pill clouds, or medicinal potency"
  }),
  CYBER_INTERFACE: defineStyleSlot({
    id: "CYBER_INTERFACE",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["CYBER_INTERFACE_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Giao diện thần kinh não bộ, thực tế ảo",
    sourceSemantics: "Source describes neural interface connection, VR immersion, or data stream state"
  }),
  CYBER_MECHA: defineStyleSlot({
    id: "CYBER_MECHA",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["MECHA_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Cơ giáp chiến đấu, hình chiếu 3D, nghĩa thể",
    sourceSemantics: "Source describes mecha deployment or cybernetic prosthetic status"
  }),
  DOMAIN_EXPANSION: defineStyleSlot({
    id: "DOMAIN_EXPANSION",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["DOMAIN_EXPAND_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Lĩnh vực tuyệt đối mở rộng",
    sourceSemantics: "Source describes expanding personal territory or absolute domain control"
  }),
  SANITY_COLLAPSE: defineStyleSlot({
    id: "SANITY_COLLAPSE",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["SANITY_MUTATION_VERB"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Lý trí sụp đổ, ô nhiễm biến dị",
    sourceSemantics: "Source describes mental madness, sanity loss, or eldritch mutation"
  }),
  WORD_AS_LAW: defineStyleSlot({
    id: "WORD_AS_LAW",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DIALOGUE"],
    requiredEvidence: ["WORD_AS_LAW_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Ngôn xuất pháp tùy",
    sourceSemantics: "Source describes spoken reality alteration or absolute word decree"
  }),
  TRANSCENDENCE_TIME: defineStyleSlot({
    id: "TRANSCENDENCE_TIME",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["TIME_DILATION_METAPHOR"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Búng tay ngàn năm, cảnh còn người mất, nhìn hết phồn hoa",
    sourceSemantics: "Source describes mortal time passage perception or millennial retrospection"
  }),
  SOLITARY_DAO: defineStyleSlot({
    id: "SOLITARY_DAO",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["SOLITARY_DAO_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Đại đạo độc hành",
    sourceSemantics: "Source describes solitary immortal path walking or boundless loneliness"
  }),
  SEVERED_VITALITY: defineStyleSlot({
    id: "SEVERED_VITALITY",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["DEATH_AURA_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Sinh cơ đoạn tuyệt, tử khí ngập trời",
    sourceSemantics: "Source describes complete extinction of life force or deathly aura saturation"
  }),
  KARMA_SAMSARA: defineStyleSlot({
    id: "KARMA_SAMSARA",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["KARMIC_THREAD_CYCLE"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Tơ nhân quả, chém đứt nghiệp duyên, chín kiếp luân hồi",
    sourceSemantics: "Source describes karmic thread perception or severing reincarnation ties"
  }),

  // =========================================================================
  // 5. AFFECT SLOTS (5 Canonical Slots)
  // =========================================================================
  SOUL_PRESSURE: defineStyleSlot({
    id: "SOUL_PRESSURE",
    semanticRole: SEMANTIC_ROLES.AFFECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["DIVINE_AURA_PRESSURE"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Uy áp giáng lâm, thức hải chấn động, linh hồn đau đớn",
    sourceSemantics: "Source expresses overwhelming psychological / spiritual aura suppression"
  }),
  ELDRITCH_HORROR: defineStyleSlot({
    id: "ELDRITCH_HORROR",
    semanticRole: SEMANTIC_ROLES.AFFECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["UNNAMEABLE_HORROR_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Bất khả danh trạng, lời thì thầm điên loạn",
    sourceSemantics: "Source expresses unfathomable cosmic dread or sanity-shattering fear"
  }),
  ELEGY_SOUL_CALL: defineStyleSlot({
    id: "ELEGY_SOUL_CALL",
    semanticRole: SEMANTIC_ROLES.AFFECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "DIALOGUE"],
    requiredEvidence: ["SOUL_SUMMON_LAMENT"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Hồn quy lai hề, ngậm cười chín suối, âm dương cách biệt",
    sourceSemantics: "Source expresses solemn mourning, calling back departed souls, or grief"
  }),
  ELEGY_HEROIC_SPIRIT: defineStyleSlot({
    id: "ELEGY_HEROIC_SPIRIT",
    semanticRole: SEMANTIC_ROLES.AFFECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "EXPOSITION"],
    requiredEvidence: ["HEROIC_SPIRIT_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Anh hồn bất diệt, âm dung uyển tại",
    sourceSemantics: "Source expresses reverence for undying heroic spirits of fallen warriors"
  }),
  SUPERNATURAL_SPECTER: defineStyleSlot({
    id: "SUPERNATURAL_SPECTER",
    semanticRole: SEMANTIC_ROLES.AFFECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "ACTION"],
    requiredEvidence: ["SPECTER_GHOST_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Lệ quỷ áo đỏ, mắt âm dương, minh hôn",
    sourceSemantics: "Source expresses sinister ghostly presence, malice, or spectral dread"
  }),

  // =========================================================================
  // 6. ATMOSPHERE SLOTS (13 Canonical Slots)
  // =========================================================================
  TEA_DISCOURSE: defineStyleSlot({
    id: "TEA_DISCOURSE",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "DIALOGUE"],
    requiredEvidence: ["TEA_DISCOURSE_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Thưởng trà luận đạo, đàm đạo thế sự",
    sourceSemantics: "Source describes tranquil conversational atmosphere while drinking tea"
  }),
  ALCHEMY_AROMA: defineStyleSlot({
    id: "ALCHEMY_AROMA",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["ALCHEMY_AROMA_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Hương thơm đan dược, dược hương",
    sourceSemantics: "Source describes fragrant medicinal fragrance wafting through the chamber"
  }),
  ALCHEMY_FLAME: defineStyleSlot({
    id: "ALCHEMY_FLAME",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["ALCHEMY_FLAME_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Luyện đan, hỏa diễm, lò đan",
    sourceSemantics: "Source describes alchemy cauldron heating or spirit fire burning"
  }),
  BEAST_ROAR: defineStyleSlot({
    id: "BEAST_ROAR",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["BEAST_ROAR_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Hung thú gầm thét, yêu khí cuồn cuộn",
    sourceSemantics: "Source describes ferocious demonic beast roars shaking the mountains"
  }),
  CULINARY_DELICACY: defineStyleSlot({
    id: "CULINARY_DELICACY",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["FOOD_WINE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Mỹ tửu, trân tu mỹ vị, bàn tiệc",
    sourceSemantics: "Source describes fine wine, gourmet feasts, or festive dining scenes"
  }),
  CULINARY_SENSATION: defineStyleSlot({
    id: "CULINARY_SENSATION",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["TASTE_SENSATION_VERB"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Cảm giác vị giác, vào miệng tan chảy, chén tạc chén thù",
    sourceSemantics: "Source describes subjective palate sensations or toast etiquette"
  }),
  NECROPOLIS_ATMOSPHERE: defineStyleSlot({
    id: "NECROPOLIS_ATMOSPHERE",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["TOMB_COFFIN_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Cổ mộ, quan quách ngàn năm, thi khí, cạm bẫy",
    sourceSemantics: "Source describes ancient mausoleum ambiance, coffins, and tomb chill"
  }),
  COSMIC_CHESS_BOARD: defineStyleSlot({
    id: "COSMIC_CHESS_BOARD",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["CHESSBOARD_METAPHOR"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Thiên địa vi bàn, chúng sinh vi tử",
    sourceSemantics: "Source describes metaphysical perspective viewing heaven/earth as a Go board"
  }),
  DIVINE_SENSE_SCAN: defineStyleSlot({
    id: "DIVINE_SENSE_SCAN",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["PSYCHIC_SWEEP_VERB"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Thần thức quét qua, thần niệm như triều",
    sourceSemantics: "Source describes divine psychic sweep surveying the surrounding landscape"
  }),
  FORBIDDEN_GAZE: defineStyleSlot({
    id: "FORBIDDEN_GAZE",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["GAZE_DEITY_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Nhìn thẳng thần minh, chứng kiến cấm kỵ",
    sourceSemantics: "Source describes gazing directly at a cosmic ancient deity"
  }),
  GRIMOIRE_CURSE: defineStyleSlot({
    id: "GRIMOIRE_CURSE",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["ACTION", "DESCRIPTION"],
    requiredEvidence: ["FORBIDDEN_CURSE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Ma pháp cấm chú, ma lực cuộn trào",
    sourceSemantics: "Source describes forbidden magic curse aura or mana surging"
  }),
  MUSICAL_PERFORMANCE: defineStyleSlot({
    id: "MUSICAL_PERFORMANCE",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC, REALIZATION_DIMENSIONS.RHYTHMIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["MELODIC_INSTRUMENT_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Tiếng đàn du dương, gảy dây đàn, Cao Sơn Lưu Thủy, khúc chung nhân tán",
    sourceSemantics: "Source describes musical zither performance or melodic resonance"
  }),
  TOPOGRAPHY_LANDSCAPE: defineStyleSlot({
    id: "TOPOGRAPHY_LANDSCAPE",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION"],
    requiredEvidence: ["IMMORTAL_LANDSCAPE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Linh khí hóa vụ, mây mù đỉnh núi, động thiên phúc địa, vách đá",
    sourceSemantics: "Source describes mountain topography, spiritual mist, or blessed sanctuary scenery"
  }),

  // =========================================================================
  // 7. DIALOGUE_ACT SLOTS (2 Canonical Slots)
  // =========================================================================
  IMPERIAL_PROCLAMATION: defineStyleSlot({
    id: "IMPERIAL_PROCLAMATION",
    semanticRole: SEMANTIC_ROLES.DIALOGUE_ACT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER, REALIZATION_DIMENSIONS.DIALOGUE_STYLE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DIALOGUE", "EXPOSITION"],
    requiredEvidence: ["ROYAL_EDICT_FORMULA"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Phụng thiên thừa vận, khâm thử",
    sourceSemantics: "Source expresses formal imperial decree or royal proclamation formula"
  }),
  IMPERIAL_SALUTATION: defineStyleSlot({
    id: "IMPERIAL_SALUTATION",
    semanticRole: SEMANTIC_ROLES.DIALOGUE_ACT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER, REALIZATION_DIMENSIONS.DIALOGUE_STYLE],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DIALOGUE", "ACTION"],
    requiredEvidence: ["COURT_SALUTATION_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Lãnh chỉ tạ ân, vạn tuế, đệ trình quốc thư",
    sourceSemantics: "Source expresses court salutations, acknowledging royal decrees, or diplomatic greetings"
  }),

  // =========================================================================
  // 8. NARRATIVE_FUNCTION SLOTS (2 Canonical Slots)
  // =========================================================================
  FORENSIC_MYSTERY: defineStyleSlot({
    id: "FORENSIC_MYSTERY",
    semanticRole: SEMANTIC_ROLES.NARRATIVE_FUNCTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "EXPOSITION"],
    requiredEvidence: ["CRIME_CLUE_NOUN"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Án mạng mật thất, bằng chứng ngoại phạm, dấu vết tơ nhện",
    sourceSemantics: "Source describes locked-room murder mystery or forensic investigative clues"
  }),
  FORENSIC_TRUTH: defineStyleSlot({
    id: "FORENSIC_TRUTH",
    semanticRole: SEMANTIC_ROLES.NARRATIVE_FUNCTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "DIALOGUE"],
    requiredEvidence: ["TRUTH_EXPOSED_VERB"],
    conflictPolicy: CONFLICT_POLICIES.WIN_OR_ABSTAIN,
    description: "Chân tướng đại bạch",
    sourceSemantics: "Source describes complete revelation of hidden truth behind a mystery"
  }),

  // =========================================================================
  // 9. WAVE C1 NORMALIZATION SLOTS (3 Canonical Slots)
  // =========================================================================
  TEMPORAL_MEASURE: defineStyleSlot({
    id: "TEMPORAL_MEASURE",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "DIALOGUE", "EXPOSITION"],
    requiredEvidence: ["TEMPORAL_MEASURE_EXPRESSION"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Ước lượng thời lượng cổ trang (nén nhang, tuần trà, nhịp thở, canh giờ)",
    sourceSemantics: "Source denotes ancient temporal duration measurement"
  }),
  SOUNDSCAPE_EFFECT: defineStyleSlot({
    id: "SOUNDSCAPE_EFFECT",
    semanticRole: SEMANTIC_ROLES.EVENT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.RHYTHMIC],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "DIALOGUE"],
    requiredEvidence: ["SOUNDSCAPE_ONOMATOPOEIA"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Từ tượng thanh, âm thanh va chạm, nổ vang, rắc, phụt, keng, gió rít",
    sourceSemantics: "Source denotes concrete acoustic onomatopoeia or impact soundscape"
  }),
  ATMOSPHERIC_DETAIL: defineStyleSlot({
    id: "ATMOSPHERIC_DETAIL",
    semanticRole: SEMANTIC_ROLES.ATMOSPHERE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.ATMOSPHERIC],
    canMerge: true,
    canCompete: false,
    maxMultiplicity: 2,
    allowedTextRoles: ["DESCRIPTION", "INNER_THOUGHT"],
    requiredEvidence: ["SENSORY_IMAGERY_KEYWORD"],
    conflictPolicy: CONFLICT_POLICIES.ORTHOGONAL_MERGE,
    description: "Chi tiết cảm giác, ánh trăng, hương thơm, sương mù linh khí, hàn ý",
    sourceSemantics: "Source denotes atmospheric sensory imagery (visual, olfactory, thermal, mist)"
  }),

  // =========================================================================
  // 10. WAVE C2A DISCOURSE & SOCIAL ADDRESS SLOTS (2 Canonical Slots)
  // =========================================================================
  SOCIAL_ADDRESS: defineStyleSlot({
    id: "SOCIAL_ADDRESS",
    semanticRole: SEMANTIC_ROLES.DIALOGUE_ACT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER, REALIZATION_DIMENSIONS.DIALOGUE_STYLE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DIALOGUE", "ACTION"],
    requiredEvidence: ["HONORIFIC_ADDRESS_EXPRESSION"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Xưng hô đối thoại tôn ti, sư đồ, quân thần, tiền bối - vãn bối, sư huynh - sư đệ",
    sourceSemantics: "Source denotes interpersonal direct address based on social hierarchy"
  }),
  TITLE_HONORIFIC: defineStyleSlot({
    id: "TITLE_HONORIFIC",
    semanticRole: SEMANTIC_ROLES.OBJECT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "DIALOGUE", "EXPOSITION"],
    requiredEvidence: ["SECT_PEERAGE_TITLE_EXPRESSION"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Tôn xưng, chức vị tông môn, quan tước triều đình, danh xưng tự xưng tôn kính",
    sourceSemantics: "Source denotes institutional or relational honorific title or self-designation"
  }),

  // =========================================================================
  // 11. WAVE C2B-1 MONOLOGUE & INNER THOUGHT SLOTS (1 Canonical Slot)
  // =========================================================================
  INNER_MONOLOGUE: defineStyleSlot({
    id: "INNER_MONOLOGUE",
    semanticRole: SEMANTIC_ROLES.COGNITION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["INNER_THOUGHT"],
    requiredEvidence: ["RESOLVED_COGNITIVE_EVENT"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Hiện thực hóa độc thoại nội tâm, hồi tưởng, quyết định hoặc suy luận đã được Semantic IR xác nhận",
    sourceSemantics: "Source Semantic IR denotes a resolved cognitive/discourse event; inner affective states are excluded"
  }),

  // =========================================================================
  // 12. WAVE C2B-2 BANTER & URBAN SLANG SLOTS (2 Canonical Slots)
  // =========================================================================
  BANTER_RETORT: defineStyleSlot({
    id: "BANTER_RETORT",
    semanticRole: SEMANTIC_ROLES.DIALOGUE_ACT,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.AFFECTIVE, REALIZATION_DIMENSIONS.DIALOGUE_STYLE],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["DIALOGUE"],
    requiredEvidence: ["RESOLVED_SPEAKER", "RESOLVED_LISTENER", "RESOLVED_RELATIONSHIP"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Hiện thực hóa lời thoại mỉa mai, chế giễu, khiêu khích giữa hai nhân vật có quan hệ đã xác nhận",
    sourceSemantics: "Source Semantic IR denotes a resolved banter/taunt/insult/retort dialogue act with confirmed Speaker, Listener, Relationship, Affect, and Register"
  }),
  MODERN_VERNACULAR: defineStyleSlot({
    id: "MODERN_VERNACULAR",
    semanticRole: SEMANTIC_ROLES.STATE,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL, REALIZATION_DIMENSIONS.REGISTER],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    allowedTextRoles: ["ACTION", "DESCRIPTION", "DIALOGUE", "EXPOSITION"],
    requiredEvidence: ["MODERN_SLANG_EXPRESSION"],
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Localise thuật ngữ internet, urban slang, gaming và meme hiện đại sang tiếng Việt tương đương",
    sourceSemantics: "Source contains contemporary Chinese internet slang, gaming jargon, or modern social meme expressions requiring register-aware localization"
  })
});

// Full Provider-Slot Compatibility Map (Static Authorization Registry)
const PROVIDER_SLOT_COMPATIBILITY_MAP = Object.freeze({
  "action-provider": ["ACTION_STRIKE", "ACTION_MOVE", "ACTION_DAMAGE", "WEAPON_STRIKE"],
  "alchemy-provider": ["ALCHEMY_AROMA", "ALCHEMY_FLAME", "ALCHEMY_POTENCY"],
  "apocalypse-provider": ["APOCALYPSE_HORDE", "GENETIC_LIMIT", "ELEMENTAL_AWAKENING"],
  "auction-provider": ["AUCTION_EVENT"],
  "beast-contract-provider": ["BEAST_CONTRACT", "BEAST_EVOLUTION"],
  "bestiary-provider": ["BEAST_ROAR", "BEAST_EVOLUTION"],
  "chronology-provider": ["TEMPORAL_MEASURE", "TRANSCENDENCE_TIME"],
  "cosmic-chess-provider": ["COSMIC_CHESS_BOARD", "CHESS_STRATEGY_MOVE"],
  "culinary-provider": ["CULINARY_DELICACY", "CULINARY_SENSATION"],
  "cyber-scifi-provider": ["CYBER_INTERFACE", "CYBER_MECHA"],
  "daoist-array-provider": ["ARRAY_NODE", "TALISMAN_ACTIVATION"],
  "divine-sense-provider": ["DIVINE_SENSE_SCAN", "SOUL_PRESSURE", "DOMAIN_EXPANSION"],
  "eldritch-provider": ["ELDRITCH_HORROR", "SANITY_COLLAPSE", "FORBIDDEN_GAZE"],
  "elegy-provider": ["ELEGY_SOUL_CALL", "ELEGY_HEROIC_SPIRIT"],
  "forensic-deduction-provider": ["FORENSIC_MYSTERY", "FORENSIC_TRUTH"],
  "grimoire-magic-provider": ["GRIMOIRE_CURSE", "MAGIC_INCANTATION"],
  "imperial-edict-provider": ["IMPERIAL_PROCLAMATION", "IMPERIAL_SALUTATION"],
  "inscript-provider": ["INSCRIPTION_LEGACY", "TALISMAN_ACTIVATION"],
  "karma-provider": ["KARMA_SAMSARA", "DESTINED_DUEL"],
  "mantra-provider": ["MANTRA_SEAL", "WORD_AS_LAW"],
  "meridian-healing-provider": ["MERIDIAN_ACUPOINT", "HEALING_PURGE"],
  "monologue-provider": ["INNER_MONOLOGUE"],
  "banter-provider": ["BANTER_RETORT"],
  "urban-slang-provider": ["MODERN_VERNACULAR"],
  "musical-dao-provider": ["MUSICAL_PERFORMANCE", "MUSICAL_ATTACK"],
  "necropolis-provider": ["NECROPOLIS_ATMOSPHERE"],
  "sensory-provider": ["ATMOSPHERIC_DETAIL", "TOPOGRAPHY_LANDSCAPE"],
  "soul-token-provider": ["SOUL_TOKEN_STATE"],
  "soundscape-provider": ["SOUNDSCAPE_EFFECT"],
  "spatial-provider": ["SPATIAL_VOID"],
  "supernatural-provider": ["SUPERNATURAL_SPECTER", "TAOIST_EXORCISM", "NETHERWORLD_PARADE"],
  "sword-provider": ["WEAPON_DRAW", "WEAPON_STRIKE", "WEAPON_INTENT"],
  "title-hierarchy-provider": ["SOCIAL_ADDRESS", "TITLE_HONORIFIC", "IMPERIAL_SALUTATION"],
  "topography-provider": ["TOPOGRAPHY_LANDSCAPE", "SEVERED_VITALITY"],
  "transcendence-provider": ["TRANSCENDENCE_TIME", "SOLITARY_DAO"],
  "tribulation-provider": ["TRIBULATION_LIGHTNING", "CELESTIAL_PHENOMENON", "REALM_BREAKTHROUGH"],
  "warfare-provider": ["WAR_DRUMS", "WARFARE_CHARGE", "BLOODY_BATTLEFIELD"],
  "zen-tea-provider": ["TEA_PREPARATION", "TEA_DISCOURSE", "ZEN_STATE"]
});

/**
 * Validates whether a provider is authorized to contribute to a target slot.
 * 
 * @param {string} providerId
 * @param {string} slotId
 * @returns {boolean}
 */
function validateProviderSlotCompatibility(providerId, slotId) {
  if (!providerId || !slotId) return false;
  const allowedSlots = PROVIDER_SLOT_COMPATIBILITY_MAP[providerId];
  if (!allowedSlots) return false;
  return allowedSlots.includes(slotId);
}

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
    semanticRole: SEMANTIC_ROLES.ACTION,
    realizationDimensions: [REALIZATION_DIMENSIONS.LEXICAL],
    canMerge: false,
    canCompete: true,
    maxMultiplicity: 1,
    conflictPolicy: CONFLICT_POLICIES.COMPOSITE_SCORE,
    description: "Dynamic or custom slot",
    sourceSemantics: "Dynamic unmapped slot"
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

/**
 * Returns all canonical StyleSlot definitions.
 */
function getAllSlotDefinitions() {
  return STYLE_SLOT_DEFINITIONS;
}

module.exports = {
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
};
