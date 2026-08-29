"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateTokens, canReserveBudget, reserveBudget } = require("./qa-budget");
test("QA budget stops before exceeding tokens or request count", () => {
  const ledger = reserveBudget(null, { inputTokens: estimateTokens("x".repeat(300)), requests: 1 }, "2026-01-01T00:00:00Z");
  assert.equal(canReserveBudget(ledger, { inputTokens: 10, requests: 1 }, { maxInputTokens: 105, maxRequests: 2 }).ok, false);
  assert.equal(canReserveBudget(ledger, { inputTokens: 1, requests: 2 }, { maxInputTokens: 1000, maxRequests: 2 }).ok, false);
});
