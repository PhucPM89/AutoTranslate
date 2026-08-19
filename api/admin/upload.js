const { handleUpload } = require("@vercel/blob/client");
const { isAdmin, isSameOrigin } = require("../../server/admin-auth");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");

const KINDS = {
  epub: {
    prefix: "library/books/",
    extension: ".epub",
    maximumSizeInBytes: 200 * 1024 * 1024,
    allowedContentTypes: ["application/epub+zip", "application/octet-stream"]
  },
  cover: {
    prefix: "library/covers/",
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    maximumSizeInBytes: 5 * 1024 * 1024,
    allowedContentTypes: ["image/jpeg", "image/png", "image/webp"]
  }
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
        if (!isSameOrigin(req) || !isAdmin(req)) throw new Error("Không có quyền upload.");
        const kind = parseKind(clientPayload);
        const rule = KINDS[kind];
        validatePathname(pathname, rule);
        return {
          allowedContentTypes: rule.allowedContentTypes,
          maximumSizeInBytes: rule.maximumSizeInBytes,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + 30 * 60 * 1000,
          cacheControlMaxAge: 60 * 60 * 24 * 30,
          tokenPayload: JSON.stringify({ kind })
        };
      }
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Blob upload token error:", error.message);
    const status = /quyền/.test(error.message) ? 401 : 400;
    return res.status(status).json({ error: status === 401 ? "Phiên quản trị đã hết hạn." : "File upload không hợp lệ." });
  }
};

function parseKind(clientPayload) {
  try {
    const kind = JSON.parse(clientPayload || "{}").kind;
    if (KINDS[kind]) return kind;
  } catch {}
  throw new Error("Loại file không hợp lệ.");
}

function validatePathname(pathname, rule) {
  if (!pathname.startsWith(rule.prefix) || pathname.includes("..") || pathname.includes("\\")) throw new Error("Đường dẫn không hợp lệ.");
  const lower = pathname.toLowerCase();
  if (rule.extension && !lower.endsWith(rule.extension)) throw new Error("Sai định dạng EPUB.");
  if (rule.extensions && !rule.extensions.some((extension) => lower.endsWith(extension))) throw new Error("Sai định dạng ảnh.");
}
