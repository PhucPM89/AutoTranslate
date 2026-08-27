"use strict";

/**
 * Central Stylist Provider Registry
 * 
 * Registers and instantiates all domain contribution providers.
 */

const { createActionProvider } = require("./action-provider");
const { createSwordProvider } = require("./sword-provider");
const { createZenTeaProvider } = require("./zen-tea-provider");
const { createSupernaturalProvider } = require("./supernatural-provider");

// Wave A Providers
const { createAlchemyProvider } = require("./alchemy-provider");
const { createBeastContractProvider } = require("./beast-contract-provider");
const { createBestiaryProvider } = require("./bestiary-provider");
const { createCulinaryProvider } = require("./culinary-provider");
const { createCyberScifiProvider } = require("./cyber-scifi-provider");
const { createDaoistArrayProvider } = require("./daoist-array-provider");
const { createInscriptProvider } = require("./inscript-provider");
const { createMeridianHealingProvider } = require("./meridian-healing-provider");
const { createNecropolisProvider } = require("./necropolis-provider");
const { createSoulTokenProvider } = require("./soul-token-provider");
const { createSpatialProvider } = require("./spatial-provider");
const { createAuctionProvider } = require("./auction-provider");

// Wave B Providers (Semantic State & Environment)
const { createApocalypseProvider } = require("./apocalypse-provider");
const { createCosmicChessProvider } = require("./cosmic-chess-provider");
const { createDivineSenseProvider } = require("./divine-sense-provider");
const { createEldritchProvider } = require("./eldritch-provider");
const { createElegyProvider } = require("./elegy-provider");
const { createForensicDeductionProvider } = require("./forensic-deduction-provider");
const { createGrimoireMagicProvider } = require("./grimoire-magic-provider");
const { createImperialEdictProvider } = require("./imperial-edict-provider");
const { createKarmaProvider } = require("./karma-provider");
const { createMantraProvider } = require("./mantra-provider");
const { createMusicalDaoProvider } = require("./musical-dao-provider");
const { createTopographyProvider } = require("./topography-provider");
const { createTranscendenceProvider } = require("./transcendence-provider");
const { createTribulationProvider } = require("./tribulation-provider");
const { createWarfareProvider } = require("./warfare-provider");

// Wave C1 Providers (Structural & Sensory Normalization)
const { createChronologyProvider } = require("./chronology-provider");
const { createSoundscapeProvider } = require("./soundscape-provider");
const { createSensoryProvider } = require("./sensory-provider");

// Wave C2A Providers (Discourse & Social Address)
const { createTitleHierarchyProvider } = require("./title-hierarchy-provider");

// Wave C2B-1 Providers (Monologue & Inner Thought)
const { createMonologueProvider } = require("./monologue-provider");

// Wave C2B-2 Providers (Banter / Dialogue Act + Urban Slang)
const { createBanterProvider } = require("./banter-provider");
const { createUrbanSlangProvider } = require("./urban-slang-provider");

// Phase 3 Wave C3-A Providers (Courtly Beauty & Chant Versifier)
const { createCourtlyBeautyProvider } = require("./courtly-beauty-provider");
const { createChantVersifierProvider } = require("./chant-versifier-provider");

function createDefaultProviderRegistry() {
  const providers = [
    // Phase 2A Pilot
    createActionProvider(),
    createSwordProvider(),
    createZenTeaProvider(),
    createSupernaturalProvider(),

    // Phase 2B Wave A (12 Providers)
    createAlchemyProvider(),
    createBeastContractProvider(),
    createBestiaryProvider(),
    createCulinaryProvider(),
    createCyberScifiProvider(),
    createDaoistArrayProvider(),
    createInscriptProvider(),
    createMeridianHealingProvider(),
    createNecropolisProvider(),
    createSoulTokenProvider(),
    createSpatialProvider(),
    createAuctionProvider(),

    // Phase 2B Wave B (15 Providers)
    createApocalypseProvider(),
    createCosmicChessProvider(),
    createDivineSenseProvider(),
    createEldritchProvider(),
    createElegyProvider(),
    createForensicDeductionProvider(),
    createGrimoireMagicProvider(),
    createImperialEdictProvider(),
    createKarmaProvider(),
    createMantraProvider(),
    createMusicalDaoProvider(),
    createTopographyProvider(),
    createTranscendenceProvider(),
    createTribulationProvider(),
    createWarfareProvider(),

    // Phase 2B Wave C1 (3 Providers)
    createChronologyProvider(),
    createSoundscapeProvider(),
    createSensoryProvider(),

    // Phase 2B Wave C2A (1 Provider)
    createTitleHierarchyProvider(),

    // Phase 2B Wave C2B-1 (1 Provider)
    createMonologueProvider(),

    // Phase 2B Wave C2B-2 (2 Providers)
    createBanterProvider(),
    createUrbanSlangProvider(),

    // Phase 3 Wave C3-A (2 Providers)
    createCourtlyBeautyProvider(),
    createChantVersifierProvider()
  ];

  return Object.freeze({
    getAllProviders: () => [...providers],
    getProviders: () => [...providers],
    providers: Object.freeze(providers)
  });
}

module.exports = {
  createDefaultProviderRegistry
};
