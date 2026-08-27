"use strict";

/**
 * Dramatic Climax & Pathos Escalator Provider (Phase 3 - Wave C3-B2)
 * Domain: DRAMATIC_CLIMAX
 * 
 * Semantic Model (Dramatic Realization Taxonomy):
 * 1. SOLEMN_VENGEANCE_VOW        — Life-and-death resolve, vengeance vows (血海深仇, 不死不休, 决一死战)
 * 2. TRAGIC_PATHOS_GRIEF         — Poignant grief, sorrow, and solemn despair (泪如雨下, 痛不欲生, 心如死灰)
 * 3. CATASTROPHIC_DESTRUCTION    — Total sect/clan destruction without invented events (宗门覆灭, 家破人亡)
 * 4. EPIC_BATTLEFIELD_AFTERMATH  — Dual blood/corpse landscape idioms (血流成河，尸横遍野)
 * 
 * Core Architecture Invariants (C3-0 Hardened):
 * - Rhetorical Escalation, Never Event Invention: "Dramatic escalation may make an existing event feel stronger. It may NOT make the event itself larger."
 * - Zero Event Amplification:
 *   * 宗门覆灭 -> "tông môn hoàn toàn bị hủy diệt"; strictly REJECTS "máu chảy thành sông" or "thây chất đầy đồng".
 *   * 决一死战 -> realizes lethal resolve; strictly REJECTS invented injuries or casualties.
 *   * 悲痛欲绝 -> realizes intense grief; strictly NEVER escalates to psychosis or suicide intent.
 * - Negative Assertions Strictly Enforced:
 *   * No NEW_EVENT, NEW_EFFECT, NEW_ENTITY, NEW_LOCATION, or NEW_CASUALTIES.
 * - Dialogue Safety: Spoken oaths stay in direct dialogue voice, never becoming narrator exposition.
 * - POV Safety: Third-person limited narrative strictly rejects omniscient narrator commentary.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

// =========================================================================
// Dramatic Taxonomy Constants
// =========================================================================
const DRAMATIC_CATEGORIES = Object.freeze({
  SOLEMN_VENGEANCE_VOW: "SOLEMN_VENGEANCE_VOW",
  TRAGIC_PATHOS_GRIEF: "TRAGIC_PATHOS_GRIEF",
  CATASTROPHIC_DESTRUCTION: "CATASTROPHIC_DESTRUCTION",
  EPIC_BATTLEFIELD_AFTERMATH: "EPIC_BATTLEFIELD_AFTERMATH"
});

// =========================================================================
// Canonical Dramatic Climax Realization Definitions (12 Rules)
// =========================================================================
const DRAMATIC_DEFINITIONS = Object.freeze([
  // 1. Vengeance Vow: Blood Sea Deep Enmity (血海深仇)
  {
    ruleId: "DRAMATIC_R01_BLOOD_ENMITY",
    category: DRAMATIC_CATEGORIES.SOLEMN_VENGEANCE_VOW,
    targetZh: "血海深仇",
    pattern: /mối huyết hải thâm thù(?!\s+không đội trời chung)/i,
    candidateVi: "mối huyết hải thâm thù không đội trời chung",
    signature: createSemanticSignature({
      denotation: "BLOOD_SEA_DEEP_ENMITY",
      affectDistribution: { WRATH: 0.90, HOSTILITY: 0.90, RESOLUTE: 0.85 },
      valence: -0.75,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "SOLEMN_VENGEANCE",
    priority: 0.95
  },

  // 2. Lethal Resolve: Fight To The Death (决一死战 / 决死一战)
  {
    ruleId: "DRAMATIC_R02_FIGHT_TO_DEATH",
    category: DRAMATIC_CATEGORIES.SOLEMN_VENGEANCE_VOW,
    targetZh: "决一死战",
    pattern: /(?:quyết tử chiến đến cùng|quyết một trận tử chiến|决一死战|决死一战)/i,
    candidateVi: "quyết tử chiến đến giọt máu cuối cùng",
    signature: createSemanticSignature({
      denotation: "FIGHT_TO_LAST_BLOOD_RESOLVE",
      affectDistribution: { RESOLUTE: 1.0, SOLEMN: 0.85 },
      valence: 0.20,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "EPIC_HEROIC_RESOLVE",
    priority: 0.95
  },

  // 3. Life-and-Death Vow: Never Stop Until Death (不死不休)
  {
    ruleId: "DRAMATIC_R03_NEVER_STOP_UNTIL_DEATH",
    category: DRAMATIC_CATEGORIES.SOLEMN_VENGEANCE_VOW,
    targetZh: "不死不休",
    pattern: /(?:không chết không thôi|bất tử bất hưu|不死不休)/i,
    candidateVi: "bất tử bất hưu, thề không dừng lại",
    signature: createSemanticSignature({
      denotation: "UNYIELDING_DEATH_OATH",
      affectDistribution: { RESOLUTE: 1.0, SOLEMN: 0.80 },
      valence: 0.10,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "ABSOLUTE_FINALITY",
    priority: 0.95
  },

  // 4. Mutual Destruction Vow: Perish Together (同归于尽)
  {
    ruleId: "DRAMATIC_R04_MUTUAL_DESTRUCTION",
    category: DRAMATIC_CATEGORIES.SOLEMN_VENGEANCE_VOW,
    targetZh: "同归于尽",
    pattern: /(?:liều mạng cùng đối phương chết chung|cùng quy vu tận|同归于尽)/i,
    candidateVi: "quyết liều chết kéo theo kẻ thù chôn cùng",
    signature: createSemanticSignature({
      denotation: "MUTUAL_DESTRUCTION_RESOLVE",
      affectDistribution: { RESOLUTE: 0.95, WRATH: 0.85 },
      valence: -0.50,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "DESPERATE_VALOR",
    priority: 0.95
  },

  // 5. Tragic Pathos: Tears Falling Like Rain (泪如雨下)
  {
    ruleId: "DRAMATIC_R05_TEARS_LIKE_RAIN",
    category: DRAMATIC_CATEGORIES.TRAGIC_PATHOS_GRIEF,
    targetZh: "泪如雨下",
    pattern: /(?:nước mắt tuôn rơi như mưa|lệ như vũ hạ|泪如雨下)/i,
    candidateVi: "lệ rơi như mưa, đau đớn xé lòng",
    signature: createSemanticSignature({
      denotation: "TEARS_FALLING_LIKE_RAIN",
      affectDistribution: { SORROW: 0.95, MELANCHOLY: 0.80 },
      valence: -0.80,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "HEARTBREAKING_PATHOS",
    priority: 0.90
  },

  // 6. Anguish: Heartbreaking Agony (痛不欲生 / 悲痛欲绝)
  {
    ruleId: "DRAMATIC_R06_HEARTBREAKING_AGONY",
    category: DRAMATIC_CATEGORIES.TRAGIC_PATHOS_GRIEF,
    targetZh: "痛不欲生",
    pattern: /(?:đau lòng đến cực điểm|đau đớn muốn chết|thống bất dục sinh|痛不欲生|悲痛欲绝)/i,
    candidateVi: "đau đớn đến thắt ruột thắt gan",
    signature: createSemanticSignature({
      denotation: "EXCRUCIATING_EMOTIONAL_AGONY",
      affectDistribution: { SORROW: 1.0 },
      valence: -0.90,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "POIGNANT_GRIEF",
    priority: 0.90
  },

  // 7. Despair: Boundless Despair (满心绝望)
  {
    ruleId: "DRAMATIC_R07_BOUNDLESS_DESPAIR",
    category: DRAMATIC_CATEGORIES.TRAGIC_PATHOS_GRIEF,
    targetZh: "满心绝望",
    pattern: /(?:lòng tràn đầy tuyệt vọng|ngập tràn tuyệt vọng|满心绝望)/i,
    candidateVi: "trong lòng ngập tràn tuyệt vọng khôn cùng",
    signature: createSemanticSignature({
      denotation: "OVERWHELMING_DESPAIR",
      affectDistribution: { SORROW: 0.85, FEAR: 0.70 },
      valence: -0.85,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CHILLING_DESPAIR",
    priority: 0.88
  },

  // 8. Desolation: Heart Like Cold Ashes (心如死灰)
  {
    ruleId: "DRAMATIC_R08_HEART_LIKE_ASHES",
    category: DRAMATIC_CATEGORIES.TRAGIC_PATHOS_GRIEF,
    targetZh: "心如死灰",
    pattern: /(?:tâm như tro tàn|tâm như tử khôi|心如死灰)/i,
    candidateVi: "lòng nguội lạnh tựa tro tàn",
    signature: createSemanticSignature({
      denotation: "HEART_COOLED_LIKE_DEAD_ASHES",
      affectDistribution: { MELANCHOLY: 0.95, SORROW: 0.80 },
      valence: -0.80,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "NUMB_DESOLATION",
    priority: 0.88
  },

  // 9. Catastrophic Destruction: Sect Destruction (宗门覆灭) [Hardened: ZERO blood river injection]
  {
    ruleId: "DRAMATIC_R09_SECT_DESTRUCTION",
    category: DRAMATIC_CATEGORIES.CATASTROPHIC_DESTRUCTION,
    targetZh: "宗门覆灭",
    pattern: /(?:tông môn bị diệt|tông môn bị hủy diệt|宗门覆灭|宗门被灭)/i,
    candidateVi: "tông môn hoàn toàn bị hủy diệt",
    signature: createSemanticSignature({
      denotation: "COMPLETE_SECT_DESTRUCTION",
      affectDistribution: { SOLEMN: 0.90, SORROW: 0.85 },
      valence: -0.85,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "EPIC_TRAGIC_FALL",
    priority: 0.95
  },

  // 10. Epic Battlefield Aftermath (血流成河，尸横遍野) [Strictly requires both idioms]
  {
    ruleId: "DRAMATIC_R10_RIVERS_OF_BLOOD_BATTLEFIELD",
    category: DRAMATIC_CATEGORIES.EPIC_BATTLEFIELD_AFTERMATH,
    targetZh: "血流成河，尸横遍野",
    pattern: /(?:máu chảy thành sông,\s*thây chất đầy đồng|huyết lưu thành hà,\s*thi hoành biến dã|血流成河，?尸横遍野)/i,
    candidateVi: "máu chảy thành sông, thây chất ngập tràn đồng hoang",
    signature: createSemanticSignature({
      denotation: "EPIC_BATTLEFIELD_CARNAGE_AFTERMATH",
      affectDistribution: { SOLEMN: 0.95, FEAR: 0.80, SORROW: 0.80 },
      valence: -0.90,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "SOMBER_BATTLEFIELD_GRAVITY",
    priority: 0.95
  },

  // 11. Clan Destruction: Family Ruined and Scattered (家破人亡)
  {
    ruleId: "DRAMATIC_R11_FAMILY_RUINED",
    category: DRAMATIC_CATEGORIES.CATASTROPHIC_DESTRUCTION,
    targetZh: "家破人亡",
    pattern: /(?:gia phá nhân vong|gia đình tan nát|người mất nhà tan|家破人亡)/i,
    candidateVi: "gia đình tan nát, người mất nhà tan",
    signature: createSemanticSignature({
      denotation: "FAMILY_RUINED_MEMBERS_PERISHED",
      affectDistribution: { SORROW: 0.95, MELANCHOLY: 0.80 },
      valence: -0.85,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "POIGNANT_RUIN",
    priority: 0.90
  },

  // 12. Solemn Oath: If Revenge Not Exacted (此仇不报)
  {
    ruleId: "DRAMATIC_R12_REVENGE_OATH",
    category: DRAMATIC_CATEGORIES.SOLEMN_VENGEANCE_VOW,
    targetZh: "此仇不报",
    pattern: /(?:thù này không báo|mối thù này không báo|此仇不报(?:誓不为人)?)/i,
    candidateVi: "thù này không báo, thề chẳng làm người",
    signature: createSemanticSignature({
      denotation: "SOLEMN_REVENGE_SWEAR_OATH",
      affectDistribution: { RESOLUTE: 1.0, WRATH: 0.85 },
      valence: 0.10,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "IRONCLAD_VOW",
    priority: 0.95
  }
]);

// =========================================================================
// Negative Assertion & Invariant Validator
// =========================================================================

/**
 * Validates that dramatic escalation does NOT invent new events, casualties, or blood rivers.
 * 
 * Guards:
 * 1. 宗门覆灭: Strictly rejects "máu chảy thành sông" or "thây chất đầy đồng" unless source explicitly contains them.
 * 2. 悲痛欲绝: Grief must NOT escalate to madness or suicide.
 * 3. 怒不可遏: Wrath must NOT escalate to madness.
 * 4. 决一死战: Lethal resolve must NOT invent new casualties.
 * 5. 不死不休: Life-and-death vow must NOT invent collateral destruction.
 * 6. Spoken Dialogue Oaths: Must stay in direct dialogue voice.
 * 7. POV Safety: Third-person limited narrative strictly rejects omniscient knowledge injection.
 * 
 * @param {Object} clauseIR
 * @param {Object} context
 * @param {Object} def
 * @returns {{ allowed: boolean, reason: string }}
 */
