// The whole server side of Trạm Chữ: the admin API.
//
// Readers never reach this code. The catalogue and every chapter are plain objects
// on R2 served by the CDN, so a reader costs no invocation here; this exists for
// the admin panel, which needs a password check, presigned uploads, a workflow
// dispatch and server-side Supabase access.
//
// Deliberately platform-neutral. Two thin entry points wrap it - worker/index.js
// for a Workers deployment with an ASSETS binding, and functions/ for Pages, which
// serves static files itself - so the same router runs either way and there is one
// implementation to reason about.
//
// Handlers reuse the modules under server/
// rather than reimplementing them - nodejs_compat makes that possible, and it is
// what keeps one behaviour instead of two. Notably scrypt in workerd produces
// byte-identical output to Node, so the existing password hash stays valid.

import { verifyPassword, issueSessionToken, verifySessionToken } from "../server/admin-auth.js";
import { presignR2Url } from "../server/storage/r2-presign.js";
import { createCrawlerState } from "../server/crawler-state.js";
import { createSupabase } from "../server/supabase.js";
import { publishCatalogSnapshot } from "../server/ingest/catalog-snapshot.js";
import {
  CATEGORY_DEFINITIONS,
  WORD_COUNT_BUCKETS,
  CREATION_STATUSES
} from "../server/crawler-store.js";
import { createR2BindingStorage } from "./r2-storage.js";

const COOKIE_NAME = "tangthu_admin";
const SESSION_TTL_SECONDS = 30 * 60;
const UPLOAD_TTL_SECONDS = 30 * 60;

// EPUBs go to the private archive bucket. Putting a source archive in the reader
// bucket would publish it over the CDN.
const UPLOAD_KINDS = {
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

const ROUTES = {
  "/api/admin/session": handleSession,
  "/api/admin/login": handleLogin,
  "/api/admin/logout": handleLogout,
  "/api/admin/upload": handleUpload,
  "/api/admin/crawler": handleCrawler,
  "/api/admin/translate": handleTranslateStatus,
  "/api/admin/catalog": handleCatalog,
  "/api/admin/analytics": handleAnalytics
};

// Returns a Response for an API path, or null when the request is for something
// else and the caller should serve a static file.
export async function handleApiRequest({ request, env }) {
  const url = new URL(request.url);
  const route = ROUTES[url.pathname.replace(/\/$/, "")];
  if (!route) return null;

  try {
    return withSecurityHeaders(await route({ request, env, url }), env);
  } catch (error) {
    console.error(`${url.pathname} lỗi:`, error.message);
    return withSecurityHeaders(json({ error: error.publicMessage || error.message }, error.status || 500), env);
  }
}

// ---- admin session ---------------------------------------------------------

async function handleSession({ request, env }) {
  if (request.method === "DELETE") return handleLogout({ request, env });
  if (request.method !== "GET") return methodNotAllowed("GET, DELETE");
  return json({
    authenticated: await isAdmin(request, env),
    // What the admin panel actually needs to know: whether uploads can be signed.
    storageReady: Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ARCHIVE_BUCKET)
  });
}

async function handleLogin({ request, env }) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  requireSameOrigin(request);

  if (!env.LIBRARY_UPLOAD_PASSWORD_HASH || !env.LIBRARY_SESSION_SECRET) {
    throw fail(503, "Chức năng quản trị chưa được cấu hình.");
  }

  const body = await readJson(request);
  if (!verifyPassword(body?.password, env.LIBRARY_UPLOAD_PASSWORD_HASH)) {
    // A fixed delay on failure, so a wrong password is not measurably faster
    // than a right one. Per-IP attempt counting lived in a module-level Map,
    // which is pointless across Worker isolates - Cloudflare's own rate limiting
    // is the right tool if this ever needs more.
    await new Promise((resolve) => setTimeout(resolve, 350));
    throw fail(401, "Mật khẩu không đúng.");
  }

  return json({ authenticated: true, expiresIn: SESSION_TTL_SECONDS }, 200, {
    "set-cookie": sessionCookie(issueSessionToken(env.LIBRARY_SESSION_SECRET), SESSION_TTL_SECONDS)
  });
}

async function handleLogout({ request, env }) {
  requireSameOrigin(request);
  return json({ authenticated: false }, 200, { "set-cookie": sessionCookie("", 0) });
}

