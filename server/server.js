const path = require("path");
const fs = require("fs");
const express = require("express");
const { translateText } = require("./gemini");

loadLocalEnv(path.join(__dirname, "..", ".env"));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "8mb" }));

const publicDir = path.join(__dirname, "..", "public");
const jszipPath = path.join(__dirname, "..", "node_modules", "jszip", "dist", "jszip.min.js");

app.get("/vendor/jszip.min.js", (_req, res) => {
  res.sendFile(jszipPath);
});

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
