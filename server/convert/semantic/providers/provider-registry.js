"use strict";

/**
 * Stylist Provider Registry (Phase 2)
 * 
 * Manages the lifecycle, domain mapping, and retrieval of all Stylist Contribution Providers.
 */

const { createActionProvider } = require("./action-provider");
const { createSwordProvider } = require("./sword-provider");
const { createSupernaturalProvider } = require("./supernatural-provider");
const { createZenTeaProvider } = require("./zen-tea-provider");
const { createCourtProvider } = require("./court-provider");
const { createCultivationProvider } = require("./cultivation-provider");

function createProviderRegistry() {
  const providers = new Map();

  // Register built-in providers
  const list = [
    createActionProvider(),
    createSwordProvider(),
    createSupernaturalProvider(),
    createZenTeaProvider(),
    createCourtProvider(),
    createCultivationProvider()
  ];

  for (const p of list) {
    providers.set(p.providerId, p);
  }

  function registerProvider(provider) {
    if (!provider || !provider.providerId) return;
    providers.set(provider.providerId, provider);
  }

  function getProvider(providerId) {
    return providers.get(providerId) || null;
  }

  function getProvidersForDomain(domain) {
    const matched = [];
    for (const p of providers.values()) {
      if (p.domain === domain) {
        matched.push(p);
      }
    }
    return matched;
  }

  function getAllProviders() {
    return Array.from(providers.values());
  }

  return Object.freeze({
    registerProvider,
    getProvider,
    getProvidersForDomain,
    getAllProviders
  });
}

module.exports = {
  createProviderRegistry
};
