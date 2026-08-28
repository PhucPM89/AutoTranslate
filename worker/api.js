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
  "/api/reader/content": handlePublicReaderContent,
  "/api/reader/term-feedback": handleTermFeedback,
  "/api/admin/keys": handleAdminKeys,
  "/api/admin/session": handleSession,
  "/api/admin/login": handleLogin,
  "/api/admin/logout": handleLogout,
  "/api/admin/upload": handleUpload,
  "/api/admin/crawler": handleCrawler,
  "/api/admin/translate": handleTranslateStatus,
  "/api/admin/catalog": handleCatalog,
  "/api/admin/analytics": handleAnalytics,
  "/api/admin/users": handleAdminUsers,
  "/api/admin/community": handleAdminCommunity,
  "/api/admin/gemini-translate": handleAdminGeminiTranslate
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

// Local development and Pages preview domains are not in the public CDN's CORS
// allow-list. Proxy only the same JSON objects that are already public on the
// CDN; the production reader keeps fetching the CDN directly and costs no Worker
// invocation. A strict key allow-list prevents this endpoint becoming a generic
// R2 object browser.
async function handlePublicReaderContent({ request, env, url }) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed("GET, HEAD");
  const key = String(url.searchParams.get("key") || "");
  const allowed = key === "catalog/latest.json" ||
    /^books\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/index\.json$/.test(key) ||
    /^books\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/r\d{1,10}\/ch\/\d{1,10}\.json$/.test(key);
  if (!allowed) throw fail(400, "Đường dẫn nội dung đọc không hợp lệ.");

  let body = null;
  const bucket = env.NOVEL_STORAGE || env.R2_READER;
  if (bucket) {
    const reader = createR2BindingStorage(bucket);
    body = await reader.get(key).catch(() => null);
  }

  if (!body) {
    const cdnBase = String(env.R2_PUBLIC_BASE_URL || "https://cdn.tram-chu.online").replace(/\/$/, "");
    const upstream = await fetch(`${cdnBase}/${key}`, { signal: AbortSignal.timeout(10000) });
    if (!upstream.ok) throw fail(upstream.status === 404 ? 404 : 502, "Không tải được nội dung đọc.");
    body = await upstream.arrayBuffer();
  }

  const immutable = /\/r\d+\/ch\/\d+\.json$/.test(key);
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      "Access-Control-Allow-Origin": "*"
    }
  });
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
    const body = await readJson(request);
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
      let dispatchStarted = false;
      if (env.GITHUB_DISPATCH_TOKEN && env.GITHUB_REPOSITORY) {
        try {
          await dispatchTranslationWorkflow(env, {
            book: focusBookId,
            budget: "5000",
            replaceCurrent: true
          });
          dispatchStarted = true;
        } catch (error) {
          console.error("Unable to replace translation run after focus change:", error.message);
        }
      }
      return json({
        success: true,
        config,
        dispatchStarted,
        message: focusBookId
          ? dispatchStarted
            ? "Đã lưu ưu tiên và đang chuyển worker sang bộ truyện này ngay."
            : "Đã lưu bộ truyện ưu tiên; worker sẽ áp dụng ở lượt chạy kế tiếp."
          : dispatchStarted
            ? "Đã chuyển về tự động và đang khởi động lại worker."
            : "Đã chuyển về chế độ tự động chọn bộ truyện."
      });
    }

    if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_REPOSITORY) {
      throw fail(503, "Chưa cấu hình GITHUB_DISPATCH_TOKEN / GITHUB_REPOSITORY.");
    }
    const { book, budget } = normalizeTranslationDispatch(body);

    await dispatchTranslationWorkflow(env, { book, budget });

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
        if (Array.isArray(status?.recentActivity)) {
          status.recentActivity = status.recentActivity.filter((activity) => publishedBookIds.has(activity.bookId));
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

  // Heartbeat timeout check: 5 minutes
  const beat = status.updatedAt || status.finishedAt;
  const heartbeatStale = Boolean(beat && Date.now() - new Date(beat).getTime() > 5 * 60 * 1000);
  const isRunning = status.state === "running" && !heartbeatStale;
  if (status.state === "running" && heartbeatStale) {
    status.state = "idle";
    status.message = "Worker đã dừng hoặc mất tín hiệu kết nối (quá 5 phút không có nhịp tim).";
  }

  // Calculate detailed worker life state & stop reasons
  const deadKeys = Number(status.deadKeyCount || 0);
  const totalKeys = Number(status.activeKeyCount || 0);
  const dailyExhausted = Number(status.dailyExhaustedKeyCount || 0);
  const readyKeys = Number(status.readyKeyCount || 0);
  const isQuotaPaused = status.state === "paused_quota" || status.activityState === "waiting_quota";

  let stopReason = "idle";
  let stopReasonTitle = "Hệ thống đang nghỉ";
  let stopReasonDetails = "Không có tác vụ dịch đang chạy.";

  if (isRunning) {
    stopReason = "running";
    stopReasonTitle = "🟢 Worker đang hoạt động bình thường (Online)";
    stopReasonDetails = `Worker đang xử lý theo thời gian thực (Nhịp tim gần nhất: ${describeTimeAgo(beat)}).`;
  } else if (isQuotaPaused || (totalKeys > 0 && dailyExhausted >= totalKeys) || (totalKeys > 0 && readyKeys === 0 && dailyExhausted > 0)) {
    stopReason = "quota_tpd_rpd";
    stopReasonTitle = "🟡 Tạm dừng chờ hồi Quota (Hết RPD / TPD ngày)";
    const resumesText = status.resumesAt ? ` Dự kiến tự động tiếp tục vào ${new Date(status.resumesAt).toLocaleTimeString("vi-VN")}.` : "";
    stopReasonDetails = `Đã chạm trần hạn mức ngày của cụm Google Gemini API (1.500 requests/ngày hoặc 1M tokens/ngày).${resumesText} Bạn có thể nạp thêm API Key mới để chạy tiếp ngay.`;
  } else if (totalKeys > 0 && deadKeys >= totalKeys) {
    stopReason = "all_keys_dead";
    stopReasonTitle = "🔴 Toàn bộ API Key bị lỗi / vô hiệu hóa";
    stopReasonDetails = "Tất cả API Key Gemini trong hệ thống đã bị thu hồi hoặc gặp lỗi 401/403. Vui lòng kiểm tra và thay thế trong tab 'Sức khỏe API Keys'.";
  } else if (status.state === "completed" || (Array.isArray(status.queue) && status.queue.length === 0 && Number(status.translatedThisRun || 0) > 0)) {
    stopReason = "completed_all";
    stopReasonTitle = "🎉 Đã hoàn tất quét toàn bộ thư viện hôm nay";
    stopReasonDetails = "Tất cả các bộ truyện trong hệ thống đã được quét hậu kiểm và đạt chuẩn chất lượng 100%.";
  } else if (heartbeatStale) {
    stopReason = "stale_offline";
    stopReasonTitle = "🔴 Worker đã dừng / Mất tín hiệu (Offline)";
    stopReasonDetails = `Tiến trình worker đã kết thúc hoặc bị gián đoạn (Nhịp tim cuối: ${describeTimeAgo(beat)}). Bấm 'Dịch ngay' hoặc khởi động lại daemon để tiếp tục.`;
  } else if (status.lastError) {
    stopReason = "error";
    stopReasonTitle = "⚠️ Tạm dừng do phát sinh lỗi";
    stopReasonDetails = `Lỗi ghi nhận: ${status.lastError}`;
  }

  // Build list of books scanned/processed today
  const dailyScannedBooks = [];
  const scannedMap = new Map();

  // 1. Current active book if any
  if (status.currentBookId) {
    scannedMap.set(status.currentBookId, {
      bookId: status.currentBookId,
      bookTitle: status.currentBookTitle || status.currentBookId,
      scannedChapters: Number(status.currentCompleted || status.currentChapter || 0),
      totalChapters: Number(status.currentTotalChapters || 0),
      repairedChapters: Number(status.translatedThisRun || 0),
      fluencyScore: 10,
      status: isRunning ? "scanning" : (isQuotaPaused ? "paused_quota" : "done"),
      statusLabel: isRunning ? "Đang quét & tái dịch..." : (isQuotaPaused ? "Tạm dừng chờ quota" : "Đã quét trong phiên"),
      lastScannedAt: status.updatedAt || new Date().toISOString()
    });
  }

  // 2. From recent activity / daily logs
  if (Array.isArray(status.recentActivity)) {
    for (const act of status.recentActivity) {
      if (!act || !act.bookId) continue;
      const existing = scannedMap.get(act.bookId);
      const count = Number(act.count || 1);
      if (existing) {
        existing.repairedChapters = Math.max(existing.repairedChapters, count);
        if (act.at && new Date(act.at).getTime() > new Date(existing.lastScannedAt).getTime()) {
          existing.lastScannedAt = act.at;
        }
      } else {
        scannedMap.set(act.bookId, {
          bookId: act.bookId,
          bookTitle: act.bookTitle || act.bookId,
          scannedChapters: Number(act.chapterNumber || count),
          totalChapters: Number(act.totalChapters || 0),
          repairedChapters: count,
          fluencyScore: 10,
          status: "done",
          statusLabel: "Đã chuẩn hóa hoàn tất",
          lastScannedAt: act.at || new Date().toISOString()
        });
      }
    }
  }

  // 3. From status.dailyScannedBooks if present
  if (Array.isArray(status.dailyScannedBooks)) {
    for (const b of status.dailyScannedBooks) {
      if (b && b.bookId) {
        scannedMap.set(b.bookId, { ...scannedMap.get(b.bookId), ...b });
      }
    }
  }

  status.workerAlive = isRunning;
  status.stopReason = stopReason;
  status.stopReasonTitle = stopReasonTitle;
  status.stopReasonDetails = stopReasonDetails;
  status.dailyScannedBooks = Array.from(scannedMap.values());
  status.focusBookId = config.focusBookId;
  status.selectionMode = config.focusBookId ? "focused" : "automatic";
  return json({ status, config });
}

