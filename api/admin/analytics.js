"use strict";

const { isAdmin, isSameOrigin } = require("../../server/admin-auth");
const { readAnalytics, summarizeAnalytics } = require("../../server/analytics-store");
const { readCatalog } = require("../../server/library-catalog");
const { methodNotAllowed, noStore } = require("../../server/http");

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
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
};
