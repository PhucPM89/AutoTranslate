"use strict";

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { runIngest } = require("../server/ingest/run-ingest");
const { translateMetadata } = require("../server/gemini");
const { createCrawlerState } = require("../server/crawler-state");
const { getTranslationBacklog } = require("../server/ingest/translation-queue");
const { createStorage, createArchiveStorage } = require("../server/storage");

const TOMATO_URL = String(process.env.TOMATO_URL || "http://127.0.0.1:18423").replace(/\/$/, "");
const TOMATO_PASSWORD = process.env.TOMATO_PASSWORD || "";
const TOMATO_DATA_DIR = path.resolve(process.env.TOMATO_DATA_DIR || ".crawler-data");
const JOB_TIMEOUT_MS = clampNumber(process.env.CRAWLER_JOB_TIMEOUT_MINUTES, 15, 320, 300) * 60 * 1000;
// The workflow allows 330 minutes. Stopping a little before that leaves room to
// upload, publish and save the Tomato cache instead of being killed mid-write.
const RUN_BUDGET_MS = clampNumber(process.env.CRAWLER_RUN_BUDGET_MINUTES, 10, 320, 300) * 60 * 1000;
// A fresh download is only worth starting if there is time to make real progress.
const MIN_BUDGET_FOR_NEW_JOB_MS = 20 * 60 * 1000;
const RUN_STARTED_AT = Date.now();
const POLL_INTERVAL_MS = 10 * 1000;

function remainingBudgetMs() {
  return RUN_BUDGET_MS - (Date.now() - RUN_STARTED_AT);
}
const RANK_PAGE_SIZE = 10;
const DEFAULT_RANK_PAGE_COUNT = 1;
// The established-novel boards are already sorted so that roughly a third of the
// first entries clear 1000 chapters, so a handful of pages is enough. Scanning 20
// pages per rank plus hundreds of book pages is what tripped Fanqie's throttle.
const LONG_NOVEL_RANK_PAGE_COUNT = 5;
const FANQIE_REQUEST_SPACING_MS = 400;
const FANQIE_RETRY_BACKOFF_MS = 2500;
const THROTTLE_ABORT_STREAK = 6;
const AVERAGE_CHARS_PER_CHAPTER = 2200;
// Probing /page/ is only a fallback now, so it gets a tight budget.
const MAX_DETAIL_PROBES = 12;

async function countUntranslatedBooks(storage) {
  try {
    const rawCatalog = await storage.get("catalog/latest.json");
    if (!rawCatalog) return 0;
    const catalog = JSON.parse(rawCatalog.toString("utf8"));
    const books = Array.isArray(catalog.books) ? catalog.books : [];
    let pendingCount = 0;
    for (const b of books) {
      const total = Number(b.chapterCount || b.totalChapters || 0);
      const done = Number(b.translatedChapters || 0);
      if (total > 0 && done < total) {
        pendingCount++;
      }
    }
    return pendingCount;
  } catch (err) {
    console.warn("countUntranslatedBooks error:", err.message);
    return 0;
  }
}

