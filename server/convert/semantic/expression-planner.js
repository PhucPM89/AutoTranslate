"use strict";

/**
 * Expression Planner (Phase R1 Hardened)
 * 
 * 3-Layer Architecture:
 * Layer A: Semantic Plan (Source Truth, Semantic Atoms, Entities, Cognitive Events, Affect)
 * Layer B: Expression Plan (Head/Modifier Graph, Slot Composition, Modifier Deduplication, Budget, Fallback Hierarchy)
 * Layer C: Surface Realization (Executed by VietnameseRealizer: 1-Pass Synthesis, Pronouns, Punctuation, Quality Gate)
 * 
 * Invariants Enforced:
 * - Providers never directly dictate final Vietnamese text.
 * - Semantic atom preservation: Subject, Verb, Object, Cause, Effect are strictly preserved.
 * - Modifier deduplication: Prevents stacking synonymous adjectives/adverbs from multiple providers.
 * - 4 Fallback Hierarchy Levels (Full -> Reduced -> Lexical -> Baseline Safe).
 * - Zero fact invention / Zero ungrounded assertions.
 */

const { createStylistRouter } = require("./stylist-router");
const { evaluateExpansionBudget } = require("./expansion-budget");
const { createRhythmProfile } = require("./rhythm-governor");
const { createAntiRepetitionTracker } = require("./anti-repetition");

// =========================================================================
// Fallback Hierarchy Levels
// =========================================================================
const FALLBACK_LEVELS = Object.freeze({
  LEVEL_1_FULL_STYLISTIC: "LEVEL_1_FULL_STYLISTIC",
  LEVEL_2_REDUCED_STYLISTIC: "LEVEL_2_REDUCED_STYLISTIC",
  LEVEL_3_LEXICALLY_FAITHFUL: "LEVEL_3_LEXICALLY_FAITHFUL",
  LEVEL_4_BASELINE_SAFE: "LEVEL_4_BASELINE_SAFE"
});

// =========================================================================
// Head / Modifier Graph Categories
// =========================================================================
const HEAD_CATEGORIES = Object.freeze({
  SUBJECT_HEAD: "SUBJECT_HEAD",
  ACTION_HEAD: "ACTION_HEAD",
  OBJECT_HEAD: "OBJECT_HEAD",
  ATMOSPHERE_HEAD: "ATMOSPHERE_HEAD",
  AFFECT_HEAD: "AFFECT_HEAD",
  COGNITIVE_HEAD: "COGNITIVE_HEAD",
  DISCOURSE_HEAD: "DISCOURSE_HEAD"
});

/**
 * Maps a StyleSlot to its appropriate Head/Modifier structural node.
 */
function classifyHeadCategory(slotId) {
  const s = String(slotId || "");
  if (s.startsWith("ACTION_") || s.startsWith("WEAPON_") || s.startsWith("SWORD_")) return HEAD_CATEGORIES.ACTION_HEAD;
  if (s.startsWith("TITLE_") || s.startsWith("ROYAL_") || s.startsWith("AESTHETIC_")) return HEAD_CATEGORIES.SUBJECT_HEAD;
  if (s.startsWith("OBJECT_") || s.startsWith("INSCRIPT_") || s.startsWith("ALCHEMY_")) return HEAD_CATEGORIES.OBJECT_HEAD;
  if (s.startsWith("ATMOSPHERIC_") || s.startsWith("TOPOGRAPHY_") || s.startsWith("NECROPOLIS_") || s.startsWith("ELDRITCH_")) return HEAD_CATEGORIES.ATMOSPHERE_HEAD;
  if (s.startsWith("BLOODLUST_") || s.startsWith("KILLING_") || s.startsWith("CORRUPTED_") || s.startsWith("DRAMATIC_") || s.startsWith("ELEGY_")) return HEAD_CATEGORIES.AFFECT_HEAD;
  if (s.startsWith("INNER_") || s.startsWith("FORENSIC_") || s.startsWith("COGNITIVE_")) return HEAD_CATEGORIES.COGNITIVE_HEAD;
  return HEAD_CATEGORIES.DISCOURSE_HEAD;
}

/**
 * Realizes dialogue templates with resolved Speaker and Listener entities.
 */
