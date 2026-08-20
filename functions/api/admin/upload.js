// Admin upload, as a Cloudflare Pages Function.
//
//   POST { action: "presign", kind, filename, size }  -> short-lived PUT URL
//   POST { action: "ingest",  archiveKey, ... }       -> dispatch the ingest run
//
// The EPUB never passes through this function. Cloudflare caps a request body at
// 100 MB and an EPUB may be 200 MB, so the browser is handed a presigned URL and
// uploads straight to R2. This function only signs and dispatches.
//
// It mirrors api/admin/upload.js on Vercel, which stays in place as a fallback.
// Both must keep the same request and response shape - client/admin-upload.js
// talks to whichever one is serving.

import { presignR2Url } from "../../_lib/sigv4.js";
import { isAdmin, isSameOrigin } from "../../_lib/admin-session.js";

// EPUBs go to the private archive bucket. Uploading a source archive into the
// reader bucket would publish it over the CDN.
const KINDS = {
  epub: {
    bucketVar: "R2_ARCHIVE_BUCKET",
    prefix: "uploads/",
    extensions: [".epub"],
    maxBytes: 200 * 1024 * 1024,
    contentTypes: ["application/epub+zip", "application/octet-stream", ""]
  },
  cover: {
    bucketVar: "R2_BUCKET",
    prefix: "covers/uploads/",
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    maxBytes: 5 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"]
  }
};

const UPLOAD_TTL_SECONDS = 30 * 60;

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request) || !(await isAdmin(request, env))) {
    return json({ error: "Phiên quản trị đã hết hạn." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body không hợp lệ." }, 400);
  }

  try {
    return body.action === "ingest" ? await dispatchIngest(body, env) : await presign(body, env);
  } catch (error) {
    // Written for an admin to read, and never containing a credential.
    console.error("Admin upload error:", error.message);
    return json({ error: error.message }, error.status || 400);
  }
}

export function onRequest() {
  return json({ error: "Method not allowed." }, 405);
}

async function presign(body, env) {
  const rule = KINDS[body.kind];
  if (!rule) throw badRequest("Loại file không hợp lệ.");

  const bucket = env[rule.bucketVar];
  if (!bucket || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw fail(503, "R2 chưa được cấu hình cho Pages function.");
  }

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) throw badRequest("Thiếu kích thước file.");
  if (size > rule.maxBytes) throw badRequest(`File vượt giới hạn ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`);
  if (body.contentType != null && !rule.contentTypes.includes(String(body.contentType))) {
    throw badRequest("Content-Type không được phép.");
  }

  const extension = extensionOf(body.filename, rule.extensions);
  // The client proposes a filename; the server decides the key. A random segment
  // means one upload can never overwrite another, and no user input reaches the
  // path unescaped.
  const random = crypto.getRandomValues(new Uint8Array(12));
  const suffix = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = `${rule.prefix}${suffix}${extension}`;

  const signed = await presignR2Url({
    method: "PUT",
    bucket,
    key,
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    endpoint: env.R2_ENDPOINT,
    expiresIn: UPLOAD_TTL_SECONDS
  });

  return json({ uploadUrl: signed.url, method: "PUT", key, expiresAt: signed.expiresAt, maxBytes: rule.maxBytes });
}

// Ingesting a large EPUB is minutes of work, far past any function timeout, so
// this only hands the job to GitHub Actions.
async function dispatchIngest(body, env) {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) {
    throw fail(503, "Chưa cấu hình GITHUB_DISPATCH_TOKEN / GITHUB_REPOSITORY.");
  }

  const archiveKey = String(body.archiveKey || "");
  if (!archiveKey.startsWith(KINDS.epub.prefix) || archiveKey.includes("..")) {
    throw badRequest("archiveKey không hợp lệ.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/ingest-book.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        // GitHub rejects API requests without a User-Agent.
        "User-Agent": "tram-chu-admin"
      },
      body: JSON.stringify({
        ref: env.GITHUB_DISPATCH_REF || "main",
        inputs: {
          archive_key: archiveKey,
          title: String(body.title || "").slice(0, 200),
          author: String(body.author || "").slice(0, 200),
          genre: String(body.genre || "").slice(0, 100),
          cover_key: String(body.coverKey || "").slice(0, 300),
          translate: body.translate === false ? "false" : "true"
        }
      })
    }
  );

  if (!response.ok) {
    // Status only: GitHub's error body is verbose and can echo request details.
    console.error("Workflow dispatch failed with status", response.status);
    throw fail(502, "Không gọi được workflow ingest.");
  }

  return json({ dispatched: true, archiveKey }, 202);
}

function extensionOf(filename, allowed) {
  const lower = String(filename || "").toLowerCase();
  const match = allowed.find((extension) => lower.endsWith(extension));
  if (!match) throw badRequest(`Chỉ nhận ${allowed.join(", ")}.`);
  return match;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function badRequest(message) {
  return fail(400, message);
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
