"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("./auth-core.js");

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    size: () => data.size
  };
}

test("normalizeSession prefers the server clock over the local one", () => {
  const session = core.normalizeSession(
    { access_token: "a", refresh_token: "r", expires_in: 3600, expires_at: 1_700_000_000 },
    5_000
  );
  assert.equal(session.expiresAt, 1_700_000_000 * 1000);
});

test("normalizeSession falls back to expires_in when expires_at is absent", () => {
  const session = core.normalizeSession({ access_token: "a", expires_in: 120 }, 1_000);
  assert.equal(session.expiresAt, 1_000 + 120_000);
});

test("normalizeSession rejects a payload with no access token", () => {
  assert.equal(core.normalizeSession({ refresh_token: "r" }), null);
  assert.equal(core.normalizeSession(null), null);
});

test("normalizeSession keeps the user fields the UI needs", () => {
  const session = core.normalizeSession({
    access_token: "a",
    user: {
      id: "u1",
      email: "doc@gia.vn",
      user_metadata: { full_name: "Độc Giả", avatar_url: "https://avatar.url/1.png" }
    }
  });
  assert.deepEqual(session.user, {
    id: "u1",
    email: "doc@gia.vn",
    fullName: "Độc Giả",
    avatarUrl: "https://avatar.url/1.png"
  });
});

test("normalizeSession extracts user from JWT if payload user is missing", () => {
  // Create a minimal fake JWT: header.payload.signature
  const jwtPayload = Buffer.from(
    JSON.stringify({
      sub: "u-google-1",
      email: "google.user@gmail.com",
      user_metadata: { full_name: "Google User", avatar_url: "https://lh3.googleusercontent.com/a/1" }
    })
  ).toString("base64url");
  const token = `header.${jwtPayload}.sig`;

  const session = core.normalizeSession({ access_token: token, refresh_token: "r1" });
  assert.equal(session.user.id, "u-google-1");
  assert.equal(session.user.email, "google.user@gmail.com");
  assert.equal(session.user.fullName, "Google User");
  assert.equal(session.user.avatarUrl, "https://lh3.googleusercontent.com/a/1");
});

test("isExpired treats a token inside the refresh margin as expired", () => {
  const now = 1_000_000;
  assert.equal(core.isExpired({ accessToken: "a", expiresAt: now + 30_000 }, now), true);
  assert.equal(core.isExpired({ accessToken: "a", expiresAt: now + 10 * 60_000 }, now), false);
});

test("isExpired treats a missing session as expired", () => {
  assert.equal(core.isExpired(null), true);
  assert.equal(core.isExpired({ expiresAt: Date.now() + 9e9 }), true);
});

test("canRefresh is false without a refresh token", () => {
  assert.equal(core.canRefresh({ accessToken: "a", refreshToken: "" }), false);
  assert.equal(core.canRefresh({ accessToken: "a", refreshToken: "r" }), true);
});

test("session survives a write and read round trip", () => {
  const storage = fakeStorage();
  const session = core.normalizeSession(
    { access_token: "a", refresh_token: "r", expires_in: 3600, user: { id: "u1", email: "a@b.vn" } },
    1_000
  );
  core.writeSession(storage, session);
  assert.deepEqual(core.readSession(storage), session);
});

test("readSession ignores corrupt or foreign data under its key", () => {
  assert.equal(core.readSession(fakeStorage({ [core.SESSION_KEY]: "{not json" })), null);
  assert.equal(core.readSession(fakeStorage({ [core.SESSION_KEY]: '{"theme":"dark"}' })), null);
  assert.equal(core.readSession(fakeStorage()), null);
  assert.equal(core.readSession(null), null);
});

test("writeSession(null) removes the stored session", () => {
  const storage = fakeStorage({ [core.SESSION_KEY]: '{"accessToken":"a"}' });
  core.writeSession(storage, null);
  assert.equal(storage.size(), 0);
});

test("writeSession swallows a storage that refuses to write", () => {
  const hostile = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("QuotaExceededError");
    }
  };
  assert.doesNotThrow(() => core.writeSession(hostile, { accessToken: "a" }));
  assert.doesNotThrow(() => core.writeSession(hostile, null));
});

const DIACRITIC = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

test("every GoTrue code seen maps to Vietnamese", () => {
  const observed = [
    ["invalid_credentials", 400],
    ["email_not_confirmed", 400],
    ["user_already_exists", 422],
    ["over_request_rate_limit", 429],
    ["refresh_token_not_found", 400]
  ];
  const english = "Something went badly wrong upstream";
  for (const [code, status] of observed) {
    const message = core.authErrorMessage(status, { error_code: code, msg: english });
    assert.match(message, DIACRITIC, `${code} không phải tiếng Việt: ${message}`);
    assert.ok(!message.includes(english), `${code} lọt nguyên văn tiếng Anh`);
    assert.ok(message.length > 8, `${code} thiếu nội dung`);
  }
});

test("authErrorMessage falls back on status when there is no code", () => {
  assert.match(core.authErrorMessage(429, {}), /quá nhiều lần/);
  assert.match(core.authErrorMessage(503, {}), /Máy chủ/);
  assert.match(core.authErrorMessage(400, {}), /Không đăng nhập được/);
});

test("sessionFromUrlHash picks up the tokens Google OAuth redirect carries", () => {
  const hash = "#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=recovery";
  const session = core.sessionFromUrlHash(hash, 1_000);
  assert.equal(session.accessToken, "abc");
  assert.equal(session.refreshToken, "def");
  assert.equal(session.expiresAt, 1_000 + 3_600_000);
});

test("sessionFromUrlHash leaves the app's own hash routes alone", () => {
  for (const hash of ["", "#catalog", "#support", "#book/mieu-cuong-co-su"]) {
    assert.equal(core.sessionFromUrlHash(hash), null, hash);
  }
});

test("errorFromUrlHash explains an OAuth error clearly", () => {
  const hash = "#error=access_denied&error_code=access_denied&error_description=User+denied";
  assert.match(core.errorFromUrlHash(hash), /hủy/);
  assert.equal(core.errorFromUrlHash("#catalog"), "");
  assert.equal(core.errorFromUrlHash(""), "");
});

test("account label and initial handle full names and emails", () => {
  assert.equal(core.accountLabel({ fullName: "Phạm Minh Phúc", email: "phuc.pham@gmail.com" }), "Phạm Minh Phúc");
  assert.equal(core.accountInitial({ fullName: "Phạm Minh Phúc" }), "P");
  assert.equal(core.accountLabel({ email: "phuc.pham@gmail.com" }), "phuc.pham");
  assert.equal(core.accountInitial({ email: "phuc.pham@gmail.com" }), "P");
  assert.equal(core.accountInitial({ email: "_ánh@gmail.com" }), "Á");
  assert.equal(core.accountInitial({ email: "+++@gmail.com" }), "?");
  assert.equal(core.accountLabel({}), "Tài khoản");
  assert.equal(core.accountInitial({}), "T");
});