async function main() {
  requireEnvironment();
  // Config, status and the crawled-book list come straight from R2 and Supabase.
  // Going through the site for its own state is what made every run fail once
  // the old blob-backed API went away.
  const state = createCrawlerState(crawlerStateOptions());
  const control = await state.readControl();
  const { config, categories, catalog, status: previousStatus } = control;
  if (!config.enabled) {
    await updateStatus({ state: "disabled", message: "Crawler đang tắt trong trang quản trị.", finishedAt: new Date().toISOString() });
    return;
  }

  const storage = createStorage();
  const maxBacklog = Number(config.maxBacklog || 5);
  const pendingCount = await countUntranslatedBooks(storage);
  if (pendingCount >= maxBacklog) {
    const msg = `Hàng đợi dịch đang có ${pendingCount} bộ chưa dịch xong (vượt mức tối đa ${maxBacklog} bộ). Tạm dừng cào sách mới để tập trung dịch dứt điểm các bộ hiện có.`;
    await updateStatus({
      state: "idle",
      message: msg,
      finishedAt: new Date().toISOString()
    });
    console.log(`[CRAWLER] ${msg}`);
    return;
  }

  // Pre-flight check: If translation worker is paused due to quota, halt crawler immediately!
  try {
    const rawTransStatus = await storage.get("jobs/translate-status.json");
    if (rawTransStatus) {
      const transStatus = JSON.parse(rawTransStatus.toString("utf8"));
      if (transStatus.state === "paused_quota") {
        await updateStatus({
          state: "paused_quota",
          message: "API keys dịch đang tạm hết hạn mức (Quota/Rate Limit). Tạm dừng cào sách mới để tránh upload truyện chưa dịch.",
          finishedAt: new Date().toISOString()
        });
        console.warn("[CRAWLER] Translation worker is paused for quota. Halting crawler to protect library integrity.");
        return;
      }
    }
  } catch {}

  const startedAt = new Date().toISOString();
  const resumeJob = selectResumeJob(previousStatus, catalog);
  const status = {
    state: "running",
    message: "Đang chuẩn bị...",
    startedAt,
    finishedAt: "",
    currentBookId: resumeJob?.sourceId || "",
    resumeAttempts: resumeJob ? resumeJob.attempts : 0,
    discovered: 0,
    published: 0,
    failed: 0
  };
  await updateStatus(status);
  // The status object is mutated in place from here on, so the heartbeat always
  // persists the latest phase, book and progress without each phase remembering
  // to write.
  startHeartbeat(status);

  try {
    // Pre-flight check: verify that metadata translation works before spinning up Tomato & downloads
    try {
      const preflight = await translateBookMetadata({
        title: "测试小说",
        author: "作者",
        description: "测试简介"
      });
      if (!preflight?.title || /[\u4e00-\u9fa5]/.test(preflight.title)) {
        throw new Error("Không thể dịch metadata sang tiếng Việt.");
      }
    } catch (error) {
      const isQuota = error.status === 429 || String(error.message || "").toLowerCase().includes("quota") || String(error.message || "").toLowerCase().includes("rate limit") || String(error.message || "").toLowerCase().includes("hết hạn mức");
      if (isQuota) {
        stopHeartbeat();
        status.state = "paused_quota";
        status.message = "API keys dịch đang hết hạn mức (Quota/Rate Limit). Tạm dừng cào sách mới để bảo toàn dữ liệu.";
        status.finishedAt = new Date().toISOString();
        await updateStatus(status);
        console.warn("[CRAWLER] Translation pre-flight failed due to quota. Halting crawler.");
        return;
      }
    }

    await waitForTomato();
    await configureTomato();

    const runJobs = async (jobs) => {
      for (const candidate of jobs) {
        // A resume job continues work already banked in the cache, so it is worth
        // starting even late in the run; a brand new download is not.
        if (!candidate.isResume && remainingBudgetMs() < MIN_BUDGET_FOR_NEW_JOB_MS) {
          status.message = `Còn ${Math.round(remainingBudgetMs() / 60000)} phút, để dành book ${candidate.sourceId} cho lượt sau.`;
          await updateStatus(status);
          break;
        }
        status.currentBookId = candidate.sourceId;
        status.currentBookTitle = "";
        status.currentChapters = 0;
        status.currentTotalChapters = 0;
        status.message = `Đang tải Fanqie book ${candidate.sourceId}...`;
        await updateStatus(status);
        try {
          const published = await downloadAndPublish(candidate, status, config.wordCountBucket);
          status.published += 1;
          status.currentBookId = "";
          status.currentBookTitle = "";
          status.currentChapters = 0;
          status.currentTotalChapters = 0;
          status.resumeAttempts = 0;
          const chapters = Number(published.totalChapters || 0);
          status.message = candidate.isUpdate
            ? `Đã cập nhật ${published.title} (${chapters} chương).`
            : `Đã thêm ${published.title} (${chapters} chương).`;
          // Newest first, so the admin sees a list of arrivals rather than a
          // single counter that says nothing about what came in.
          status.recent = [
            { title: published.title, chapters, at: new Date().toISOString(), sourceId: String(candidate.sourceId) },
            ...(status.recent || [])
          ].slice(0, 8);
        } catch (error) {
          const isQuota = error.status === 429 || String(error.message || "").toLowerCase().includes("quota") || String(error.message || "").toLowerCase().includes("rate limit") || String(error.message || "").toLowerCase().includes("hết hạn mức");
          if (isQuota) {
            status.state = "paused_quota";
            status.message = `Tạm dừng crawler: API keys dịch đang tạm hết hạn mức (Quota/Rate Limit). Ngừng cào để tránh upload sách chưa dịch.`;
            status.finishedAt = new Date().toISOString();
            await updateStatus(status);
            console.warn(`[CRAWLER PAUSED] ${status.message}`);
            return;
          }
          status.failed += 1;
          const errorMsg = error.message || String(error);
          status.message = `Book ${candidate.sourceId} thất bại: ${errorMsg}`;
          status.recentErrors = [
            {
              sourceId: String(candidate.sourceId),
              title: candidate.title || status.currentBookTitle || `Fanqie ${candidate.sourceId}`,
              error: errorMsg,
              at: new Date().toISOString()
            },
            ...(status.recentErrors || [])
          ].slice(0, 6);
          console.error(`[CRAWLER ERROR] ${status.message}`);
        }
        await updateStatus(status);
      }
    };

    // Tomato keeps partially downloaded chapters in the Actions cache, so a book
    // an earlier run left unfinished is retried first rather than being dropped
    // in favour of a different novel.
    if (resumeJob) {
      status.message = `Đang tải tiếp Fanqie book ${resumeJob.sourceId} (lần thử ${resumeJob.attempts}).`;
      await updateStatus(status);
      await runJobs([resumeJob]);
    }

    const excludedIds = new Set(config.excludedSourceIds || []);
    const existingBooks = (catalog.books || []).filter((book) => book.source === "fanqie" && book.sourceId && !excludedIds.has(String(book.sourceId)));
    const existingIds = new Set(existingBooks.map((book) => String(book.sourceId)));
    if (resumeJob) existingIds.add(resumeJob.sourceId);

    // A refresh job whose download keeps failing never advances lastCrawledAt, so
    // it used to be re-picked forever and no new novel was ever discovered again.
    // Discovery now runs whenever the refresh pass added nothing. The resumed book
    // is excluded so one run never attempts the same download twice.
    const refreshable = existingBooks.filter((book) => String(book.sourceId) !== resumeJob?.sourceId);
    await runJobs(selectWorkItems([], refreshable, config.updateExisting));

    let discovery = null;
    let newCandidateCount = 0;
    
    // Backpressure before crawling new novels. Two independent ceilings:
    //   1. maxLibraryBooks — total library size (the real storage ceiling now
    //      that convert makes every crawled book readable). Existing novels keep
    //      updating above it; only new-book acquisition stops.
    //   2. maxPendingBooksBacklog — a soft cap on the LLM-polish queue.
    const storage = createStorage();
    const librarySize = existingBooks.length;
    const maxLibraryBooks = config.maxLibraryBooks || 0;
    const libraryFull = maxLibraryBooks > 0 && librarySize >= maxLibraryBooks;
    const maxBacklog = config.maxPendingBooksBacklog || 5;
    const backlog = await getTranslationBacklog(storage);
    const maxNewBooks = libraryFull
      ? 0
      : Math.min(config.maxNewBooksPerRun || 2, Math.max(0, maxBacklog - backlog.pendingBooksCount));

    if (libraryFull) {
      const fullMsg = `Thư viện đã đạt ${librarySize}/${maxLibraryBooks} bộ (trần maxLibraryBooks). Ngừng cào truyện mới, chỉ tiếp tục cập nhật truyện đang theo dõi.`;
      console.log(`[CRAWLER LIBRARY FULL] ${fullMsg}`);
      status.message = fullMsg;
      await updateStatus(status);
    } else if (backlog.pendingBooksCount >= maxBacklog) {
      const backpressureMsg = `Hàng đợi dịch đang có ${backlog.pendingBooksCount} bộ truyện (${backlog.totalPendingChapters} chương) chờ dịch. Tạm dừng cào thêm truyện mới để ưu tiên dịch hoàn tất (ngưỡng tối đa: ${maxBacklog} bộ).`;
      console.log(`[CRAWLER BACKPRESSURE] ${backpressureMsg}`);
      status.message = backpressureMsg;
      await updateStatus(status);
    } else {
      console.log(`[CRAWLER CAPACITY] Hàng đợi dịch hiện có ${backlog.pendingBooksCount}/${maxBacklog} bộ truyện chờ dịch. Cho phép cào tối đa ${maxNewBooks} bộ mới trong lượt này.`);
      let booksAddedThisRun = 0;

      while (remainingBudgetMs() >= MIN_BUDGET_FOR_NEW_JOB_MS && booksAddedThisRun < maxNewBooks) {
        const candidates = await discoverBooks(config, categories, status);
        const newCandidates = candidates.filter((item) => !existingIds.has(item.sourceId) && !excludedIds.has(item.sourceId));
        newCandidateCount = newCandidates.length;

        const chapterFloor = bucketChapterFloor(config.wordCountBucket);
        if (chapterFloor > 0) {
          status.message = `Đang tìm truyện từ ${chapterFloor} chương trở lên...`;
          await updateStatus(status);
        }
        discovery = await selectNewBookCandidates(
          newCandidates,
          chapterFloor,
          maxNewBooks - booksAddedThisRun,
          fetchText,
          async ({ scanned, scanLimit, selected, bestChapterCount }) => {
            status.message = `Đang lọc truyện dài: đã kiểm ${scanned}/${scanLimit}, chọn ${selected}, dài nhất ${bestChapterCount} chương.`;
            await updateStatus(status);
          }
        );

        if (!discovery.selected.length) break;

        status.discovered += discovery.selected.length;
        await runJobs(discovery.selected);
        booksAddedThisRun += discovery.selected.length;

        for (const item of discovery.selected) existingIds.add(String(item.sourceId));
      }
    }

    if (!status.published && !status.failed) {
      stopHeartbeat();
      status.state = "success";
      status.message = describeEmptyRun(config, newCandidateCount, discovery);
      status.currentBookId = "";
      status.resumeAttempts = 0;
      status.finishedAt = new Date().toISOString();
      await updateStatus(status);
      return;
    }

    stopHeartbeat();
    status.state = status.published ? "success" : "error";
    status.message = status.published
      ? `Hoàn tất: thêm ${status.published} truyện, lỗi ${status.failed}.`
      : `Không thể thêm truyện; ${status.failed} tác vụ thất bại.${discovery ? ` ${describeEmptyRun(config, newCandidateCount, discovery)}` : ""}`;
    // currentBookId is left in place when a download failed, so the next run picks
    // that book up again instead of discarding the chapters already cached.
    status.finishedAt = new Date().toISOString();
    await updateStatus(status);
    if (!status.published) process.exitCode = 1;
  } catch (error) {
    // Before the final write, or the heartbeat would overwrite the error state
    // with a stale "running" a moment later.
    stopHeartbeat();
    status.state = "error";
    status.message = error.message;
    // Keep currentBookId: a crash mid-download is exactly when resuming matters.
    status.finishedAt = new Date().toISOString();
    await updateStatus(status).catch(() => {});
    throw error;
  }
}

