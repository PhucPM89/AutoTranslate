"use strict";

/**
 * Court Politics & Conspiracy Semantic Provider (Phase 3 - Wave C3-C1)
 * Domain: POLITICAL_INTRIGUE
 * 
 * Semantic Model (Political Intrigue Taxonomy):
 * 1. COURT_UNDERCURRENT        — Palace undercurrents, subtle court tension (暗流涌动)
 * 2. HIGH_TREASON_CRIME        — Crimes against the sovereign, treason decrees (欺君犯上, 株连九族)
 * 3. RUTHLESS_STRATAGEM        — Ruthless betrayal schemes, power moves (狼子野心, 借刀杀人, 兔死狗烹, 设计陷害)
 * 4. EXPLICIT_CONSPIRACY_PLAN  — Confirmed multi-party plots, forged edicts (早已谋划, 里应外合, 伪造诏书)
 * 
 * Core Architecture Invariants (C3-0 Hardened):
 * - Provider is NOT an Inference Engine: Provider never infers hidden intent from neutral gestures.
 * - Core Principle: "A smile is not a conspiracy. A political setting is not proof of conspiracy. A hostile emotion is not proof of conspiracy."
 * - Evidence Hierarchy Strictly Enforced:
 *   * STRONG: Explicit plans (早已谋划), explicit thoughts (等入城便动手), explicit treason acts (伪造诏书), confirmed idioms (狼子野心, 借刀杀人, 欺君犯上, 株连九族, 暗流涌动).
 *   * WEAK: Smiles (微微一笑), silence (沉默), glances (冷冷看着), tea drinking (喝茶), calm demeanor.
 *   * WEAK evidence strictly ABSTAINS (0 contributions).
 * - Context Gating: Imperial court context enables interpretation, but never serves as standalone proof of conspiracy.
 * - Dialogue Safety: Spoken statements stay in character voice without injecting narrator conspiracy commentary.
 * - POV Safety: Third-person limited narrative strictly rejects unobserved hidden plans of non-POV characters.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

// =========================================================================
// Political Intrigue Taxonomy Constants
// =========================================================================
const CONSPIRACY_CATEGORIES = Object.freeze({
  COURT_UNDERCURRENT: "COURT_UNDERCURRENT",
  HIGH_TREASON_CRIME: "HIGH_TREASON_CRIME",
  RUTHLESS_STRATAGEM: "RUTHLESS_STRATAGEM",
  EXPLICIT_CONSPIRACY_PLAN: "EXPLICIT_CONSPIRACY_PLAN"
});

// =========================================================================
// Canonical Conspiracy Realization Definitions (10 Rules)
// =========================================================================
const CONSPIRACY_DEFINITIONS = Object.freeze([
  // 1. Court Undercurrent: Palace Tension (暗流涌动)
  {
    ruleId: "CONSPIRACY_R01_UNDERCURRENT",
    category: CONSPIRACY_CATEGORIES.COURT_UNDERCURRENT,
    targetZh: "暗流涌动",
    pattern: /(?:sóng ngầm cuộn trào|ám lưu dũng động|暗流涌动)/i,
    candidateVi: "sóng ngầm cuộn trào nơi thâm cung nội viện",
    signature: createSemanticSignature({
      denotation: "PALACE_UNDERCURRENT_TENSION",
      affectDistribution: { SOLEMN: 0.85, SUSPICION: 0.80 },
      valence: -0.50,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "COLD_CALCULATING",
    priority: 0.90
  },

  // 2. High Treason: Deceiving the Sovereign (欺君犯上 / 欺君罔上)
  {
    ruleId: "CONSPIRACY_R02_HIGH_TREASON",
    category: CONSPIRACY_CATEGORIES.HIGH_TREASON_CRIME,
    targetZh: "欺君犯上",
    pattern: /(?:khi quân võng thượng|khi quân phạm thượng|khi quân mạt thượng|欺君犯上|欺君罔上)/i,
    candidateVi: "tội tày đình khi quân phạm thượng, muôn chết không tha",
    signature: createSemanticSignature({
      denotation: "HIGH_TREASON_SOVEREIGN_INSULT",
      affectDistribution: { WRATH: 0.95, SOLEMN: 0.90 },
      valence: -0.85,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "IMPERIAL_WRATH",
    priority: 0.95
  },

  // 3. Dynastic Punishment: Nine Clan Extermination (株连九族 / 诛连九族)
  {
    ruleId: "CONSPIRACY_R03_NINE_CLANS_EXTERMINATION",
    category: CONSPIRACY_CATEGORIES.HIGH_TREASON_CRIME,
    targetZh: "株连九族",
    pattern: /(?:tru di cửu tộc|chu liên cửu tộc|株连九族|诛连九族)/i,
    candidateVi: "tội đáng tru di cửu tộc",
    signature: createSemanticSignature({
      denotation: "NINE_CLANS_EXTERMINATION_DECREE",
      affectDistribution: { SOLEMN: 1.0, WRATH: 0.90 },
      valence: -0.90,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "IMPERIAL_DECREE_TERROR",
    priority: 0.95
  },

  // 4. Insidious Ambition: Wolf-Cub Ambition (狼子野心)
  {
    ruleId: "CONSPIRACY_R04_WOLF_AMBITION",
    category: CONSPIRACY_CATEGORIES.RUTHLESS_STRATAGEM,
    targetZh: "狼子野心",
    pattern: /(?:dã tâm lang sói|lang tử dã tâm|狼子野心)/i,
    candidateVi: "dã tâm lang sói muôn phần hiểm độc khó lường",
    signature: createSemanticSignature({
      denotation: "INSIDIOUS_TREASONOUS_AMBITION",
      affectDistribution: { HOSTILITY: 0.90, SOLEMN: 0.75 },
      valence: -0.80,
      intensity: 0.88,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "RUTHLESS_TREASON",
    priority: 0.92
  },

  // 5. Ruthless Scheme: Borrow Knife To Kill (借刀杀人)
  {
    ruleId: "CONSPIRACY_R05_BORROW_KNIFE",
    category: CONSPIRACY_CATEGORIES.RUTHLESS_STRATAGEM,
    targetZh: "借刀杀人",
    pattern: /(?:mượn đao giết người|tá đao sát nhân|借刀杀人)/i,
    candidateVi: "mượn đao giết người không vấy một giọt máu",
    signature: createSemanticSignature({
      denotation: "BORROW_KNIFE_MURDER_STRATAGEM",
      affectDistribution: { HOSTILITY: 0.85, SOLEMN: 0.80 },
      valence: -0.75,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "SINISTER_SCHEME",
    priority: 0.90
  },

  // 6. Treacherous Betrayal: Cooking The Hound (兔死狗烹 / 鸟尽弓藏)
  {
    ruleId: "CONSPIRACY_R06_COOK_THE_HOUND",
    category: CONSPIRACY_CATEGORIES.RUTHLESS_STRATAGEM,
    targetZh: "兔死狗烹",
    pattern: /(?:thỏ chết chó bị mổ|thỏ chết chó săn bị nấu|chim hết bẻ cung|thỏ tử cẩu phanh|兔死狗烹|鸟尽弓藏)/i,
    candidateVi: "chim hết bẻ cung, thỏ chết chó săn ắt bị làm thịt",
    signature: createSemanticSignature({
      denotation: "RUTHLESS_PURGE_OF_LOYAL_PAWNS",
      affectDistribution: { MELANCHOLY: 0.85, SOLEMN: 0.90 },
      valence: -0.80,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CHILLING_CYNICISM",
    priority: 0.90
  },

  // 7. Explicit Plan: Long-Planned Scheme (早已谋划 / 早有预谋)
  {
    ruleId: "CONSPIRACY_R07_LONG_PLANNED_SCHEME",
    category: CONSPIRACY_CATEGORIES.EXPLICIT_CONSPIRACY_PLAN,
    targetZh: "早已谋划",
    pattern: /(?:sớm đã mưu tính|mưu đồ từ lâu|đã sớm bày sẵn|sớm đã tính kế|早已谋划|早有预谋|暗中谋划)/i,
    candidateVi: "sớm đã bày sẵn kế sách vẹn toàn",
    signature: createSemanticSignature({
      denotation: "PREMEDITATED_CONSPIRACY_SCHEME",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.80 },
      valence: -0.40,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CALCULATING_INSIGHT",
    priority: 0.90
  },

  // 8. Coordinated Treason: Colluding Inside and Out (里应外合)
  {
    ruleId: "CONSPIRACY_R08_INSIDE_OUTSIDE_COLLUSION",
    category: CONSPIRACY_CATEGORIES.EXPLICIT_CONSPIRACY_PLAN,
    targetZh: "里应外合",
    pattern: /(?:lý ứng ngoại hợp|trong ngoài phối hợp|trong ngoài cấu kết|里应外合)/i,
    candidateVi: "trong ngoài tương ứng, ngầm cấu kết",
    signature: createSemanticSignature({
      denotation: "COORDINATED_COVERT_TREASON",
      affectDistribution: { RESOLUTE: 0.85, SOLEMN: 0.80 },
      valence: -0.60,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CLANDESTINE_COLLUSION",
    priority: 0.90
  },

  // 9. Framing Scheme: Design and Frame (设计陷害)
  {
    ruleId: "CONSPIRACY_R09_DESIGN_AND_FRAME",
    category: CONSPIRACY_CATEGORIES.RUTHLESS_STRATAGEM,
    targetZh: "设计陷害",
    pattern: /(?:thiết kế hãm hại|bày mưu hãm hại|gài bẫy hãm hại|设计陷害)/i,
    candidateVi: "bày mưu tính kế hãm hại",
    signature: createSemanticSignature({
      denotation: "DELIBERATE_MALICIOUS_FRAMING",
      affectDistribution: { HOSTILITY: 0.90, SOLEMN: 0.75 },
      valence: -0.75,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "MALICIOUS_FRAME",
    priority: 0.90
  },

  // 10. Forged Edict: Forging Imperial Decree (伪造诏书 / 伪造圣旨)
  {
    ruleId: "CONSPIRACY_R10_FORGED_IMPERIAL_EDICT",
    category: CONSPIRACY_CATEGORIES.EXPLICIT_CONSPIRACY_PLAN,
    targetZh: "伪造诏书",
    pattern: /(?:giả mạo thánh chỉ|giả mạo chiếu thư|ngụy tạo thánh chỉ|伪造诏书|伪造圣旨)/i,
    candidateVi: "giả mạo thánh chỉ, mưu đồ bất chính",
    signature: createSemanticSignature({
      denotation: "FORGED_IMPERIAL_DECREE_TREASON",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.85 },
      valence: -0.80,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "HIGH_TREASON_CRIME",
    priority: 0.95
  }
]);

// =========================================================================
// Negative Assertion & Invariant Validator
// =========================================================================

/**
 * Validates that conspiracy expressions are strictly backed by confirmed semantic evidence.
 * 
 * Guards:
 * 1. A Smile is NOT a conspiracy: "微微一笑" / "mỉm cười" without explicit scheming -> ABSTAIN.
 * 2. Silence / Pauses are NOT a conspiracy: "沉默片刻" / "im lặng" -> ABSTAIN.
 * 3. Cold glances are NOT a conspiracy: "冷冷看着" / "ánh mắt lạnh lùng" -> ABSTAIN.
 * 4. Court setting alone is NOT proof of conspiracy: "朝堂" + demeanor -> ABSTAIN.
 * 5. Titles alone are NOT a conspiracy: "王爷微微一笑" -> ABSTAIN.
 * 6. Sarcastic dialogue / Banter is NOT a conspiracy: "“你可真厉害。”" -> ABSTAIN.
 * 7. POV Safety: Limited POV cannot assert unobserved hidden intentions of others.
 * 
 * @param {Object} clauseIR
 * @param {Object} context
 * @param {Object} def
 * @returns {{ allowed: boolean, reason: string }}
 */
