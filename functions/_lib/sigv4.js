// SigV4 query-string presigning on Web Crypto.
//
// server/storage/r2-presign.js does the same job with node:crypto. This exists
// separately because Pages Functions run on the Workers runtime, where
// node:crypto is only available behind the nodejs_compat flag - and relying on a
// compatibility flag for something this small is a worse trade than 40 lines of
// Web Crypto. The two must stay in agreement; server/storage/r2-presign.test.js
// pins the signature format both produce.

const REGION = "auto";
const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";
const MAX_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

async function hmac(key, message) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

async function sha256Hex(message) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function presignR2Url({
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
  // Each segment is encoded on its own: slashes in the key stay slashes.
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

  // UNSIGNED-PAYLOAD: the signature cannot depend on bytes this worker never sees.
  const canonicalRequest = [method, url.pathname, canonicalQuery, `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = [ALGORITHM, amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

  let signingKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  for (const part of [REGION, SERVICE, "aws4_request"]) {
    signingKey = await hmac(signingKey, part);
  }
  const signature = toHex(await hmac(signingKey, stringToSign));

  return {
    url: `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    method,
    key,
    bucket,
    expiresAt: new Date(now.getTime() + expires * 1000).toISOString()
  };
}
