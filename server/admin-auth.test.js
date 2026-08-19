"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPasswordHash,
  verifyPassword,
  issueSessionToken,
  isAdmin,
  setSessionCookie,
  clearSessionCookie,
  isSameOrigin
} = require("./admin-auth");

test("stores and verifies an irreversible password hash", () => {
  const hash = createPasswordHash("correct horse battery staple");
  assert.match(hash, /^scrypt\$/);
  assert.equal(hash.includes("correct horse"), false);
  assert.equal(verifyPassword("correct horse battery staple", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
});

test("accepts a signed admin session and rejects a changed token", () => {
  const previous = process.env.LIBRARY_SESSION_SECRET;
  process.env.LIBRARY_SESSION_SECRET = "test-secret-with-enough-entropy";
  const token = issueSessionToken(process.env.LIBRARY_SESSION_SECRET);
  assert.equal(isAdmin({ headers: { cookie: `tangthu_admin=${token}` } }), true);
  assert.equal(isAdmin({ headers: { cookie: `tangthu_admin=${token}x` } }), false);
  restoreEnv("LIBRARY_SESSION_SECRET", previous);
});

test("uses HttpOnly strict cookies and clears them safely", () => {
  const headers = {};
  const res = { setHeader: (key, value) => { headers[key] = value; } };
  setSessionCookie(res, "token", true);
  assert.match(headers["Set-Cookie"], /HttpOnly/);
  assert.match(headers["Set-Cookie"], /SameSite=Strict/);
  assert.match(headers["Set-Cookie"], /Secure/);
  clearSessionCookie(res, true);
  assert.match(headers["Set-Cookie"], /Max-Age=0/);
});

test("rejects cross-origin state-changing requests", () => {
  assert.equal(isSameOrigin({ headers: { origin: "https://example.com", host: "example.com" } }), true);
  assert.equal(isSameOrigin({ headers: { origin: "https://evil.example", host: "example.com" } }), false);
});

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