// The library API is the cheap path: one request per genre returns 100 novels that
// already clear the word-count bar. Rank pages stay as a fallback for the case
// where the API shape changes or the request is refused.
async function discoverBooks(config, categories, status) {
  try {
    status.message = "Đang lọc thư viện Fanqie theo độ dài...";
    await updateStatus(status);
    const candidates = await discoverFromLibrary(config, categories, fetchJson, async ({ categoryLabel, found, totalCount }) => {
      status.message = `Thư viện Fanqie · ${categoryLabel}: ${found} truyện đã lấy trong ${totalCount} truyện đạt độ dài.`;
      await updateStatus(status);
    });
    if (candidates.length) return candidates;
    console.warn("Library API trả về danh sách rỗng; chuyển sang bảng xếp hạng.");
  } catch (error) {
    console.warn(`Library API lỗi (${error.message}); chuyển sang bảng xếp hạng.`);
  }

  status.message = "Đang quét bảng xếp hạng Fanqie...";
  await updateStatus(status);
  return discoverCandidates(config, categories, fetchText, async ({ categoryLabel, scannedPages, totalPages, found }) => {
    status.message = `Đang quét thể loại ${categoryLabel}: ${scannedPages}/${totalPages} trang, tìm thấy ${found} truyện.`;
    await updateStatus(status);
  });
}

