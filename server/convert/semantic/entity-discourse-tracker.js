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
  decayFactor = 0.75,
  initialPOV = "THIRD_PERSON_OMNISCIENT"
} = {}) {
  // Entity Registry: Map of entityId -> EntityData
  const registry = new Map();

  // Salience Stack: Array of { entityId, salience, lastSeenClauseIndex }
  let salienceStack = [];

  // Active POV
  const VALID_POVS = new Set(["FIRST_PERSON", "THIRD_PERSON_LIMITED", "THIRD_PERSON_OMNISCIENT", "OBJECTIVE_NARRATION"]);
  let activePOV = VALID_POVS.has(initialPOV) ? initialPOV : "THIRD_PERSON_OMNISCIENT";

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
        persona: ent.persona || null,
        speechStyle: ent.speechStyle || null,
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
    persona = null,
    speechStyle = null,
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
      persona,
      speechStyle,
      relationships: { ...relationships }
    };
    registry.set(id, entity);
    return entity;
  }

  function getEntity(entityId) {
    return registry.get(entityId) || null;
  }

  function resolvedParticipant(entity, confidence, reason) {
    return {
      status: "RESOLVED",
      entityId: entity ? entity.id : null,
      entityRole: entity ? entity.role : null,
      confidence,
      reason
    };
  }

  function unresolvedParticipant(status, reason, candidates = []) {
    return {
      status,
      entityId: null,
      entityRole: null,
      confidence: 0.0,
      reason,
      candidates
    };
  }

  function entitiesMatchingSource(sourceZh) {
    const matches = [];
    for (const entity of registry.values()) {
      const mentions = [entity.name, ...entity.aliases].filter(Boolean);
      const matchedMention = mentions.find((mention) => sourceZh.includes(mention));
      if (matchedMention) matches.push({ entity, mention: matchedMention, index: sourceZh.indexOf(matchedMention) });
    }
    return matches;
  }

  /**
   * Resolves thinker/referent strictly from the existing entity registry and
   * salience state. It does not create entities or social/persona hypotheses.
   */
  function resolveCognitiveParticipants(sourceZh) {
    const text = String(sourceZh || "");
    const namedMatches = entitiesMatchingSource(text);
    const cognitiveMarkerIndex = text.search(/心中|心头|脑海|想|决定|推断|皱眉/);
    const namedSubjects = namedMatches.filter(({ index }) => cognitiveMarkerIndex >= 0 && index <= cognitiveMarkerIndex);
    let thinker;

    if (/我|吾|余/.test(text)) {
      thinker = {
        status: "RESOLVED",
        entityId: null,
        entityRole: "SELF",
        confidence: 0.99,
        reason: "FIRST_PERSON_GRAMMATICAL_SELF"
      };
    } else if (namedSubjects.length === 1) {
      thinker = resolvedParticipant(namedSubjects[0].entity, 0.98, "EXPLICIT_NAMED_SUBJECT");
    } else if (namedSubjects.length > 1) {
      thinker = unresolvedParticipant("AMBIGUOUS", "MULTIPLE_NAMED_THINKER_CANDIDATES", namedSubjects.map(({ entity }) => entity.id));
    } else if (/^(?:他|她|其)/.test(text)) {
      const pronoun = text[0];
      const candidates = salienceStack
        .map((item) => ({ item, entity: registry.get(item.entityId) }))
        .filter(({ entity }) => entity && !(pronoun === "他" && entity.gender === "FEMALE") && !(pronoun === "她" && entity.gender === "MALE"));
      if (candidates.length === 1 || (candidates[0] && (!candidates[1] || candidates[0].item.salience - candidates[1].item.salience >= 0.20))) {
        thinker = resolvedParticipant(candidates[0].entity, candidates[0].item.salience, "PRONOUN_RESOLVED_FROM_DISCOURSE_SALIENCE");
      } else if (candidates.length > 1) {
        thinker = unresolvedParticipant("AMBIGUOUS", "THIRD_PERSON_PRONOUN_AMBIGUOUS", candidates.map(({ entity }) => entity.id));
      } else {
        thinker = unresolvedParticipant("UNKNOWN", "THIRD_PERSON_PRONOUN_WITHOUT_DISCOURSE_ANTECEDENT");
      }
    } else {
      thinker = unresolvedParticipant("UNKNOWN", "NO_EXPLICIT_THINKER_EVIDENCE");
    }

    let referent = null;
    const relationalRole = /师尊|师父|师傅/.test(text) ? "MASTER" : (/敌人|仇敌|对手/.test(text) ? "ENEMY" : null);
    if (relationalRole) {
      const candidates = [...registry.values()].filter((entity) => entity.role === relationalRole);
      if (candidates.length === 1) referent = resolvedParticipant(candidates[0], 0.95, `UNIQUE_${relationalRole}_ROLE_REFERENCE`);
      else if (candidates.length > 1) referent = unresolvedParticipant("AMBIGUOUS", `${relationalRole}_ROLE_REFERENCE_AMBIGUOUS`, candidates.map((entity) => entity.id));
    }
    if (!referent) {
      const otherNamed = namedMatches.filter(({ entity }) => entity.id !== thinker.entityId);
      if (otherNamed.length === 1) referent = resolvedParticipant(otherNamed[0].entity, 0.95, "EXPLICIT_NAMED_REFERENT");
      else if (otherNamed.length > 1) referent = unresolvedParticipant("AMBIGUOUS", "MULTIPLE_NAMED_REFERENTS", otherNamed.map(({ entity }) => entity.id));
      else referent = unresolvedParticipant("UNKNOWN", "NO_REFERENT_EVIDENCE");
    }

    return Object.freeze({ thinker: Object.freeze(thinker), referent: Object.freeze(referent) });
  }

  const RELATIONSHIP_ALIASES = Object.freeze({
    MORTAL_ENEMY: "ENEMY",
    ENEMY_ENEMY: "ENEMY",
    MASTER_AND_DISCIPLE: "MASTER_DISCIPLE",
    SENIOR_AND_JUNIOR: "SENIOR_JUNIOR",
    RULER_AND_SUBJECT: "RULER_SUBJECT"
  });

  function normalizeRelationship(rawRelationship) {
    if (!rawRelationship) return null;
    const relation = typeof rawRelationship === "string"
      ? { type: rawRelationship }
      : { ...rawRelationship };
    const rawType = String(relation.type || "").toUpperCase();
    if (!rawType) return null;
    return Object.freeze({
      ...relation,
      type: RELATIONSHIP_ALIASES[rawType] || rawType
    });
  }

  /**
   * Resolves an explicitly supplied dialogue pair. The tracker validates IDs,
   * returns existing character voice state, and is the sole relationship authority.
   * It never guesses a pair from quotation contents.
   */
  function resolveDialogueContext({ speakerId = null, listenerId = null } = {}) {
    const speakerEntity = speakerId ? registry.get(speakerId) : null;
    const listenerEntity = listenerId ? registry.get(listenerId) : null;

    const speaker = speakerEntity
      ? Object.freeze({
          status: "RESOLVED",
          entityId: speakerEntity.id,
          socialRank: speakerEntity.socialRank,
          persona: speakerEntity.persona,
          speechStyle: speakerEntity.speechStyle,
          realization: Object.freeze(resolveDialoguePronoun({ pronounZh: "我", speakerId, targetId: listenerId }))
        })
      : Object.freeze({ status: "UNKNOWN", entityId: null, confidence: 0.0, reason: "SPEAKER_NOT_SUPPLIED_OR_UNKNOWN" });

    const listener = listenerEntity
      ? Object.freeze({
          status: "RESOLVED",
          entityId: listenerEntity.id,
          socialRank: listenerEntity.socialRank,
          persona: listenerEntity.persona,
          speechStyle: listenerEntity.speechStyle,
          realization: Object.freeze(resolveDialoguePronoun({ pronounZh: "你", speakerId, targetId: listenerId }))
        })
      : Object.freeze({ status: "UNKNOWN", entityId: null, confidence: 0.0, reason: "LISTENER_NOT_SUPPLIED_OR_UNKNOWN" });

    let rawRelationship = null;
    let relationshipSource = null;
    if (speakerEntity && listenerEntity) {
      rawRelationship = speakerEntity.relationships[listenerId] || null;
      relationshipSource = rawRelationship ? "SPEAKER_RELATIONSHIP_STATE" : null;
      if (!rawRelationship) {
        rawRelationship = listenerEntity.relationships[speakerId] || null;
        relationshipSource = rawRelationship ? "LISTENER_RECIPROCAL_RELATIONSHIP_STATE" : null;
      }
    }
    const normalizedRelationship = normalizeRelationship(rawRelationship);
    const relationship = normalizedRelationship
      ? Object.freeze({ status: "RESOLVED", ...normalizedRelationship, source: relationshipSource, confidence: 0.98 })
      : Object.freeze({ status: "UNKNOWN", type: "UNKNOWN", confidence: 0.0, reason: "NO_EXPLICIT_RELATIONSHIP_STATE" });

    const status = speaker.status === "RESOLVED" && listener.status === "RESOLVED" && relationship.status === "RESOLVED"
      ? "RESOLVED"
      : "UNKNOWN";

    return Object.freeze({
      status,
      speaker,
      listener,
      relationship,
      reason: status === "RESOLVED" ? "EXPLICIT_DIALOGUE_PAIR_AND_RELATIONSHIP" : "INCOMPLETE_DIALOGUE_DISCOURSE_STATE"
    });
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
    resolveDialoguePronoun,
    resolveNarrativePronoun,
    populateClauseDiscourse,
    resolveCognitiveParticipants,
    resolveDialogueContext,
    getActivePOV: () => activePOV,
    setActivePOV: (pov) => {
      if (!VALID_POVS.has(pov)) return false;
      activePOV = pov;
      return true;
    },
    getState: () => ({ salienceStack: [...salienceStack], registry: new Map(registry) }),
    getSalienceStack: () => [...salienceStack],
    getRegistry: () => new Map(registry)
  };
}

module.exports = {
  createDiscourseTracker,
  DEFAULT_ROLE_PRONOUNS
};
