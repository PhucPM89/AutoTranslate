const { readCatalog } = require("../server/library-catalog");
const { methodNotAllowed } = require("../server/http");

// The catalog only changes when the owner uploads or the crawler publishes, so
// the CDN answers most visitors and the function (plus its Blob reads) is spared.
const CATALOG_CDN_CACHE = "public, max-age=0, s-maxage=120, stale-while-revalidate=86400";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const catalog = await readCatalog();
    const body = JSON.stringify(catalog);
    res.setHeader("Cache-Control", CATALOG_CDN_CACHE);
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    const etag = `W/"${Buffer.byteLength(body)}-${hash(body)}"`;
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) return res.status(304).end();

    return res.status(200).send(body);
  } catch (error) {
    console.error(error);
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({ error: "Không thể tải thư viện." });
  }
};

function hash(value) {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result * 33) ^ value.charCodeAt(index)) >>> 0;
  }
  return result.toString(36);
}
