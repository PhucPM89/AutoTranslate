"use strict";

// Thin PostgREST client. No SDK dependency: the four things this project needs
// from Postgres are an upsert, a select, an insert and a count, all of which are
// plain HTTP against Supabase's REST endpoint.
//
// Two key tiers, never mixed up:
//   service role -> server-side only (ingest, admin). Bypasses RLS.
//   anon         -> safe for the browser. RLS allows reading published books and
//                   inserting analytics events, nothing else.

function createSupabase(env = process.env, { role = "service" } = {}) {
  const url = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = role === "anon" ? env.SUPABASE_ANON_KEY : env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  async function request(path, { method = "GET", body, headers = {}, query = "" } = {}) {
    const response = await fetch(`${url}/rest/v1/${path}${query}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(Number(env.SUPABASE_TIMEOUT_MS || 20000))
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = new Error(`Supabase ${method} ${path} lỗi HTTP ${response.status}: ${detail.slice(0, 200)}`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    role,
    request,

    // ---- books ---------------------------------------------------------
    async upsertBook(book) {
      return request("books", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: [toBookRow(book)]
      });
    },

    // ---- chapters ------------------------------------------------------
    // Chunked because a 4,000-chapter novel in one request would be a very large
    // body; the unique (book_id, revision, chapter_number) key makes it idempotent.
    async upsertChapters(bookId, revision, chapters, { chunkSize = 500 } = {}) {
      let written = 0;
      for (let i = 0; i < chapters.length; i += chunkSize) {
        const slice = chapters.slice(i, i + chunkSize).map((chapter) => ({
          book_id: bookId,
          revision,
          chapter_number: chapter.chapterNumber,
          title: chapter.title || "",
          translation_status: chapter.translationStatus || "pending",
          characters: chapter.characters || 0
        }));
        await request("chapters", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: slice
        });
        written += slice.length;
      }
      return written;
    },

    // ---- catalogue reads ----------------------------------------------
    async listBooks({ limit = 24, offset = 0, genre = "", search = "", order = "updated_at.desc" } = {}) {
      const params = new URLSearchParams({
        select: "id,title,author,description,cover_url,status,total_chapters,translated_chapters,revision,featured,updated_at",
        published: "eq.true",
        order,
        limit: String(limit),
        offset: String(offset)
      });
      if (genre) params.set("status", `eq.${genre}`);
      if (search) {
        // Trigram index on (title || ' ' || author) backs this.
        params.set("or", `(title.ilike.*${search}*,author.ilike.*${search}*)`);
      }
      return request("books", { query: `?${params}` });
    },

    async countBooks() {
      const response = await fetch(`${url}/rest/v1/books?select=id&published=eq.true`, {
        method: "HEAD",
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
        signal: AbortSignal.timeout(15000)
      });
      const range = response.headers.get("content-range") || "";
      return Number(range.split("/")[1]) || 0;
    },

    // ---- analytics -----------------------------------------------------
    // Insert-only, return=minimal: no read, no lock, no contention. Replaces the
    // read-modify-write on a single JSON blob that dropped counts.
    async insertAnalyticsEvent(event) {
      return request("analytics_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: [
          {
            event_type: event.type,
            book_id: event.bookId || null,
            chapter_number: Number.isFinite(event.chapterNumber) ? event.chapterNumber : null,
            session_id: event.sessionId || null
          }
        ]
      });
    },

    async readAnalyticsDaily({ days = 30 } = {}) {
      const params = new URLSearchParams({ select: "*", order: "day.desc", limit: String(days) });
      return request("analytics_daily", { query: `?${params}` });
    }
  };
}

function toBookRow(book) {
  return {
    id: book.id,
    title: book.title || "",
    author: book.author || "",
    description: book.description || "",
    cover_url: book.cover || book.cover_url || "",
    status: book.status || "Đang cập nhật",
    total_chapters: book.totalChapters || 0,
    translated_chapters: book.translatedChapters || 0,
    revision: book.revision || 1,
    source: book.source || "admin",
    source_id: book.sourceId || null,
    source_url: book.sourceUrl || null,
    featured: Boolean(book.featured),
    published: book.published !== false,
    last_crawled_at: book.lastCrawledAt || null
  };
}

function hasSupabase(env = process.env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

// Adapter shaped for ingestBook's metadataStore option, so ingest stays unaware
// of which database is behind it.
function createMetadataStore(env = process.env) {
  const client = createSupabase(env);
  if (!client) return null;
  return {
    upsertBook: (book) => client.upsertBook(book),
    upsertChapters: (bookId, revision, chapters) => client.upsertChapters(bookId, revision, chapters)
  };
}

module.exports = { createSupabase, createMetadataStore, hasSupabase, toBookRow };
