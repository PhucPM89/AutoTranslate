"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { presignR2Url } = require("./r2-presign");

const CREDS = {
  bucket: "novel-archive",
  key: "uploads/abc.epub",
  accountId: "acct123",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI-K7MDENG-bPxRfiCYEXAMPLEKEY",
  now: new Date("2026-01-02T03:04:05.000Z")
};

test("presign puts the credential in the query and never the secret", () => {
  const signed = presignR2Url({ ...CREDS });
  assert.ok(!signed.url.includes(CREDS.secretAccessKey), "secret không được xuất hiện trong URL");
  assert.ok(signed.url.includes("X-Amz-Signature="));
  assert.ok(signed.url.includes(`X-Amz-Credential=${CREDS.accessKeyId}%2F20260102%2Fauto%2Fs3%2Faws4_request`));
  assert.ok(signed.url.startsWith("https://acct123.r2.cloudflarestorage.com/novel-archive/uploads/abc.epub?"));
});

test("the signature is deterministic for the same inputs and changes with the key", () => {
  const a = presignR2Url({ ...CREDS });
  const b = presignR2Url({ ...CREDS });
  assert.equal(a.url, b.url);
  const other = presignR2Url({ ...CREDS, key: "uploads/def.epub" });
  assert.notEqual(signatureOf(a.url), signatureOf(other.url));
});

test("method is part of the signature, so a PUT URL cannot be reused to DELETE", () => {
  const put = presignR2Url({ ...CREDS, method: "PUT" });
  const del = presignR2Url({ ...CREDS, method: "DELETE" });
  assert.notEqual(signatureOf(put.url), signatureOf(del.url));
});

test("expiry is bounded", () => {
  assert.throws(() => presignR2Url({ ...CREDS, expiresIn: 0 }), /expiresIn/);
  assert.throws(() => presignR2Url({ ...CREDS, expiresIn: 60 * 60 * 24 * 8 }), /expiresIn/);
  assert.equal(presignR2Url({ ...CREDS, expiresIn: 900 }).expiresAt, "2026-01-02T03:19:05.000Z");
});

test("missing credentials fail loudly instead of producing a broken URL", () => {
  assert.throws(() => presignR2Url({ ...CREDS, secretAccessKey: "" }), /credentials/);
  assert.throws(() => presignR2Url({ ...CREDS, bucket: "" }), /bucket/);
  assert.throws(() => presignR2Url({ ...CREDS, accountId: "", endpoint: "" }), /R2_ACCOUNT_ID/);
});

test("a key with spaces or unicode is encoded per segment", () => {
  const signed = presignR2Url({ ...CREDS, key: "uploads/quyển sách.epub" });
  assert.ok(signed.url.includes("/uploads/quy%E1%BB%83n%20s%C3%A1ch.epub?"));
  assert.ok(signed.url.includes("/novel-archive/uploads/"), "dấu / trong key phải giữ nguyên");
});

function signatureOf(url) {
  return new URL(url).searchParams.get("X-Amz-Signature");
}