// Says *why* a run came up empty, so a length filter that is too aggressive can
// be told apart from Fanqie refusing the scan.
function describeEmptyRun(config, candidateCount, discovery) {
  if (!discovery) return "Hết thời gian của lượt chạy trước khi kịp tìm truyện mới.";
  if (!candidateCount) return "Fanqie không trả về truyện mới nào.";

  const chapterFloor = bucketChapterFloor(config.wordCountBucket);
  const { scanned, fromRankMetadata = 0, detailProbes = 0, networkErrors, unreadable, bestChapterCount, throttled } = discovery;
  const failed = networkErrors + unreadable;
  if (throttled || (detailProbes && failed >= Math.max(5, detailProbes * 0.5))) {
    return `Fanqie đang chặn tốc độ: ${failed}/${detailProbes} lượt kiểm tra chi tiết không đọc được. Crawler sẽ thử lại ở lượt sau.`;
  }
  if (!chapterFloor) return "Không có truyện mới phù hợp.";
  if (!bestChapterCount && !detailProbes) {
    return `Đã lấy ${scanned} truyện đạt độ dài từ Fanqie nhưng tất cả đều đã có trong thư viện hoặc bị loại trừ.`;
  }
  return `Đã đọc ${scanned} truyện (${fromRankMetadata} biết trước số chương, ${detailProbes} lượt kiểm tra chi tiết), dài nhất ${bestChapterCount} chương, chưa đạt sàn ${chapterFloor} chương của bộ lọc độ dài.`;
}

// Picks up a book an earlier run was still downloading when it died. Capped so a
// novel that can never finish stops blocking everything else.
function selectResumeJob(previousStatus, catalog, maxAttempts = 3) {
  const sourceId = String(previousStatus?.currentBookId || "");
  if (!/^\d{10,30}$/.test(sourceId)) return null;
  if (!["running", "error"].includes(previousStatus?.state)) return null;

  const attempts = Number(previousStatus?.resumeAttempts) || 0;
  if (attempts >= maxAttempts) return null;

  const known = (catalog?.books || []).find((book) => String(book.sourceId) === sourceId);
  // Already published means the previous run actually finished; nothing to resume.
  if (known && previousStatus.state !== "error") return null;

  return {
    sourceId,
    genre: known?.genre || "Fanqie",
    category: "resume",
    isUpdate: Boolean(known),
    isResume: true,
    attempts: attempts + 1
  };
}

function selectWorkItems(newBooks, existingBooks, updateExisting, now = Date.now()) {
  if (updateExisting) {
    const refreshBefore = now - 24 * 60 * 60 * 1000;
    const due = existingBooks
      .map((book) => ({ book, crawledAt: new Date(book.lastCrawledAt || 0).getTime() || 0 }))
      // metadataVersion was a marker on the old blob catalogue and no longer
      // exists, so keeping it here made the condition always true and every book
      // permanently due. Age is the only thing that decides a refresh now.
      .filter((item) => item.crawledAt < refreshBefore)
      .sort((a, b) => a.crawledAt - b.crawledAt)[0]?.book;
    if (due) {
      return [{
        sourceId: String(due.sourceId),
        genre: due.genre || "Fanqie",
        category: "existing",
        isUpdate: true
      }];
    }
  }
  return newBooks;
}

const LIBRARY_API = "https://fanqienovel.com/api/author/library/book_list/v0/";
const LIBRARY_PAGE_SIZE = 100;
const LIBRARY_MAX_PAGES = 3;

// Fanqie's own 字数 filter, mirrored from the site's book library. Filtering
// server-side means one request returns 100 novels that already clear the size
// bar, instead of probing each book's detail page (the rate-limited endpoint).
const WORD_COUNT_FLOORS = { "-1": 0, 0: 0, 1: 300000, 2: 500000, 3: 1000000, 4: 2000000 };

function bucketChapterFloor(bucket) {
  const words = WORD_COUNT_FLOORS[String(bucket)] || 0;
  return words ? Math.floor(words / AVERAGE_CHARS_PER_CHAPTER) : 0;
}

async function fetchLibraryPage({ categoryId, wordCountBucket, creationStatus, pageIndex }, loadJson = fetchJson) {
  const query = new URLSearchParams({
    page_count: LIBRARY_PAGE_SIZE,
    page_index: pageIndex,
    gender: -1,
    category_id: categoryId,
    creation_status: creationStatus,
    word_count: wordCountBucket,
    book_type: -1,
    sort: 0
  });
  const body = await loadJson(`${LIBRARY_API}?${query}`);
  if (body?.code !== 0) throw new Error(`Fanqie library API trả code ${body?.code}: ${body?.message || "không rõ"}.`);
  const list = Array.isArray(body?.data?.book_list) ? body.data.book_list : [];
  return {
    books: list
      .map((item) => ({
        sourceId: String(item.book_id || ""),
        title: String(item.book_name || ""),
        author: String(item.author || ""),
        creationStatus: item.creation_status
      }))
      .filter((item) => /^\d{10,30}$/.test(item.sourceId)),
    hasMore: Boolean(body?.data?.has_more),
    totalCount: Number(body?.data?.total_count) || 0
  };
}

