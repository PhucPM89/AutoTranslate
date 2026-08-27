"use strict";

/**
 * Provider Interaction Matrix (Wave B.5)
 * 
 * Replaces rigid binary domain suppression with contextual, multi-dimensional
 * interaction modeling. Defines semantic compatibility, competition, and orthogonal
 * coexistence between stylistic domains.
 */

const INTERACTION_RELATIONS = Object.freeze({
  COMPETE: "COMPETE",                         // Compete for the same slot/token
  COMPLEMENT: "COMPLEMENT",                   // Complementary enrichment across distinct slots
  ORTHOGONAL: "ORTHOGONAL",                   // Completely independent dimensions; 100% coexist
  DEPENDENT: "DEPENDENT",                     // Domain A requires semantic context from Domain B
  MUTUALLY_EXCLUSIVE: "MUTUALLY_EXCLUSIVE",   // Contradictory registers or tones (e.g. SLAPSTICK vs ELDRITCH)
  NEUTRAL: "NEUTRAL"                          // Non-interfering default
});

// Domain Interaction Matrix Definitions
const DOMAIN_PAIR_RELATIONS = [
  // Combat & Martial Arts
  { domainA: "COMBAT", domainB: "SWORD_DAO", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Action and Sword enrich strike vs weapon slots" },
  { domainA: "COMBAT", domainB: "ZEN_TEA", relation: INTERACTION_RELATIONS.ORTHOGONAL, note: "Tea drinking by battlefield coexists orthogonally" },
  { domainA: "COMBAT", domainB: "MUSICAL_DAO", relation: INTERACTION_RELATIONS.ORTHOGONAL, note: "Sonic attacks and martial combat coexist" },
  { domainA: "COMBAT", domainB: "WARFARE_SIEGE", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Troop charges and martial strikes enrich battles" },
  { domainA: "SWORD_DAO", domainB: "ZEN_TEA", relation: INTERACTION_RELATIONS.ORTHOGONAL, note: "Sword meditation and tea tasting coexist" },
  { domainA: "SWORD_DAO", domainB: "MUSICAL_DAO", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Sword intent and acoustic zither melodies coexist" },

  // Arts & Serenity
  { domainA: "MUSICAL_DAO", domainB: "ZEN_TEA", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Zither music and tea preparation harmonize" },
  { domainA: "CULINARY", domainB: "ZEN_TEA", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Immortal feast and tea banquet harmonize" },
  { domainA: "ALCHEMY", domainB: "CULINARY", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Pill crafting and spiritual wine coexist" },

  // Horror & Supernatural
  { domainA: "SUPERNATURAL_HORROR", domainB: "ROMANCE_AESTHETICS", relation: INTERACTION_RELATIONS.ORTHOGONAL, note: "Beautiful specter: Beauty and Horror coexist orthogonally" },
  { domainA: "SUPERNATURAL_HORROR", domainB: "ELDRITCH_HORROR", relation: INTERACTION_RELATIONS.COMPETE, note: "Taoist exorcism vs Cosmic Eldritch horror compete on horror slots" },
  { domainA: "SUPERNATURAL_HORROR", domainB: "WARFARE_SIEGE", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Netherworld army parade and mortal warfare coexist" },
  { domainA: "SUPERNATURAL_HORROR", domainB: "FORENSIC_DEDUCTION", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Murder mystery and ghostly clues coexist" },

  // State, Dao & Imperial
  { domainA: "WARFARE_SIEGE", domainB: "IMPERIAL_DECREE", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Imperial decrees commanding army charges coexist" },
  { domainA: "KARMA_SAMSARA", domainB: "MANTRA_SEAL", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Daoist mudras and karmic threads harmonize" },
  { domainA: "TRIBULATION_BREAKTHROUGH", domainB: "TOPOGRAPHY_LANDSCAPE", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Celestial lightning over immortal peaks" },
  { domainA: "TRANSCENDENCE_TIME", domainB: "ELEGY_LAMENT", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Passing of millennia and mourning fallen heroes" },
  { domainA: "TRANSCENDENCE_TIME", domainB: "WARFARE_SIEGE", relation: INTERACTION_RELATIONS.ORTHOGONAL, note: "Millennium contemplation over ancient battlefields" },
  { domainA: "APOCALYPSE_SURVIVAL", domainB: "CYBER_SCIFI", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Wasteland survival and futuristic mechas" },

  // Wave C1 Normalization Interactions
  { domainA: "COMBAT", domainB: "SOUNDSCAPE", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Impact acoustic effects and martial combat harmonize" },
  { domainA: "MUSICAL_DAO", domainB: "SOUNDSCAPE", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Acoustic zither chords and environmental soundscapes harmonize" },
  { domainA: "WARFARE_SIEGE", domainB: "SOUNDSCAPE", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "War drums, explosions, and battlefield charges harmonize" },
  { domainA: "SUPERNATURAL_HORROR", domainB: "SENSORY_ATMOSPHERE", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Ghostly specters and eerie cold mist harmonize" },
  { domainA: "ZEN_TEA", domainB: "SENSORY_ATMOSPHERE", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Tea discourse and serene fragrances harmonize" },
  { domainA: "TRANSCENDENCE_TIME", domainB: "CHRONOLOGY", relation: INTERACTION_RELATIONS.COMPLEMENT, note: "Temporal measures and retrospective time skips harmonize" }
];

/**
 * Normalizes a pair of domain names into a canonical key.
 */
function getPairKey(domainA, domainB) {
  return [domainA, domainB].sort().join("::");
}

const DOMAIN_RELATION_LOOKUP = new Map();
for (const item of DOMAIN_PAIR_RELATIONS) {
  DOMAIN_RELATION_LOOKUP.set(getPairKey(item.domainA, item.domainB), item);
}

/**
 * Retrieves the interaction relation between two domains.
 * 
 * @param {string} domainA
 * @param {string} domainB
 * @returns {string} INTERACTION_RELATIONS enum
 */
function getDomainInteractionRelation(domainA, domainB) {
  if (!domainA || !domainB || domainA === domainB) {
    return INTERACTION_RELATIONS.NEUTRAL;
  }
  const key = getPairKey(domainA, domainB);
  const found = DOMAIN_RELATION_LOOKUP.get(key);
  return found ? found.relation : INTERACTION_RELATIONS.NEUTRAL;
}

/**
 * Evaluates whether two contributions targeting different or same slots can coexist.
 * 
 * @param {Object} contribA
 * @param {Object} contribB
 * @param {Object} context
 * @returns {{ canCoexist: boolean, relation: string, reason: string }}
 */
function evaluateContributionCoexistence(contribA, contribB, context = {}) {
  if (contribA.providerId === contribB.providerId && contribA.targetSlot === contribB.targetSlot) {
    return {
      canCoexist: false,
      relation: INTERACTION_RELATIONS.COMPETE,
      reason: "Same provider proposing multiple candidates for same slot"
    };
  }

  // If targeting the same slot:
  if (contribA.targetSlot === contribB.targetSlot) {
    return {
      canCoexist: false,
      relation: INTERACTION_RELATIONS.COMPETE,
      reason: `Both contributions compete for slot ${contribA.targetSlot}`
    };
  }

  // If targeting distinct slots:
  const rel = getDomainInteractionRelation(contribA.domain, contribB.domain);

  if (rel === INTERACTION_RELATIONS.MUTUALLY_EXCLUSIVE) {
    return {
      canCoexist: false,
      relation: rel,
      reason: `Domains ${contribA.domain} and ${contribB.domain} are mutually exclusive`
    };
  }

  // Orthogonal, Complementary, Neutral or Dependent can freely coexist on distinct slots
  return {
    canCoexist: true,
    relation: rel,
    reason: `Orthogonal/Complementary coexistence on distinct slots (${contribA.targetSlot} vs ${contribB.targetSlot})`
  };
}

module.exports = {
  INTERACTION_RELATIONS,
  DOMAIN_PAIR_RELATIONS,
  getDomainInteractionRelation,
  evaluateContributionCoexistence
};
