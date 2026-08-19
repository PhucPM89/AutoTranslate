const { readCatalog } = require("../server/library-catalog");
const { methodNotAllowed } = require("../server/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const catalog = await readCatalog();
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.status(200).json(catalog);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Không thể tải thư viện." });
  }
};
