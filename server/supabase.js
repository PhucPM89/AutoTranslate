"use strict";

const { CATEGORY_DEFINITIONS, categorySlugForLabel } = require("./crawler-store");

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

    // A partial update, deliberately. The translation worker knows the chapter
    // counts and nothing else; upserting a whole row from index.json reset
    // source to "admin" and source_id to null, which made the crawler lose track
    // of its own books and queue them for download all over again. A component
    // writes only the columns it owns.
    async updateBookProgress(bookId, { totalChapters, translatedChapters, revision, status }) {
      const patch = { updated_at: new Date().toISOString() };
      if (Number.isFinite(totalChapters)) patch.total_chapters = totalChapters;
      if (Number.isFinite(translatedChapters)) patch.translated_chapters = translatedChapters;
      if (Number.isFinite(revision)) patch.revision = revision;
      if (status) {
        patch.status = status;
      } else if (Number.isFinite(totalChapters) && Number.isFinite(translatedChapters) && totalChapters > 0 && translatedChapters >= totalChapters) {
        patch.status = "Hoàn thành";
      }
      return request("books", {
        method: "PATCH",
        query: `?id=eq.${encodeURIComponent(bookId)}`,
        headers: { Prefer: "return=minimal" },
        body: patch
      });
    },

    async bookExists(bookId) {
      const rows = await request("books", { query: `?select=id&id=eq.${encodeURIComponent(bookId)}&limit=1` });
      return Array.isArray(rows) && rows.length > 0;
    },

    // ---- chapters ------------------------------------------------------
    // Chunked because a 4,000-chapter novel in one request would be a very large
    // body; the unique (book_id, revision, chapter_number) key makes it idempotent.
    async upsertChapters(bookId, revision, chapters, { chunkSize = 500 } = {}) {
      if (!Array.isArray(chapters) || !chapters.length) return 0;

      // Deduplicate chapters by chapter_number within the batch to prevent Postgres Error 21000
      // ("ON CONFLICT DO UPDATE command cannot affect row a second time")
      const seen = new Map();
      for (const chapter of chapters) {
        if (!chapter) continue;
        const num = Number(chapter.chapterNumber ?? chapter.chapter_number);
        if (!Number.isFinite(num)) continue;
        seen.set(num, chapter);
      }
      const uniqueChapters = Array.from(seen.values()).sort(
        (a, b) => (Number(a.chapterNumber ?? a.chapter_number) || 0) - (Number(b.chapterNumber ?? b.chapter_number) || 0)
      );

      let written = 0;
      for (let i = 0; i < uniqueChapters.length; i += chunkSize) {
        const slice = uniqueChapters.slice(i, i + chunkSize).map((chapter) => ({
          book_id: bookId,
          revision,
          chapter_number: Number(chapter.chapterNumber ?? chapter.chapter_number),
          title: chapter.title || "",
          translation_status: chapter.translationStatus || chapter.translation_status || "pending",
          characters: chapter.characters || 0
        }));
        await request("chapters", {
          method: "POST",
          // on_conflict is required, not decorative: the table's primary key is a
          // surrogate bigserial, so merge-duplicates alone resolves against `id`
          // and every re-sync raised a 409 on chapters_unique instead of updating
          // the row. Chapter statuses therefore never advanced past the first
          // insert.
          query: "?on_conflict=book_id,revision,chapter_number",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: slice
        });
        written += slice.length;
      }
      return written;
    },

    // ---- catalogue reads ----------------------------------------------
    async listBooks({ limit = 24, offset = 0, genre = "", search = "", order = "updated_at.desc" } = {}) {
      const categorySelect = genre
        ? "book_categories!inner(categories!inner(slug,name))"
        : "book_categories(categories(slug,name))";
      const params = new URLSearchParams({
        // book_categories is embedded rather than joined by hand: the books table
        // has no genre column, so this is where a book's category comes from, and
        // without it the reader's category filter had nothing to populate.
        select:
          `id,title,author,description,cover_url,status,total_chapters,translated_chapters,revision,featured,updated_at,${categorySelect}`,
        published: "eq.true",
        order,
        limit: String(limit),
        offset: String(offset)
      });
      if (genre) {
        params.set("book_categories.categories.slug", `eq.${genre}`);
      }
      if (search) {
        // Trigram index on (title || ' ' || author) backs this.
        params.set("or", `(title.ilike.*${search}*,author.ilike.*${search}*)`);
      }
      return request("books", { query: `?${params}` });
    },

    // ---- categories ----------------------------------------------------

    async upsertCategories(categories) {
      if (!Array.isArray(categories) || !categories.length) return [];
      const seen = new Map();
      for (const item of categories) {
        if (!item || !item.slug) continue;
        seen.set(item.slug, item);
      }
      const unique = Array.from(seen.values());
      return request("categories", {
        method: "POST",
        query: "?on_conflict=slug",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: unique.map((item) => ({ slug: item.slug, name: item.name, source_id: item.sourceId ?? null }))
      });
    },

    async listCategories() {
      return request("categories", { query: "?select=id,slug,name,source_id&order=name.asc" });
    },

    // One category per book is all the reader needs, so an existing link is
    // replaced rather than added to.
    async setBookCategory(bookId, categoryId) {
      await request("book_categories", {
        method: "DELETE",
        query: `?book_id=eq.${encodeURIComponent(bookId)}`
      });
      if (!categoryId) return null;
      return request("book_categories", {
        method: "POST",
        query: "?on_conflict=book_id,category_id",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: [{ book_id: bookId, category_id: categoryId }]
      });
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
    },

    async readTopBooks({ limit = 10 } = {}) {
      try {
        const rows = await request("analytics_book_totals", {
          query: `?select=book_id,reads&order=reads.desc&limit=${Math.max(1, Math.min(100, Number(limit) || 10))}`
        });
        return (rows || []).map((row) => ({ bookId: row.book_id, reads: Number(row.reads) || 0 }));
      } catch {
        // Rolling-deploy fallback until migration 0005 creates the aggregate view.
        try {
          const rows = await request("analytics_events", {
            query: "?select=book_id&event_type=eq.read&book_id=not.is.null&limit=2000"
          });
          const counts = {};
          for (const row of rows || []) {
            if (row.book_id) counts[row.book_id] = (counts[row.book_id] || 0) + 1;
          }
          return Object.entries(counts)
            .map(([bookId, reads]) => ({ bookId, reads }))
            .sort((a, b) => b.reads - a.reads)
            .slice(0, limit);
        } catch {
          return [];
        }
      }
    },

    async readUserBookmarkCount() {
      try {
        const response = await fetch(`${url}/rest/v1/user_bookmarks?select=book_id`, {
          method: "HEAD",
          headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) return 0;
        return Number((response.headers.get("content-range") || "").split("/")[1]) || 0;
      } catch {
        return 0;
      }
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
    total_chapters: book.totalChapters ?? book.total_chapters ?? 0,
    translated_chapters: book.translatedChapters ?? book.translated_chapters ?? 0,
    revision: book.revision ?? 1,
    source: book.source || "admin",
    source_id: book.sourceId ?? book.source_id ?? null,
    source_url: book.sourceUrl ?? book.source_url ?? null,
    featured: Boolean(book.featured),
    published: book.published !== false,
    last_crawled_at: book.lastCrawledAt ?? book.last_crawled_at ?? null
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
    upsertChapters: (bookId, revision, chapters) => client.upsertChapters(bookId, revision, chapters),
    // Best effort: a book with no recognised category is simply uncategorised, and
    // failing to record that must never fail an ingest that otherwise worked.
    async linkCategory(bookId, genreLabel) {
      const slug = categorySlugForLabel(genreLabel);
      if (!slug) return null;
      const definition = CATEGORY_DEFINITIONS[slug];
      const [row] = await client.upsertCategories([
        { slug, name: definition.label, sourceId: definition.categoryIds?.[0] ?? null }
      ]);
      if (!row?.id) return null;
      return client.setBookCategory(bookId, row.id);
    }
  };
}

module.exports = { createSupabase, createMetadataStore, hasSupabase, toBookRow };