// Word counts come back masked as "." in this payload, so the bucket floor is the
// size guarantee; readEpubMetadata re-checks the real count after download.
async function discoverFromLibrary(config, categories, loadJson = fetchJson, onProgress = null) {
  const chapterFloor = bucketChapterFloor(config.wordCountBucket);
  const groups = await Promise.all((config.categories || []).map(async (key) => {
    const definition = categories[key];
    const categoryIds = definition?.categoryIds || [];
    if (!categoryIds.length) return [];

    const collected = [];
    for (const categoryId of categoryIds) {
      for (let pageIndex = 0; pageIndex < LIBRARY_MAX_PAGES; pageIndex += 1) {
        if (collected.length) await sleep(FANQIE_REQUEST_SPACING_MS);
        const page = await fetchLibraryPage(
          { categoryId, wordCountBucket: config.wordCountBucket, creationStatus: config.creationStatus, pageIndex },
          loadJson
        );
        collected.push(...page.books.map((book) => ({
          ...book,
          genre: definition.label,
          category: key,
          listedChapterCount: chapterFloor || null,
          chapterCountIsFloor: Boolean(chapterFloor)
        })));
        if (onProgress) {
          await onProgress({ categoryLabel: definition.label, found: collected.length, totalCount: page.totalCount });
        }
        if (!page.hasMore || !page.books.length) break;
      }
    }
    return uniqueBySourceId(collected);
  }));
  return roundRobin(groups);
}

function uniqueBySourceId(books) {
  const seen = new Set();
  return books.filter((book) => {
    if (seen.has(book.sourceId)) return false;
    seen.add(book.sourceId);
    return true;
  });
}

async function discoverCandidates(config, categories, loadPage = fetchText, onProgress = null) {
  const wantsLongNovels = bucketChapterFloor(config.wordCountBucket) > 0;
  const rankPageCount = wantsLongNovels ? LONG_NOVEL_RANK_PAGE_COUNT : DEFAULT_RANK_PAGE_COUNT;
  const groups = await Promise.all(config.categories.map(async (key) => {
    const definition = categories[key];
    if (!definition) return [];
    // The new-book boards cap out near 200 chapters, so a length filter has to
    // read the established-novel boards instead.
    const ranks = (wantsLongNovels && definition.longRanks?.length ? definition.longRanks : definition.ranks) || [];
    const ids = [];
    const metadata = new Map();
    let scannedPages = 0;
    const totalPages = ranks.length * rankPageCount;
    for (const rank of ranks) {
      for (let page = 0; page < rankPageCount; page += 1) {
        const offset = page * RANK_PAGE_SIZE;
        const url = offset ? `https://fanqienovel.com/rank/${rank}?offset=${offset}` : `https://fanqienovel.com/rank/${rank}`;
        if (scannedPages) await sleep(FANQIE_REQUEST_SPACING_MS);
        const html = await loadPage(url);
        // Prefer the embedded metadata; fall back to bare links if it is missing.
        const pageBooks = parseRankBooks(html);
        const pageIds = pageBooks.length ? pageBooks.map((book) => book.sourceId) : parseRankBookIds(html);
        pageBooks.forEach((book) => {
          if (!metadata.has(book.sourceId)) metadata.set(book.sourceId, book);
        });
        ids.push(...pageIds);
        scannedPages += 1;
        if (onProgress && (scannedPages % 5 === 0 || scannedPages === totalPages)) {
          await onProgress({ categoryLabel: definition.label, scannedPages, totalPages, found: unique(ids).length });
        }
        if (!pageIds.length) break;
      }
    }
    return unique(ids).map((sourceId) => ({
      sourceId,
      genre: definition.label,
      category: key,
      listedChapterCount: metadata.get(sourceId)?.listedChapterCount ?? null,
      listedTitle: metadata.get(sourceId)?.title || ""
    }));
  }));
  return roundRobin(groups);
}

