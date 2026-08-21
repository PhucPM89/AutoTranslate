"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAuthClient } = require("./auth.js");

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
  user: {
    id: "u1",
    email: "doc@gia.vn",
    user_metadata: { full_name: "Độc Giả Google" }
  }
};

test("getOAuthUrl builds the correct Supabase Google authorize endpoint", () => {
  const { client } = harness();
  const url = client.getOAuthUrl("google");
  assert.match(url, /^https:\/\/project\.supabase\.co\/auth\/v1\/authorize\?/);
  assert.match(url, /provider=google/);
});

test("signInWithGoogle returns authorize URL without error", () => {
  const { client } = harness();
  const result = client.signInWithGoogle();
  assert.equal(result.ok, true);
  assert.match(result.url, /provider=google/);
});

test("signOut clears the session even when the server call fails", async () => {
  const { client, storage } = harness({ responses: [{ reject: true }] });
  storage.setItem("tramChu.auth", JSON.stringify({ accessToken: "at-1", user: { id: "u1" } }));
  const reloaded = createAuthClient({
    url: "https://project.supabase.co",
    anonKey: "anon-key",
    storage
  });
  assert.equal(reloaded.getSession().accessToken, "at-1");
  await reloaded.signOut();
  assert.equal(reloaded.getSession(), null);
});

test("an expired session is refreshed once even for concurrent callers", async () => {
  let clock = 1_000_000;
  const { client, calls, storage } = harness({
    responses: [
      {
        status: 200,
        payload: {
          access_token: "at-2",
          refresh_token: "rt-2",
          expires_in: 3600,
          user: SESSION_PAYLOAD.user
        }
      }
    ],
    now: () => clock
  });

  storage.setItem(
    "tramChu.auth",
    JSON.stringify({
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: clock + 10_000,
      user: { id: "u1" }
    })
  );

  const reloaded = createAuthClient({
    url: "https://project.supabase.co",
    anonKey: "anon-key",
    storage,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body) : null, headers: options.headers });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "at-2",
          refresh_token: "rt-2",
          expires_in: 3600,
          user: SESSION_PAYLOAD.user
        })
      };
    },
    now: () => clock
  });

  const [a, b, c] = await Promise.all([
    reloaded.ensureFreshToken(),
    reloaded.ensureFreshToken(),
    reloaded.ensureFreshToken()
  ]);
  assert.equal(a.accessToken, "at-2");
  assert.equal(b.accessToken, "at-2");
  assert.equal(c.accessToken, "at-2");
  assert.equal(calls.length, 1, "phải chỉ gọi refresh một lần");
  assert.match(calls[0].url, /grant_type=refresh_token/);
  assert.equal(calls[0].body.refresh_token, "rt-1");
});

test("a fresh session is not refreshed at all", async () => {
  const { calls, storage } = harness();
  storage.setItem(
    "tramChu.auth",
    JSON.stringify({
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: Date.now() + 100_000_000,
      user: { id: "u1" }
    })
  );

  const reloaded = createAuthClient({
    url: "https://project.supabase.co",
    anonKey: "anon-key",
    storage,
    fetchImpl: async () => {
      throw new Error("không được gọi mạng");
    }
  });

  const fresh = await reloaded.ensureFreshToken();
  assert.equal(fresh.accessToken, "at-1");
  assert.equal(calls.length, 0);
});

test("a stored session is picked up on construction with no network call", async () => {
  const { calls, storage } = harness();
  storage.setItem(
    "tramChu.auth",
    JSON.stringify({
      accessToken: "at-9",
      refreshToken: "rt-9",
      expiresAt: 9e15,
      user: { id: "u1", email: "a@b.vn" }
    })
  );
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
});

test("the anon key is the only credential ever sent", async () => {
  const calls = [];
  const storage = {
    getItem: () => JSON.stringify({ accessToken: "at-1", refreshToken: "rt-1", expiresAt: 9e15, user: {} }),
    setItem: () => {},
    removeItem: () => {}
  };
  const client = createAuthClient({
    url: "https://project.supabase.co",
    anonKey: "anon-key",
    storage,
    fetchImpl: async (url, options) => {
      calls.push({ url, headers: options.headers });
      return { ok: true, status: 204, json: async () => ({}) };
    }
  });

  await client.signOut();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.apikey, "anon-key");
  assert.equal(calls[0].headers.Authorization, "Bearer at-1");
});
