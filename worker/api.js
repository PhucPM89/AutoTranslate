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
  readTranslationConfig,
  writeTranslationConfig
} from "../server/translation-config.js";
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
  "/api/catalog": handlePublicCatalog,
  "/api/admin/keys": handleAdminKeys,
  "/api/admin/session": handleSession,
  "/api/admin/login": handleLogin,
  "/api/admin/logout": handleLogout,
  "/api/admin/upload": handleUpload,
  "/api/admin/crawler": handleCrawler,
  "/api/admin/translate": handleTranslateStatus,
  "/api/admin/catalog": handleCatalog,
  "/api/admin/analytics": handleAnalytics,
  "/api/admin/users": handleAdminUsers
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
    const status = error.status || 500;
    if (status >= 500) console.error(`${url.pathname} lỗi:`, error.message);
    const message = error.publicMessage || (status < 500 ? error.message : "Hệ thống đang gặp lỗi. Vui lòng thử lại sau.");
    return withSecurityHeaders(json({ error: message }, status), env);
  }
}

// ---- public catalog --------------------------------------------------------
async function handlePublicCatalog({ request, env }) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed("GET, HEAD");
  const bucket = env.NOVEL_STORAGE || env.R2_READER;
  if (bucket) {
    const reader = createR2BindingStorage(bucket);
    const raw = await reader.get("catalog/latest.json").catch(() => null);
    if (raw) {
      return new Response(raw, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  }

  try {
    const cdnBase = String(env.R2_PUBLIC_BASE_URL || "https://cdn.tram-chu.online").replace(/\/$/, "");
    const cdnRes = await fetch(`${cdnBase}/catalog/latest.json`, { signal: AbortSignal.timeout(10000) });
    if (cdnRes.ok) {
      const data = await cdnRes.text();
      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  } catch {}

  throw fail(404, "Chưa có dữ liệu catalog.");
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
      }),
      signal: AbortSignal.timeout(15000)
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

    // Stop the crawler picking it straight back up.
    if (book.source === "fanqie" && /^\d{10,30}$/.test(String(book.source_id || ""))) {
      const state = crawlerState(env);
      const config = await state.readConfig();
      await state.writeConfig({
        excludedSourceIds: [...new Set([...(config.excludedSourceIds || []), String(book.source_id)])]
      });
    }

    const cleanupErrors = [];
    const storage = readerStorage(env);
    try {
      const [bookObjects, jobObjects] = await Promise.all([
        storage.list(`books/${id}/`),
        storage.list(`jobs/${id}/`)
      ]);
      const keys = [
        ...bookObjects.map((object) => object.key),
        ...jobObjects.map((object) => object.key),
        `covers/${id}.jpg`,
        `covers/${id}.jpeg`,
        `covers/${id}.png`,
        `covers/${id}.webp`
      ];
      await storage.removeMany(keys);

      const translationConfig = await readTranslationConfig(storage);
      if (translationConfig.focusBookId === id) {
        await writeTranslationConfig(storage, { focusBookId: "" });
      }
    } catch (error) {
      cleanupErrors.push(`R2 reader: ${error.message}`);
    }

    if (env.NOVEL_ARCHIVE) {
      try {
        const archive = createR2BindingStorage(env.NOVEL_ARCHIVE);
        const objects = await archive.list(`archives/${id}`);
        await archive.removeMany(objects.map((object) => object.key));
      } catch (error) {
        cleanupErrors.push(`R2 archive: ${error.message}`);
      }
    }

    try {
      await db.request("chapters", { method: "DELETE", query: `?book_id=eq.${encodeURIComponent(id)}` });
      await db.request("book_categories", { method: "DELETE", query: `?book_id=eq.${encodeURIComponent(id)}` });
      await db.request("books", { method: "DELETE", query: `?id=eq.${encodeURIComponent(id)}` });
    } catch (error) {
      cleanupErrors.push(`Supabase: ${error.message}`);
      // Keep it invisible even if a related table prevented permanent deletion.
      await db.upsertBook({ id, title: book.title, published: false }).catch(() => {});
    }

    return json({
      deleted: { id, title: book.title },
      cleanupFailed: cleanupErrors.length > 0,
      cleanupErrors,
      catalog: await republish(env)
    });
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
  if (request.method !== "GET" && request.method !== "POST") return methodNotAllowed("GET, POST");

  if (request.method === "POST") {
    requireSameOrigin(request);
    const body = await readJson(request).catch(() => ({}));
    if (body?.action === "focus") {
      if (!env.NOVEL_STORAGE) throw fail(503, "Chưa cấu hình NOVEL_STORAGE để lưu bộ truyện ưu tiên.");
      const storage = createR2BindingStorage(env.NOVEL_STORAGE);
      const focusBookId = String(body?.focusBookId || "").trim();
      if (focusBookId) {
        const catalogRaw = await storage.get("catalog/latest.json").catch(() => null);
        const catalog = catalogRaw ? JSON.parse(catalogRaw.toString("utf8")) : { books: [] };
        if (!(catalog.books || []).some((book) => book.id === focusBookId)) {
          throw fail(400, "Bộ truyện được chọn không còn trong thư viện.");
        }
      }
      const config = await writeTranslationConfig(storage, { focusBookId });
      return json({
        success: true,
        config,
        message: focusBookId
          ? "Đã lưu bộ truyện ưu tiên. Worker sẽ chỉ dịch bộ này cho đến khi hoàn tất."
          : "Đã chuyển về chế độ tự động chọn bộ truyện."
      });
    }

    if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) {
      throw fail(503, "Chưa cấu hình GITHUB_DISPATCH_TOKEN / GITHUB_REPOSITORY.");
    }
    const book = String(body?.book || "").trim();
    const budget = String(body?.budget || "5000").trim();

    const response = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/translate-worker.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "tram-chu-admin"
        },
        body: JSON.stringify({
          ref: env.GITHUB_DISPATCH_REF || "main",
          inputs: {
            book,
            budget
          }
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Workflow dispatch translate-worker failed:", response.status, errText);
      throw fail(502, `Không gọi được GitHub Actions translate worker (HTTP ${response.status}).`);
    }

    return json({ success: true, message: "Đã kích hoạt worker dịch trên GitHub Actions thành công!" }, 202);
  }

  let status = null;
  let config = { schema: 1, focusBookId: "", updatedAt: "" };
  let publishedBookIds = null;
  try {
    if (env.NOVEL_STORAGE) {
      const storage = createR2BindingStorage(env.NOVEL_STORAGE);
      config = await readTranslationConfig(storage);
      const catalogRaw = await storage.get("catalog/latest.json").catch(() => null);
      if (catalogRaw) {
        const catalog = JSON.parse(catalogRaw.toString("utf8"));
        if (Array.isArray(catalog.books)) {
          publishedBookIds = new Set(catalog.books.map((book) => book.id));
        }
      }
      const raw = await storage.get("jobs/translate-status.json").catch(() => null);
      if (raw) status = JSON.parse(raw.toString("utf8"));

      // Status is a heartbeat snapshot and can outlive a deleted book. Never
      // expose those stale entries to the dashboard, and release a stale focus
      // so the next worker run can select a real published title.
      if (publishedBookIds) {
        if (Array.isArray(status?.queue)) {
          status.queue = status.queue.filter((job) => publishedBookIds.has(job.bookId));
        }
        if (config.focusBookId && !publishedBookIds.has(config.focusBookId)) {
          config = await writeTranslationConfig(storage, { focusBookId: "" });
        }
        if (status?.currentBookId && !publishedBookIds.has(status.currentBookId)) {
          status = {
            ...status,
            state: "idle",
            currentBookId: "",
            currentBookTitle: "",
            currentChapter: 0,
            currentCompleted: 0,
            currentTotalChapters: 0,
            message: "Truyện của trạng thái cũ đã bị xóa; đang chờ worker chọn bộ tiếp theo."
          };
        }
      }
    }
    if (!status && env.NOVEL_ARCHIVE) {
      const archive = createR2BindingStorage(env.NOVEL_ARCHIVE);
      const raw = await archive.get("jobs/translate-status.json").catch(() => null);
      if (raw) status = JSON.parse(raw.toString("utf8"));
    }
  } catch {}

  if (!status) {
    status = {
      state: "idle",
      message: "Chưa có dữ liệu từ worker dịch (đang chờ phiên chạy tiếp theo hoặc worker vừa khởi động).",
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
      status.message = "Tiến trình dịch đã hoàn tất lượt chạy (chờ lượt xoay vòng tiếp theo).";
    }
  }

  status.focusBookId = config.focusBookId;
  status.selectionMode = config.focusBookId ? "focused" : "automatic";
  return json({ status, config });
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