function validateConspiracyEvidence(clauseIR, context = {}, def) {
  const sourceZh = String(clauseIR.sourceZh || "");
  const translatedText = String((context && context.translatedText) || "");

  // 1. Weak evidence guard: Neutral demeanor (smiles, silence, glances, tea drinking)
  const isNeutralDemeanor = /(?:微微一笑|淡淡一笑|相视一笑|嘴角微扬|沉默|冷冷地看着|冷眼旁观|端起茶杯|轻啜一口|mỉm cười|nụ cười|im lặng|lạnh lùng nhìn|uống trà)/i.test(sourceZh) ||
                           /(?:mỉm cười|nở nụ cười|im lặng|lạnh lùng nhìn|uống một ngụm trà)/i.test(translatedText);

  const hasExplicitConspiracyMarker = /(?:暗流|欺君|诛连|株连|狼子野心|借刀杀人|兔死狗烹|鸟尽弓藏|谋划|预谋|里应外合|设计陷害|伪造|sóng ngầm|khi quân|tru di|dã tâm|mượn đao|thỏ chết|mưu tính|cấu kết|hãm hại|giả mạo)/i.test(sourceZh) ||
                                     /(?:sóng ngầm|khi quân|tru di|dã tâm lang sói|mượn đao|thỏ chết|bày sẵn kế|cấu kết|hãm hại|giả mạo thánh chỉ)/i.test(translatedText);

  if (isNeutralDemeanor && !hasExplicitConspiracyMarker) {
    return {
      allowed: false,
      reason: "REJECT_NEUTRAL_DEMEANOR_FROM_CONSPIRACY"
    };
  }

  // 2. Banter dialogue guard: Sarcastic retort without conspiracy evidence
  if (context.isBanter === true && !hasExplicitConspiracyMarker) {
    return {
      allowed: false,
      reason: "REJECT_BANTER_DIALOGUE_FROM_CONSPIRACY"
    };
  }

  // 3. POV Safety Guard
  const pov = (clauseIR.cognitiveEvent && clauseIR.cognitiveEvent.pov) || context.pov || "THIRD_PERSON_LIMITED";
  if (pov === "THIRD_PERSON_LIMITED" && context.assertUnobservedIntent === true) {
    return {
      allowed: false,
      reason: "REJECT_UNOBSERVED_INTENT_IN_LIMITED_POV"
    };
  }

  return { allowed: true, reason: "CONSPIRACY_EVIDENCE_VALIDATED" };
}

