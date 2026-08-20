"use strict";

const crypto = require("node:crypto");

const SESSION_TTL_MS = 30 * 60 * 1000;

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function verifyPassword(password, encodedHash) {
  try {
    const [algorithm, saltValue, hashValue] = String(encodedHash || "").split("$");
    if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, "base64url");
    const actual = crypto.scryptSync(String(password || ""), Buffer.from(saltValue, "base64url"), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function issueSessionToken(secret) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS, nonce: crypto.randomBytes(12).toString("base64url") })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, secret) {
  try {
    if (!token || !secret) return false;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return false;
    const expected = Buffer.from(sign(payload, secret));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(session.exp) && session.exp > Date.now();
  } catch {
    return false;
  }
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}


module.exports = {
  createPasswordHash,
  verifyPassword,
  issueSessionToken,
  verifySessionToken,
  SESSION_TTL_MS
};