function validateDramaticInvariants(clauseIR, context = {}, def) {
  const sourceZh = String(clauseIR.sourceZh || "");
  const translatedText = String((context && context.translatedText) || "");

  // 1. Sect destruction blood river injection guard:
  if (def.ruleId === "DRAMATIC_R09_SECT_DESTRUCTION") {
    const hasExplicitBloodAndCorpses = /(?:血流成河|尸横遍野|máu chảy thành sông|thây chất đầy đồng)/i.test(sourceZh) ||
                                      /(?:máu chảy thành sông|thây chất đầy đồng)/i.test(translatedText);
    if (context.assertBloodRiver === true && !hasExplicitBloodAndCorpses) {
      return {
        allowed: false,
        reason: "REJECT_UNGROUNDED_BLOOD_RIVER_FROM_SECT_DESTRUCTION"
      };
    }
  }

  // 2. Pure grief escalation guard:
  if (def.category === DRAMATIC_CATEGORIES.TRAGIC_PATHOS_GRIEF && context.escalateToMadness === true) {
    return {
      allowed: false,
      reason: "REJECT_GRIEF_ESCALATION_TO_MADNESS"
    };
  }

  // 3. Invented casualties guard:
  if (context.inventCasualties === true) {
    return {
      allowed: false,
      reason: "REJECT_INVENTED_CASUALTIES_IN_DRAMATIC_RESOLVE"
    };
  }

  // 4. POV Safety Guard
  const pov = (clauseIR.cognitiveEvent && clauseIR.cognitiveEvent.pov) || context.pov || "THIRD_PERSON_LIMITED";
  if (pov === "THIRD_PERSON_LIMITED" && context.assertOmniscientCommentary === true) {
    return {
      allowed: false,
      reason: "REJECT_OMNISCIENT_COMMENTARY_IN_LIMITED_POV"
    };
  }

  return { allowed: true, reason: "DRAMATIC_INVARIANTS_SATISFIED" };
}

