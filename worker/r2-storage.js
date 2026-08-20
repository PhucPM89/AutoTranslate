// Adapts a Cloudflare R2 binding to the same interface the server storage
// drivers expose (put/get/head/list/remove).
//
// The point is reuse: with this, the Worker runs server/crawler-state.js and
// server/ingest/catalog-snapshot.js unchanged instead of growing a second
// implementation of each. A binding is also cheaper and simpler than SigV4 from
// inside Cloudflare - the only thing it cannot do is presign, which is why
// server/storage/r2-presign.js is still used for uploads.

const { cacheControlFor, contentTypeFor } = require("../server/storage/keys");

function createR2BindingStorage(bucket, { publicBase = "" } = {}) {
  if (!bucket) throw new Error("Thiếu R2 binding.");
  const base = String(publicBase || "").replace(/\/$/, "");

  return {
    async put(key, body, options = {}) {
      await bucket.put(key, body, {
        httpMetadata: {
          contentType: options.contentType || contentTypeFor(key),
          // Derived from the key, exactly as the S3 driver does it, so an object
          // written from here gets the same cache policy as one written by ingest.
          cacheControl: options.cacheControl || cacheControlFor(key)
        }
      });
      return base ? `${base}/${key}` : "";
    },

    async get(key) {
      const object = await bucket.get(key);
      if (!object) throw new Error(`Không tìm thấy ${key}.`);
      return Buffer.from(await object.arrayBuffer());
    },

    async head(key) {
      return Boolean(await bucket.head(key));
    },

    async list(prefix = "") {
      const results = [];
      let cursor;
      // R2 pages at 1000 keys; the catalogue rebuild walks every book index, so
      // stopping at the first page would silently truncate the catalogue.
      do {
        const page = await bucket.list({ prefix, cursor });
        for (const object of page.objects) {
          results.push({ key: object.key, size: object.size, uploadedAt: object.uploaded, etag: object.etag });
        }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return results;
    },

    async remove(key) {
      await bucket.delete(key);
    },

    publicUrl(key) {
      if (!base) throw new Error("Chưa cấu hình R2_PUBLIC_BASE_URL.");
      return `${base}/${key}`;
    }
  };
}

module.exports = { createR2BindingStorage };
