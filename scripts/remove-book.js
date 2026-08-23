"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage, createArchiveStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { createCrawlerState } = require("../server/crawler-state");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");
const { readTranslationConfig, writeTranslationConfig } = require("../server/translation-config");

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || "") : "";
};

async function removePrefix(storage, prefix) {
  const objects = await storage.list(prefix);
  for (let index = 0; index < objects.length; index += 20) {
    await Promise.all(objects.slice(index, index + 20).map((object) => storage.remove(object.key)));
  }
  return objects.length;
}

async function main() {
  const bookId = option("--book");
  const expectedTitle = option("--expect-title");
  const confirmed = args.includes("--confirm");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(bookId)) {
    throw new Error("Cần --book với bookId hợp lệ.");
  }

  const storage = createStorage();
  const indexRaw = await storage.get(`books/${bookId}/index.json`);
  const index = indexRaw ? JSON.parse(indexRaw.toString("utf8")) : null;
  const title = index?.title || "";
  if (expectedTitle && title !== expectedTitle) {
    throw new Error(`Dừng xóa: title thực tế ${JSON.stringify(title)} không khớp ${JSON.stringify(expectedTitle)}.`);
  }

  const targets = await Promise.all([
    storage.list(`books/${bookId}/`),
    storage.list(`jobs/${bookId}/`)
  ]);
  console.log(`Mục tiêu: ${title || bookId} (${bookId}), ${targets[0].length} object sách, ${targets[1].length} object job.`);
  if (!confirmed) {
    console.log("Chỉ kiểm tra. Thêm --confirm để xóa vĩnh viễn.");
    return;
  }

  let removed = 0;
  removed += await removePrefix(storage, `books/${bookId}/`);
  removed += await removePrefix(storage, `jobs/${bookId}/`);
  for (const extension of ["jpg", "jpeg", "png", "webp"]) {
    const key = `covers/${bookId}.${extension}`;
    if (await storage.head(key)) {
      await storage.remove(key);
      removed += 1;
    }
  }

  const translationConfig = await readTranslationConfig(storage);
  if (translationConfig.focusBookId === bookId) {
    await writeTranslationConfig(storage, { focusBookId: "" });
  }

  const archive = createArchiveStorage();
  if (archive) removed += await removePrefix(archive, `archives/${bookId}`);

  const db = createSupabase();
  if (db) {
    await db.request("chapters", { method: "DELETE", query: `?book_id=eq.${encodeURIComponent(bookId)}` });
    await db.request("book_categories", { method: "DELETE", query: `?book_id=eq.${encodeURIComponent(bookId)}` });
    await db.request("books", { method: "DELETE", query: `?id=eq.${encodeURIComponent(bookId)}` });
  }

  if (archive && /^fanqie-(\d{10,30})$/.test(bookId)) {
    const sourceId = bookId.replace(/^fanqie-/, "");
    const crawler = createCrawlerState({ storage: archive, readerStorage: storage, db: db || false });
    const config = await crawler.readConfig();
    await crawler.writeConfig({
      excludedSourceIds: [...new Set([...(config.excludedSourceIds || []), sourceId])]
    });
  }

  await publishCatalogSnapshot({ storage, env: process.env });
  console.log(`Đã xóa vĩnh viễn ${title || bookId}: ${removed} object R2 và dữ liệu Supabase liên quan.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
