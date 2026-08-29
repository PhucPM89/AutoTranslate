"use strict";

function estimateTokens(text) { return Math.max(1, Math.ceil(String(text || "").length / 3)); }

function canReserveBudget(ledger, { inputTokens = 0, requests = 1 }, limits = {}) {
  const maxInputTokens = Math.max(1, Number(limits.maxInputTokens || 250_000));
  const maxRequests = Math.max(1, Number(limits.maxRequests || 100));
  const usedTokens = Number(ledger?.estimatedInputTokens || 0);
  const usedRequests = Number(ledger?.requests || 0);
  return { ok: usedTokens + inputTokens <= maxInputTokens && usedRequests + requests <= maxRequests, remainingInputTokens: Math.max(0, maxInputTokens - usedTokens), remainingRequests: Math.max(0, maxRequests - usedRequests) };
}

function reserveBudget(ledger, reservation, now = new Date().toISOString()) {
  return { schema: 1, date: now.slice(0, 10), estimatedInputTokens: Number(ledger?.estimatedInputTokens || 0) + Number(reservation.inputTokens || 0), requests: Number(ledger?.requests || 0) + Number(reservation.requests || 1), updatedAt: now };
}

module.exports = { estimateTokens, canReserveBudget, reserveBudget };