// ---- admin users -----------------------------------------------------------

async function handleAdminUsers({ request, env }) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  await requireAdmin(request, env);

  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return json({
      totalUsers: 0,
      active7Days: 0,
      totalChaptersRead: 0,
      totalExp: 0,
      users: []
    });
  }

  // 1. Fetch Auth Users, Leaderboard profiles & Bookmarks concurrently
  const [authUsersRes, profilesRes, bookmarksRes] = await Promise.all([
    fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000)
    }).catch(() => null),
    fetch(`${url}/rest/v1/reader_leaderboard?select=id,display_name,school,exp,chapters_read,level_title,badge_class,avatar_url,updated_at&limit=1000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000)
    }).catch(() => null),
    fetch(`${url}/rest/v1/user_bookmark_counts?select=user_id,bookmark_count&limit=1000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000)
    }).catch(() => null)
  ]);

  let authUsers = [];
  if (authUsersRes && authUsersRes.ok) {
    const data = await authUsersRes.json().catch(() => ({}));
    authUsers = Array.isArray(data.users) ? data.users : (Array.isArray(data) ? data : []);
  }

  let profiles = [];
  if (profilesRes && profilesRes.ok) {
    profiles = await profilesRes.json().catch(() => []);
    if (!Array.isArray(profiles)) profiles = [];
  }

  let bookmarks = [];
  if (bookmarksRes && bookmarksRes.ok) {
    bookmarks = await bookmarksRes.json().catch(() => []);
    if (!Array.isArray(bookmarks)) bookmarks = [];
  } else {
    // Rolling-deploy compatibility: code may reach Pages a few minutes before
    // migration 0005 creates the aggregate view.
    const legacy = await fetch(`${url}/rest/v1/user_bookmarks?select=user_id&limit=1000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000)
    }).catch(() => null);
    if (legacy?.ok) {
      const rows = await legacy.json().catch(() => []);
      const counts = new Map();
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row.user_id) counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
      }
      bookmarks = [...counts].map(([user_id, bookmark_count]) => ({ user_id, bookmark_count }));
    }
  }

  // Map bookmarks by user_id
  const bookmarkCounts = {};
  for (const bm of bookmarks) {
    if (bm.user_id) {
      bookmarkCounts[bm.user_id] = Number(bm.bookmark_count) || 0;
    }
  }

  // Map profiles by id
  const profileMap = new Map();
  for (const p of profiles) {
    if (p.id) profileMap.set(p.id, p);
  }

  // Set of processed user IDs
  const processedIds = new Set();
  const mergedUsers = [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let active7DaysCount = 0;
  let totalChaptersRead = 0;
  let totalExp = 0;

  for (const u of authUsers) {
    processedIds.add(u.id);
    const p = profileMap.get(u.id) || {};
    const meta = u.user_metadata || {};
    const email = u.email || meta.email || "";
    const fullName = meta.full_name || meta.name || "";
    const avatarUrl = p.avatar_url || meta.avatar_url || meta.picture || "";
    const displayName = p.display_name || fullName || (email ? email.split("@")[0] : "Đạo hữu");
    const exp = Number(p.exp) || 0;
    const chaptersRead = Number(p.chapters_read) || 0;
    const lastActive = u.last_sign_in_at || p.updated_at || u.created_at;
    const isRecentlyActive = lastActive && new Date(lastActive).getTime() > sevenDaysAgo;
    if (isRecentlyActive) active7DaysCount++;

    totalChaptersRead += chaptersRead;
    totalExp += exp;

    mergedUsers.push({
      id: u.id,
      email,
      fullName,
      displayName,
      avatarUrl,
      school: p.school || "cultivation",
      levelTitle: p.level_title || "Phàm Nhân",
      badgeClass: p.badge_class || "rank-1",
      exp,
      chaptersRead,
      bookmarkCount: bookmarkCounts[u.id] || 0,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      lastActiveAt: lastActive,
      isGuest: false
    });
  }

  // Also include anonymous leaderboard users who haven't logged in with Google yet
  for (const p of profiles) {
    if (!processedIds.has(p.id)) {
      const exp = Number(p.exp) || 0;
      const chaptersRead = Number(p.chapters_read) || 0;
      const lastActive = p.updated_at;
      const isRecentlyActive = lastActive && new Date(lastActive).getTime() > sevenDaysAgo;
      if (isRecentlyActive) active7DaysCount++;

      totalChaptersRead += chaptersRead;
      totalExp += exp;

      mergedUsers.push({
        id: p.id,
        email: "(Chưa liên kết Google)",
        fullName: "",
        displayName: p.display_name || "Ẩn danh đạo hữu",
        avatarUrl: p.avatar_url || "",
        school: p.school || "cultivation",
        levelTitle: p.level_title || "Phàm Nhân",
        badgeClass: p.badge_class || "rank-1",
        exp,
        chaptersRead,
        bookmarkCount: bookmarkCounts[p.id] || 0,
        createdAt: p.updated_at,
        lastSignInAt: null,
        lastActiveAt: lastActive,
        isGuest: true
      });
    }
  }

  // Sort by most active / highest EXP first
  mergedUsers.sort((a, b) => {
    if (b.exp !== a.exp) return b.exp - a.exp;
    return new Date(b.lastActiveAt || 0).getTime() - new Date(a.lastActiveAt || 0).getTime();
  });

  return json({
    totalUsers: mergedUsers.length,
    active7Days: active7DaysCount,
    totalChaptersRead,
    totalExp,
    users: mergedUsers
  });
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
    if (new URL(origin).origin !== new URL(request.url).origin) throw fail(403, "Yêu cầu không hợp lệ.");
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

// ---- dynamic key storage helpers -------------------------------------------

const KEYS_STORAGE_KEY = "config/api-keys.json";

function storageForKeys(env) {
  if (env.NOVEL_STORAGE) return createR2BindingStorage(env.NOVEL_STORAGE);
  if (env.NOVEL_ARCHIVE) return createR2BindingStorage(env.NOVEL_ARCHIVE);
  return null;
}

async function getActiveKeyList(env) {
  const storage = storageForKeys(env);
  if (storage) {
    try {
      const raw = await storage.get(KEYS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw.toString("utf8"));
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((k) => typeof k === "string" && k.trim().length > 0);
        }
      }
    } catch {}
  }
  const fromEnv = env.GROQ_API_KEYS || env.GROQ_API_KEY || env.OPENROUTER_API_KEYS || env.OPENROUTER_API_KEY || "";
  const { parseApiKeys } = await import("../server/gemini.js");
  return parseApiKeys(fromEnv);
}

async function saveActiveKeyList(env, list) {
  const storage = storageForKeys(env);
  if (!storage) throw fail(503, "R2 Storage chưa được cấu hình để lưu API Key.");
  await storage.put(KEYS_STORAGE_KEY, JSON.stringify(list, null, 2), {
    contentType: "application/json",
    cacheControl: "no-cache"
  });
}

// ---- admin keys health dashboard ------------------------------------------

async function handleAdminKeys({ request, env }) {
  if (request.method !== "GET" && request.method !== "POST") return methodNotAllowed("GET, POST");
  requireSameOrigin(request);

  await requireAdmin(request, env);

  const keyList = await getActiveKeyList(env);
  const model = env.GROQ_MODEL || env.OPENROUTER_MODEL || "qwen/qwen3.6-27b";
  const fallbackModels = env.GROQ_FALLBACK_MODELS || env.OPENROUTER_FALLBACK_MODELS || "openai/gpt-oss-120b";

  if (request.method === "POST") {
    const body = await readJson(request);
    const action = String(body?.action || "ping").toLowerCase();

    if (action === "add") {
      const newKey = String(body?.key || "").trim();
      if (!newKey || (!newKey.startsWith("gsk_") && !newKey.startsWith("sk-or-v1-"))) {
        throw fail(400, "API Key không hợp lệ. Key phải bắt đầu bằng 'gsk_' (Groq) hoặc 'sk-or-v1-' (OpenRouter).");
      }
      if (keyList.includes(newKey)) {
        throw fail(400, "API Key này đã tồn tại trong danh sách.");
      }
      const updatedList = [...keyList, newKey];
      await saveActiveKeyList(env, updatedList);
      return json({
        success: true,
        message: "Đã thêm API Key mới thành công.",
        totalKeys: updatedList.length,
        keys: updatedList.map((k, i) => ({
          id: i + 1,
          masked: k.slice(0, 8) + "..." + k.slice(-6),
          provider: k.startsWith("gsk_") ? "Groq LPU" : "OpenRouter",
          status: "ready"
        })),
        activeModel: model,
        fallbackModels
      });
    }

    if (action === "delete") {
      const targetMasked = String(body?.masked || "").trim();
      const targetIndex = Number(body?.index);

      let targetKey = "";
      if (!Number.isNaN(targetIndex) && targetIndex >= 0 && targetIndex < keyList.length) {
        targetKey = keyList[targetIndex];
      } else if (targetMasked) {
        targetKey = keyList.find((k) => (k.slice(0, 8) + "..." + k.slice(-6)) === targetMasked);
      }

      if (!targetKey) {
        throw fail(404, "Không tìm thấy API Key cần xóa.");
      }

      if (keyList.length <= 1) {
        throw fail(400, "Hệ thống phải duy trì ít nhất 1 API Key đang hoạt động.");
      }

      const updatedList = keyList.filter((k) => k !== targetKey);
      await saveActiveKeyList(env, updatedList);
      return json({
        success: true,
        message: "Đã xóa API Key thành công.",
        totalKeys: updatedList.length,
        keys: updatedList.map((k, i) => ({
          id: i + 1,
          masked: k.slice(0, 8) + "..." + k.slice(-6),
          provider: k.startsWith("gsk_") ? "Groq LPU" : "OpenRouter",
          status: "ready"
        })),
        activeModel: model,
        fallbackModels
      });
    }

    // Default action: "ping" - Probe all keys live
    const results = [];
    for (let i = 0; i < keyList.length; i++) {
      const key = keyList[i];
      const isGroq = key.startsWith("gsk_");
      const isOpenRouter = key.startsWith("sk-or-v1-");
      const masked = key.slice(0, 8) + "..." + key.slice(-6);
      const startTime = Date.now();

      try {
        if (isGroq) {
          const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`
            },
            body: JSON.stringify({
              model: env.GROQ_MODEL || "qwen/qwen3.6-27b",
              messages: [{ role: "user", content: "hi" }],
              max_tokens: 1
            })
          });
          const data = await resp.json().catch(() => null);
          const ok = resp.ok;
          const status = ok ? "ready" : (resp.status === 429 ? "cooldown" : "error");
          const statusMessage = ok
            ? "Sẵn sàng (Groq Qwen 3.6 27B)"
            : (resp.status === 429 ? "Tạm hết TPM/TPD" : (data?.error?.message || `Lỗi HTTP ${resp.status}`));

          const remTokens = resp.headers.get("x-ratelimit-remaining-tokens");
          const limTokens = resp.headers.get("x-ratelimit-limit-tokens");
          const resetTokens = resp.headers.get("x-ratelimit-reset-tokens");
          const remRequests = resp.headers.get("x-ratelimit-remaining-requests");
          const limRequests = resp.headers.get("x-ratelimit-limit-requests");
          const resetRequests = resp.headers.get("x-ratelimit-reset-requests");

          results.push({
            id: i + 1,
            masked,
            provider: "Groq LPU",
            status,
            statusMessage,
            latencyMs: Date.now() - startTime,
            ok,
            error: data?.error?.message || null,
            remainingTokens: remTokens ? Number(remTokens) : null,
            limitTokens: limTokens ? Number(limTokens) : 8000,
            resetTokens: resetTokens || "0s",
            remainingRequests: remRequests ? Number(remRequests) : null,
            limitRequests: limRequests ? Number(limRequests) : 1000,
            resetRequests: resetRequests || null
          });
        } else if (isOpenRouter) {
          const resp = await fetch("https://openrouter.ai/api/v1/auth/key", {
            headers: { Authorization: `Bearer ${key}` }
          });
          const data = await resp.json().catch(() => null);
          const ok = resp.ok;
          const status = ok ? "ready" : (resp.status === 429 ? "cooldown" : "error");
          const statusMessage = ok
            ? "Sẵn sàng (OpenRouter 70B)"
            : (resp.status === 429 ? "Tạm hết RPM/TPM" : (data?.error?.message || `Lỗi HTTP ${resp.status}`));

          const usage = data?.data?.usage;
          const limit = data?.data?.limit;
          const usageText = usage != null ? `$${Number(usage).toFixed(3)} đã dùng` : "";
          const limitText = limit != null ? `Hạn mức: $${limit}` : "Không giới hạn";

          results.push({
            id: i + 1,
            masked,
            provider: "OpenRouter",
            status,
            statusMessage,
            latencyMs: Date.now() - startTime,
            ok,
            error: data?.error?.message || null,
            usageInfo: usageText ? `${usageText} (${limitText})` : "Sẵn sàng (70B Instruct)",
            limitTokens: 50000,
            remainingTokens: 50000,
            resetTokens: "0s"
          });
        } else {
          results.push({
            id: i + 1,
            masked,
            provider: "API Khác",
            status: "ready",
            statusMessage: "Sẵn sàng",
            latencyMs: Date.now() - startTime,
            ok: true
          });
        }
      } catch (err) {
        results.push({
          id: i + 1,
          masked,
          provider: isGroq ? "Groq LPU" : isOpenRouter ? "OpenRouter" : "Khác",
          status: "error",
          statusMessage: err.message,
          error: err.message,
          ok: false
        });
      }
    }

    const healthyCount = results.filter((r) => r.ok).length;
    const dailyCapacity = Math.round(keyList.length * 2500); // ~40k chapters/day
    const safeSpacingSec = Math.max(1, Math.round(18 / Math.max(1, healthyCount)));

    return json({
      keys: results,
      activeModel: model,
      fallbackModels,
      totalKeys: keyList.length,
      healthyKeys: healthyCount,
      dailyCapacityEstimate: `~${dailyCapacity.toLocaleString("vi-VN")} chương/ngày`,
      safePacingEstimate: `${safeSpacingSec}s/chương (Dịch 24/24 liên tục)`
    });
  }

  const summary = keyList.map((key, i) => ({
    id: i + 1,
    masked: key.slice(0, 8) + "..." + key.slice(-6),
    provider: key.startsWith("gsk_") ? "Groq LPU" : "Google Gemini",
    status: "ready"
  }));

  return json({
    totalKeys: keyList.length,
    keys: summary,
    activeModel: model,
    fallbackModels
  });
}

async function readJson(request) {
  const limit = 64 * 1024;
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) throw fail(413, "Body vượt giới hạn 64 KB.");

  try {
    if (!request.body) return {};
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw fail(413, "Body vượt giới hạn 64 KB.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    if (!text.trim()) return {};
    return JSON.parse(text);
  } catch (error) {
    if (error?.status) throw error;
    throw fail(400, "Body không đúng định dạng JSON.");
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