function parseRankBookIds(html) {
  return unique(Array.from(String(html || "").matchAll(/href=["']\/page\/(\d{10,30})["']/g), (match) => match[1]));
}

// Rank pages embed window.__INITIAL_STATE__ with a full metadata record for every
// book listed, so one rank request yields ~10 chapter counts. The per-book /page/
// endpoint is the one Fanqie rate-limits, so reading counts from here instead of
// probing each book removes almost all of the crawler's request volume.
function parseRankBooks(html) {
  const state = extractInitialState(html);
  if (!state) return [];

  const books = [];
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const sourceId = String(node.bookId || "");
    if (/^\d{10,30}$/.test(sourceId) && node.bookName && !seen.has(sourceId)) {
      seen.add(sourceId);
      books.push({
        sourceId,
        title: String(node.bookName || ""),
        author: String(node.author || ""),
        wordNumber: Number(node.wordNumber) || 0,
        creationStatus: node.creationStatus,
        lastChapterTitle: String(node.lastChapterTitle || ""),
        listedChapterCount: estimateChapterCount(node)
      });
    }
    Object.values(node).forEach(walk);
  };
  walk(state);
  return books;
}

function extractInitialState(html) {
  const source = String(html || "");
  const marker = "window.__INITIAL_STATE__=";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;

  let start = markerIndex + marker.length;
  while (start < source.length && source[start] !== "{") start += 1;
  if (source[start] !== "{") return null;

  // Brace matching has to ignore braces inside strings; novel blurbs contain them.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (!depth) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// The latest chapter title carries its own number, which is the chapter total for
// a serialised novel. Word count is the fallback when the title is not numbered.
function estimateChapterCount(book) {
  const numbered = String(book?.lastChapterTitle || "").match(/第\s*([0-9]{1,6})\s*[章回節节]/);
  if (numbered) {
    const value = Number(numbered[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const words = Number(book?.wordNumber) || 0;
  return words > 0 ? Math.round(words / AVERAGE_CHARS_PER_CHAPTER) : null;
}

function roundRobin(groups) {
  const output = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    groups.forEach((group) => {
      if (group[index]) output.push(group[index]);
    });
  }
  return output;
}

async function selectNewBookCandidates(candidates, minChapterCount, limit, loadPage = fetchText, onProgress = null) {
  const minimum = Math.max(0, Number.parseInt(minChapterCount, 10) || 0);
  const maximum = Math.max(1, Number.parseInt(limit, 10) || 1);
  if (!minimum) {
    const selected = candidates.slice(0, maximum);
    return { selected, scanned: selected.length, networkErrors: 0, unreadable: 0, bestChapterCount: 0 };
  }

  const selected = [];
  // Counted so a run that found nothing can say whether the boards were short or
  // whether Fanqie simply stopped answering; both used to report "not found".
  let networkErrors = 0;
  let unreadable = 0;
  let bestChapterCount = 0;
  let failureStreak = 0;
  let throttled = false;
  let scanned = 0;

  // Three kinds of candidate, none of which needs a detail request:
  //  - preFiltered: Fanqie's own word-count filter already guaranteed a floor,
  //    so the exact count is unknown but the size bar is met. downloadAndPublish
  //    re-checks the real count from the EPUB, which is the authoritative gate.
  //  - exact: a rank page told us the real chapter number.
  //  - unknown: neither, so it falls back to a bounded detail probe.
  const preFiltered = candidates.filter((candidate) => candidate.chapterCountIsFloor && candidate.listedChapterCount > 0);
  const exact = candidates.filter((candidate) => !candidate.chapterCountIsFloor && Number.isFinite(candidate.listedChapterCount));
  const unknown = candidates.filter(
    (candidate) => !candidate.chapterCountIsFloor && !Number.isFinite(candidate.listedChapterCount)
  );
  for (const candidate of exact) {
    bestChapterCount = Math.max(bestChapterCount, candidate.listedChapterCount);
  }

  // Longest first among the exactly-known ones; pre-filtered keep Fanqie's order.
  exact
    .filter((candidate) => candidate.listedChapterCount >= minimum)
    .sort((a, b) => b.listedChapterCount - a.listedChapterCount)
    .forEach((candidate) => selected.push(candidate));
  if (selected.length < maximum) selected.push(...preFiltered);
  selected.splice(maximum);
  const known = [...exact, ...preFiltered];

  if (selected.length >= maximum || !unknown.length) {
    return {
      selected,
      scanned: known.length,
      fromRankMetadata: known.length,
      detailProbes: 0,
      networkErrors,
      unreadable,
      bestChapterCount,
      throttled
    };
  }

  // Only books the rank payload could not describe fall back to a detail request.
  const scanLimit = Math.min(unknown.length, MAX_DETAIL_PROBES);
  for (let index = 0; index < scanLimit; index += 1) {
    const candidate = unknown[index];
    if (index) await sleep(FANQIE_REQUEST_SPACING_MS);
    scanned += 1;
    try {
      const html = await loadPage(`https://fanqienovel.com/page/${candidate.sourceId}`);
      const chapterCount = parseFanqieChapterCount(html);
      if (chapterCount === null) {
        unreadable += 1;
        failureStreak += 1;
      } else {
        failureStreak = 0;
        bestChapterCount = Math.max(bestChapterCount, chapterCount);
        if (chapterCount >= minimum) selected.push({ ...candidate, listedChapterCount: chapterCount });
      }
    } catch (error) {
      networkErrors += 1;
      failureStreak += 1;
      if (error.throttled) throttled = true;
      console.warn(`Không kiểm tra được số chương Fanqie ${candidate.sourceId}: ${error.message}`);
    }

    if (onProgress && ((index + 1) % 10 === 0 || selected.length >= maximum || index + 1 === scanLimit)) {
      await onProgress({ scanned, scanLimit, selected: selected.length, bestChapterCount, networkErrors });
    }
    if (selected.length >= maximum) break;
    // Burning the rest of the budget against a throttled host only deepens the block.
    if (failureStreak >= THROTTLE_ABORT_STREAK) {
      throttled = true;
      console.warn(`Dừng quét sớm: ${failureStreak} lượt liên tiếp không đọc được (nghi Fanqie chặn tốc độ).`);
      break;
    }
  }
  return {
    selected,
    scanned: known.length + scanned,
    fromRankMetadata: known.length,
    detailProbes: scanned,
    networkErrors,
    unreadable,
    bestChapterCount,
    throttled
  };
}

function parseFanqieChapterCount(html) {
  const source = String(html || "");
  const preferred = source.match(/["']chapterTotal["']\s*:\s*(\d+)\s*,\s*["']followStatus["']/);
  const fallback = source.match(/["']chapterTotal["']\s*:\s*(\d+)/);
  const value = Number.parseInt((preferred || fallback)?.[1], 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

async function downloadAndPublish(candidate, status, wordCountBucket = -1) {
  const before = new Map(findFiles(TOMATO_DATA_DIR, ".epub").map((file) => [file, fs.statSync(file).mtimeMs]));
  const startedAt = Date.now();
  const job = await tomatoRequest("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_id: candidate.sourceId })
  });
  const completedJob = await waitForJob(job.id, status);
  const epubPath = findProducedEpub(before, startedAt);
  if (!epubPath) throw new Error("Tomato báo hoàn tất nhưng không tìm thấy EPUB.");

  const epubBuffer = fs.readFileSync(epubPath);
  const metadata = await readEpubMetadata(epubBuffer);
  // Fanqie already guaranteed the word count, so this only has to catch a Tomato
  // download that stopped early. Chars per chapter varies wildly between novels
  // (roughly 1.8k to 24k), so the guard is deliberately loose.
  const truncationFloor = Math.max(10, Math.round(bucketChapterFloor(wordCountBucket) * 0.25));
  if (!candidate.isUpdate && metadata.chapterCount < truncationFloor) {
    throw new Error(
      `EPUB chỉ có ${metadata.chapterCount} chương, nghi bị tải dở (cần tối thiểu ${truncationFloor}).`
    );
  }

  status.message = `Đang dịch thông tin Fanqie book ${candidate.sourceId}...`;
  await updateStatus(status);
  const translatedMetadata = await translateBookMetadata({
    title: metadata.title || completedJob.title || `Fanqie ${candidate.sourceId}`,
    author: metadata.author || completedJob.author || "",
    description: metadata.description || ""
  });

  if (!translatedMetadata || !translatedMetadata.title || /\p{Script=Han}/u.test(translatedMetadata.title) || /\p{Script=Han}/u.test(translatedMetadata.author || "")) {
    throw new Error(`Dịch metadata thất bại cho Fanqie book ${candidate.sourceId}: Tiêu đề hoặc tác giả vẫn còn chứa chữ Hán.`);
  }

  // Extract and enqueue only. Translation is a separate workload: this job runs
  // every 15 minutes and must finish in minutes, while a 3,000-chapter novel takes
  // Gemini hours. scripts/translate-worker.js drains the queue on its own schedule.
  status.message = `Đang tách chương cho ${translatedMetadata.title}...`;
  await updateStatus(status);
  const result = await runIngest({
    translateEnabled: false,
    epubBuffer,
    book: {
      id: `fanqie-${candidate.sourceId}`,
      title: translatedMetadata.title,
      author: translatedMetadata.author,
      description: translatedMetadata.description,
      genre: candidate.genre,
      status: "Đang cập nhật",
      source: "fanqie",
      sourceId: String(candidate.sourceId),
      sourceUrl: `https://fanqienovel.com/page/${candidate.sourceId}`,
      lastCrawledAt: new Date().toISOString()
    },
    revision: 1,
    log: (event) => {
      if (event.event === "ingest.chapters_extracted") console.log(`  tách ${event.chapters} chương`);
      if (event.event === "ingest.completed") console.log(`  ingest xong: ${event.totalChapters} chương đã xếp hàng chờ dịch`);
    }
  });

  status.message = `Đã thêm ${translatedMetadata.title}: ${result.totalChapters} chương, ${result.summary.pending} chờ dịch.`;
  await updateStatus(status);
  return { title: translatedMetadata.title, ...result };
}

// Metadata translation runs locally when the worker has a Gemini key, so the
// crawler no longer needs the website to be reachable. The site call remains as a
// Title, author and description are the only things translated here; chapter
// bodies are the translation worker's job.
async function translateBookMetadata(source) {
  let apiKey = "";
  try {
    const storage = createStorage();
    const rawKeys = await storage.get("config/api-keys.json");
    if (rawKeys) {
      const parsed = JSON.parse(rawKeys.toString("utf8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        apiKey = parsed.join(",");
      }
    }
  } catch {}

  if (!apiKey) {
    apiKey = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY;
  }
  if (!apiKey) {
    throw new Error("Không dịch được metadata: thiếu GROQ_API_KEY / GEMINI_API_KEY.");
  }
  return translateMetadata(source, apiKey);
}

async function waitForJob(jobId, status) {
  // Bounded by whichever runs out first: the per-job limit or the run's budget.
  // Ending on our own terms lets the cache save so the next run resumes.
  const deadline = Date.now() + Math.max(0, Math.min(JOB_TIMEOUT_MS, remainingBudgetMs()));
  while (Date.now() < deadline) {
    const data = await tomatoRequest(`/api/jobs?id=${encodeURIComponent(jobId)}&all=true`);
    const job = data.items?.[0];
    if (!job) throw new Error("Tomato làm mất trạng thái download job.");
    if (job.book_name_options?.length) await submitTomatoChoice(jobId, "book_name", job.book_name_options[0].value);
    if (job.format_options?.length) {
      const epub = job.format_options.find((option) => String(option.value).toLowerCase() === "epub") || job.format_options[0];
      await submitTomatoChoice(jobId, "format", epub.value);
    }
    if (job.state === "done") return job;
    if (["failed", "canceled"].includes(job.state)) throw new Error(job.message || `Tomato job ${job.state}.`);
    // Recorded on every poll, written by the heartbeat. Kept as numbers as well
    // as prose so the admin can draw a bar rather than parse a sentence.
    const saved = Number(job.progress?.saved_chapters || 0);
    const total = Number(job.progress?.chapter_total || 0);
    status.currentBookTitle = job.title || String(job.book_id || "");
    status.currentChapters = saved;
    status.currentTotalChapters = total;
    status.message = `Đang tải ${status.currentBookTitle}: ${job.progress ? `${saved}/${total} chương` : "đang chuẩn bị"}.`;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Tomato không hoàn tất sau ${Math.round(JOB_TIMEOUT_MS / 60000)} phút.`);
}

async function submitTomatoChoice(jobId, kind, value) {
  await tomatoRequest(`/api/jobs/${encodeURIComponent(jobId)}/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value })
  });
}

async function configureTomato() {
  const config = await tomatoRequest("/api/config/full");
  Object.assign(config, {
    save_path: "/data/library",
    novel_format: "epub",
    bulk_files: false,
    ask_format_after_download: false,
    preferred_book_name_field: "book_name",
    enable_audiobook: false,
    auto_open: false
  });
  await tomatoRequest("/api/config/full", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config)
  });
}

async function waitForTomato() {
  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      await tomatoRequest("/api/status");
      return;
    } catch {
      await sleep(3000);
    }
  }
  throw new Error("Tomato Web API không khởi động sau 2 phút.");
}

async function readEpubMetadata(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const container = await zip.file("META-INF/container.xml")?.async("text");
  const opfPath = container?.match(/full-path=["']([^"']+)["']/i)?.[1];
  if (!opfPath || !zip.file(opfPath)) throw new Error("EPUB không có package document.");
  const opf = await zip.file(opfPath).async("text");
  const manifest = parseManifest(opf);
  const coverId = opf.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const coverItem = manifest.find((item) => item.id === coverId)
    || manifest.find((item) => /(?:^|\s)cover-image(?:\s|$)/.test(item.properties));
  let cover = null;
  if (coverItem) {
    const coverPath = path.posix.normalize(path.posix.join(path.posix.dirname(opfPath), coverItem.href));
    const coverFile = zip.file(coverPath);
    if (coverFile) cover = { data: await coverFile.async("nodebuffer"), contentType: normalizeImageType(coverItem.mediaType, coverItem.href) };
  }
  return {
    title: xmlText(opf, "title"),
    author: xmlText(opf, "creator"),
    description: xmlText(opf, "description"),
    chapterCount: Array.from(opf.matchAll(/<itemref\b/gi)).length,
    cover
  };
}

function parseManifest(opf) {
  return Array.from(opf.matchAll(/<item\b([^>]+)>?/gi), (match) => {
    const attrs = match[1];
    return {
      id: attribute(attrs, "id"),
      href: decodeXml(attribute(attrs, "href")),
      mediaType: attribute(attrs, "media-type"),
      properties: attribute(attrs, "properties")
    };
  });
}

function xmlText(xml, localName) {
  const match = String(xml).match(new RegExp(`<(?:(?:\\w+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${localName}>`, "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "";
}

function attribute(attrs, name) {
  return attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function decodeXml(value) {
  return String(value || "").replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function normalizeImageType(mediaType, href) {
  if (["image/jpeg", "image/png", "image/webp"].includes(mediaType)) return mediaType;
  if (/\.png$/i.test(href)) return "image/png";
  if (/\.webp$/i.test(href)) return "image/webp";
  return "image/jpeg";
}

function findProducedEpub(before, startedAt) {
  return findFiles(TOMATO_DATA_DIR, ".epub")
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .filter((item) => item.mtime >= startedAt - 5000 || item.mtime > (before.get(item.file) || 0))
    .sort((a, b) => b.mtime - a.mtime)[0]?.file || "";
}

function findFiles(root, extension) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) output.push(fullPath);
    }
  }
  return output;
}

// Fanqie throttles by answering HTTP 200 with an empty body instead of 429, so an
// empty response has to be raised as an error; otherwise every throttled check
// looks exactly like "this novel is too short".
async function fetchText(url, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt) await sleep(FANQIE_RETRY_BACKOFF_MS * attempt);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TramChuCrawler/1.0)", "Accept-Language": "zh-CN,zh;q=0.9" },
        signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) throw new Error(`Fanqie trả HTTP ${response.status}.`);
      const text = await response.text();
      if (!text.trim()) throw new ThrottleError(`Fanqie trả nội dung rỗng cho ${url} (nghi bị chặn tốc độ).`);
      return text;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function fetchJson(url, attempts = 3) {
  const text = await fetchText(url, attempts);
  try {
    return JSON.parse(text);
  } catch {
    throw new ThrottleError(`Fanqie trả JSON không hợp lệ cho ${url}.`);
  }
}

class ThrottleError extends Error {
  constructor(message) {
    super(message);
    this.name = "ThrottleError";
    this.throttled = true;
  }
}

async function tomatoRequest(pathname, options = {}) {
  return jsonRequest(`${TOMATO_URL}${pathname}`, {
    ...options,
    headers: { "x-tomato-password": TOMATO_PASSWORD, ...(options.headers || {}) }
  });
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(60000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `${url} trả HTTP ${response.status}.`);
  return body;
}

// Status is written to R2 directly. A failure here must never abort a run that
// is otherwise working - losing a progress note is far cheaper than losing the
// download in flight.
let crawlerState = null;

// Crawler state lives in the private bucket; the catalogue snapshot it falls back
// to lives in the public one.
function crawlerStateOptions() {
  return { storage: createArchiveStorage() || createStorage(), readerStorage: createStorage() };
}

let heartbeatTimer = null;

// A heartbeat that does not depend on which phase the run is in. The per-phase
// updates only covered Tomato's download, so the ingest that follows - thousands
// of object writes, several minutes - looked identical to a dead run.
//
// 45 seconds is a deliberate compromise: often enough that the admin can tell
// the difference, rare enough that a five-hour run costs a few hundred R2 writes
// rather than thousands.
function startHeartbeat(status) {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    updateStatus(status).catch(() => {});
  }, 45 * 1000);
  if (heartbeatTimer.unref) heartbeatTimer.unref();
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function updateStatus(status) {
  try {
    crawlerState = crawlerState || createCrawlerState(crawlerStateOptions());
    // Stamped here rather than by callers, so no status write can forget it and
    // leave the admin unable to tell a working run from a dead one.
    return await crawlerState.writeStatus({ ...status, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.warn(`Không ghi được trạng thái crawler: ${error.message}`);
    return null;
  }
}

function requireEnvironment() {
  // The worker no longer talks to the site for its own state, so a site token is
  // not a precondition any more - only the storage it actually writes to is.
  // Site auth is checked lazily, and only if the metadata fallback fires.
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter(
    (name) => !process.env[name]
  );
  if (missing.length) {
    throw new Error(`Thiếu biến R2 cho crawler: ${missing.join(", ")}.`);
  }
}

function unique(values) {
  return Array.from(new Set(values));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  discoverCandidates,
  discoverFromLibrary,
  fetchLibraryPage,
  bucketChapterFloor,
  parseRankBookIds,
  parseRankBooks,
  estimateChapterCount,
  parseFanqieChapterCount,
  roundRobin,
  readEpubMetadata,
  selectWorkItems,
  selectResumeJob,
  selectNewBookCandidates,
  describeEmptyRun,
  fetchText
};
