"use strict";

const crypto = require("crypto");

const COOKIE_NAME = "tangthu_admin";
const SESSION_TTL_MS = 30 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

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

function getSession(req) {
  return parseCookies(req.headers.cookie || "")[COOKIE_NAME] || "";
}

function isAdmin(req) {
  return verifySessionToken(getSession(req), process.env.LIBRARY_SESSION_SECRET);
}

function setSessionCookie(res, token, secure = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) {
  const parts = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${SESSION_TTL_MS / 1000}`];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res, secure = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL)) {
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function parseCookies(header) {
  return header.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator < 0) return cookies;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) cookies[key] = value;
    return cookies;
  }, {});
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return new URL(origin).host === String(host || "").split(",")[0].trim();
  } catch {
    return false;
  }
}

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function canAttemptLogin(req) {
  pruneAttempts();
  const entry = loginAttempts.get(getClientIp(req));
  return !entry || entry.count < LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(req) {
  const key = getClientIp(req);
  const current = loginAttempts.get(key);
  loginAttempts.set(key, !current || current.expiresAt <= Date.now()
    ? { count: 1, expiresAt: Date.now() + LOGIN_WINDOW_MS }
    : { ...current, count: current.count + 1 });
}

function clearLoginFailures(req) {
  loginAttempts.delete(getClientIp(req));
}

function pruneAttempts() {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (entry.expiresAt <= now) loginAttempts.delete(key);
  }
}

module.exports = {
  COOKIE_NAME,
  createPasswordHash,
  verifyPassword,
  issueSessionToken,
  isAdmin,
  setSessionCookie,
  clearSessionCookie,
  isSameOrigin,
  canAttemptLogin,
  recordLoginFailure,
  clearLoginFailures
};
