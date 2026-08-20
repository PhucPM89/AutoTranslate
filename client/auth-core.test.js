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
  // A browser running five minutes fast would compute an expiry five minutes
  // late from expires_in, and keep using a token the server has already retired.
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

test("normalizeSession keeps only the user fields the UI needs", () => {
  const session = core.normalizeSession({
    access_token: "a",
    user: { id: "u1", email: "doc@gia.vn", phone: "0900", app_metadata: { provider: "email" } }
  });
  assert.deepEqual(session.user, { id: "u1", email: "doc@gia.vn" });
});

test("isExpired treats a token inside the refresh margin as expired", () => {
  const now = 1_000_000;
  // 30s of life left: still valid to the server, but too close to spend on a
  // request that might take longer than that.
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
  // Safari in private mode exposes localStorage and throws on use. Losing
  // persistence is acceptable; throwing would break the login just completed.
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

test("validateCredentials catches the mistakes worth catching before a request", () => {
  assert.match(core.validateCredentials({ email: "khong-phai-email", password: "matkhau1" }), /định dạng/);
  assert.match(core.validateCredentials({ email: "a@b.vn", password: "abc" }), /ít nhất 6/);
  assert.equal(core.validateCredentials({ email: "a@b.vn", password: "matkhau1" }), "");
});

test("validateCredentials measures the password in bytes, not characters", () => {
  // bcrypt ignores everything past 72 bytes. Vietnamese characters cost three
  // bytes each, so a 30-character password can cross the limit while looking
  // comfortably short - and the part past 72 would silently not be checked.
  const password = "mậtkhẩuruấtdàiđểkiểmtra".repeat(4);
  assert.ok(password.length < 100, "vẫn ngắn khi đếm ký tự");
  assert.ok(Buffer.byteLength(password, "utf8") > core.MAX_PASSWORD_BYTES);
  assert.match(core.validateCredentials({ email: "a@b.vn", password }), /quá dài/);
});

// "Email" is a normal Vietnamese word, so scanning for latin letters proves
// nothing. What matters is that the wording is ours and the English GoTrue sent
// does not reach the reader.
const DIACRITIC = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

test("every GoTrue code seen from the live project maps to Vietnamese", () => {
  const observed = [
    ["invalid_credentials", 400],
    ["email_not_confirmed", 400],
    ["weak_password", 422],
    ["user_already_exists", 422],
    ["over_email_send_rate_limit", 429],
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
  assert.match(core.authErrorMessage(400, {}), /Kiểm tra lại/);
});

test("authErrorMessage keeps the number out of an English length complaint", () => {
  const message = core.authErrorMessage(422, { msg: "Password should be at least 8 characters." });
  assert.match(message, /ít nhất 8 ký tự/);
});

test("an unrecognised error still produces Vietnamese, not a passthrough", () => {
  const samples = [
    { error_code: "unheard_of_code", msg: "Something broke deep inside" },
    { msg: "User already registered" },
    {},
    null
  ];
  for (const body of samples) {
    const message = core.authErrorMessage(400, body);
    assert.match(message, DIACRITIC, `không phải tiếng Việt: ${message}`);
    if (body?.msg) assert.ok(!message.includes(body.msg), `lọt nguyên văn: ${message}`);
  }
});

test("describeSignup reads the real confirmation-required response", () => {
  // Captured verbatim from the live project: 200 OK, a bare user record, no
  // session, and confirmed_at null. Note that is_anonymous is false and
  // confirmed_at is null here too, so neither can stand in for access_token.
  const probed = {
    id: "eb094b41-73da-45cb-882a-66e4764f4817",
    aud: "authenticated",
    role: "authenticated",
    email: "doc@gia.vn",
    confirmation_sent_at: "2026-08-21T00:00:00Z",
    confirmed_at: null,
    identities: [],
    is_anonymous: false
  };
  const outcome = core.describeSignup(probed);
  assert.equal(outcome.needsConfirmation, true);
  assert.equal(outcome.session, null);
  assert.equal(outcome.email, "doc@gia.vn");
});

test("describeSignup logs the reader straight in when confirmation is off", () => {
  const outcome = core.describeSignup({
    access_token: "a",
    refresh_token: "r",
    expires_in: 3600,
    user: { id: "u1", email: "doc@gia.vn" }
  });
  assert.equal(outcome.needsConfirmation, false);
  assert.equal(outcome.session.accessToken, "a");
  assert.equal(outcome.email, "doc@gia.vn");
});

test("sessionFromUrlHash picks up the tokens a confirmation link carries", () => {
  const hash = "#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=signup";
  const session = core.sessionFromUrlHash(hash, 1_000);
  assert.equal(session.accessToken, "abc");
  assert.equal(session.refreshToken, "def");
  assert.equal(session.expiresAt, 1_000 + 3_600_000);
});

test("sessionFromUrlHash leaves the app's own hash routes alone", () => {
  // These are real routes in this app. Mistaking one for a login callback would
  // wipe it from the address bar and break navigation.
  for (const hash of ["", "#catalog", "#support", "#book/mieu-cuong-co-su"]) {
    assert.equal(core.sessionFromUrlHash(hash), null, hash);
  }
});

test("errorFromUrlHash explains an expired link instead of doing nothing", () => {
  const hash = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
  assert.match(core.errorFromUrlHash(hash), /hết hạn/);
  assert.equal(core.errorFromUrlHash("#catalog"), "");
  assert.equal(core.errorFromUrlHash(""), "");
});

test("account label and initial come from the local part, never the domain", () => {
  assert.equal(core.accountLabel({ email: "phuc.pham@gmail.com" }), "phuc.pham");
  assert.equal(core.accountInitial({ email: "phuc.pham@gmail.com" }), "P");
  // A leading symbol must not become the avatar, and a Vietnamese letter has to
  // survive upper-casing with its diacritic intact.
  assert.equal(core.accountInitial({ email: "_ánh@gmail.com" }), "Á");
  // An address whose local part is nothing but punctuation leaves no letter to
  // show, which is the only case the placeholder exists for.
  assert.equal(core.accountInitial({ email: "+++@gmail.com" }), "?");
  assert.equal(core.accountLabel({}), "Tài khoản");
  assert.equal(core.accountInitial({}), "T");
});
