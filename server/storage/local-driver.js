"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { cacheControlFor, contentTypeFor } = require("./keys");

// Filesystem stand-in for R2. Metadata that R2 would hold as object headers is
// kept in a sidecar `.meta.json` so behaviour matches the real driver.
function createLocalStorage(env = process.env) {
  const root = path.resolve(env.LOCAL_STORAGE_DIR || ".storage");
  const publicBase = (env.LOCAL_PUBLIC_BASE_URL || "/local-cdn").replace(/\/$/, "");

  const full = (key) => {
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      throw new Error(`Path traversal detected: ${key}`);
    }
    return resolved;
  };
  const metaPath = (key) => `${full(key)}.meta.json`;

  return {
    driver: "local",

    async put(key, body, options = {}) {
      const target = full(key);
      if (options.ifNoneMatch === "*" && fs.existsSync(target)) {
        const error = new Error(`Local PUT ${key} lỗi HTTP 412: object đã tồn tại.`);
        error.status = 412;
        throw error;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
      fs.writeFileSync(target, buffer);
      fs.writeFileSync(
        metaPath(key),
        JSON.stringify({
          contentType: options.contentType || contentTypeFor(key),
          cacheControl: options.cacheControl || cacheControlFor(key),
          size: buffer.length,
          uploadedAt: new Date().toISOString()
        })
      );
      return { key, size: buffer.length, url: this.publicUrl(key) };
    },

    async get(key) {
      try {
        return fs.readFileSync(full(key));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },

    async head(key) {
      try {
        const stat = fs.statSync(full(key));
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(metaPath(key), "utf8")); } catch {}
        const etag = `"${crypto.createHash("sha256").update(fs.readFileSync(full(key))).digest("hex")}"`;
        return { key, size: stat.size, etag, ...meta };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },

    async list(prefix = "") {
      const start = full(prefix);
      const base = fs.existsSync(start) && fs.statSync(start).isDirectory() ? start : path.dirname(start);
      if (!fs.existsSync(base)) return [];
      const out = [];
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(p);
          else if (!entry.name.endsWith(".meta.json")) {
            const key = path.relative(root, p).split(path.sep).join("/");
            if (key.startsWith(prefix)) out.push({ key, size: fs.statSync(p).size });
          }
        }
      };
      walk(base);
      return out.sort((a, b) => a.key.localeCompare(b.key));
    },

    async remove(key, options = {}) {
      if (options.ifMatch) {
        const current = await this.head(key);
        if (current && current.etag !== options.ifMatch) {
          const error = new Error(`Local DELETE ${key} lỗi HTTP 412: ETag không khớp.`);
          error.status = 412;
          throw error;
        }
      }
      for (const p of [full(key), metaPath(key)]) {
        try { fs.unlinkSync(p); } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      return true;
    },

    async removeMany(keys) {
      let removed = 0;
      for (const key of [...new Set((keys || []).filter(Boolean))]) {
        await this.remove(key);
        removed += 1;
      }
      return removed;
    },

    publicUrl(key) {
      return `${publicBase}/${key}`;
    }
  };
}

module.exports = { createLocalStorage };
