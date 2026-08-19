"use strict";

const { isAdmin, isSameOrigin } = require("../../server/admin-auth");
const {
  CATEGORY_DEFINITIONS,
  readCrawlerConfig,
  writeCrawlerConfig,
  readCrawlerStatus
} = require("../../server/crawler-store");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");

module.exports = async function handler(req, res) {
  noStore(res);
  if (!isSameOrigin(req) || !isAdmin(req)) return res.status(401).json({ error: "Phiên quản trị đã hết hạn." });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: "Vercel Blob chưa được kết nối." });

  try {
    if (req.method === "GET") return res.status(200).json(await responsePayload());
    if (req.method === "POST") {
      const body = await readJsonBody(req, 16 * 1024);
      const current = await readCrawlerConfig();
      await writeCrawlerConfig({ ...body, excludedSourceIds: current.excludedSourceIds });
      return res.status(200).json(await responsePayload());
    }
    return methodNotAllowed(res, "GET, POST");
  } catch (error) {
    console.error("Crawler admin error:", error.message);
    return res.status(error.status || 400).json({ error: "Không thể lưu cấu hình crawler." });
  }
};

async function responsePayload() {
  const [config, status] = await Promise.all([readCrawlerConfig(), readCrawlerStatus()]);
  return {
    config,
    status,
    categories: CATEGORY_DEFINITIONS,
    workerReady: Boolean(process.env.CRAWLER_SECRET)
  };
}