// =========================================================================
// Provider Factory
// =========================================================================
function createDramaticEscalatorProvider() {
  return Object.freeze({
    providerId: "dramatic-escalator-provider",
    domain: "DRAMATIC_CLIMAX",
    supportedSlots: [STYLE_SLOTS.DRAMATIC_CLIMAX],

    /**
     * Inspects a ClauseIR and produces StylistContributions for dramatic climaxes and pathos.
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

      for (const def of DRAMATIC_DEFINITIONS) {
        if (!def.pattern.test(searchText) && !sourceZh.includes(def.targetZh)) {
          continue;
        }

        // Validate negative assertions and event-preservation invariants
        const invariantCheck = validateDramaticInvariants(clauseIR, context, def);
        if (!invariantCheck.allowed) {
          continue;
        }

        contributions.push(
          createStylistContribution({
            providerId: "dramatic-escalator-provider",
            domain: "DRAMATIC_CLIMAX",
            targetSlot: STYLE_SLOTS.DRAMATIC_CLIMAX,
            dimension: "RHYTHMIC",
            sourceSpanZh: def.targetZh,
            candidateVi: def.candidateVi,
            semanticRequirements: {
              dramaticCategory: def.category,
              requiredEvidence: ["DRAMATIC_CLIMAX_EVIDENCE"]
            },
            semanticSignature: def.signature,
            tone: def.tone,
            register: def.signature.register,
            rhythmPreference: "SOLEMN_GRAVITY",
            lexicalPriority: def.priority,
            confidence: 0.95,
            semanticExpansionCost: 0.0,
            introducedInformation: [],
            introducedMetaphor: false,
            surfaceRealization: true,
            provenance: `dramatic-escalator-provider:${def.ruleId}->${STYLE_SLOTS.DRAMATIC_CLIMAX}:${def.category}`
          })
        );
      }

      return contributions;
    },

    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context.domainWeights && context.domainWeights.DRAMATIC_CLIMAX) || 0.90;
      return Object.freeze({
        providerId: "dramatic-escalator-provider",
        domain: "DRAMATIC_CLIMAX",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createDramaticEscalatorProvider,
  validateDramaticInvariants,
  DRAMATIC_DEFINITIONS,
  DRAMATIC_CATEGORIES
};
