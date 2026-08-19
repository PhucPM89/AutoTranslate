"use strict";

const { isAdmin, isSameOrigin } = require("../server/admin-auth");
const { recordEvent, readAnalytics, summarizeAnalytics, cleanBookId } = require("../server/analytics-store");
const { readCatalog } = require("../server/library-catalog");
const { readJsonBody, methodNotAllowed, noStore } = require("../server/http");

// One function serves both sides of the same resource, because the Hobby plan
// allows only 12 serverless functions per deployment:
//   POST -> public, anonymous beacon from a reader's browser
//   GET  -> the admin panel reading the aggregated figures
module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method === "POST") return recordBeacon(req, res);
  if (req.method === "GET") return readSummary(req, res);
  return methodNotAllowed(res, "GET, POST");
};

// The client only beacons once per browser session and once per book opened, so
// this stays a couple of invocations per visitor rather than one per pageview.
// No IP, cookie or fingerprint is stored: the counters are anonymous.
async function recordBeacon(req, res) {
  try {
    const body = await readJsonBody(req, 2 * 1024);
    const type = body?.type === "read" ? "read" : body?.type === "visit" ? "visit" : "";
    if (!type) return res.status(400).json({ error: "Loại sự kiện không hợp lệ." });

    await recordEvent({ type, bookId: cleanBookId(body?.bookId) });
    return res.status(204).end();
  } catch (error) {
    // A failed beacon must never surface to a reader, so this always answers 204.
    console.error("Analytics beacon error:", error.message);
    return res.status(204).end();
  }
}

async function readSummary(req, res) {
  if (!isSameOrigin(req) || !isAdmin(req)) return res.status(401).json({ error: "Phiên quản trị đã hết hạn." });

  try {
    const [analytics, catalog] = await Promise.all([readAnalytics(), readCatalog()]);
    const summary = summarizeAnalytics(analytics);
    // Titles live in the catalog, so the analytics blob only ever stores book ids.
    const titles = new Map((catalog.books || []).map((book) => [book.id, book.title]));

    return res.status(200).json({
      ...summary,
      topBooks: summary.topBooks.map((book) => ({
        ...book,
        title: titles.get(book.bookId) || book.bookId
      })),
      storageReady: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
    });
  } catch (error) {
    console.error("Analytics admin error:", error.message);
    return res.status(500).json({ error: "Không thể đọc số liệu truy cập." });
  }
}
