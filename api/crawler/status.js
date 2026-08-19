"use strict";

const { isCrawlerRequest, writeCrawlerStatus } = require("../../server/crawler-store");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  if (!(await isCrawlerRequest(req))) return res.status(401).json({ error: "Crawler token không hợp lệ." });
  try {
    const status = await writeCrawlerStatus(await readJsonBody(req, 16 * 1024));
    return res.status(200).json({ status });
  } catch (error) {
    console.error("Crawler status error:", error.message);
    return res.status(400).json({ error: "Không thể cập nhật trạng thái crawler." });
  }
};
