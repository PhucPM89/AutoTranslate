"use strict";

const { readCatalog } = require("../../server/library-catalog");
const { translateMetadata } = require("../../server/gemini");
const { CATEGORY_DEFINITIONS, isCrawlerRequest, readCrawlerConfig, readCrawlerStatus } = require("../../server/crawler-store");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");

module.exports = async function handler(req, res) {
  noStore(res);
  if (!["GET", "POST"].includes(req.method)) return methodNotAllowed(res, "GET, POST");
  if (!(await isCrawlerRequest(req))) return res.status(401).json({ error: "Crawler token không hợp lệ." });
  try {
    if (req.method === "POST") {
      if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "Server chưa có GEMINI_API_KEY." });
      const metadata = await readJsonBody(req, 16 * 1024);
      return res.status(200).json(await translateMetadata(metadata, process.env.GEMINI_API_KEY));
    }
    // The previous status travels with the config so the worker can resume a book
    // that an earlier run left half-downloaded instead of starting a different one.
    const [config, catalog, status] = await Promise.all([readCrawlerConfig(), readCatalog(), readCrawlerStatus()]);
    return res.status(200).json({ config, categories: CATEGORY_DEFINITIONS, catalog, status });
  } catch (error) {
    console.error("Crawler control error:", error.message);
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({ error: req.method === "POST" ? `Không thể dịch metadata: ${error.message}` : "Không thể đọc cấu hình crawler." });
  }
};
