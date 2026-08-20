"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { presignR2Url: presignNode } = require("./storage/r2-presign");
const { issueSessionToken } = require("./admin-auth");

// The Pages Functions are ESM for the Workers runtime, while this package is
// CommonJS. Loading them through a data: URL runs the real source under Node's
// ESM loader without a build step or a second package. Both files are chosen to
// have no relative imports so this stays honest - it is the shipped source being
// tested, not a copy.
function loadModule(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  assert.ok(!/^\s*import\s+.*from\s+["']\./m.test(source), `${relativePath} có relative import, không nạp được kiểu này`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const CREDS = {
  bucket: "novel-archive",
  key: "uploads/abc.epub",
  accountId: "acct123",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI-K7MDENG-bPxRfiCYEXAMPLEKEY",
  now: new Date("2026-01-02T03:04:05.000Z")
};

test("the Workers signer and the Node signer agree exactly", async () => {
  const { presignR2Url: presignWorker } = await loadModule("functions/_lib/sigv4.js");

  // Byte-for-byte: a Pages upload and a Vercel upload must be interchangeable,
  // and R2 rejects anything that is off by a character.
  for (const variant of [
    {},
    { key: "uploads/quyển sách.epub" },
    { key: "covers/uploads/a b/c.webp", bucket: "novel-storage" },
    { method: "GET" },
    { expiresIn: 60 },
    { expiresIn: 7 * 24 * 60 * 60 },
    { endpoint: "https://custom.example.com" }
  ]) {
    const options = { ...CREDS, ...variant };
    const fromNode = presignNode(options);
    const fromWorker = await presignWorker(options);
    assert.equal(fromWorker.url, fromNode.url, `khác nhau với ${JSON.stringify(variant)}`);
    assert.equal(fromWorker.expiresAt, fromNode.expiresAt);
    assert.equal(fromWorker.key, fromNode.key);
  }
});

test("the Workers signer rejects the same bad input as the Node one", async () => {
  const { presignR2Url: presignWorker } = await loadModule("functions/_lib/sigv4.js");
  await assert.rejects(() => presignWorker({ ...CREDS, secretAccessKey: "" }), /credentials/);
  await assert.rejects(() => presignWorker({ ...CREDS, bucket: "" }), /bucket/);
  await assert.rejects(() => presignWorker({ ...CREDS, expiresIn: 0 }), /expiresIn/);
  await assert.rejects(() => presignWorker({ ...CREDS, expiresIn: 60 * 60 * 24 * 8 }), /expiresIn/);
  await assert.rejects(() => presignWorker({ ...CREDS, accountId: "", endpoint: "" }), /R2_ACCOUNT_ID/);
});

test("the signed URL never carries the secret", async () => {
  const { presignR2Url: presignWorker } = await loadModule("functions/_lib/sigv4.js");
  const signed = await presignWorker(CREDS);
  assert.ok(!signed.url.includes(CREDS.secretAccessKey));
  assert.ok(signed.url.includes("X-Amz-Signature="));
});

test("the Pages function accepts a session issued by the existing login", async () => {
  const { verifySessionToken } = await loadModule("functions/_lib/admin-session.js");
  const secret = "một-secret-đủ-dài-để-dùng-thật";

  // Issued by server/admin-auth.js, verified by the Workers code: an admin
  // already logged in must not have to log in again.
  const token = issueSessionToken(secret);
  assert.equal(await verifySessionToken(token, secret), true);

  assert.equal(await verifySessionToken(token, "secret-khác"), false, "sai secret phải bị từ chối");
  assert.equal(await verifySessionToken("", secret), false);
  assert.equal(await verifySessionToken(token, ""), false);
  assert.equal(await verifySessionToken("khong-co-dau-cham", secret), false);

  // A tampered payload keeps the old signature and must fail.
  const [payload, signature] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ exp: Date.now() + 9e9, nonce: "x" })).toString("base64url");
  assert.equal(await verifySessionToken(`${forgedPayload}.${signature}`, secret), false, "payload bị sửa phải bị từ chối");
  assert.equal(await verifySessionToken(`${payload}.${signature.slice(0, -1)}a`, secret), false, "chữ ký bị sửa phải bị từ chối");
});

test("an expired session is rejected even though its signature is valid", async () => {
  const { verifySessionToken } = await loadModule("functions/_lib/admin-session.js");
  const crypto = require("crypto");
  const secret = "secret-kiem-tra-het-han";
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() - 1000, nonce: "abc" })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  assert.equal(await verifySessionToken(`${payload}.${signature}`, secret), false);
});

test("cookie parsing picks the right cookie out of a crowded header", async () => {
  const { readCookie } = await loadModule("functions/_lib/admin-session.js");
  const request = {
    headers: {
      get: () => "theme=dark; tangthu_admin=abc.def; other=tangthu_admin"
    },
    url: "https://tram-chu.online/api/admin/upload"
  };
  assert.equal(readCookie(request, "tangthu_admin"), "abc.def");
  assert.equal(readCookie(request, "khong-co"), "");
});

test("cross-origin posts are refused", async () => {
  const { isSameOrigin } = await loadModule("functions/_lib/admin-session.js");
  const make = (origin) => ({
    url: "https://tram-chu.online/api/admin/upload",
    headers: { get: (name) => (name === "origin" ? origin : null) }
  });
  assert.equal(isSameOrigin(make("https://tram-chu.online")), true);
  assert.equal(isSameOrigin(make("https://ke-xau.example.com")), false);
  assert.equal(isSameOrigin(make(null)), true, "thiếu Origin thì cho qua, như bản Node");
});
