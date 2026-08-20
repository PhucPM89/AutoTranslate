const crypto = require("crypto");
const { isAdmin, isSameOrigin } = require("../../server/admin-auth");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");
const { presignR2Url } = require("../../server/storage/r2-presign");

// Admin upload, in two calls and no bytes through this function.
//
//   POST { action: "presign", ... }  -> a short-lived PUT URL for private R2
//   POST { action: "ingest",  ... }  -> dispatch the ingest workflow
//
// Both actions live in one file on purpose: Vercel Hobby caps a deployment at 12
// serverless functions and the deployment already sits at 11.
//
// EPUBs go to the private archive bucket, never to the public reader bucket -
// uploading a source archive to novel-storage would publish it over the CDN.

const KINDS = {
  epub: {
    bucketEnv: "R2_ARCHIVE_BUCKET",
    prefix: "uploads/",
    extensions: [".epub"],
    maxBytes: 200 * 1024 * 1024,
    contentTypes: ["application/epub+zip", "application/octet-stream", ""]
  },
  cover: {
    bucketEnv: "R2_BUCKET",
    prefix: "covers/uploads/",
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    maxBytes: 5 * 1024 * 1024,
    contentTypes: ["image/jpeg", "image/png", "image/webp"]
  }
};

const UPLOAD_TTL_SECONDS = 30 * 60;

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  if (!isSameOrigin(req) || !isAdmin(req)) return res.status(401).json({ error: "Phiên quản trị đã hết hạn." });

  let body;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch {
    return res.status(400).json({ error: "Body không hợp lệ." });
  }

  try {
    if (body.action === "ingest") return await dispatchIngest(body, res);
    return presign(body, res);
  } catch (error) {
    // The message is written for an admin, but never echoes a credential.
    console.error("Admin upload error:", error.message);
    return res.status(error.status || 400).json({ error: error.message });
  }
};

function presign(body, res) {
  const rule = KINDS[body.kind];
  if (!rule) throw badRequest("Loại file không hợp lệ.");

  const bucket = process.env[rule.bucketEnv];
  if (!bucket || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw fail(503, "R2 chưa được cấu hình trên server.");
  }

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) throw badRequest("Thiếu kích thước file.");
  if (size > rule.maxBytes) {
    throw badRequest(`File vượt giới hạn ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`);
  }
  if (body.contentType != null && !rule.contentTypes.includes(String(body.contentType))) {
    throw badRequest("Content-Type không được phép.");
  }

  const extension = extensionOf(body.filename, rule.extensions);
  // The client proposes a filename; the server decides the key. A random segment
  // means one upload can never overwrite another, and no user input reaches the
  // path unescaped.
  const key = `${rule.prefix}${crypto.randomBytes(12).toString("hex")}${extension}`;

  const signed = presignR2Url({
    method: "PUT",
    bucket,
    key,
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    endpoint: process.env.R2_ENDPOINT,
    expiresIn: UPLOAD_TTL_SECONDS
  });

  return res.status(200).json({
    uploadUrl: signed.url,
    method: "PUT",
    key,
    expiresAt: signed.expiresAt,
    maxBytes: rule.maxBytes
  });
}

// Ingest is minutes of work for a large EPUB, far past any serverless timeout,
// so this only hands the job to GitHub Actions and returns.
async function dispatchIngest(body, res) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) throw fail(503, "Chưa cấu hình GITHUB_DISPATCH_TOKEN / GITHUB_REPOSITORY.");

  const archiveKey = String(body.archiveKey || "");
  if (!archiveKey.startsWith(KINDS.epub.prefix) || archiveKey.includes("..")) {
    throw badRequest("archiveKey không hợp lệ.");
  }

  const inputs = {
    archive_key: archiveKey,
    title: String(body.title || "").slice(0, 200),
    author: String(body.author || "").slice(0, 200),
    genre: String(body.genre || "").slice(0, 100),
    cover_key: String(body.coverKey || "").slice(0, 300),
    translate: body.translate === false ? "false" : "true"
  };

  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/ingest-book.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ref: process.env.GITHUB_DISPATCH_REF || "main", inputs })
    }
  );

  if (!response.ok) {
    // GitHub's error body can be verbose; log the status only so a token or
    // repository detail never lands in a log line.
    console.error("Workflow dispatch failed with status", response.status);
    throw fail(502, "Không gọi được workflow ingest.");
  }

  return res.status(202).json({ dispatched: true, archiveKey });
}

function extensionOf(filename, allowed) {
  const lower = String(filename || "").toLowerCase();
  const match = allowed.find((extension) => lower.endsWith(extension));
  if (!match) throw badRequest(`Chỉ nhận ${allowed.join(", ")}.`);
  return match;
}

function badRequest(message) {
  return fail(400, message);
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
