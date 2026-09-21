"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadEnv(path.join(__dirname, "..", ".env.local"));
loadEnv(path.join(__dirname, "..", ".env"));

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

  // Handle /api/admin/audio locally
  if (pathname.startsWith("/api/admin/audio")) {
    const { handleAdminAudio } = require("../server/audio/admin-router");
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        const bodyBuf = Buffer.concat(chunks);
        const webReq = new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
          method: req.method,
          headers: req.headers,
          body: ["POST", "PUT", "PATCH"].includes(req.method) ? bodyBuf : undefined,
          duplex: "half"
        });
        const webRes = await handleAdminAudio({
          request: webReq,
          env: process.env,
          path: pathname,
          requireAdmin: async () => {}, // local dev pass-through
          readJson: async () => (bodyBuf.length ? JSON.parse(bodyBuf.toString("utf8")) : {})
        });
        const resHeaders = Object.fromEntries(webRes.headers.entries());
        resHeaders["access-control-allow-origin"] = "*";
        res.writeHead(webRes.status, resHeaders);
        const resBuf = Buffer.from(await webRes.arrayBuffer());
        res.end(resBuf);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Proxy /api/reader/audio from Google Drive with byte-range and CORS headers
  if (pathname === "/api/reader/audio") {
    const fileId = urlObj.searchParams.get("fileId") || "";
    const rawUrl = urlObj.searchParams.get("url") || "";
    let driveUrl = "";
    if (fileId && /^[A-Za-z0-9_-]{10,100}$/.test(fileId)) {
      driveUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
    } else if (rawUrl && /^https:\/\/(drive\.google\.com|drive\.usercontent\.google\.com)/.test(rawUrl)) {
      driveUrl = rawUrl;
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Thiếu fileId hoặc url" }));
      return;
    }

    fetch(driveUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...(req.headers.range ? { Range: req.headers.range } : {})
      }
    })
      .then(async (driveRes) => {
        res.writeHead(driveRes.status === 206 ? 206 : 200, {
          "Content-Type": "audio/mpeg",
          "Access-Control-Allow-Origin": "*",
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
          ...(driveRes.headers.get("content-range") ? { "Content-Range": driveRes.headers.get("content-range") } : {}),
          ...(driveRes.headers.get("content-length") ? { "Content-Length": driveRes.headers.get("content-length") } : {})
        });

        const reader = driveRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      })
      .catch((err) => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
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

  // Proxy /api/reader/tts to live API so local dev server can play audio
  if (pathname === "/api/reader/tts") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      fetch("https://tram-chu.online/api/reader/tts", {
        method: "POST",
        headers: {
          "Content-Type": req.headers["content-type"] || "application/json",
          "Origin": "https://tram-chu.online"
        },
        body: Buffer.concat(chunks)
      })
        .then(async (apiRes) => {
          res.writeHead(apiRes.status, {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": apiRes.headers.get("content-type") || "audio/mpeg"
          });
          const buf = Buffer.from(await apiRes.arrayBuffer());
          res.end(buf);
        })
        .catch((err) => {
          res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ error: "TTS Proxy Error: " + err.message }));
        });
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
      "Cache-Control": "no-cache, no-store, must-revalidate"
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n  🚀 Trạm Chữ Spatial 3D Dev Server running at: http://localhost:${PORT}/\n`);
});

