"use strict";

// Query-string SigV4 presigning for R2.
//
// The point of this file: an admin can upload a 200 MB EPUB straight to the
// private archive bucket without the bytes passing through any serverless
// function, and without the browser ever seeing R2_SECRET_ACCESS_KEY. The
// signature is scoped to one method, one key and a short expiry.
//
// Presigning differs from signRequest() in r2-driver.js: the credential lives
// in the query string rather than an Authorization header, only `host` is
// signed, and the payload hash is the literal UNSIGNED-PAYLOAD - the signature
// cannot depend on bytes the server never sees.

const crypto = require("crypto");

const REGION = "auto";
const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";
const MAX_EXPIRES_SECONDS = 7 * 24 * 60 * 60; // AWS SigV4 hard limit.

function presignR2Url({
  method = "PUT",
  bucket,
  key,
  accountId,
  accessKeyId,
  secretAccessKey,
  endpoint,
  expiresIn = 900,
  now = new Date()
}) {
  if (!bucket) throw new Error("Thiếu bucket.");
  if (!key) throw new Error("Thiếu key.");
  if (!accessKeyId || !secretAccessKey) throw new Error("Thiếu R2 credentials.");
  if (!endpoint && !accountId) throw new Error("Thiếu R2_ACCOUNT_ID hoặc R2_ENDPOINT.");

  const expires = Math.floor(Number(expiresIn));
  if (!Number.isFinite(expires) || expires < 1 || expires > MAX_EXPIRES_SECONDS) {
    throw new Error(`expiresIn phải trong khoảng 1..${MAX_EXPIRES_SECONDS} giây.`);
  }

  const base = String(endpoint || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/$/, "");
  // Each path segment is encoded separately: a key contains slashes that must
  // stay slashes, but everything else has to be escaped.
  const encodedKey = String(key).split("/").map(encodeRfc3986).join("/");
  const url = new URL(`${base}/${encodeRfc3986(bucket)}/${encodedKey}`);

  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const query = {
    "X-Amz-Algorithm": ALGORITHM,
    "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host"
  };

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encodeRfc3986(name)}=${encodeRfc3986(query[name])}`)
    .join("&");

  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery,
    `host:${url.host}\n`,
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");

  let signingKey = crypto.createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  for (const part of [REGION, SERVICE, "aws4_request"]) {
    signingKey = crypto.createHmac("sha256", signingKey).update(part).digest();
  }
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    url: `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    method,
    key,
    bucket,
    expiresAt: new Date(now.getTime() + expires * 1000).toISOString()
  };
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

module.exports = { presignR2Url, MAX_EXPIRES_SECONDS };