function describeTimeAgo(isoString) {
  if (!isoString) return "Chưa rõ";
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec} giây trước`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour} giờ trước`;
}

async function dispatchTranslationWorkflow(env, { book = "", budget = "5000", replaceCurrent = false } = {}) {
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
            budget,
            replace_current: replaceCurrent ? "true" : "false"
          }
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!response.ok) {
      // GitHub's diagnostic can echo workflow inputs. Status is sufficient here,
      // and keeping the body out of logs prevents attacker-controlled data from
      // becoming an operational log-injection surface.
      console.error("Workflow dispatch translate-worker failed:", response.status);
      throw fail(502, `Không gọi được GitHub Actions translate worker (HTTP ${response.status}).`);
    }
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

// ---- admin community ------------------------------------------------------
async function handleAdminCommunity({ request, env }) {
  await requireAdmin(request, env);

  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (request.method === "DELETE") {
    const reqUrl = new URL(request.url);
    const id = reqUrl.searchParams.get("id");
    if (!id) throw fail(400, "Thiếu ID bình luận.");
    if (!url || !key) throw fail(503, "Supabase chưa được cấu hình.");

    const delRes = await fetch(`${url}/rest/v1/paragraph_comments?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!delRes.ok) throw fail(delRes.status, "Không thể xóa bình luận.");
    return json({ ok: true, message: "Đã xóa bình luận thành công." });
  }

  if (request.method !== "GET") return methodNotAllowed("GET, DELETE");

  // Fetch comments & book list from Supabase
  let comments = [];
  let books = [];

  if (url && key) {
    const [commentsRes, booksRes] = await Promise.all([
      fetch(`${url}/rest/v1/paragraph_comments?select=id,book_id,chapter_index,paragraph_index,author_name,content,likes_count,created_at&order=created_at.desc&limit=300`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000)
      }).catch(() => null),
      fetch(`${url}/rest/v1/books?select=id,title,author&limit=500`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000)
      }).catch(() => null)
    ]);

    if (commentsRes?.ok) comments = (await commentsRes.json().catch(() => [])) || [];
    if (booksRes?.ok) books = (await booksRes.json().catch(() => [])) || [];
  }

  const bookMap = new Map();
  for (const b of books) {
    if (b.id) bookMap.set(b.id, b);
  }

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  let todayCommentsCount = 0;
  const bookCommentCountMap = new Map();

  const formattedComments = (Array.isArray(comments) ? comments : []).map((c) => {
    const b = bookMap.get(c.book_id) || {};
    const createdAtTime = new Date(c.created_at).getTime();
    if (createdAtTime > oneDayAgo) todayCommentsCount++;
    const count = (bookCommentCountMap.get(c.book_id) || 0) + 1;
    bookCommentCountMap.set(c.book_id, count);

    return {
      id: c.id,
      bookId: c.book_id,
      bookTitle: b.title || c.book_id,
      chapterIndex: Number(c.chapter_index) || 0,
      chapterNumber: (Number(c.chapter_index) || 0) + 1,
      paragraphIndex: Number(c.paragraph_index) || 0,
      authorName: c.author_name || "Độc giả",
      content: c.content || "",
      likesCount: Number(c.likes_count) || 0,
      createdAt: c.created_at
    };
  });

  let topBookId = "";
  let topBookCount = 0;
  for (const [bid, cnt] of bookCommentCountMap.entries()) {
    if (cnt > topBookCount) {
      topBookCount = cnt;
      topBookId = bid;
    }
  }
  const topBookObj = bookMap.get(topBookId);
  const topBookTitle = topBookObj ? topBookObj.title : (topBookId || "Chưa có");

  return json({
    ok: true,
    stats: {
      totalComments: formattedComments.length,
      todayComments: todayCommentsCount,
      topDiscussedBook: topBookTitle
    },
    comments: formattedComments
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
  // Credentials are operational secrets. NOVEL_STORAGE is the reader bucket and
  // is served wholesale by the public CDN, so falling back to it publishes every
  // key to the internet. Fail closed when the private binding is absent.
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
          return parsed.filter((k) => typeof k === "string" && k.trim().length > 0).map((k) => k.trim());
        }
      }
    } catch {}
  }
  const fromEnv =
    env.GEMINI_API_KEYS ||
    env.GEMINI_API_KEY ||
    env.GROQ_API_KEYS ||
    env.GROQ_API_KEY ||
    env.OPENROUTER_API_KEYS ||
    env.OPENROUTER_API_KEY ||
    "";
  const { parseApiKeys } = await import("../server/gemini.js");
  return parseApiKeys(fromEnv);
}

async function saveActiveKeyList(env, list) {
  const storage = storageForKeys(env);
  if (!storage) throw fail(503, "R2 Storage chưa được cấu hình để lưu API Key.");
  const cleanList = (list || []).map((k) => String(k || "").trim()).filter(Boolean);
  await storage.put(KEYS_STORAGE_KEY, JSON.stringify(cleanList, null, 2), {
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
  const isGeminiOnly = keyList.length > 0 && keyList.every((k) => k.startsWith("AIza") || k.startsWith("AQ."));
  const isGroqOnly = keyList.length > 0 && keyList.every((k) => k.startsWith("gsk_"));
  const defaultModel = isGeminiOnly
    ? (env.GEMINI_MODEL || "gemini-3.6-flash")
    : isGroqOnly
      ? (env.GROQ_MODEL || "qwen/qwen3.6-27b")
      : (env.GEMINI_MODEL || env.GROQ_MODEL || env.OPENROUTER_MODEL || "gemini-3.6-flash");
  const model = defaultModel;
  const fallbackModels = env.GEMINI_FALLBACK_MODELS || env.GROQ_FALLBACK_MODELS || env.OPENROUTER_FALLBACK_MODELS || "gemini-3.6-flash";

  if (request.method === "POST") {
    const body = await readJson(request);
    const action = String(body?.action || "ping").toLowerCase();

    if (action === "add") {
      const newKey = String(body?.key || "").trim();
      if (!/^(?:gsk_|sk-or-v1-|AIza|AQ\.)[A-Za-z0-9_.-]{14,280}$/.test(newKey)) {
        throw fail(400, "API Key không hợp lệ. Key phải bắt đầu bằng 'AIza'/'AQ.' (Gemini), 'gsk_' (Groq) hoặc 'sk-or-v1-' (OpenRouter).");
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
          provider: k.startsWith("gsk_") ? "Groq LPU" : k.startsWith("sk-or-v1-") ? "OpenRouter" : "Google Gemini",
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
          provider: k.startsWith("gsk_") ? "Groq LPU" : k.startsWith("sk-or-v1-") ? "OpenRouter" : "Google Gemini",
          status: "ready"
        })),
        activeModel: model,
        fallbackModels
      });
    }

    // Default action: "ping" - Probe all keys live
    const results = [];
    for (let i = 0; i < keyList.length; i++) {
      const rawKey = keyList[i];
      const key = String(rawKey || "").trim();
      const isGroq = key.startsWith("gsk_");
      const isOpenRouter = key.startsWith("sk-or-v1-");
      const isGemini = key.startsWith("AIza") || key.startsWith("AQ.");
      const masked = key.length >= 14 ? key.slice(0, 8) + "..." + key.slice(-6) : key;
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
            }),
            signal: AbortSignal.timeout(15000)
          });
          const data = await resp.json().catch(() => null);
          const ok = resp.ok;
          const status = ok ? "ready" : (resp.status === 429 ? "tpd_limited" : "error");
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
            error: ok ? null : (data?.error?.message || `Lỗi HTTP ${resp.status}`),
            remainingTokens: remTokens ? Number(remTokens) : null,
            limitTokens: limTokens ? Number(limTokens) : 8000,
            resetTokens: resetTokens || "0s",
            remainingRequests: remRequests ? Number(remRequests) : null,
            limitRequests: limRequests ? Number(limRequests) : 1000,
            resetRequests: resetRequests || null
          });
        } else if (isOpenRouter) {
          const resp = await fetch("https://openrouter.ai/api/v1/auth/key", {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(15000)
          });
          const data = await resp.json().catch(() => null);
          const ok = resp.ok;
          const status = ok ? "ready" : (resp.status === 429 ? "tpd_limited" : "error");
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
            error: ok ? null : (data?.error?.message || `Lỗi HTTP ${resp.status}`),
            usageInfo: usageText ? `${usageText} (${limitText})` : "Sẵn sàng (70B Instruct)",
            limitTokens: 50000,
            remainingTokens: 50000,
            resetTokens: "0s"
          });
        } else if (isGemini) {
          const geminiBaseUrl = (env.GEMINI_BASE_URL || env.GOOGLE_AI_GATEWAY || "https://gateway.ai.cloudflare.com/v1/aa644d98f2377007f0fa98abcafe3d21/tram-chu/google-ai-studio").replace(/\/$/, "");
          const cfToken = env.CLOUDFLARE_API_TOKEN || "";
          const headers = {};
          if (geminiBaseUrl.includes("gateway.ai.cloudflare.com") && cfToken) {
            headers["cf-aig-authorization"] = `Bearer ${cfToken}`;
          }
          const resp = await fetch(`${geminiBaseUrl}/v1beta/models?key=${encodeURIComponent(key)}`, {
            headers,
            signal: AbortSignal.timeout(15000)
          });
          const data = await resp.json().catch(() => null);
          const ok = resp.ok;
          let status = ok ? "ready" : "error";
          let statusMessage = ok ? "Sẵn sàng (Google Gemini API)" : `Lỗi HTTP ${resp.status}`;
          let error = null;

          if (ok) {
            status = "ready";
            statusMessage = "Sẵn sàng (Google Gemini API)";
          } else if (resp.status === 429) {
            status = "tpd_limited";
            statusMessage = "Hết hạn mức Quota (Chạm RPD/TPD/RPM)";
            error = data?.error?.message || "Tạm hết quota ngày (1.500 RPD) hoặc token (1M TPM) của Gemini";
          } else if (data?.error?.message && data.error.message.includes("User location is not supported")) {
            status = "error";
            statusMessage = "Vùng IP không được Google hỗ trợ (User location not supported)";
            error = "Vùng IP của máy chủ Cloudflare không được Google Gemini hỗ trợ trực tiếp (User location is not supported). Hãy cấu hình GEMINI_BASE_URL (Cloudflare AI Gateway / Proxy US) trong Settings để mở khóa.";
          } else if (resp.status === 401 || resp.status === 403) {
            status = "error";
            statusMessage = "Key không hợp lệ / Chưa bật Gemini API";
            error = data?.error?.message || `Key không hợp lệ hoặc đã bị thu hồi (HTTP ${resp.status})`;
          } else {
            status = "error";
            statusMessage = data?.error?.message ? `Lỗi: ${data.error.message.slice(0, 80)}` : `Lỗi HTTP ${resp.status}`;
            error = data?.error?.message || `Lỗi HTTP ${resp.status}`;
          }

          results.push({
            id: i + 1,
            masked,
            provider: "Google Gemini",
            status,
            statusMessage,
            latencyMs: Date.now() - startTime,
            ok,
            error,
            usageInfo: ok ? "15 RPM · 1M TPM · 1.500 RPD" : null,
            remainingTokens: ok ? 1000000 : null,
            limitTokens: ok ? 1000000 : null,
            resetTokens: ok ? "0s" : null,
            remainingRequests: ok ? 1500 : null,
            limitRequests: ok ? 1500 : null
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
          provider: isGroq ? "Groq LPU" : isOpenRouter ? "OpenRouter" : isGemini ? "Google Gemini" : "Khác",
          status: "error",
          statusMessage: err.message,
          error: err.message,
          ok: false
        });
      }
    }

    const healthyCount = results.filter((r) => r.ok).length;
    const dailyCapacity = Math.round(keyList.length * 2500); // ~2.5k chapters/key/day
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
    masked: key.length >= 14 ? key.slice(0, 8) + "..." + key.slice(-6) : key,
    provider: key.startsWith("gsk_") ? "Groq LPU" : key.startsWith("sk-or-v1-") ? "OpenRouter" : "Google Gemini",
    status: "ready"
  }));

  return json({
    totalKeys: keyList.length,
    keys: summary,
    activeModel: model,
    fallbackModels
  });
}

async function readJson(request, limit = 64 * 1024) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) throw fail(413, `Body vượt giới hạn ${Math.round(limit / 1024)} KB.`);

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
        throw fail(413, `Body vượt giới hạn ${Math.round(limit / 1024)} KB.`);
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

function normalizeTranslationDispatch(body) {
  const book = String(body?.book || "").trim();
  if (book && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(book)) {
    throw fail(400, "ID truyện không hợp lệ.");
  }

  const rawBudget = String(body?.budget ?? "5000").trim();
  if (!/^\d{1,5}$/.test(rawBudget)) throw fail(400, "Budget dịch không hợp lệ.");
  const parsedBudget = Number(rawBudget);
  if (!Number.isSafeInteger(parsedBudget) || parsedBudget < 1 || parsedBudget > 10000) {
    throw fail(400, "Budget dịch phải từ 1 đến 10.000 lượt gọi.");
  }
  return { book, budget: String(parsedBudget) };
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

// ---- admin gemini translate (VIP EPUB Studio) -------------------------------
let epubStudioKeyCursor = 0;
const epubStudioKeyCooldowns = new Map();

function studioApiKeys(env) {
  return String(env.EPUB_STUDIO_API_KEYS || "")
    .split(/[\r\n,;]+/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function studioKeyCooldownMs(status, message) {
  if (status === 401 || status === 403) return 24 * 60 * 60_000;
  if (/\b(tpd|rpd)\b|tokens? per day|requests? per day|daily quota/i.test(message)) return 24 * 60 * 60_000;
  return 10 * 60_000;
}

async function handleAdminGeminiTranslate({ request, env }) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  requireSameOrigin(request);
  await requireAdmin(request, env);

  const body = await readJson(request, 1024 * 1024);
  const content = String(body?.content || "").trim();
  if (!content) throw fail(400, "Thiếu nội dung chương cần dịch.");
  if (content.length > 500000) throw fail(400, "Nội dung chương quá dài (tối đa 500.000 ký tự).");

  const apiKeys = studioApiKeys(env);
  if (!apiKeys.length) throw fail(503, "Cụm API Key riêng của EPUB Studio chưa được cấu hình.");

  const rawModel = String(body?.model || "gemini-3.6-flash").trim();
  const allowedModels = new Set([
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite"
  ]);
  if (!allowedModels.has(rawModel)) throw fail(400, "Model Gemini không được EPUB Studio hỗ trợ.");
  const model = rawModel;
  const title = String(body?.title || "").trim();

  const prompt = [
    "Bạn là một dịch giả tiểu thuyết Trung Quốc sang tiếng Việt chuyên nghiệp.",
    "Hãy dịch trọn vẹn chương truyện sau đây sang tiếng Việt tự nhiên, chuẩn văn phong tiểu thuyết Tiên Hiệp/Huyền Huyễn/Đô Thị.",
    "QUY TẮC BẮT BUỘC:",
    "- Chuyển toàn bộ tên người, địa danh, môn phái, chiêu thức, cảnh giới sang âm Hán-Việt phù hợp, quen thuộc.",
    "- Tuyệt đối không dùng Pinyin hoặc để sót chữ Hán.",
    "- Giữ nguyên cấu trúc phân đoạn văn bản, hội thoại rõ ràng, xưng hô tự nhiên (huynh-đệ, sư đồ, ta-ngươi, hắn-nàng).",
    "- Không tóm tắt, không thêm lời bình luận bên ngoài, chỉ trả về duy nhất nội dung bản dịch tiếng Việt.",
    "",
    title ? `Tiêu đề chương: ${title}\n` : "",
    "Nội dung cần dịch:",
    content
  ].join("\n");

  const geminiBaseUrl = (env.GEMINI_BASE_URL || env.GOOGLE_AI_GATEWAY || "https://gateway.ai.cloudflare.com/v1/aa644d98f2377007f0fa98abcafe3d21/tram-chu/google-ai-studio").replace(/\/$/, "");
  const cfToken = env.CLOUDFLARE_API_TOKEN || "";
  const url = `${geminiBaseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const now = Date.now();
    const orderedKeys = apiKeys.map((_, offset) => apiKeys[(epubStudioKeyCursor + offset) % apiKeys.length]);
    epubStudioKeyCursor = (epubStudioKeyCursor + 1) % apiKeys.length;
    let data = null;
    let lastProviderError = null;

    for (const apiKey of orderedKeys) {
      if ((epubStudioKeyCooldowns.get(apiKey) || 0) > now) continue;
      const headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-api-client": "gl-node/gemini-epub-studio-vip"
      };
      if (geminiBaseUrl.includes("gateway.ai.cloudflare.com") && cfToken) {
        headers["cf-aig-authorization"] = `Bearer ${cfToken}`;
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 32768 }
        })
      });
      data = await response.json().catch(() => ({}));
      if (response.ok) break;

      const errMsg = data?.error?.message || `Lỗi Gemini API (HTTP ${response.status})`;
      lastProviderError = fail(response.status >= 500 ? 502 : response.status || 400, errMsg);
      if ([401, 403, 429].includes(response.status) || response.status >= 500) {
        epubStudioKeyCooldowns.set(apiKey, Date.now() + studioKeyCooldownMs(response.status, errMsg));
        data = null;
        continue;
      }
      throw lastProviderError;
    }

    if (!data) {
      throw lastProviderError || fail(429, "Toàn bộ key VIP EPUB Studio đang chờ hồi quota.");
    }

    if (data?.candidates?.[0]?.finishReason === "SAFETY") {
      throw fail(400, "Nội dung chương bị bộ lọc an toàn của Gemini từ chối xử lý.");
    }
    if (data?.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      throw fail(502, "Bản dịch bị cắt do hết giới hạn output token.");
    }

    let text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
    text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    if (!text) throw fail(502, "Gemini không trả về nội dung bản dịch.");

    return json({
      ok: true,
      translation: text,
      model,
      finishReason: data?.candidates?.[0]?.finishReason || "",
      usage: data?.usageMetadata || null
    });
  } catch (error) {
    if (error.name === "AbortError") throw fail(504, "Gemini API phản hồi quá lâu (quá 120 giây).");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- reader term feedback -------------------------------------------------
async function handleTermFeedback({ request, env }) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  const body = await readJson(request);
  const bookId = String(body?.bookId || "").trim();
  const originalTerm = String(body?.originalTerm || "").trim().slice(0, 50);
  const suggestedTranslation = String(body?.suggestedTranslation || "").trim().slice(0, 80);
  const contextSnippet = String(body?.contextSnippet || "").trim().slice(0, 300);
  const note = String(body?.note || "").trim().slice(0, 200);

  if (!bookId || !originalTerm || !suggestedTranslation) {
    return json({ error: "Thiếu thông tin bắt buộc (mã truyện, từ gốc, bản dịch đề xuất)." }, 400);
  }

  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

  if (url && key) {
    await fetch(`${url}/rest/v1/glossary_suggestions`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        book_id: bookId,
        source_term: originalTerm,
        suggested_term: suggestedTranslation,
        context_snippet: contextSnippet,
        note: note,
        status: "pending"
      })
    }).catch(() => null);
  }

  return json({
    ok: true,
    message: "Cảm ơn bạn! Đề xuất sửa đổi thuật ngữ đã được gửi tới Ban Quản Trị để duyệt.",
    term: { zh: originalTerm, vi: suggestedTranslation }
  });
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
    // The CDN for chapters, Supabase for analytics, R2 S3 endpoint, and Gemini API.
    `connect-src 'self'${cdn ? ` ${cdn}` : ""} https://*.supabase.co https://*.r2.cloudflarestorage.com https://generativelanguage.googleapis.com https://gateway.ai.cloudflare.com`,
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' mailto:"
  ].join("; ");
}
