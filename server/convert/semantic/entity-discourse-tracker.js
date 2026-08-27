"use strict";

/**
 * Entity & Discourse Tracker (Phase 1)
 * 
 * Manages chapter-level discourse state, dynamic salience stack,
 * speaker-listener social relationships, and multi-factor pronoun resolution.
 * 
 * Features:
 * - Dynamic Salience Stack with syntactic weighting & recency decay
 * - POV-Aware Social Relationship Matrix (Master-Disciple, Ruler-Subject, Enemy-Enemy)
 * - Multi-Factor Uncertainty & Abstention (Abstain on ambiguous ties, Resolve on overwhelming evidence)
 */

const { resolveWithAbstention } = require("./contracts");

// Default Vietnamese Pronoun Mappings for Standard Roles
const DEFAULT_ROLE_PRONOUNS = {
  MALE_NARRATIVE: ["hắn", "y", "chàng"],
  FEMALE_NARRATIVE: ["nàng", "cô"],
  NEUTRAL_FALLBACK: "đối phương",
  UNKNOWN_FALLBACK: "người này"
};

/**
 * Creates a dynamic DiscourseTracker instance.
 */
function createDiscourseTracker({
  initialEntities = [],
  decayFactor = 0.75
} = {}) {
  // Entity Registry: Map of entityId -> EntityData
  const registry = new Map();

  // Salience Stack: Array of { entityId, salience, lastSeenClauseIndex }
  let salienceStack = [];

  // Active POV
  let activePOV = "THIRD_PERSON_OMNISCIENT"; // THIRD_PERSON_OMNISCIENT | FIRST_PERSON | THIRD_PERSON_LIMITED

  // Register initial entities
  for (const ent of initialEntities) {
    if (ent.id && ent.name) {
      registry.set(ent.id, {
        id: ent.id,
        name: ent.name,
        aliases: new Set(ent.aliases || []),
        gender: ent.gender || "UNKNOWN", // MALE | FEMALE | UNKNOWN
        role: ent.role || "CHARACTER",   // PROTAGONIST | MASTER | DISCIPLE | ELDER | ENEMY | EMPEROR
        socialRank: ent.socialRank || "PEER",
        relationships: { ...(ent.relationships || {}) }
      });
    }
  }

  function registerEntity({
    id,
    name,
    aliases = [],
    gender = "UNKNOWN",
    role = "CHARACTER",
    socialRank = "PEER",
    relationships = {}
  }) {
    if (!id || !name) return null;
    const entity = {
      id,
      name,
      aliases: new Set(aliases),
      gender,
      role,
      socialRank,
      relationships: { ...relationships }
    };
    registry.set(id, entity);
    return entity;
  }

  function getEntity(entityId) {
    return registry.get(entityId) || null;
  }

  /**
   * Updates salience of an entity based on its syntactic position in the current clause.
   */
  function updateSalience({ entityId, roleInClause = "SUBJECT", clauseIndex = 0 }) {
    if (!entityId || !registry.has(entityId)) return;

    // Apply decay to all existing entities
    for (const item of salienceStack) {
      const deltaT = Math.max(0, clauseIndex - item.lastSeenClauseIndex);
      item.salience = Number((item.salience * Math.pow(decayFactor, deltaT)).toFixed(3));
    }

    // Boost score for current entity
    let boost = 0.3;
    if (roleInClause === "SUBJECT") boost = 1.0;
    else if (roleInClause === "OBJECT") boost = 0.6;
    else if (roleInClause === "SPEAKER") boost = 0.9;

    const existingIndex = salienceStack.findIndex((s) => s.entityId === entityId);
    if (existingIndex >= 0) {
      salienceStack[existingIndex].salience = Math.min(1.0, salienceStack[existingIndex].salience + boost);
      salienceStack[existingIndex].lastSeenClauseIndex = clauseIndex;
    } else {
      salienceStack.push({
        entityId,
        salience: Math.min(1.0, boost),
        lastSeenClauseIndex: clauseIndex
      });
    }

    // Sort salience stack descending
    salienceStack.sort((a, b) => b.salience - a.salience);
  }

  /**
   * Resolves direct address pronoun in Dialogue between Speaker and Target.
   */
  function resolveDialoguePronoun({ pronounZh, speakerId, targetId }) {
    const speaker = registry.get(speakerId);
    const target = registry.get(targetId);

    if (!speaker || !target) {
      return resolveWithAbstention([], { neutralFallback: pronounZh === "我" ? "ta" : "ngươi" });
    }

    const rel = speaker.relationships[targetId] || {};

    if (rel.type === "MASTER_DISCIPLE") {
      if (rel.hierarchy === "INFERIOR_TO_SUPERIOR") {
        // Disciple speaking to Master
        if (pronounZh === "我") return { status: "RESOLVED", resolvedValue: "đồ nhi", confidence: 0.95 };
        if (pronounZh === "你" || pronounZh === "您") return { status: "RESOLVED", resolvedValue: "sư tôn", confidence: 0.95 };
      } else if (rel.hierarchy === "SUPERIOR_TO_INFERIOR") {
        // Master speaking to Disciple
        if (pronounZh === "我") return { status: "RESOLVED", resolvedValue: "vi sư", confidence: 0.95 };
        if (pronounZh === "你") return { status: "RESOLVED", resolvedValue: "đồ nhi", confidence: 0.90 };
      }
    }

    if (rel.type === "RULER_SUBJECT") {
      if (rel.hierarchy === "SUPERIOR_TO_INFERIOR") {
        // Emperor to Subject
        if (pronounZh === "我") return { status: "RESOLVED", resolvedValue: "trẫm", confidence: 0.98 };
        if (pronounZh === "你") return { status: "RESOLVED", resolvedValue: "ái khanh", confidence: 0.90 };
      } else {
        // Subject to Emperor
        if (pronounZh === "我") return { status: "RESOLVED", resolvedValue: "vi thần", confidence: 0.95 };
        if (pronounZh === "你" || pronounZh === "您") return { status: "RESOLVED", resolvedValue: "bệ hạ", confidence: 0.98 };
      }
    }

    if (rel.type === "MORTAL_ENEMY") {
      if (pronounZh === "我") return { status: "RESOLVED", resolvedValue: "ta", confidence: 0.90 };
      if (pronounZh === "你") return { status: "RESOLVED", resolvedValue: "ngươi", confidence: 0.90 };
    }

    // Default neutral ancient dialogue
    return {
      status: "RESOLVED",
      resolvedValue: pronounZh === "我" ? "ta" : (pronounZh === "您" ? "ngài" : "ngươi"),
      confidence: 0.80
    };
  }

  /**
   * Resolves third-person pronouns in the narrative stream using Salience Stack & Multi-factor Abstention.
   */
  function resolveNarrativePronoun({ pronounZh, clauseIndex = 0 }) {
    const candidates = [];

    for (const item of salienceStack) {
      const entity = registry.get(item.entityId);
      if (!entity) continue;

      // Gender filtering
      if (pronounZh === "他" && entity.gender === "FEMALE") continue;
      if (pronounZh === "她" && entity.gender === "MALE") continue;

      // Compute composite confidence score based on salience + recency
      const deltaT = Math.max(0, clauseIndex - item.lastSeenClauseIndex);
      const recencyScore = Math.max(0.2, 1.0 - deltaT * 0.15);
      const score = Number(((item.salience * 0.7) + (recencyScore * 0.3)).toFixed(3));

      let preferredPronoun = entity.gender === "FEMALE" ? "nàng" : "hắn";
      if (entity.role === "PROTAGONIST") preferredPronoun = "hắn";

      candidates.push({
        id: entity.id,
        value: preferredPronoun,
        score,
        name: entity.name
      });
    }

    return resolveWithAbstention(candidates, {
      confidenceThreshold: 0.60,
      marginDeltaThreshold: 0.20,
      overwhelmingConfidenceThreshold: 0.85,
      neutralFallback: "đối phương",
      unknownFallback: "người này"
    });
  }

  /**
   * Master Pronoun Resolver combining Dialogue & Narrative contexts.
   */
  function resolvePronoun({
    pronounZh,
    clauseRole = "ACTION",
    speakerId = null,
    targetId = null,
    clauseIndex = 0
  } = {}) {
    if (!pronounZh) {
      return { status: "UNKNOWN", resolvedValue: "", confidence: 0 };
    }

    if (clauseRole === "DIALOGUE") {
      return resolveDialoguePronoun({ pronounZh, speakerId, targetId });
    }

    return resolveNarrativePronoun({ pronounZh, clauseIndex });
  }

  /**
   * Binds and populates discourse context onto a ClauseIR.
   */
  function populateClauseDiscourse(clauseIR, { clauseIndex = 0, speakerId = null, targetId = null } = {}) {
    if (!clauseIR) return null;

    let resolvedPronoun = null;
    let uncertainty = clauseIR.uncertainty;

    if (clauseIR.subjectSlot && clauseIR.subjectSlot.isImplicit) {
      // Pro-drop: Infer implicit subject from top of salience stack
      const top = salienceStack[0];
      if (top && top.salience >= 0.6) {
        const ent = registry.get(top.entityId);
        resolvedPronoun = ent ? (ent.gender === "FEMALE" ? "nàng" : "hắn") : "hắn";
        uncertainty = {
          status: "RESOLVED",
          confidence: top.salience,
          flag: "INFERRED_FROM_SALIENCE_TOP"
        };
      } else {
        resolvedPronoun = "hắn"; // Default safe neutral narrative pronoun
        uncertainty = {
          status: "LOW_CONFIDENCE",
          confidence: 0.4,
          flag: "PRO_DROP_DEFAULT_FALLBACK"
        };
      }
    }

    return Object.freeze({
      ...clauseIR,
      subjectSlot: clauseIR.subjectSlot ? Object.freeze({
        ...clauseIR.subjectSlot,
        resolvedPronoun: resolvedPronoun || clauseIR.subjectSlot.resolvedPronoun
      }) : null,
      uncertainty: Object.freeze(uncertainty)
    });
  }

  return {
    registerEntity,
    getEntity,
    updateSalience,
    resolvePronoun,
    populateClauseDiscourse,
    getSalienceStack: () => [...salienceStack],
    getRegistry: () => new Map(registry)
  };
}

module.exports = {
  createDiscourseTracker,
  DEFAULT_ROLE_PRONOUNS
};
