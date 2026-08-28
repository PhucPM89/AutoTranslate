"use strict";

const fs = require("fs");
const path = require("path");

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

const ROOT = path.join(__dirname, "..");
const env = {
  ...parseEnvFile(path.join(ROOT, ".env")),
  ...parseEnvFile(path.join(ROOT, ".env.local")),
  ...process.env
};

const { createStorage } = require("../server/storage/index");
const { buildBookIndex } = require("../server/ingest/documents");

async function syncTagsFromChapterDocs() {
  const storage = createStorage(env);
  const bookId = "fanqie-7373165433928567832"; // Địa Phủ Xuất Hiện Một Thái Tử Gia

  console.log(`Đang đồng bộ tag từ các file chapter document của bộ [${bookId}]...`);
  const indexRaw = await storage.get(`books/${bookId}/index.json`);
  if (!indexRaw) return;
  const index = JSON.parse(indexRaw.toString("utf8"));

  let geminiCount = 0;
  let hachimiCount = 0;

  for (let idx = 0; idx < index.chapters.length; idx++) {
    const ch = index.chapters[idx];
    const chNum = ch.n || (idx + 1);

    // Read chapter doc if completed
    if (ch.status === "completed" || ch.translationStatus === "completed") {
      const chDocRaw = await storage.get(`books/${bookId}/r1/ch/${chNum}.json`).catch(() => null);
      if (chDocRaw) {
        const chDoc = JSON.parse(chDocRaw.toString("utf8"));
        if (chDoc.provider === "gemini") {
          ch.provider = "gemini";
          ch.model = chDoc.model || "gemini-3.6-flash";
          ch.qaReviewed = true;
          geminiCount++;
        } else {
          ch.provider = chDoc.provider || "hachimi";
          ch.model = chDoc.model || "HachimiMT-60-QT";
          hachimiCount++;
        }
      }
    }
  }

  index.updatedAt = new Date().toISOString();
  await storage.put(`books/${bookId}/index.json`, JSON.stringify(buildBookIndex({
    book: index,
    revision: index.revision || 1,
    chapters: index.chapters
  })));

  console.log(`✅ Hoàn tất! Đã đồng bộ [${index.title}]: Gemini = ${geminiCount} chương, Hachimi = ${hachimiCount} chương.`);
}

syncTagsFromChapterDocs().catch(console.error);
