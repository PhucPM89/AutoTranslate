"use strict";

const { handleUpload } = require("@vercel/blob/client");
const { isCrawlerRequest } = require("../../server/crawler-store");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");

const KINDS = {
  epub: { prefix: "library/books/", extensions: [".epub"], maximumSizeInBytes: 200 * 1024 * 1024, allowedContentTypes: ["application/epub+zip", "application/octet-stream"] },
  cover: { prefix: "library/covers/", extensions: [".jpg", ".png", ".webp"], maximumSizeInBytes: 5 * 1024 * 1024, allowedContentTypes: ["image/jpeg", "image/png", "image/webp"] }
};

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: "Vercel Blob chưa được kết nối." });
  try {
    const body = await readJsonBody(req, 64 * 1024);
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!(await isCrawlerRequest(req))) throw new Error("Crawler token không hợp lệ.");
        const kind = JSON.parse(clientPayload || "{}").kind;
        const rule = KINDS[kind];
        const lower = pathname.toLowerCase();
        if (!rule || !pathname.startsWith(rule.prefix) || pathname.includes("..") || pathname.includes("\\") || !rule.extensions.some((extension) => lower.endsWith(extension))) throw new Error("File crawler không hợp lệ.");
        return {
          allowedContentTypes: rule.allowedContentTypes,
          maximumSizeInBytes: rule.maximumSizeInBytes,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + 30 * 60 * 1000,
          cacheControlMaxAge: 60 * 60 * 24 * 30
        };
      }
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Crawler upload error:", error.message);
    return res.status(/token/.test(error.message) ? 401 : 400).json({ error: "Không thể cấp quyền upload cho crawler." });
  }
};
