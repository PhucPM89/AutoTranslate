"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createSupabase } = require("./supabase");

test("security migration binds community writes to authenticated readers", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "supabase", "migrations", "0005_security_hardening.sql"),
    "utf8"
  );
  assert.match(sql, /auth\.uid\(\)\)::text = id/);
  assert.match(sql, /paragraph_comments_insert[\s\S]*to authenticated/);
  assert.match(sql, /glossary_suggestions_insert[\s\S]*to authenticated/);
  assert.match(sql, /revoke all on analytics_daily from anon, authenticated/);
});

// The PostgREST calls are checked by intercepting fetch. These assertions exist
// because a wrong upsert here fails at runtime as an HTTP 409 that the callers
// deliberately swallow, so it can go unnoticed for a long time.
function withFakeFetch(handler, run) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options) || new Response(null, { status: 204 });
  };
  return Promise.resolve(run(calls)).finally(() => {
    global.fetch = original;
  });
}

const ENV = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-key" };

test("chapter upsert names the conflict target explicitly", () =>
  withFakeFetch(
    () => new Response(null, { status: 204 }),
    async (calls) => {
      const db = createSupabase(ENV);
      await db.upsertChapters("book-1", 2, [{ chapterNumber: 1, title: "Một", translationStatus: "completed" }]);

      assert.equal(calls.length, 1);
      const { url, options } = calls[0];
      // The table's primary key is a surrogate bigserial, so merge-duplicates on
      // its own resolves against `id` and collides with chapters_unique.
      assert.ok(
        url.includes("on_conflict=book_id,revision,chapter_number"),
        `thiếu on_conflict trong ${url}`
      );
      assert.match(options.headers.Prefer, /resolution=merge-duplicates/);
      const body = JSON.parse(options.body);
      assert.deepEqual(body, [
        { book_id: "book-1", revision: 2, chapter_number: 1, title: "Một", translation_status: "completed", characters: 0 }
      ]);
    }
  ));

test("chapter upsert chunks large books instead of sending one huge body", () =>
  withFakeFetch(
    () => new Response(null, { status: 204 }),
    async (calls) => {
      const db = createSupabase(ENV);
      const chapters = Array.from({ length: 1201 }, (_, index) => ({
        chapterNumber: index + 1,
        title: `Chương ${index + 1}`,
        translationStatus: "pending"
      }));
      const written = await db.upsertChapters("book-1", 1, chapters);

      assert.equal(written, 1201);
      assert.equal(calls.length, 3, "500 + 500 + 201");
      assert.equal(JSON.parse(calls[2].options.body).length, 201);
      for (const call of calls) assert.ok(call.url.includes("on_conflict="));
    }
  ));

test("an analytics insert asks for nothing back", () =>
  withFakeFetch(
    () => new Response(null, { status: 204 }),
    async (calls) => {
      const db = createSupabase(ENV);
      await db.insertAnalyticsEvent({ type: "visit", bookId: "", sessionId: "abc" });
      assert.match(calls[0].options.headers.Prefer, /return=minimal/);
    }
  ));

test("top-book analytics uses the aggregate view instead of downloading raw events", () =>
  withFakeFetch(
    () => new Response(JSON.stringify([{ book_id: "book-1", reads: 42 }]), {
      status: 200,
      headers: { "content-type": "application/json" }
    }),
    async (calls) => {
      const rows = await createSupabase(ENV).readTopBooks({ limit: 5 });
      assert.deepEqual(rows, [{ bookId: "book-1", reads: 42 }]);
      assert.match(calls[0].url, /analytics_book_totals/);
      assert.doesNotMatch(calls[0].url, /analytics_events/);
    }
  ));

test("bookmark statistics uses an exact HEAD count with no row payload", () =>
  withFakeFetch(
    (_url, options) => new Response(null, {
      status: 200,
      headers: { "content-range": "0-0/2345" }
    }),
    async (calls) => {
      const count = await createSupabase(ENV).readUserBookmarkCount();
      assert.equal(count, 2345);
      assert.equal(calls[0].options.method, "HEAD");
      assert.equal(calls[0].options.headers.Prefer, "count=exact");
    }
  ));

test("a failed request reports the status without echoing the key", () =>
  withFakeFetch(
    () => new Response("permission denied", { status: 403 }),
    async () => {
      const db = createSupabase(ENV);
      await assert.rejects(
        () => db.upsertBook({ id: "book-1", title: "T" }),
        (error) => {
          assert.equal(error.status, 403);
          assert.ok(!error.message.includes("service-key"), "thông báo lỗi không được chứa key");
          return true;
        }
      );
    }
  ));