// ---- admin upload ----------------------------------------------------------

async function handleUpload({ request, env }) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  await requireAdmin(request, env);

  const body = await readJson(request);
  return body.action === "ingest" ? dispatchIngest(body, env) : presignUpload(body, env);
}

async function presignUpload(body, env) {
  const rule = UPLOAD_KINDS[body.kind];
  if (!rule) throw fail(400, "Loại file không hợp lệ.");

  const bucketName = env[rule.bucketVar];
  if (!bucketName || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw fail(503, "R2 chưa được cấu hình trên Worker.");
  }

  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) throw fail(400, "Thiếu kích thước file.");
  if (size > rule.maxBytes) throw fail(400, `File vượt giới hạn ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`);
  if (body.contentType != null && !rule.contentTypes.includes(String(body.contentType))) {
    throw fail(400, "Content-Type không được phép.");
  }

  const extension = extensionOf(body.filename, rule.extensions);
  // The client proposes a filename; the server decides the key. A random segment
  // means one upload can never overwrite another, and no user input reaches the
  // path unescaped.
  const random = crypto.getRandomValues(new Uint8Array(12));
  const key = `${rule.prefix}${[...random].map((b) => b.toString(16).padStart(2, "0")).join("")}${extension}`;

  // Presigned rather than proxied: Cloudflare caps a request body at 100 MB and
  // an EPUB may be 200 MB, so the bytes must go straight to R2.
  const signed = presignR2Url({
    method: "PUT",
    bucket: bucketName,
    key,
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    endpoint: env.R2_ENDPOINT,
    expiresIn: UPLOAD_TTL_SECONDS
  });

  return json({ uploadUrl: signed.url, method: "PUT", key, expiresAt: signed.expiresAt, maxBytes: rule.maxBytes });
}

