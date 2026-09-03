#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const { createStorage, LAYOUT } = require("../server/storage");
const { detectRawHanVietTranscription } = require("../server/translation-artifacts");

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const ONLY_BOOK = flag("--book", "");
const MAX_BOOKS = Number(flag("--max-books", "0"));
const MAX_CHAPTERS = Number(flag("--max-chapters", "0"));
const CONCURRENCY = Math.max(1, Number(flag("--concurrency", "25")));
const SAMPLE_LIMIT = Math.max(1, Number(flag("--samples", "8")));

const storage = createStorage();

const CHECKS = [
  {
    id: "han-leftover",
    label: "Còn chữ Hán trong nội dung dịch",
    regex: /\p{Script=Han}+/u
  },
  {
    id: "foreign-script",
    label: "Ký tự lạ ngoài Latin/Vietnamese",
    regex: /[\u0980-\u09ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\uac00-\ud7af]+/u
  },
  {
    id: "ui-artifact",
    label: "Dính chữ giao diện/code fence của AI",
    regex: /\b(?:Gemini said|Show code|Copy code|Here is the translation|Vietnamese translation)\b|```/iu
  },
  {
    id: "leading-label",
    label: "Dính nhãn Tiêu đề/Nội dung vào đầu chương",
    regex: /^\s*(?:#{1,3}\s*)?(?:Tiêu\s*đề|Nội\s*dung|Title|Content)\s*[:：]/imu
  },
  {
    id: "literal-gloss",
    label: "Dính gloss trong ngoặc kiểu Hán-Việt (term: nghĩa)",
    regex: /\b[\p{L}][\p{L}\s-]{1,36}\s*\((?:thân thể|làm việc|nghĩa là|tức là|ý là|body|work)[^)]{0,40}\)/iu
  },
  {
    id: "hv-family",
    label: "Từ xưng hô Hán-Việt còn sót",
    regex: /\b(?:Gia Gia|Nãi Nãi|Ba Ba|Mụ Mụ|Ca Ca|Tỷ Tỷ|Đệ Đệ|Muội Muội)\b/iu
  },
  {
    id: "hv-everyday-phrase",
    label: "Cụm Hán-Việt máy móc từng gặp",
    regex: /\b(?:hách phá đảm|tát thối tựu bào|thử thử thân thủ|hồi quá thần lai|nhất thanh bất hưởng|đả khai phòng môn|thủ chỉ vi vi nhất chiến|thần sắc bất định)\b/iu
  },
  {
    id: "horse-fall-residue",
    label: "Residue lỗi ngã ngựa bị dịch thành tôi/ta ngựa/mã",
    regex: /\b(?:tôi|ta)\s+(?:ngựa|mã)\b/iu
  }
];

function contextFor(text, index, length = 90) {
  const start = Math.max(0, index - length);
  const end = Math.min(text.length, index + length);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function repeatedParagraph(text) {
  const counts = new Map();
  for (const raw of String(text || "").split(/\n{2,}/)) {
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (normalized.length < 120) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  for (const [paragraph, count] of counts) {
    if (count >= 3) return { count, paragraph };
  }
  return null;
}

async function readJson(key) {
  const raw = await storage.get(key);
  if (!raw) return null;
  return JSON.parse(raw.toString("utf8"));
}

async function mapConcurrent(items, concurrency, fn) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

function addFinding(findings, id, sample) {
  const entry = findings.get(id) || { count: 0, samples: [] };
  entry.count += 1;
  if (entry.samples.length < SAMPLE_LIMIT) entry.samples.push(sample);
  findings.set(id, entry);
}

async function main() {
  const catalog = (await readJson(LAYOUT.catalogSnapshot())) || {};
  let books = catalog.books || [];
  if (ONLY_BOOK) books = books.filter((book) => book.id === ONLY_BOOK);
  if (MAX_BOOKS > 0) books = books.slice(0, MAX_BOOKS);

  const totals = { books: 0, chapters: 0 };
  const findings = new Map();

  console.log("Audit translation artifacts");
  console.log(`Books: ${books.length}${ONLY_BOOK ? ` (only ${ONLY_BOOK})` : ""}`);
  console.log(`Chapter concurrency: ${CONCURRENCY}`);

  for (const book of books) {
    const index = await readJson(LAYOUT.bookIndex(book.id));
    if (!index) continue;
    totals.books += 1;
    const revision = index.revision || 1;
    let chapters = (index.chapters || []).filter((chapter) => chapter.status === "completed");
    if (MAX_CHAPTERS > 0) chapters = chapters.slice(0, MAX_CHAPTERS);

    await mapConcurrent(chapters, CONCURRENCY, async (entry) => {
      const chapter = await readJson(LAYOUT.chapter(book.id, revision, entry.n));
      if (!chapter || !chapter.content) return;
      totals.chapters += 1;
      const text = String(chapter.content || "");

      for (const check of CHECKS) {
        const match = text.match(check.regex);
        if (!match) continue;
        addFinding(findings, check.id, {
          bookId: book.id,
          bookTitle: book.title || book.id,
          chapter: entry.n,
          title: chapter.title || entry.title || "",
          match: match[0],
          context: contextFor(text, match.index || 0)
        });
      }

      const repeated = repeatedParagraph(text);
      if (repeated) {
        addFinding(findings, "repeated-paragraph", {
          bookId: book.id,
          bookTitle: book.title || book.id,
          chapter: entry.n,
          title: chapter.title || entry.title || "",
          match: `repeated ${repeated.count}x`,
          context: repeated.paragraph.slice(0, 220)
        });
      }

      if (detectRawHanVietTranscription(text)) {
        addFinding(findings, "raw-hanviet-transcription", {
          bookId: book.id,
          bookTitle: book.title || book.id,
          chapter: entry.n,
          title: chapter.title || entry.title || "",
          match: "raw transcription",
          context: text.slice(0, 260).replace(/\s+/g, " ").trim()
        });
      }
    });
  }

  console.log("\nSummary");
  console.log(`- Books scanned: ${totals.books}`);
  console.log(`- Chapters scanned: ${totals.chapters}`);
  for (const check of [...CHECKS, { id: "repeated-paragraph", label: "Đoạn văn bị lặp nhiều lần" }, { id: "raw-hanviet-transcription", label: "Cả chương/đoạn còn phiên âm thô" }]) {
    const entry = findings.get(check.id);
    if (!entry) continue;
    console.log(`\n${check.id}: ${entry.count} - ${check.label}`);
    for (const sample of entry.samples) {
      console.log(`- ${sample.bookTitle} (${sample.bookId}) ch ${sample.chapter}: ${sample.match}`);
      console.log(`  ${sample.context}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
