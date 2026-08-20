"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAuthClient } = require("./auth.js");

// createAuthClient takes its fetch and storage as arguments precisely so it can
// be driven from node. initAuth is the only part that needs a DOM and is left to
// the browser check.
function harness({ responses = [], now = () => 1_000_000 } = {}) {
  const calls = [];
  const queue = [...responses];
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null, headers: options.headers });
    const next = queue.shift();
    if (!next) throw new Error(`Không có phản hồi giả cho ${url}`);
    if (next.reject) throw new Error("network down");
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.payload ?? {}
    };
  };
  const client = createAuthClient({
    url: "https://project.supabase.co",
    anonKey: "anon-key",
    storage,
    fetchImpl,
    now
  });
  return { client, calls, store, storage };
}

const SESSION_PAYLOAD = {
  access_token: "at-1",
  refresh_token: "rt-1",
  expires_in: 3600,
  user: { id: "u1", email: "doc@gia.vn" }
};

test("signIn stores the session and tells subscribers", async () => {
  const { client, calls } = harness({ responses: [{ status: 200, payload: SESSION_PAYLOAD }] });
  const seen = [];
  client.subscribe((session) => seen.push(session));

  const result = await client.signIn({ email: "doc@gia.vn", password: "matkhau1" });
  assert.equal(result.ok, true);
  assert.equal(client.getSession().accessToken, "at-1");
  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=password$/);
  assert.equal(calls[0].headers.apikey, "anon-key");
  // Once on subscribe with no session, once after signing in.
  assert.equal(seen.length, 2);
  assert.equal(seen[0], null);
  assert.equal(seen[1].user.email, "doc@gia.vn");
});

test("signIn on an unconfirmed account reports the one failure a reader can fix", async () => {
  const { client } = harness({
    responses: [{ status: 400, payload: { error_code: "email_not_confirmed", msg: "Email not confirmed" } }]
  });
  const result = await client.signIn({ email: "doc@gia.vn", password: "matkhau1" });
  assert.equal(result.ok, false);
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.email, "doc@gia.vn");
  assert.equal(client.getSession(), null);
});

test("signIn rejects a bad password without spending a request", async () => {
  const { client, calls } = harness();
  const result = await client.signIn({ email: "doc@gia.vn", password: "abc" });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test("signUp with confirmation on does not create a session", async () => {
  const { client, store } = harness({
    responses: [{ status: 200, payload: { id: "u1", email: "doc@gia.vn", confirmed_at: null } }]
  });
  const result = await client.signUp({ email: "doc@gia.vn", password: "matkhau1" });
  assert.equal(result.ok, true);
  assert.equal(result.needsConfirmation, true);
  assert.match(result.message, /doc@gia\.vn/);
  assert.equal(client.getSession(), null);
  assert.equal(store.size, 0, "không được lưu phiên nào");
});

test("signUp with confirmation off signs the reader in immediately", async () => {
  const { client } = harness({ responses: [{ status: 200, payload: SESSION_PAYLOAD }] });
  const result = await client.signUp({ email: "doc@gia.vn", password: "matkhau1" });
  assert.equal(result.needsConfirmation, false);
  assert.equal(client.getSession().accessToken, "at-1");
});

test("signOut clears the session even when the server call fails", async () => {
  const { client } = harness({ responses: [{ status: 200, payload: SESSION_PAYLOAD }, { reject: true }] });
  await client.signIn({ email: "doc@gia.vn", password: "matkhau1" });
  await client.signOut();
  // A failed logout must not leave a reader looking signed in with a token that
  // may or may not still work.
  assert.equal(client.getSession(), null);
});

test("an expired session is refreshed once even for concurrent callers", async () => {
  let clock = 1_000_000;
  const { client, calls } = harness({
    responses: [
      { status: 200, payload: { ...SESSION_PAYLOAD, expires_in: 60 } },
      { status: 200, payload: { access_token: "at-2", refresh_token: "rt-2", expires_in: 3600, user: SESSION_PAYLOAD.user } }
    ],
    now: () => clock
  });
  await client.signIn({ email: "doc@gia.vn", password: "matkhau1" });
  clock += 120_000;

  const [a, b, c] = await Promise.all([
    client.ensureFreshToken(),
    client.ensureFreshToken(),
    client.ensureFreshToken()
  ]);
  assert.equal(a.accessToken, "at-2");
  assert.equal(b.accessToken, "at-2");
  assert.equal(c.accessToken, "at-2");
  // GoTrue rotates the refresh token, so sending the old one twice would fail
  // the second call and sign the reader out.
  assert.equal(calls.length, 2, "phải chỉ gọi refresh một lần");
  assert.match(calls[1].url, /grant_type=refresh_token/);
  assert.equal(calls[1].body.refresh_token, "rt-1");
});

test("a fresh session is not refreshed at all", async () => {
  const { client, calls } = harness({ responses: [{ status: 200, payload: SESSION_PAYLOAD }] });
  await client.signIn({ email: "doc@gia.vn", password: "matkhau1" });
  await client.ensureFreshToken();
  assert.equal(calls.length, 1, "không được gọi mạng thêm");
});

test("a rejected refresh signs the reader out rather than keeping a dead token", async () => {
  let clock = 1_000_000;
  const { client, store } = harness({
    responses: [
      { status: 200, payload: { ...SESSION_PAYLOAD, expires_in: 60 } },
      { status: 400, payload: { error_code: "refresh_token_not_found" } }
    ],
    now: () => clock
  });
  await client.signIn({ email: "doc@gia.vn", password: "matkhau1" });
  clock += 120_000;
  assert.equal(await client.ensureFreshToken(), null);
  assert.equal(client.getSession(), null);
  assert.equal(store.size, 0);
});

test("ensureFreshToken is a no-op when nobody is signed in", async () => {
  const { client, calls } = harness();
  assert.equal(await client.ensureFreshToken(), null);
  assert.equal(calls.length, 0);
});

test("a stored session is picked up on construction with no network call", async () => {
  const { client, calls, storage } = harness();
  storage.setItem(
    "tramChu.auth",
    JSON.stringify({ accessToken: "at-9", refreshToken: "rt-9", expiresAt: 9e15, user: { id: "u1", email: "a@b.vn" } })
  );
  // A second client over the same storage stands in for the next page load.
  const reloaded = createAuthClient({
    url: "https://project.supabase.co",
    anonKey: "anon-key",
    storage,
    fetchImpl: async () => {
      throw new Error("không được gọi mạng khi tải trang");
    }
  });
  assert.equal(reloaded.getSession().accessToken, "at-9");
  assert.equal(calls.length, 0);
  void client;
});

test("password reset wording does not reveal whether the account exists", async () => {
  const { client, calls } = harness({ responses: [{ status: 200, payload: {} }] });
  const result = await client.requestPasswordReset("doc@gia.vn");
  assert.equal(result.ok, true);
  assert.match(result.message, /Nếu email này có tài khoản/);
  assert.match(calls[0].url, /\/auth\/v1\/recover/);
});

test("the anon key is the only credential ever sent", async () => {
  const { client, calls } = harness({
    responses: [{ status: 200, payload: SESSION_PAYLOAD }, { status: 204, payload: {} }]
  });
  await client.signIn({ email: "doc@gia.vn", password: "matkhau1" });
  await client.signOut();
  for (const call of calls) {
    assert.equal(call.headers.apikey, "anon-key");
    const authorization = call.headers.Authorization || "";
    // Only logout carries a bearer token, and it is the reader access token -
    // never a service role key, which must never reach a browser.
    if (authorization) assert.equal(authorization, "Bearer at-1");
  }
});
