const path = require("path");
const fs = require("fs");
const express = require("express");
const { translateText } = require("./gemini");

loadLocalEnv(path.join(__dirname, "..", ".env"));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "8mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// Mirrors the rewrites in vercel.json so local dev hits the same handlers.
const analyticsHandler = require("../api/analytics");
const adminSessionHandler = require("../api/admin/login");

app.all("/api/library", require("../api/library"));
app.all("/api/analytics", analyticsHandler);
app.all("/api/admin/analytics", analyticsHandler);
app.all("/api/admin/login", adminSessionHandler);
app.all("/api/admin/session", adminSessionHandler);
app.all("/api/admin/logout", (req, res) => {
  req.query = { ...(req.query || {}), action: "logout" };
  return adminSessionHandler(req, res);
});
app.all("/api/admin/upload", require("../api/admin/upload"));
app.all("/api/admin/catalog", require("../api/admin/catalog"));
app.all("/api/admin/crawler", require("../api/admin/crawler"));
app.all("/api/crawler/control", require("../api/crawler/control"));
app.all("/api/crawler/status", require("../api/crawler/status"));
app.all("/api/crawler/publish", require("../api/crawler/publish"));
app.all("/api/crawler/upload", require("../api/crawler/upload"));

// Dev-only CDN stand-in. When the local storage driver is in use, this serves
// .storage at the same path the reader expects from Cloudflare, so the CDN reader
// path can be exercised end to end without a public R2 domain. Production never
// hits this: Cloudflare serves those objects directly from R2.
const localStorageDir = path.resolve(process.env.LOCAL_STORAGE_DIR || ".storage");
if (fs.existsSync(localStorageDir)) {
  app.use(
    "/local-cdn",
    express.static(localStorageDir, {
      setHeaders: (res, filePath) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        // Normalise separators first: on Windows express hands back backslashes.
        const normalised = String(filePath).split("\\").join("/");
        if (/\/r\d+\/ch\//.test(normalised)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "public, max-age=60");
        }
      }
    })
  );
  console.log(`Local CDN stand-in: /local-cdn -> ${localStorageDir}`);
}

// `npm run build` writes the minified client plus vendor/jszip.min.js into public/.
const publicDir = path.join(__dirname, "..", "public");

app.use(express.static(publicDir));

app.post("/api/translate", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server chưa có GEMINI_API_KEY." });
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      return res.status(400).json({ error: "Thiếu nội dung chương cần dịch." });
    }

    const result = await translateText(text, apiKey);
    if (!result.translation) {
      return res.status(502).json({ error: "Gemini không trả về bản dịch." });
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
    res.status(status).json({ error: formatPublicError(error) });
  }
});

app.listen(PORT, () => {
  console.log(`EPUB Translator running at http://localhost:${PORT}`);
});

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function formatPublicError(error) {
  const modelNote = error.model ? ` (${error.model})` : "";
  const message = error.message || "Không rõ lỗi.";
  return `Không thể dịch chương lúc này${modelNote}: ${message}`;
}
