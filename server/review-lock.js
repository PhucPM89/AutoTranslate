"use strict";

function reviewLockKey(bookId) {
  return `jobs/${bookId}/semantic-review.lock.json`;
}

async function readLock(storage, key) {
  try {
    const raw = await storage.get(key);
    return raw ? JSON.parse(raw.toString("utf8")) : null;
  } catch {
    return null;
  }
}

async function acquireReviewLock(storage, bookId, owner, { now = Date.now(), leaseMs = 60 * 60_000 } = {}) {
  const key = reviewLockKey(bookId);
  const existing = await readLock(storage, key);
  if (existing && Number(existing.expiresAtEpochMs || 0) > now) return null;
  if (existing) {
    const head = await storage.head(key);
    try {
      await storage.remove(key, head?.etag ? { ifMatch: head.etag } : {});
    } catch (error) {
      if ([409, 412].includes(error.status)) return null;
      throw error;
    }
  }
  const lock = {
    schema: 1,
    bookId,
    owner: String(owner || "semantic-reviewer"),
    acquiredAt: new Date(now).toISOString(),
    expiresAtEpochMs: now + leaseMs
  };
  try {
    await storage.put(key, JSON.stringify(lock), { cacheControl: "private, no-store", ifNoneMatch: "*" });
    return lock;
  } catch (error) {
    if ([409, 412].includes(error.status)) return null;
    throw error;
  }
}

async function releaseReviewLock(storage, bookId, owner) {
  const key = reviewLockKey(bookId);
  const existing = await readLock(storage, key);
  if (!existing || existing.owner !== String(owner || "")) return false;
  const head = await storage.head(key);
  try {
    await storage.remove(key, head?.etag ? { ifMatch: head.etag } : {});
  } catch (error) {
    if ([409, 412].includes(error.status)) return false;
    throw error;
  }
  return true;
}

module.exports = { reviewLockKey, acquireReviewLock, releaseReviewLock };
