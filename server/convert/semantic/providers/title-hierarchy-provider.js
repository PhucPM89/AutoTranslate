"use strict";

/**
 * Title Hierarchy & Social Address Contribution Provider (Phase 2B - Wave C2A)
 * Domain: TITLE_HIERARCHY
 * 
 * Target Slots:
 * - SOCIAL_ADDRESS (Direct address: Sư tôn, Tiền bối, Bệ hạ, Điện hạ, Vương gia, Sư huynh, Sư đệ)
 * - TITLE_HONORIFIC (Sect titles, court titles & self-designations: Bổn cung, Ai gia, Vi thần, Mạt tướng, Bần đạo, Lão nạp, Thái Thượng Trưởng lão)
 * - IMPERIAL_SALUTATION (Khởi bẩm Bệ hạ, Tạ Chủ long ân)
 * 
 * Architecture Invariants:
 * - Entity & Discourse Aware: Distinguishes DIRECT_ADDRESS vs NARRATIVE_REFERENCE vs SELF_REFERENCE.
 * - Zero Pronoun Injection: Never injects external pronouns (hắn, nàng, ta, ngươi) into title contributions.
 * - Contextual Hierarchy: Adapts courtly, sect, religious, or peerage registers based on discourse role.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const TITLE_HIERARCHY_DEFINITIONS = [
  // =========================================================================
  // 1. Imperial Self-Designations & Court Greetings (TITLE_HONORIFIC / IMPERIAL_SALUTATION)
  // =========================================================================
  {
    targetZh: "哀家",
    pattern: /哀家/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Ai gia",
    signature: createSemanticSignature({
      denotation: "EMPRESS_DOWAGER_SELF_REF",
      affectDistribution: { SOLEMN: 0.90, ELEVATED: 0.85 },
      valence: 0.50,
      intensity: 0.60,
      register: "SOLEMN_DECREE"
    }),
    discourseRole: "SELF_REFERENCE",
    tone: "ELEVATED",
    priority: 0.95,
    expansionCost: 0.0,
    requiredRoles: ["DIALOGUE"]
  },
  {
    targetZh: "本宫",
    pattern: /本宫/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Bổn cung",
    signature: createSemanticSignature({
      denotation: "IMPERIAL_CONSORT_SELF_REF",
      affectDistribution: { SOLEMN: 0.85, ELEVATED: 0.80 },
      valence: 0.50,
      intensity: 0.60,
      register: "SOLEMN_DECREE"
    }),
    discourseRole: "SELF_REFERENCE",
    tone: "ELEVATED",
    priority: 0.95,
    expansionCost: 0.0,
    requiredRoles: ["DIALOGUE"]
  },
  {
    targetZh: "微臣",
    pattern: /微臣|臣/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Vi thần",
    signature: createSemanticSignature({
      denotation: "COURT_MINISTER_SELF_REF",
      affectDistribution: { SOLEMN: 0.90 },
      valence: 0.50,
      intensity: 0.50,
      register: "SOLEMN_DECREE"
    }),
    discourseRole: "SELF_REFERENCE",
    tone: "SOLEMN",
    priority: 0.95,
    expansionCost: 0.0,
    requiredRoles: ["DIALOGUE"]
  },
  {
    targetZh: "末将",
    pattern: /末将/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Mạt tướng",
    signature: createSemanticSignature({
      denotation: "MILITARY_GENERAL_SELF_REF",
      affectDistribution: { RESOLUTE: 0.85, SOLEMN: 0.80 },
      valence: 0.50,
      intensity: 0.60,
      register: "SOLEMN_DECREE"
    }),
    discourseRole: "SELF_REFERENCE",
    tone: "SOLEMN",
    priority: 0.95,
    expansionCost: 0.0,
    requiredRoles: ["DIALOGUE"]
  },
  {
    targetZh: "启禀陛下",
    pattern: /启禀陛下|启禀圣上|启禀皇上/,
    targetSlot: STYLE_SLOTS.IMPERIAL_SALUTATION,
    candidateVi: "Khởi bẩm Bệ hạ",
    signature: createSemanticSignature({
      denotation: "PETITION_MONARCH_FORMULA",
      affectDistribution: { SOLEMN: 0.95 },
      valence: 0.50,
      intensity: 0.70,
      register: "SOLEMN_DECREE"
    }),
    discourseRole: "DIRECT_ADDRESS",
    tone: "SOLEMN",
    priority: 0.98,
    expansionCost: 0.0,
    requiredRoles: ["DIALOGUE", "ACTION"]
  },
  {
    targetZh: "谢主隆恩",
    pattern: /谢主隆恩|叩谢天恩/,
    targetSlot: STYLE_SLOTS.IMPERIAL_SALUTATION,
    candidateVi: "Tạ Chủ long ân",
    signature: createSemanticSignature({
      denotation: "THANKS_IMPERIAL_GRACE",
      affectDistribution: { SOLEMN: 0.95, AWE: 0.80 },
      valence: 0.70,
      intensity: 0.75,
      register: "SOLEMN_DECREE"
    }),
    discourseRole: "DIRECT_ADDRESS",
    tone: "SOLEMN",
    priority: 0.98,
    expansionCost: 0.0,
    requiredRoles: ["DIALOGUE", "ACTION"]
  },

  // =========================================================================
  // 2. Religious & Daoist Self-Designations (TITLE_HONORIFIC)
  // =========================================================================
  {
    targetZh: "老衲",
    pattern: /老衲/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Lão nạp",
    signature: createSemanticSignature({
      denotation: "BUDDHIST_ELDER_SELF_REF",
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.80 },
      valence: 0.50,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "SELF_REFERENCE",
    tone: "SERENE",
    priority: 0.95,
    expansionCost: 0.0,
    requiredRoles: ["DIALOGUE"]
  },
  {
    targetZh: "贫僧",
    pattern: /贫僧/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Bần tăng",
    signature: createSemanticSignature({
      denotation: "BUDDHIST_MONK_SELF_REF",
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.75 },
      valence: 0.50,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "SELF_REFERENCE",
    tone: "SERENE",
    priority: 0.95,
    expansionCost: 0.0,
    requiredRoles: ["DIALOGUE"]
  },
  {
    targetZh: "贫道",
    pattern: /贫道/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Bần đạo",
    signature: createSemanticSignature({
      denotation: "DAOIST_PRIEST_SELF_REF",
      affectDistribution: { TRANQUIL: 0.90, ELEVATED: 0.75 },
      valence: 0.50,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "SELF_REFERENCE",
    tone: "SERENE",
    priority: 0.95,
    expansionCost: 0.0,
    requiredRoles: ["DIALOGUE"]
  },

  // =========================================================================
  // 3. Sect Hierarchical & Peerage Titles (TITLE_HONORIFIC - Narrative Reference)
  // =========================================================================
  {
    targetZh: "掌门师兄",
    pattern: /掌门师兄/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Chưởng môn sư huynh",
    signature: createSemanticSignature({
      denotation: "SECT_LEADER_SENIOR_TITLE",
      affectDistribution: { SOLEMN: 0.85 },
      valence: 0.50,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "RELATIONSHIP_TITLE",
    tone: "SOLEMN",
    priority: 0.95,
    expansionCost: 0.0
  },
  {
    targetZh: "掌门师弟",
    pattern: /掌门师弟/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Chưởng môn sư đệ",
    signature: createSemanticSignature({
      denotation: "SECT_LEADER_JUNIOR_TITLE",
      affectDistribution: { SOLEMN: 0.85 },
      valence: 0.50,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "RELATIONSHIP_TITLE",
    tone: "SOLEMN",
    priority: 0.95,
    expansionCost: 0.0
  },
  {
    targetZh: "太上长老",
    pattern: /太上长老/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Thái Thượng Trưởng lão",
    signature: createSemanticSignature({
      denotation: "SUPREME_ELDER_TITLE",
      affectDistribution: { SOLEMN: 0.95, ELEVATED: 0.90 },
      valence: 0.50,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "OFFICIAL_TITLE",
    tone: "ELEVATED",
    priority: 0.95,
    expansionCost: 0.0
  },
  {
    targetZh: "太上老祖",
    pattern: /太上老祖/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Thái Thượng Lão tổ",
    signature: createSemanticSignature({
      denotation: "SUPREME_ANCESTOR_TITLE",
      affectDistribution: { SOLEMN: 0.95, ELEVATED: 0.90 },
      valence: 0.50,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "OFFICIAL_TITLE",
    tone: "ELEVATED",
    priority: 0.95,
    expansionCost: 0.0
  },
  {
    targetZh: "掌教至尊",
    pattern: /掌教至尊/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "Chưởng giáo Chí tôn",
    signature: createSemanticSignature({
      denotation: "SECT_SUPREME_LEADER_TITLE",
      affectDistribution: { SOLEMN: 0.95, ELEVATED: 0.90 },
      valence: 0.50,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "OFFICIAL_TITLE",
    tone: "ELEVATED",
    priority: 0.95,
    expansionCost: 0.0
  },

  // =========================================================================
  // 4. Interpersonal Direct Address & Discourse Hierarchy (SOCIAL_ADDRESS)
  // =========================================================================
  {
    targetZh: "师尊",
    pattern: /师尊/,
    targetSlot: STYLE_SLOTS.SOCIAL_ADDRESS,
    candidateVi: "sư tôn",
    signature: createSemanticSignature({
      denotation: "REVERED_MASTER_ADDRESS",
      affectDistribution: { SOLEMN: 0.90, ELEVATED: 0.80 },
      valence: 0.60,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "DIRECT_ADDRESS",
    tone: "SOLEMN",
    priority: 0.95,
    expansionCost: 0.0
  },
  {
    targetZh: "前辈",
    pattern: /前辈/,
    targetSlot: STYLE_SLOTS.SOCIAL_ADDRESS,
    candidateVi: "tiền bối",
    signature: createSemanticSignature({
      denotation: "SENIOR_ELDER_ADDRESS",
      affectDistribution: { SOLEMN: 0.85 },
      valence: 0.55,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "DIRECT_ADDRESS",
    tone: "SOLEMN",
    priority: 0.90,
    expansionCost: 0.0
  },
  {
    targetZh: "师兄",
    pattern: /师兄/,
    targetSlot: STYLE_SLOTS.SOCIAL_ADDRESS,
    candidateVi: "sư huynh",
    signature: createSemanticSignature({
      denotation: "SENIOR_BROTHER_ADDRESS",
      affectDistribution: { TRANQUIL: 0.70, SOLEMN: 0.60 },
      valence: 0.60,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "DIRECT_ADDRESS",
    tone: "NEUTRAL",
    priority: 0.90,
    expansionCost: 0.0
  },
  {
    targetZh: "师弟",
    pattern: /师弟/,
    targetSlot: STYLE_SLOTS.SOCIAL_ADDRESS,
    candidateVi: "sư đệ",
    signature: createSemanticSignature({
      denotation: "JUNIOR_BROTHER_ADDRESS",
      affectDistribution: { TRANQUIL: 0.70, SOLEMN: 0.60 },
      valence: 0.60,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    discourseRole: "DIRECT_ADDRESS",
    tone: "NEUTRAL",
    priority: 0.90,
    expansionCost: 0.0
  },
  {
    targetZh: "王爷",
    pattern: /王爷/,
    targetSlot: STYLE_SLOTS.TITLE_HONORIFIC,
    candidateVi: "vương gia",
    signature: createSemanticSignature({
      denotation: "ROYAL_PRINCE_TITLE",
      affectDistribution: { SOLEMN: 0.85, ELEVATED: 0.75 },
      valence: 0.50,
      intensity: 0.55,
      register: "SOLEMN_DECREE"
    }),
    discourseRole: "OFFICIAL_TITLE",
    tone: "SOLEMN",
    priority: 0.90,
    expansionCost: 0.0
  }
];

function createTitleHierarchyProvider() {
  return Object.freeze({
    providerId: "title-hierarchy-provider",
    domain: "TITLE_HIERARCHY",
    supportedSlots: [STYLE_SLOTS.SOCIAL_ADDRESS, STYLE_SLOTS.TITLE_HONORIFIC, STYLE_SLOTS.IMPERIAL_SALUTATION],

    /**
     * Inspects a ClauseIR and produces StylistContributions.
     * 
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      const contributions = [];
      const sourceZh = clauseIR.sourceZh;
      const textRole = clauseIR.role || "NARRATION";

      for (const def of TITLE_HIERARCHY_DEFINITIONS) {
        if (def.pattern.test(sourceZh)) {
          // Check role requirements if specified (e.g. self-references only active in dialogue)
          if (def.requiredRoles && !def.requiredRoles.includes(textRole)) {
            continue;
          }

          contributions.push(
            createStylistContribution({
              providerId: "title-hierarchy-provider",
              domain: "TITLE_HIERARCHY",
              targetSlot: def.targetSlot,
              dimension: "LEXICAL",
              sourceSpanZh: def.targetZh,
              candidateVi: def.candidateVi,
              semanticRequirements: { discourseRole: def.discourseRole },
              semanticSignature: def.signature,
              tone: def.tone,
              register: def.signature.register,
              rhythmPreference: "FLOWING_BALANCED",
              lexicalPriority: def.priority,
              confidence: 0.95,
              semanticExpansionCost: def.expansionCost,
              introducedInformation: [],
              introducedMetaphor: false,
              surfaceRealization: true,
              provenance: `title-hierarchy-provider:${def.targetZh}->${def.targetSlot}:${def.discourseRole}`
            })
          );
        }
      }

      return contributions;
    },

    /**
     * Standard provider getSuggestions interface.
     */
    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context && context.domainWeights && context.domainWeights.TITLE_HIERARCHY) || 0.80;
      return Object.freeze({
        providerId: "title-hierarchy-provider",
        domain: "TITLE_HIERARCHY",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createTitleHierarchyProvider,
  TITLE_HIERARCHY_DEFINITIONS
};
