"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json"
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(urlObj.pathname);

  if (pathname === "/") pathname = "/index.html";

  const filePath = path.join(PUBLIC_DIR, pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  // Proxy /api/catalog or /catalog/latest.json to live CDN
  if (pathname === "/api/catalog" || pathname === "/catalog/latest.json") {
    fetch("https://cdn.tram-chu.online/catalog/latest.json")
      .then((cdnRes) => {
        if (!cdnRes.ok) {
          res.writeHead(cdnRes.status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ error: "CDN Catalog not available" }));
          return;
        }
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache"
        });
        const reader = cdnRes.body.getReader();
        function pump() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              res.end();
              return;
            }
            res.write(value);
            return pump();
          });
        }
        pump().catch(() => res.end());
      })
      .catch((err) => {
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ error: "Proxy Error: " + err.message }));
      });
    return;
  }

  // Proxy /covers/* with CORS so WebGL TextureLoader can load real book covers cleanly
  if (pathname.startsWith("/covers/")) {
    const filename = pathname.replace(/^\/covers\//, "");
    const cdnUrl = `https://cdn.tram-chu.online/covers/${encodeURIComponent(filename)}`;
    fetch(cdnUrl)
      .then((cdnRes) => {
        if (!cdnRes.ok) {
          res.writeHead(cdnRes.status, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
          res.end("Not Found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": cdnRes.headers.get("content-type") || "image/jpeg",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=31536000, immutable"
        });
        const reader = cdnRes.body.getReader();
        function pump() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              res.end();
              return;
            }
            res.write(value);
            return pump();
          });
        }
        pump().catch(() => res.end());
      })
      .catch((err) => {
        res.writeHead(502, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
        res.end("Proxy Error");
      });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA client routing
      const indexFile = path.join(PUBLIC_DIR, "index.html");
      fs.readFile(indexFile, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        } else {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable"
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🚀 Trạm Chữ Spatial 3D Dev Server running at: http://localhost:${PORT}/\n`);
});

