"use strict";

const { readCatalog } = require("../../server/library-catalog");
const { CATEGORY_DEFINITIONS, isCrawlerRequest, readCrawlerConfig } = require("../../server/crawler-store");
const { methodNotAllowed, noStore } = require("../../server/http");

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  if (!isCrawlerRequest(req)) return res.status(401).json({ error: "Crawler token không hợp lệ." });
  try {
    const [config, catalog] = await Promise.all([readCrawlerConfig(), readCatalog()]);
    return res.status(200).json({ config, categories: CATEGORY_DEFINITIONS, catalog });
  } catch (error) {
    console.error("Crawler control error:", error.message);
    return res.status(500).json({ error: "Không thể đọc cấu hình crawler." });
  }
};