function realizeDialogueTemplate(candidateVi, dialogueAct) {
  if (!candidateVi || !dialogueAct || dialogueAct.status !== "RESOLVED") return candidateVi;
  const speakerValue = dialogueAct.speaker && dialogueAct.speaker.realization && dialogueAct.speaker.realization.resolvedValue;
  const listenerValue = dialogueAct.listener && dialogueAct.listener.realization && dialogueAct.listener.realization.resolvedValue;
  return candidateVi
    .replace(/\{\{SPEAKER\}\}/g, speakerValue || "")
    .replace(/\{\{LISTENER\}\}/g, listenerValue || "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Extracts linguistic constraints (negation, quantity, temporal, causal) from source text.
 */
function extractLinguisticConstraints(sourceZh = "") {
  const text = String(sourceZh || "");

  const hasNegation = /(?:没有|不|未|从未|并非|无论|休想|绝非|不可|无)/.test(text);
  const hasQuantity = /(?:一|两|三|四|五|六|七|八|九|十|百|千|万|无数|几|许多|全部|仅仅|至少)/.test(text);
  
  let temporalAspect = "NONE";
  if (/(?:已经|已然|早已)/.test(text)) temporalAspect = "PERFECTIVE_ALREADY";
  else if (/(?:正在|正自)/.test(text)) temporalAspect = "PROGRESSIVE_ONGOING";
  else if (/(?:将要|即将|快要)/.test(text)) temporalAspect = "PROSPECTIVE_ABOUT_TO";
  else if (/(?:曾经|从前|当年)/.test(text)) temporalAspect = "EXPERIENTIAL_PAST";
  else if (/(?:刚刚|刚才|方才)/.test(text)) temporalAspect = "RECENT_JUST_NOW";
  else if (/(?:随后|旋即|紧接着)/.test(text)) temporalAspect = "SEQUENTIAL_THEN";
  else if (/(?:多年后|数年后)/.test(text)) temporalAspect = "TEMPORAL_YEARS_LATER";

  let causalRelation = "NONE";
  if (/(?:因为|由于)/.test(text)) causalRelation = "CAUSAL_BECAUSE";
  else if (/(?:所以|因此|因而)/.test(text)) causalRelation = "CAUSAL_THEREFORE";
  else if (/(?:于是)/.test(text)) causalRelation = "CONSECUTIVE_THEREUPON";
  else if (/(?:却|但是|然而|不过)/.test(text)) causalRelation = "ADVERSATIVE_BUT";
  else if (/(?:虽然|纵然|即便|哪怕)/.test(text)) causalRelation = "CONCESSIVE_ALTHOUGH";

  return Object.freeze({
    hasNegation,
    hasQuantity,
    temporalAspect,
    causalRelation
  });
}

/**
 * Extracts core semantic atoms from a ClauseIR to guarantee zero dropped arguments.
 */
function extractSourceSemanticAtoms(clauseIR) {
  const atoms = [];
  if (clauseIR.subjectSlot) {
    atoms.push({ type: "SUBJECT", entityId: clauseIR.subjectSlot.entityId, isImplicit: clauseIR.subjectSlot.isImplicit });
  }
  if (clauseIR.actionSequence && clauseIR.actionSequence.length > 0) {
    for (const act of clauseIR.actionSequence) {
      atoms.push({ type: "ACTION", verbZh: act.verbZh, actionVi: act.actionVi, weapon: act.weaponEntity });
    }
  }
  if (clauseIR.objectSlot) {
    atoms.push({ type: "OBJECT", entityId: clauseIR.objectSlot.entityId, baseVi: clauseIR.objectSlot.baseVi });
  }
  if (clauseIR.cognitiveEvent && clauseIR.cognitiveEvent.kind !== "NONE") {
    atoms.push({ type: "COGNITION", kind: clauseIR.cognitiveEvent.kind, evidenceId: clauseIR.cognitiveEvent.evidenceId });
  }
  if (clauseIR.dialogueAct && clauseIR.dialogueAct.status === "RESOLVED") {
    atoms.push({ type: "DIALOGUE_ACT", actType: clauseIR.dialogueAct.actType });
  }
  return Object.freeze(atoms);
}

/**
 * Modifier Deduplication Engine:
 * Detects and collapses overlapping/redundant modifiers targeting the same head or semantic attribute.
 * Prevents adjective piling (e.g. "sắc lạnh" + "lạnh lẽo" + "hàn khí" -> single coherent modifier).
 */
function deduplicateModifiers(contributions) {
  const seenAttributes = new Map();
  const filtered = [];
  const deduplicated = [];

  for (const contrib of contributions) {
    const text = (contrib.candidateVi || "").toLowerCase().trim();
    
    // Grouping by semantic signature denotation or slot category
    const attrKey = contrib.semanticSignature && contrib.semanticSignature.denotation
      ? `${contrib.targetSlot}::${contrib.semanticSignature.denotation}`
      : `${contrib.targetSlot}::${text}`;

    if (!seenAttributes.has(attrKey)) {
      seenAttributes.set(attrKey, contrib);
      filtered.push(contrib);
    } else {
      const existing = seenAttributes.get(attrKey);
      // If candidate is identical or strictly overlapping, record deduplication and keep highest priority
      if (contrib.lexicalPriority > existing.lexicalPriority) {
        const idx = filtered.indexOf(existing);
        if (idx !== -1) filtered[idx] = contrib;
        seenAttributes.set(attrKey, contrib);
        deduplicated.push({ dropped: existing, retained: contrib, reason: "REDUNDANT_MODIFIER_SUBORDINATED" });
      } else {
        deduplicated.push({ dropped: contrib, retained: existing, reason: "REDUNDANT_MODIFIER_PRUNED" });
      }
    }
  }

  return { filtered, deduplicated };
}

/**
 * Expression Planner Factory
 */
function createExpressionPlanner({
  router = createStylistRouter(),
  antiRepetitionTracker = createAntiRepetitionTracker()
} = {}) {
  /**
   * Plans the exact lexical and syntactic substitutions for a ClauseIR,
   * organizing them into an ExpressionPlan with Head/Modifier graphs and fallback levels.
   * 
   * @param {Object} clauseIR
   * @param {Object} context
   * @returns {Object} ExpressionPlan
   */
  function planClause(clauseIR, context = {}) {
    // 1. Layer A: Semantic Plan (Source Truth extraction)
    const sourceAtoms = extractSourceSemanticAtoms(clauseIR);
    const routingDecision = router.route(clauseIR, context);
    const rhythmProfile = createRhythmProfile(clauseIR, context);

    const rawContributions = routingDecision.selectedContributions || routingDecision.acceptedSuggestions || [];

    // 2. Layer B: Modifier Deduplication
    const { filtered: deduplicatedContribs, deduplicated } = deduplicateModifiers(rawContributions);

    // 3. Layer B: Head/Modifier Graph Planning & Expansion Budget Evaluation
    const headModifierGraph = {
      [HEAD_CATEGORIES.SUBJECT_HEAD]: [],
      [HEAD_CATEGORIES.ACTION_HEAD]: [],
      [HEAD_CATEGORIES.OBJECT_HEAD]: [],
      [HEAD_CATEGORIES.ATMOSPHERE_HEAD]: [],
      [HEAD_CATEGORIES.AFFECT_HEAD]: [],
      [HEAD_CATEGORIES.COGNITIVE_HEAD]: [],
      [HEAD_CATEGORIES.DISCOURSE_HEAD]: []
    };

    const slotReplacements = [];
    const rejectedByBudget = [];
    let totalExpansionCost = 0.0;
    let fallbackLevel = FALLBACK_LEVELS.LEVEL_1_FULL_STYLISTIC;

    for (const contrib of deduplicatedContribs) {
      const slotId = contrib.sourceSpanZh || contrib.targetSlot || contrib.slotId || "";
      const candidateVi = contrib.providerId === "banter-provider"
        ? realizeDialogueTemplate(contrib.candidateVi || "", clauseIR.dialogueAct)
        : (contrib.candidateVi || "");

      // Evaluate against Expansion Budget & Invariant Limits
      const budgetCheck = evaluateExpansionBudget(clauseIR, {
        targetVi: candidateVi,
        introducedMetaphors: contrib.introducedMetaphor ? 1 : 0,
        adjectiveCount: (contrib.introducedInformation || []).length
      });

      if (budgetCheck.allowed) {
        const replacementItem = {
          slotId,
          targetSlot: contrib.targetSlot,
          replacementVi: candidateVi,
          providerId: contrib.providerId,
          dimension: contrib.dimension || "LEXICAL",
          priority: contrib.lexicalPriority || contrib.priority || 0.8,
          expansionCost: contrib.semanticExpansionCost || 0.0,
          provenance: contrib.provenance || `${contrib.providerId}:${slotId}`
        };

        slotReplacements.push(replacementItem);
        totalExpansionCost += replacementItem.expansionCost;

        // Populate Head/Modifier Graph
        const headCat = classifyHeadCategory(contrib.targetSlot);
        headModifierGraph[headCat].push(replacementItem);
      } else {
        rejectedByBudget.push({
          slotId,
          candidateVi,
          reason: budgetCheck.reason
        });
      }
    }

    // Determine Fallback Hierarchy Level
    if (rejectedByBudget.length > 0) {
      fallbackLevel = slotReplacements.length > 0
        ? FALLBACK_LEVELS.LEVEL_2_REDUCED_STYLISTIC
        : FALLBACK_LEVELS.LEVEL_3_LEXICALLY_FAITHFUL;
    } else if (slotReplacements.length === 0) {
      fallbackLevel = FALLBACK_LEVELS.LEVEL_3_LEXICALLY_FAITHFUL;
    }

    const resolvedSubject =
      clauseIR.subjectSlot && clauseIR.subjectSlot.resolvedPronoun
        ? clauseIR.subjectSlot.resolvedPronoun
        : null;

    const linguisticConstraints = extractLinguisticConstraints(clauseIR.sourceZh);

    // Freeze and return rich ExpressionPlan
    return Object.freeze({
      clauseId: clauseIR.id,
      sourceZh: clauseIR.sourceZh,
      role: clauseIR.role,
      tier: clauseIR.tier,
      resolvedSubject,
      dialogueAct: clauseIR.dialogueAct || null,
      cognitiveEvent: clauseIR.cognitiveEvent || null,
      linguisticConstraints,
      semanticPlan: Object.freeze({
        sourceAtoms,
        affectSignature: clauseIR.semanticSignature
      }),
      headModifierGraph: Object.freeze({
        [HEAD_CATEGORIES.SUBJECT_HEAD]: Object.freeze([...headModifierGraph[HEAD_CATEGORIES.SUBJECT_HEAD]]),
        [HEAD_CATEGORIES.ACTION_HEAD]: Object.freeze([...headModifierGraph[HEAD_CATEGORIES.ACTION_HEAD]]),
        [HEAD_CATEGORIES.OBJECT_HEAD]: Object.freeze([...headModifierGraph[HEAD_CATEGORIES.OBJECT_HEAD]]),
        [HEAD_CATEGORIES.ATMOSPHERE_HEAD]: Object.freeze([...headModifierGraph[HEAD_CATEGORIES.ATMOSPHERE_HEAD]]),
        [HEAD_CATEGORIES.AFFECT_HEAD]: Object.freeze([...headModifierGraph[HEAD_CATEGORIES.AFFECT_HEAD]]),
        [HEAD_CATEGORIES.COGNITIVE_HEAD]: Object.freeze([...headModifierGraph[HEAD_CATEGORIES.COGNITIVE_HEAD]]),
        [HEAD_CATEGORIES.DISCOURSE_HEAD]: Object.freeze([...headModifierGraph[HEAD_CATEGORIES.DISCOURSE_HEAD]])
      }),
      slotReplacements: Object.freeze(slotReplacements),
      deduplicatedModifiers: Object.freeze(deduplicated),
      rejectedByBudget: Object.freeze(rejectedByBudget),
      fallbackLevel,
      totalExpansionCost: Number(totalExpansionCost.toFixed(3)),
      rhythmProfile,
      forbiddenPatterns: routingDecision.forbiddenPatterns || []
    });
  }

  return Object.freeze({
    planClause,
    getRouter: () => router,
    getAntiRepetitionTracker: () => antiRepetitionTracker
  });
}

module.exports = {
  createExpressionPlanner,
  realizeDialogueTemplate,
  extractSourceSemanticAtoms,
  extractLinguisticConstraints,
  deduplicateModifiers,
  classifyHeadCategory,
  FALLBACK_LEVELS,
  HEAD_CATEGORIES
};
