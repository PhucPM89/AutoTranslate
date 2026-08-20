"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPasswordHash,
  verifyPassword,
  issueSessionToken,
  verifySessionToken
} = require("./admin-auth");

test("stores and verifies an irreversible password hash", () => {
  const hash = createPasswordHash("correct horse battery staple");
  assert.match(hash, /^scrypt\$/);
  assert.equal(hash.includes("correct horse"), false);
  assert.equal(verifyPassword("correct horse battery staple", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
});

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
