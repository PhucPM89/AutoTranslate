"use strict";

const crypto = require("node:crypto");
const { cacheControlFor, contentTypeFor } = require("./keys");

// Minimal S3 (SigV4) client for Cloudflare R2. Deliberately hand-rolled instead
// of pulling in @aws-sdk/client-s3, which would add tens of megabytes to every
// serverless bundle for the four operations this project actually needs.
const SERVICE = "s3";
const REGION = "auto";

function createR2Storage(env = process.env) {
  const accountId = env.R2_ACCOUNT_ID;
  const bucket = env.R2_BUCKET;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const endpoint = env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  const publicBase = (env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");

  // Retried because R2 does return the occasional 5xx, and an ingest is thousands
  // of sequential writes: a single transient 502 was enough to abandon a
  // 4,000-chapter book and make the next run start it over. Every operation here
  // is idempotent - a PUT writes the same bytes to the same key - so replaying one
  // is safe. The signature is regenerated per attempt because it is timestamped.
  const MAX_ATTEMPTS = Math.max(1, Number(env.R2_MAX_ATTEMPTS || 4));

  async function send(method, key, { body, headers = {}, query = "" } = {}) {
    const url = `${endpoint}/${bucket}/${encodeKey(key)}${query}`;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const signed = signRequest({ method, url, body, headers, accessKeyId, secretAccessKey });
        const response = await fetch(url, {
          method,
          headers: signed,
          body,
          signal: AbortSignal.timeout(Number(env.R2_TIMEOUT_MS || 30000))
        });
        // 4xx is our own mistake and will not improve by asking again.
        if (response.status < 500 && response.status !== 429) return response;
        if (attempt === MAX_ATTEMPTS) return response;
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        // A timeout or a dropped connection is worth another attempt too.
        if (attempt === MAX_ATTEMPTS) throw error;
        lastError = error.message;
      }
      const backoffMs = 500 * 2 ** (attempt - 1);
      console.warn(`R2 ${method} ${key}: ${lastError}, thử lại sau ${backoffMs}ms (lần ${attempt}/${MAX_ATTEMPTS})`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    throw new Error(`R2 ${method} ${key} thất bại sau ${MAX_ATTEMPTS} lần.`);
  }

  return {
    driver: "r2",

    async put(key, body, options = {}) {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
      const response = await send("PUT", key, {
        body: buffer,
        headers: {
          "content-type": options.contentType || contentTypeFor(key),
          "cache-control": options.cacheControl || cacheControlFor(key)
        }
      });
      if (!response.ok) throw new Error(`R2 PUT ${key} lỗi HTTP ${response.status}: ${await safeText(response)}`);
      // Uploading must not depend on a public domain being configured yet: the
      // migration writes objects long before the CDN hostname exists.
      return { key, size: buffer.length, url: publicBase ? this.publicUrl(key) : "" };
    },

    async get(key) {
      const response = await send("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`R2 GET ${key} lỗi HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },

    async head(key) {
      const response = await send("HEAD", key);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`R2 HEAD ${key} lỗi HTTP ${response.status}`);
      return {
        key,
        size: Number(response.headers.get("content-length")) || 0,
        contentType: response.headers.get("content-type") || "",
        cacheControl: response.headers.get("cache-control") || ""
      };
    },

    async list(prefix = "") {
      const out = [];
      let token = "";
      do {
        const query = `?list-type=2&prefix=${encodeURIComponent(prefix)}${token ? `&continuation-token=${encodeURIComponent(token)}` : ""}`;
        const response = await send("GET", "", { query });
        if (!response.ok) throw new Error(`R2 LIST ${prefix} lỗi HTTP ${response.status}`);
        const xml = await response.text();
        // Parse each <Contents> block and pull fields independently: depending on
        // element order here made listing silently return nothing.
        for (const block of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = (block[1].match(/<Key>([\s\S]*?)<\/Key>/) || [])[1];
          if (!key) continue;
          out.push({ key: decodeXml(key), size: Number((block[1].match(/<Size>(\d+)<\/Size>/) || [])[1]) || 0 });
        }
        token = (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] || "";
      } while (token);
      return out;
    },

    async remove(key) {
      const response = await send("DELETE", key);
      if (!response.ok && response.status !== 404) throw new Error(`R2 DELETE ${key} lỗi HTTP ${response.status}`);
      return true;
    },

    publicUrl(key) {
      if (!publicBase) throw new Error("R2_PUBLIC_BASE_URL chưa được cấu hình.");
      return `${publicBase}/${key}`;
    }
  };
}

function encodeKey(key) {
  return String(key).split("/").map(encodeURIComponent).join("/");
}

function signRequest({ method, url, body, headers, accessKeyId, secretAccessKey }) {
  const target = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash("sha256").update(body || "").digest("hex");

  const allHeaders = {
    ...lowerKeys(headers),
    host: target.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  const signedHeaders = Object.keys(allHeaders).sort();
  const canonicalHeaders = signedHeaders.map((h) => `${h}:${String(allHeaders[h]).trim()}\n`).join("");
  const signedHeaderList = signedHeaders.join(";");

  // Query params must be sorted and encoded for the canonical request.
  const canonicalQuery = [...target.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)])
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    method,
    target.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderList,
    payloadHash
  ].join("\n");

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
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
    ...allHeaders,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderList}, Signature=${signature}`
  };
}

function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function lowerKeys(object) {
  return Object.fromEntries(Object.entries(object || {}).map(([k, v]) => [k.toLowerCase(), v]));
}

function decodeXml(value) {
  return String(value).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

async function safeText(response) {
  try { return (await response.text()).slice(0, 300); } catch { return ""; }
}

module.exports = { createR2Storage, signRequest };