// Ingest is minutes of work for a large EPUB, so it runs in GitHub Actions and
// this only starts it.
async function dispatchIngest(body, env) {
  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) {
    throw fail(503, "Chưa cấu hình GITHUB_DISPATCH_TOKEN / GITHUB_REPOSITORY.");
  }

  const archiveKey = String(body.archiveKey || "");
  if (!archiveKey.startsWith(UPLOAD_KINDS.epub.prefix) || archiveKey.includes("..")) {
    throw fail(400, "archiveKey không hợp lệ.");
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

// ---- crawler configuration -------------------------------------------------

async function handleCrawler({ request, env }) {
  await requireAdmin(request, env);
  const state = crawlerState(env);

  if (request.method === "POST") {
    const body = await readJson(request);
    // excludedSourceIds is managed by deletions, not by the form, so the form
    // cannot clear it by omission.
    const { excludedSourceIds, ...patch } = body || {};
    await state.writeConfig(patch);
  } else if (request.method !== "GET") {
    return methodNotAllowed("GET, POST");
  }

  const [config, status] = await Promise.all([state.readConfig(), state.readStatus()]);
  return json({
    config,
    status,
    categories: CATEGORY_DEFINITIONS,
    // Option vocabularies come from the server so the admin form and the worker
    // can never disagree about which Fanqie filter values are valid.
    wordCountBuckets: WORD_COUNT_BUCKETS,
    creationStatuses: CREATION_STATUSES,
    workerReady: true
  });
}

// ---- catalogue -------------------------------------------------------------

async function handleCatalog({ request, env }) {
  await requireAdmin(request, env);
  const db = requireSupabase(env);

  if (request.method === "DELETE") {
    const body = await readJson(request);
    const id = String(body?.id || "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)) throw fail(400, "ID truyện không hợp lệ.");

    const rows = await db.request("books", { query: `?select=id,title,source,source_id&id=eq.${encodeURIComponent(id)}` });
    const book = rows?.[0];
    if (!book) throw fail(404, "Không tìm thấy truyện cần xóa.");

    // Unpublished rather than deleted: chapter objects on R2 stay where they are,
    // so this is reversible and no reader gets a broken link mid-read.
    await db.upsertBook({ id, title: book.title, published: false });

    // Stop the crawler picking it straight back up.
    if (book.source === "fanqie" && /^\d{10,30}$/.test(String(book.source_id || ""))) {
      const state = crawlerState(env);
      const config = await state.readConfig();
      await state.writeConfig({
        excludedSourceIds: [...new Set([...(config.excludedSourceIds || []), String(book.source_id)])]
      });
    }

    return json({ deleted: { id, title: book.title }, catalog: await republish(env) });
  }

  if (request.method !== "POST") return methodNotAllowed("POST, DELETE");

  const body = await readJson(request);
  const id = String(body?.id || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)) throw fail(400, "ID truyện không hợp lệ.");

  const existing = (await db.request("books", { query: `?select=*&id=eq.${encodeURIComponent(id)}` }))?.[0];
  if (!existing) throw fail(404, "Không tìm thấy truyện. Truyện mới được thêm qua ingest.");

  // Only the editable fields; provenance and counts belong to ingest.
  await db.upsertBook({
    id,
    title: text(body.title, 300) || existing.title,
    author: text(body.author, 200),
    description: text(body.description, 5000),
    cover: text(body.cover, 500) || existing.cover_url,
    status: text(body.status, 100) || existing.status,
    featured: Boolean(body.featured),
    published: body.published !== false,
    revision: existing.revision,
    totalChapters: existing.total_chapters,
    translatedChapters: existing.translated_chapters,
    source: existing.source,
    sourceId: existing.source_id,
    sourceUrl: existing.source_url,
    lastCrawledAt: existing.last_crawled_at
  });

  const catalog = await republish(env);
  const book = catalog.books.find((item) => item.id === id) || { id };
  return json({ book, catalog });
}

// The catalogue the reader loads is a static object on R2, so any admin change
// has to republish it or the change is invisible.
async function republish(env) {
  const storage = readerStorage(env);
  return publishCatalogSnapshot({
    storage,
    env,
    site: { name: "Trạm Chữ", tagline: "Một góc đọc truyện Trung được tuyển chọn và dịch." }
  });
}

// ---- analytics -------------------------------------------------------------

// ---- translation status ----------------------------------------------------

async function handleTranslateStatus({ request, env }) {
  await requireAdmin(request, env);
  if (request.method !== "GET") return methodNotAllowed("GET");

  let status = null;
  try {
    if (env.NOVEL_ARCHIVE) {
      const storage = createR2BindingStorage(env.NOVEL_ARCHIVE);
      const raw = await storage.get("jobs/translate-status.json").catch(() => null);
      if (raw) status = JSON.parse(raw.toString("utf8"));
    }
  } catch {}

  if (!status) {
    status = {
      state: "idle",
      message: "Chưa có tiến trình dịch nào đang chạy.",
      updatedAt: null,
      translatedThisRun: 0,
      spentRequests: 0,
      queue: []
    };
  }

  // Heartbeat timeout check: 6 minutes
  if (status.state === "running" && status.updatedAt) {
    const ageMs = Date.now() - new Date(status.updatedAt).getTime();
    if (ageMs > 6 * 60 * 1000) {
      status.state = "idle";
      status.message = "Tiến trình dịch đã hoàn tất hoặc tạm dừng (không có nhịp tim mới).";
    }
  }

  return json({ status });
}

// ---- analytics -------------------------------------------------------------

// Reads the aggregated view, never raw events. RLS blocks the anon key from
// reading analytics_events at all, so this needs the service role - which is why
// it lives here and not in the browser.
async function handleAnalytics({ request, env }) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  await requireAdmin(request, env);

  const db = createSupabase(env);
  if (!db) {
    return json({ summary: { storageReady: false }, days: [], books: [] });
  }

  const [rows, topBooks, bookmarks] = await Promise.all([
    db.readAnalyticsDaily().catch((error) => {
      console.error("Analytics read failed:", error.message);
      return [];
    }),
    db.readTopBooks?.().catch(() => []) || [],
    db.readUserBookmarkCount?.().catch(() => 0) || 0
  ]);

  return json(summarizeDaily(rows, topBooks, bookmarks));
}

