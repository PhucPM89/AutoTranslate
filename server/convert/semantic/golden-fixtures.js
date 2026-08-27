"use strict";

/**
 * Golden Test Fixtures for Semantic Translation Engine (Phase 0)
 * 
 * Provides verified ground-truth scenarios testing:
 * 1. Multi-Label Affect Signatures (cold smiles vs bitter smiles vs tranquil smiles)
 * 2. Extreme Pro-Drop & Serial Action Sequences
 * 3. Shock Scorer (Acoustic/Violent shock vs. False positive in quotes/ancient records)
 * 4. Uncertainty & Abstention (Ambiguous ties -> Abstain; Clear margin -> Resolve)
 * 5. Multi-Domain Context Blending & Inertia
 * 6. Discourse Role & Honorific Shift (Dialogue vs. Narration)
 */

const {
  createSemanticSignature,
  createClauseIR
} = require("./contracts");

const GOLDEN_FIXTURES = Object.freeze({
  // FIXTURE 1: Multi-Label Affect Signatures
  affectSignatures: [
    {
      id: "affect_leng_xiao",
      termZh: "冷笑",
      expectedSignature: createSemanticSignature({
        denotation: "COLD_CONTEMPTUOUS_LAUGHTER",
        affectDistribution: { CONTEMPT: 0.85, HOSTILITY: 0.50, AMUSEMENT: 0.20 },
        valence: -0.70,
        intensity: 0.65,
        register: "CLASSICAL_LITERARY"
      }),
      validCandidates: [
        {
          vi: "cười lạnh",
          sig: createSemanticSignature({
            affectDistribution: { CONTEMPT: 0.80, HOSTILITY: 0.40 },
            valence: -0.65,
            intensity: 0.60
          })
        },
        {
          vi: "cười khẩy",
          sig: createSemanticSignature({
            affectDistribution: { CONTEMPT: 0.85, HOSTILITY: 0.55 },
            valence: -0.75,
            intensity: 0.70
          })
        }
      ],
      invalidCandidates: [
        {
          vi: "an nhiên mỉm cười",
          sig: createSemanticSignature({
            affectDistribution: { TRANQUIL: 0.90, JOY: 0.30 },
            valence: 0.80,
            intensity: 0.40
          }),
          expectedRejectReason: "Polarity Inversion"
        }
      ]
    },
    {
      id: "affect_ku_xiao",
      termZh: "苦笑",
      expectedSignature: createSemanticSignature({
        denotation: "BITTER_HELPLESS_LAUGHTER",
        affectDistribution: { SORROW: 0.65, AMUSEMENT: 0.40, MELANCHOLY: 0.30 },
        valence: -0.40,
        intensity: 0.50,
        register: "VERNACULAR"
      }),
      validCandidates: [
        {
          vi: "cười khổ",
          sig: createSemanticSignature({
            affectDistribution: { SORROW: 0.60, AMUSEMENT: 0.35 },
            valence: -0.40,
            intensity: 0.50
          })
        },
        {
          vi: "cười trừ bất lực",
          sig: createSemanticSignature({
            affectDistribution: { SORROW: 0.50, AMUSEMENT: 0.45 },
            valence: -0.35,
            intensity: 0.55
          })
        }
      ],
      invalidCandidates: [
        {
          vi: "phẫn nộ gầm thét",
          sig: createSemanticSignature({
            affectDistribution: { WRATH: 0.95, HOSTILITY: 0.80 },
            valence: -0.90,
            intensity: 0.95
          }),
          expectedRejectReason: "Affect similarity too low"
        }
      ]
    }
  ],

  // FIXTURE 2: Serial Verbs & Pro-Drop in High-Paced Combat
  serialActionProDrop: {
    id: "action_pro_drop_01",
    sourceZh: "拔剑，纵身，凌空一斩！",
    expectedClauseIR: createClauseIR({
      id: "cl_golden_01",
      tier: "SERIAL_ACTION",
      sourceZh: "拔剑，纵身，凌空一斩！",
      role: "ACTION",
      subjectSlot: {
        entityId: "char_protagonist",
        isImplicit: true,
        resolvedPronoun: "hắn"
      },
      actionSequence: [
        { verbZh: "拔剑", actionVi: "rút kiếm", manner: "SWIFT", intensity: 0.8 },
        { verbZh: "纵身", actionVi: "tung mình", manner: "AGILE", intensity: 0.8 },
        { verbZh: "凌空一斩", actionVi: "tung kiếm chém ngang không trung", intensity: 0.95 }
      ],
      invariants: {
        preserveClauseOrder: true,
        allowMetaphor: false
      }
    })
  },

  // FIXTURE 3: Shock Scorer Scenarios (Real Shock vs. Quoted/Ancient Lore False Positive)
  shockScenarios: [
    {
      id: "shock_false_positive_quote",
      description: "Shock words occurring inside an ancient scroll reading must NOT trigger context shock",
      evidence: {
        isQuotedOrRecollection: true,
        hasViolentActionShock: true, // "huyết quang bắn tung tóe"
        hasSpatioTemporalJump: true,  // "ba năm sau"
        syntacticRole: "EMBEDDED_QUOTE"
      },
      expectedDecision: {
        isShock: false,
        transitionType: "RECOLLECTION_FILTERED",
        recommendedAlpha: 0.85
      }
    },
    {
      id: "shock_true_positive_ambush",
      description: "Sudden acoustic & violent crash in narrative stream triggers immediate context shock",
      evidence: {
        isQuotedOrRecollection: false,
        hasAcousticShock: true,       // "Rầm!"
        hasViolentActionShock: true,  // "Kiếm quang xé toạc nóc nhà"
        syntacticRole: "MAIN_ASSERTION"
      },
      expectedDecision: {
        isShock: true,
        transitionType: "PUNCTUAL_EVENT_SHOCK",
        recommendedAlpha: 0.0
      }
    },
    {
      id: "shock_continuous_dialogue",
      description: "Smooth tea drinking dialogue without any shock",
      evidence: {
        isQuotedOrRecollection: false,
        hasAcousticShock: false,
        hasViolentActionShock: false,
        hasSpatioTemporalJump: false,
        syntacticRole: "MAIN_ASSERTION"
      },
      expectedDecision: {
        isShock: false,
        transitionType: "CONTINUOUS_FLOW",
        recommendedAlpha: 0.75
      }
    }
  ],

  // FIXTURE 4: Uncertainty & Abstention (Ambiguous Tie vs. Confident Resolution)
  uncertaintyScenarios: [
    {
      id: "uncertainty_ambiguous_brothers",
      description: "Two senior martial brothers mentioned with equal salience: engine must abstain from guessing",
      candidates: [
        { id: "ent_su_huynh_luc", value: "Lục sư huynh", score: 0.52 },
        { id: "ent_su_huynh_bach", value: "Bạch sư huynh", score: 0.48 }
      ],
      expectedResult: {
        status: "AMBIGUOUS",
        resolvedValue: "đối phương",
        flag: "AMBIGUITY_DETECTED_ent_su_huynh_luc_VS_ent_su_huynh_bach"
      }
    },
    {
      id: "uncertainty_confident_master",
      description: "Clear salience margin (> 0.20 delta): engine safely resolves to explicit master",
      candidates: [
        { id: "ent_su_phu_ly", value: "sư phụ", score: 0.88 },
        { id: "ent_truong_lao_trieu", value: "Triệu trưởng lão", score: 0.35 }
      ],
      expectedResult: {
        status: "RESOLVED",
        resolvedValue: "sư phụ",
        flag: "CONFIDENT_RESOLUTION"
      }
    },
    {
      id: "uncertainty_no_evidence",
      description: "Zero discourse evidence: engine abstains with unknown fallback",
      candidates: [],
      expectedResult: {
        status: "UNKNOWN",
        resolvedValue: "người này",
        flag: "NO_EVIDENCE_ABSTENTION"
      }
    }
  ]
});

module.exports = {
  GOLDEN_FIXTURES
};
