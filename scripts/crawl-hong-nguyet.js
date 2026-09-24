"use strict";

const { loadEnvFile } = require("node:process");
try { loadEnvFile(".env"); } catch (e) {}
try { loadEnvFile(".env.local"); } catch (e) {}

const fs = require("node:fs");
const path = require("node:path");
const { crawlQidian } = require("./qidian-crawler");
const { translateMetadata } = require("../server/gemini");
const { runIngest } = require("../server/ingest/run-ingest");
const { createArchiveStorage, createStorage } = require("../server/storage");
const { sanitizeCrawlerStatus } = require("../server/crawler-store");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

async function run() {
  const archive = createArchiveStorage();
  const storage = createStorage();
  const sourceId = "1024868626";
  const startedAt = new Date().toISOString();

  let lastStatusWrite = 0;
  async function updateStatus(patch) {
    if (!archive) return;
    try {
      const now = Date.now();
      if (now - lastStatusWrite < 2000 && !patch.state) return;
      lastStatusWrite = now;
      const currentRaw = await archive.get("crawler/status.json").catch(() => null);
      const current = currentRaw ? JSON.parse(currentRaw.toString("utf8")) : {};
      const next = sanitizeCrawlerStatus({
        ...current,
        ...patch,
        updatedAt: new Date().toISOString()
      });
      await archive.put("crawler/status.json", JSON.stringify(next, null, 2));
    } catch (err) {
      console.warn("Lỗi ghi crawler status:", err.message);
    }
  }

  console.log(">>> [1/4] BẮT ĐẦU CÀO BỘ TRUYỆN: BẮT ĐẦU TỪ MẶT TRĂNG ĐỎ (1024868626 - Hắc Sơn Lão Quỷ) <<<");
  await updateStatus({
    state: "running",
    message: "Đang kết nối Piaotian cào Bắt Đầu Từ Mặt Trăng Đỏ (1024868626)...",
    startedAt,
    currentBookId: sourceId,
    currentBookTitle: "Bắt Đầu Từ Mặt Trăng Đỏ",
    currentChapters: 0,
    currentTotalChapters: 910
  });

  const crawlResult = await crawlQidian({
    target: sourceId,
    source: "qidian",
    maxChapters: 1000,
    allowVip: true,
    onProgress: async ({ chapter, total, title, metadata }) => {
      const bookTitle = metadata?.title || "Bắt Đầu Từ Mặt Trăng Đỏ";
      if (chapter % 50 === 0 || chapter === total || chapter <= 5) {
        console.log(`[CRAWL] ${chapter}/${total} chương: ${title}`);
      }
      await updateStatus({
        currentBookTitle: bookTitle,
        currentChapters: chapter,
        currentTotalChapters: total,
        message: `Đang tải ${bookTitle}: ${chapter}/${total} chương (${title}).`
      });
    }
  });

  console.log(`\n>>> [2/4] ĐÃ TẢI XONG ${crawlResult.downloadedChapters} CHƯƠNG. ĐANG DỊCH METADATA... <<<`);
  await updateStatus({
    message: `Đang dịch thông tin truyện ${crawlResult.title}...`,
    currentChapters: crawlResult.downloadedChapters,
    currentTotalChapters: crawlResult.downloadedChapters
  });

  let translatedMetadata = null;
  try {
    translatedMetadata = await translateMetadata({
      title: crawlResult.title,
      author: crawlResult.author,
      description: crawlResult.description
    });
  } catch (e) {
    console.warn("Dịch metadata fallback:", e.message);
  }

  const finalTitle = translatedMetadata?.title || "Bắt Đầu Từ Mặt Trăng Đỏ";
  const finalAuthor = translatedMetadata?.author || "Hắc Sơn Lão Quỷ";
  const finalDescription = translatedMetadata?.description || crawlResult.description || "Trên bầu trời xuất hiện một vầng trăng màu máu, từ đó thế giới hoàn toàn thay đổi...";

  console.log("Metadata:", { finalTitle, finalAuthor, finalDescription });

  console.log(`\n>>> [3/4] ĐANG INGEST VÀO R2 & SUPABASE... <<<`);
  await updateStatus({
    message: `Đang ingest ${crawlResult.downloadedChapters} chương cho ${finalTitle}...`
  });

  const epubBuffer = fs.readFileSync(crawlResult.epubPath);
  const ingestResult = await runIngest({
    translateEnabled: false,
    epubBuffer,
    book: {
      id: `qidian-${sourceId}`,
      title: finalTitle,
      author: finalAuthor,
      description: finalDescription,
      genre: "Khoa Huyễn / Mạt Thế",
      status: "Đã hoàn thành",
      source: "qidian",
      sourceId,
      sourceUrl: crawlResult.sourceUrl,
      lastCrawledAt: new Date().toISOString()
    },
    revision: 1,
    log: (event) => {
      if (event.event === "ingest.chapters_extracted") console.log(`  Tách xong: ${event.chapters} chương`);
      if (event.event === "ingest.completed") console.log(`  Ingest hoàn tất: ${event.totalChapters} chương`);
    }
  });

  // Upload original cover if available
  if (crawlResult.coverUrl) {
    try {
      console.log("Đang tải bìa gốc:", crawlResult.coverUrl);
      const covRes = await fetch(crawlResult.coverUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (covRes.ok) {
        const covBuf = Buffer.from(await covRes.arrayBuffer());
        await storage.put(`covers/qidian-${sourceId}.jpg`, covBuf, { contentType: "image/jpeg" });
        await storage.put(`covers/qidian-${sourceId}.webp`, covBuf, { contentType: "image/webp" });
        console.log("Đã lưu bìa gốc vào covers/");
      }
    } catch (e) {
      console.warn("Lỗi tải bìa:", e.message);
    }
  }

  console.log("\n>>> Đồng bộ Catalogue Snapshot <<<");
  await publishCatalogSnapshot({ storage });

  console.log(`\n>>> [4/4] HOÀN TẤT CÀO VÀ INGEST BỘ TRUYỆN: ${finalTitle} (${ingestResult.totalChapters} chương) <<<`);
  await updateStatus({
    state: "success",
    finishedAt: new Date().toISOString(),
    published: 1,
    currentChapters: ingestResult.totalChapters,
    currentTotalChapters: ingestResult.totalChapters,
    message: `Đã thêm thành công ${finalTitle} (${ingestResult.totalChapters} chương).`,
    recent: [
      {
        title: finalTitle,
        chapters: ingestResult.totalChapters,
        at: new Date().toISOString(),
        sourceId
      }
    ]
  });

  console.log("ALL DONE CRAWL HONG NGUYET!");
}

run().catch(async (err) => {
  console.error("FATAL ERROR IN CRAWL RUN:", err);
  process.exit(1);
});