// =========================================================================
// Provider Factory
// =========================================================================
function createConspiracyProvider() {
  return Object.freeze({
    providerId: "conspiracy-provider",
    domain: "POLITICAL_INTRIGUE",
    supportedSlots: [STYLE_SLOTS.POLITICAL_INTRIGUE],

    /**
     * Inspects a ClauseIR and produces StylistContributions for confirmed political intrigue.
     * 
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      const sourceZh = clauseIR.sourceZh;
      const translatedText = (context && context.translatedText) || "";
      const searchText = translatedText || sourceZh;
      const contributions = [];

      for (const def of CONSPIRACY_DEFINITIONS) {
        if (!def.pattern.test(searchText) && !sourceZh.includes(def.targetZh)) {
          continue;
        }

        // Validate negative assertions and genuine conspiracy evidence
        const evidenceCheck = validateConspiracyEvidence(clauseIR, context, def);
        if (!evidenceCheck.allowed) {
          continue;
        }

        contributions.push(
          createStylistContribution({
            providerId: "conspiracy-provider",
            domain: "POLITICAL_INTRIGUE",
            targetSlot: STYLE_SLOTS.POLITICAL_INTRIGUE,
            dimension: "LEXICAL",
            sourceSpanZh: def.targetZh,
            candidateVi: def.candidateVi,
            semanticRequirements: {
              conspiracyCategory: def.category,
              requiredEvidence: ["CONSPIRACY_EVIDENCE"]
            },
            semanticSignature: def.signature,
            tone: def.tone,
            register: def.signature.register,
            rhythmPreference: "MEASURED_FORMAL",
            lexicalPriority: def.priority,
            confidence: 0.95,
            semanticExpansionCost: 0.0,
            introducedInformation: [],
            introducedMetaphor: false,
            surfaceRealization: true,
            provenance: `conspiracy-provider:${def.ruleId}->${STYLE_SLOTS.POLITICAL_INTRIGUE}:${def.category}`
          })
        );
      }

      return contributions;
    },

    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context.domainWeights && context.domainWeights.POLITICAL_INTRIGUE) || 0.85;
      return Object.freeze({
        providerId: "conspiracy-provider",
        domain: "POLITICAL_INTRIGUE",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createConspiracyProvider,
  validateConspiracyEvidence,
  CONSPIRACY_DEFINITIONS,
  CONSPIRACY_CATEGORIES
};