function summarizeDaily(rows, topBooks = [], bookmarks = 0) {
  const days = (rows || []).map((row) => ({
    day: String(row.day || "").slice(0, 10),
    visits: Number(row.visits || 0),
    reads: Number(row.reads || 0),
    sessions: Number(row.sessions || row.visits || 0)
  }));
  const total = (field) => days.reduce((sum, day) => sum + (day[field] || 0), 0);
  const recent = (count, field) => days.slice(0, count).reduce((sum, day) => sum + (day[field] || 0), 0);
  const today = days[0] || { visits: 0, reads: 0, sessions: 0 };

  return {
    summary: {
      storageReady: true,
      today: { visits: today.visits, reads: today.reads, sessions: today.sessions },
      last7: { visits: recent(7, "visits"), reads: recent(7, "reads"), sessions: recent(7, "sessions") },
      last30: { visits: recent(30, "visits"), reads: recent(30, "reads"), sessions: recent(30, "sessions") },
      allTime: { visits: total("visits"), reads: total("reads"), sessions: total("sessions") },
      bookmarks,
      firstDay: days.length ? days[days.length - 1].day : ""
    },
    days,
    books: topBooks
  };
}

// ---- shared ----------------------------------------------------------------

function readerStorage(env) {
  if (!env.NOVEL_STORAGE) throw fail(503, "Thiếu R2 binding NOVEL_STORAGE.");
  return createR2BindingStorage(env.NOVEL_STORAGE, { publicBase: env.R2_PUBLIC_BASE_URL });
}

function crawlerState(env) {
  if (!env.NOVEL_ARCHIVE) throw fail(503, "Thiếu R2 binding NOVEL_ARCHIVE.");
  return createCrawlerState({
    // Crawler state is operational, so it lives in the private bucket.
    storage: createR2BindingStorage(env.NOVEL_ARCHIVE),
    readerStorage: env.NOVEL_STORAGE ? createR2BindingStorage(env.NOVEL_STORAGE) : null,
    db: createSupabase(env) || false
  });
}

function requireSupabase(env) {
  const db = createSupabase(env);
  if (!db) throw fail(503, "Chưa cấu hình Supabase trên Worker.");
  return db;
}

async function isAdmin(request, env) {
  return verifySessionToken(readCookie(request, COOKIE_NAME), env.LIBRARY_SESSION_SECRET);
}

async function requireAdmin(request, env) {
  requireSameOrigin(request);
  if (!(await isAdmin(request, env))) throw fail(401, "Phiên quản trị đã hết hạn.");
}

// A cross-site POST would otherwise ride along on the session cookie. A missing
// Origin is allowed because same-origin navigations may omit it.
function requireSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    if (new URL(origin).host !== new URL(request.url).host) throw fail(403, "Yêu cầu không hợp lệ.");
  } catch (error) {
    throw error.status ? error : fail(403, "Yêu cầu không hợp lệ.");
  }
}

function readCookie(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return "";
}

function sessionCookie(value, maxAge) {
  return [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`
  ].join("; ");
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw fail(400, "Body không hợp lệ.");
  }
}

function extensionOf(filename, allowed) {
  const lower = String(filename || "").toLowerCase();
  const match = allowed.find((extension) => lower.endsWith(extension));
  if (!match) throw fail(400, `Chỉ nhận ${allowed.join(", ")}.`);
  return match;
}

function text(value, max) {
  return String(value == null ? "" : value).slice(0, max).trim();
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
  });
}

function methodNotAllowed(allow) {
  return json({ error: "Method not allowed." }, 405, { allow });
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

// Workers Assets does serve and honour public/_headers, so static responses
// already carry these. This covers the JSON responses above, which are generated
// here and never touch that file, and acts as a backstop if _headers is missing.
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

export function withSecurityHeaders(response, env) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (!headers.has("Content-Security-Policy")) {
    headers.set("Content-Security-Policy", contentSecurityPolicy(env));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function contentSecurityPolicy(env) {
  let cdn = "";
  try {
    cdn = env.R2_PUBLIC_BASE_URL ? new URL(env.R2_PUBLIC_BASE_URL).origin : "";
  } catch {
    cdn = "";
  }
  return [
    "default-src 'self'",
    `img-src 'self' data:${cdn ? ` ${cdn}` : ""}`,
    "script-src 'self'",
    "style-src 'self'",
    // The CDN for chapters, Supabase for analytics, and the R2 S3 endpoint for
    // the admin page's presigned upload.
    `connect-src 'self'${cdn ? ` ${cdn}` : ""} https://*.supabase.co https://*.r2.cloudflarestorage.com`,
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' mailto:"
  ].join("; ");
}
