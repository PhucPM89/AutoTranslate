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
    createAuctionProvider()
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
