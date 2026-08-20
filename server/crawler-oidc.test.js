"use strict";

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { isCrawlerRequest } = require("./crawler-store");

// These tests exist because of a real intermittent production failure: the
// crawler got HTTP 401 on some scheduled runs and not others. GitHub rotates its
// OIDC signing keys, the JWKS was cached for an hour per warm serverless
// instance, and an unknown kid was treated as a forged token instead of a stale
// cache. Cold instances succeeded, warm ones rejected valid tokens.

const AUDIENCE = "https://auto-translate-xi.vercel.app";

function makeKeyPair(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  return { kid, privateKey, jwk: { ...jwk, kid, kty: "RSA", alg: "RS256", use: "sig" } };
}

function makeToken(pair, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: pair.kid };
  const payload = {
    iss: "https://token.actions.githubusercontent.com",
    aud: AUDIENCE,
    repository: "PhucPM89/AutoTranslate",
    ref: "refs/heads/main",
    workflow_ref: "PhucPM89/AutoTranslate/.github/workflows/fanqie-crawler.yml@refs/heads/main",
    nbf: now - 10,
    exp: now + 300,
    ...overrides
  };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), pair.privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

function request(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

// Serves whichever keys the test currently says GitHub is publishing, and counts
// how many times the JWKS was fetched.
function stubJwks(state) {
  const original = global.fetch;
  global.fetch = async (url) => {
    if (!String(url).includes("/.well-known/jwks")) throw new Error(`fetch ngoài dự kiến: ${url}`);
    state.fetches += 1;
    return new Response(JSON.stringify({ keys: state.keys }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return () => {
    global.fetch = original;
  };
}

test("accepts a token signed by a published key, and rotation does not lock it out", async () => {
  const oldKey = makeKeyPair("key-old");
  const newKey = makeKeyPair("key-new");
  const state = { keys: [oldKey.jwk], fetches: 0 };
  const restore = stubJwks(state);
  try {
    assert.equal(await isCrawlerRequest(request(makeToken(oldKey))), true, "khoá đang publish phải được nhận");
    const afterFirst = state.fetches;

    // GitHub rotates. The cached set still holds only the old key, so without the
    // refetch this returned false and the run failed with 401.
    state.keys = [newKey.jwk];
    assert.equal(await isCrawlerRequest(request(makeToken(newKey))), true, "kid mới phải khiến JWKS được tải lại");
    assert.ok(state.fetches > afterFirst, "phải có thêm một lần tải JWKS");
  } finally {
    restore();
  }
});

test("rejects tokens that fail the claim checks, whatever the signature", async () => {
  const key = makeKeyPair("key-claims");
  const state = { keys: [key.jwk], fetches: 0 };
  const restore = stubJwks(state);
  try {
    const cases = {
      "sai audience": { aud: "https://ke-xau.example.com" },
      "sai repo": { repository: "someone/else" },
      "khong phai main": { ref: "refs/heads/feature" },
      "sai workflow": { workflow_ref: "PhucPM89/AutoTranslate/.github/workflows/other.yml@refs/heads/main" },
      "het han": { exp: Math.floor(Date.now() / 1000) - 10 },
      "sai issuer": { iss: "https://evil.example.com" }
    };
    for (const [name, overrides] of Object.entries(cases)) {
      assert.equal(await isCrawlerRequest(request(makeToken(key, overrides))), false, name);
    }
  } finally {
    restore();
  }
});

test("rejects a token signed by a key GitHub never published", async () => {
  const published = makeKeyPair("key-real");
  const forged = makeKeyPair("key-real"); // same kid, different private key
  const state = { keys: [published.jwk], fetches: 0 };
  const restore = stubJwks(state);
  try {
    assert.equal(await isCrawlerRequest(request(makeToken(forged))), false, "chữ ký sai phải bị từ chối");
  } finally {
    restore();
  }
});

test("a request with no bearer token never reaches the network", async () => {
  const state = { keys: [], fetches: 0 };
  const restore = stubJwks(state);
  try {
    assert.equal(await isCrawlerRequest({ headers: {} }), false);
    assert.equal(await isCrawlerRequest({ headers: { authorization: "Basic abc" } }), false);
    assert.equal(await isCrawlerRequest({ headers: { authorization: "Bearer " } }), false);
    assert.equal(state.fetches, 0, "không được gọi JWKS khi chưa có token");
  } finally {
    restore();
  }
});

test("a malformed token is rejected without throwing", async () => {
  const state = { keys: [], fetches: 0 };
  const restore = stubJwks(state);
  try {
    for (const token of ["abc", "a.b", "a.b.c.d", "not-base64.not-base64.sig"]) {
      assert.equal(await isCrawlerRequest(request(token)), false, token);
    }
  } finally {
    restore();
  }
});

test("an unknown kid costs at most one extra JWKS fetch per minute", async () => {
  const key = makeKeyPair("key-known");
  const state = { keys: [key.jwk], fetches: 0 };
  const restore = stubJwks(state);
  try {
    // Warm the cache, then hammer it with kids that will never be published.
    await isCrawlerRequest(request(makeToken(key)));
    const warm = state.fetches;
    for (let i = 0; i < 12; i += 1) {
      const junk = makeKeyPair(`junk-${i}`);
      assert.equal(await isCrawlerRequest(request(makeToken(junk))), false);
    }
    assert.ok(
      state.fetches - warm <= 1,
      `chỉ được tải lại tối đa 1 lần, thực tế ${state.fetches - warm}`
    );
  } finally {
    restore();
  }
});
