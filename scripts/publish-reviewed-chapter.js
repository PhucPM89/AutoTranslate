"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const envName of [".env.local", ".env"]) {
  const envPath = path.join(ROOT, envName);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

const { createStorage } = require("../server/storage");
const { syncCompletedChapter } = require("../server/ingest/chapter-progress");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function main() {
  const bookId = process.argv[2];
  const chapterNumber = Number(process.argv[3]);
  const candidatePath = path.resolve(process.argv[4] || "");
  if (!bookId || !Number.isInteger(chapterNumber) || chapterNumber < 1 || !candidatePath) {
    throw new Error("Usage: node scripts/publish-reviewed-chapter.js <bookId> <chapterNumber> <candidate.txt>");
  }

  const candidate = fs.readFileSync(candidatePath, "utf8").replace(/^\uFEFF/, "").trim();
  const [titleLine, ...bodyLines] = candidate.split(/\r?\n/);
  const content = bodyLines.join("\n").trim();
  if (!titleLine.trim() || /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(titleLine) || content.length < 300) {
    throw new Error("Candidate phải có tiêu đề ở dòng đầu và nội dung hợp lệ.");
  }

  const storage = createStorage(process.env);
  const key = `books/${bookId}/r1/ch/${chapterNumber}.json`;
  const [head, raw] = await Promise.all([storage.head(key), storage.get(key)]);
  if (!head?.etag || !raw) throw new Error(`Không tìm thấy bản live: ${key}`);
  const existing = JSON.parse(raw.toString("utf8"));

  const backupDir = path.join(ROOT, "scratch", "ranh-gioi-hoang-hon", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `chapter-${chapterNumber}.${stamp}.${sha256(raw).slice(0, 12)}.json`);
  fs.writeFileSync(backupPath, raw);

  const now = new Date().toISOString();
  const updated = {
    ...existing,
    title: titleLine.trim(),
    content,
    translationStatus: "completed",
    characters: content.length,
    provider: "agent",
    model: "codex-direct-review",
    updatedAt: now,
    manualEdited: true,
    review: {
      method: "direct-agent-bilingual-review",
      source: `books/${bookId}/r1/ch/${chapterNumber}.original.json`,
      reviewedAt: now,
      candidateSha256: sha256(candidate)
    }
  };

  await storage.put(key, JSON.stringify(updated, null, 2), {
    contentType: "application/json; charset=utf-8",
    cacheControl: "public, max-age=60, stale-while-revalidate=600",
    ifMatch: head.etag
  });
  await syncCompletedChapter({
    storage,
    bookId,
    revision: Number(existing.revision || 1),
    chapterNumber,
    title: updated.title,
    provider: updated.provider,
    model: updated.model,
    manualEdited: true
  });

  const verifiedRaw = await storage.get(key);
  const verified = JSON.parse(verifiedRaw.toString("utf8"));
  if (verified.title !== updated.title || verified.content !== updated.content) {
    throw new Error("Read-back verification failed after publish.");
  }
  console.log(JSON.stringify({
    ok: true,
    key,
    title: verified.title,
    characters: verified.content.length,
    contentSha256: sha256(verified.content),
    backupPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
