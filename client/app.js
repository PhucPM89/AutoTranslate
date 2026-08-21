"use strict";

// Reader accounts. Bundled rather than loaded on demand because the header has
// to know on first paint whether anyone is signed in, and answering that costs
// one localStorage read.
const { initAuth } = require("./auth.js");
const { createUserSync } = require("./user-sync.js");
const { renderQuoteCard } = require("./quote-card.js");
const { applyInvisibleWatermark, initSecurityGuards } = require("./security.js");
const { extractTitleFromContent, formatVietnameseChapterTitle } = require("./chapter-title.js");
const { updatePageMeta, shareContent } = require("./seo.js");
const { createTTS } = require("./tts.js");

let activeShelfTab = "all";
let userSync = null;
let autoScrollRaf = null;
let isAutoScrolling = false;
let selectedQuoteText = "";
let ttsEngine = null;
let isZenMode = false;

const state = {
  // "epub" is the legacy path (download the whole book, parse with JSZip).
  // "cdn" fetches one chapter JSON at a time. Both stay supported during
  // migration so a CDN miss can fall back instead of breaking the reader.
  mode: "epub",
  cdnTemplate: "",
  bookId: "",
  fileName: "",
  title: "",
  cover: "",
  chapters: [],
  currentIndex: 0,
  translations: {}
};

const libraryState = {
  site: {},
  books: [],
  recentProgress: null,
  detailBook: null,
  featuredBook: null,
  catalogPage: 1
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BRAND_NAME = "Trạm Chữ";
const CATALOG_PAGE_SIZE = 12;
const CACHE_DB_NAME = "epubTranslator.cache";
const CACHE_DB_VERSION = 2;
const CACHE_STORE = "books";
const PROGRESS_STORE = "progress";
const TRANSLATION_STORE = "translations";
const LEGACY_MIGRATION_KEY = "epubTranslator.cacheMigratedV2";
const CHAPTER_DECODE_CONCURRENCY = 6;
const SEARCH_DEBOUNCE_MS = 160;
const CACHE_WRITE_DEBOUNCE_MS = 800;
const ANALYTICS_VISIT_KEY = "epubTranslator.visitCounted";
const ANALYTICS_READ_KEY = "epubTranslator.readCounted";
const JSZIP_URL = __ASSET_JSZIP__;
const ADMIN_MODULE_URL = __ASSET_ADMIN__;
// Reader CDN path. Chapter JSON is fetched straight from R2 through the CDN:
// no Worker invocation, no Supabase query, no Gemini call on the read path.
const CDN_BASE = String(__CDN_BASE__ || "").replace(/\/$/, "");
// Analytics goes straight to Supabase so a page view costs no serverless
// invocation. The anon key is public by design: RLS lets it insert events and
// nothing else - verified against the live project.
const SUPABASE_URL = String(__SUPABASE_URL__ || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = String(__SUPABASE_ANON_KEY__ || "");
const READER_CDN_ENABLED = Boolean(__READER_CDN_ENABLED__) && Boolean(CDN_BASE);
const FALLBACK_BOOK_COVERS = [
  "/library/covers/night-temple.webp",
  "/library/covers/misty-pagoda.webp",
  "/library/covers/lantern-temple.webp"
];
const els = {
  adminOpen: document.getElementById("adminOpen"),
  accountOpen: document.getElementById("accountOpen"),
  accountIcon: document.getElementById("accountIcon"),
  accountInitial: document.getElementById("accountInitial"),
  authDialog: document.getElementById("authDialog"),
  authClose: document.getElementById("authClose"),
  authTitle: document.getElementById("authTitle"),
  authGuest: document.getElementById("authGuest"),
  authGoogleBtn: document.getElementById("authGoogleBtn"),
  authAccount: document.getElementById("authAccount"),
  authAccountAvatar: document.getElementById("authAccountAvatar"),
  authAccountInitial: document.getElementById("authAccountInitial"),
  authAccountName: document.getElementById("authAccountName"),
  authAccountEmail: document.getElementById("authAccountEmail"),
  authSignOut: document.getElementById("authSignOut"),
  authMessage: document.getElementById("authMessage"),
  libraryView: document.getElementById("libraryView"),
  readerView: document.getElementById("readerView"),
  bookView: document.getElementById("bookView"),
  bookBackToLibrary: document.getElementById("bookBackToLibrary"),
  bookThemeToggle: document.getElementById("bookThemeToggle"),
  bookViewBackdrop: document.getElementById("bookViewBackdrop"),
  bookViewCover: document.getElementById("bookViewCover"),
  bookViewGenre: document.getElementById("bookViewGenre"),
  bookViewStatus: document.getElementById("bookViewStatus"),
  bookViewTitle: document.getElementById("bookViewTitle"),
  bookViewAuthor: document.getElementById("bookViewAuthor"),
  bookViewChapters: document.getElementById("bookViewChapters"),
  bookViewUpdated: document.getElementById("bookViewUpdated"),
  bookViewProgress: document.getElementById("bookViewProgress"),
  bookViewRead: document.getElementById("bookViewRead"),
  bookViewReadLabel: document.getElementById("bookViewReadLabel"),
  bookViewRestart: document.getElementById("bookViewRestart"),
  bookViewDescription: document.getElementById("bookViewDescription"),
  bookViewRelated: document.getElementById("bookViewRelated"),
  bookViewRelatedEmpty: document.getElementById("bookViewRelatedEmpty"),
  libraryBrand: document.getElementById("libraryBrand"),
  libraryName: document.getElementById("libraryName"),
  libraryTagline: document.getElementById("libraryTagline"),
  featuredBackdrop: document.getElementById("featuredBackdrop"),
  featuredPoster: document.getElementById("featuredPoster"),
  featuredPosterLink: document.getElementById("featuredPosterLink"),
  rankSection: document.getElementById("rankSection"),
  rankRail: document.getElementById("rankRail"),
  rankPrev: document.getElementById("rankPrev"),
  rankNext: document.getElementById("rankNext"),
  genrePills: document.getElementById("genrePills"),
  featuredStory: document.getElementById("featuredStory"),
  featuredGenre: document.getElementById("featuredGenre"),
  featuredStatus: document.getElementById("featuredStatus"),
  featuredTitle: document.getElementById("featuredTitle"),
  featuredDescription: document.getElementById("featuredDescription"),
  featuredAuthor: document.getElementById("featuredAuthor"),
  featuredChapters: document.getElementById("featuredChapters"),
  featuredRead: document.getElementById("featuredRead"),
  supportQrOpen: document.getElementById("supportQrOpen"),
  supportQrClose: document.getElementById("supportQrClose"),
  supportDialog: document.getElementById("supportDialog"),
  librarySearch: document.getElementById("librarySearch"),
  libraryGenre: document.getElementById("libraryGenre"),
  viewAllBooks: document.getElementById("viewAllBooks"),
  viewMyShelf: document.getElementById("viewMyShelf"),
  statusFilter: document.getElementById("statusFilter"),
  lengthFilter: document.getElementById("lengthFilter"),
  sortOrder: document.getElementById("sortOrder"),
  catalogGrid: document.getElementById("catalogGrid"),
  catalogEmpty: document.getElementById("catalogEmpty"),
  catalogEmptyText: document.getElementById("catalogEmptyText"),
  catalogPagination: document.getElementById("catalogPagination"),
  catalogPaginationSummary: document.getElementById("catalogPaginationSummary"),
  catalogPageNumbers: document.getElementById("catalogPageNumbers"),
  catalogPrevPage: document.getElementById("catalogPrevPage"),
  catalogNextPage: document.getElementById("catalogNextPage"),
  bookCount: document.getElementById("bookCount"),
  genreCount: document.getElementById("genreCount"),
  contactLink: document.getElementById("contactLink"),
  contactEmail: document.getElementById("contactEmail"),
  continueSection: document.getElementById("continueSection"),
  continueTitle: document.getElementById("continueTitle"),
  continueMeta: document.getElementById("continueMeta"),
  continueReading: document.getElementById("continueReading"),
  backToLibrary: document.getElementById("backToLibrary"),
  bookViewBookmark: document.getElementById("bookViewBookmark"),
  bookViewBookmarkLabel: document.getElementById("bookViewBookmarkLabel"),
  readerThemeToggle: document.getElementById("readerThemeToggle"),
  readerThemeSelect: document.getElementById("readerThemeSelect"),
  readerFontFamily: document.getElementById("readerFontFamily"),
  autoScrollBtn: document.getElementById("autoScrollBtn"),
  autoScrollLabel: document.getElementById("autoScrollLabel"),
  autoScrollSpeed: document.getElementById("autoScrollSpeed"),
  selectionTooltip: document.getElementById("selectionTooltip"),
  quoteCopyBtn: document.getElementById("quoteCopyBtn"),
  quoteCardBtn: document.getElementById("quoteCardBtn"),
  quoteDialog: document.getElementById("quoteDialog"),
  quoteDialogClose: document.getElementById("quoteDialogClose"),
  quoteCanvas: document.getElementById("quoteCanvas"),
  quotePreviewImg: document.getElementById("quotePreviewImg"),
  quoteDownloadBtn: document.getElementById("quoteDownloadBtn"),
  quoteCopyImgBtn: document.getElementById("quoteCopyImgBtn"),
  readerImportButton: document.getElementById("readerImportButton"),
  fileInput: document.getElementById("fileInput"),
  bookTitle: document.getElementById("bookTitle"),
  bookMeta: document.getElementById("bookMeta"),
  readerBookCover: document.getElementById("readerBookCover"),
  globalSearch: document.getElementById("globalSearch"),
  chapterSelect: document.getElementById("chapterSelect"),
  chapterList: document.getElementById("chapterList"),
  documentCount: document.getElementById("documentCount"),
  progressLabel: document.getElementById("progressLabel"),
  progressBar: document.getElementById("progressBar"),
  paperTitle: document.getElementById("paperTitle"),
  outputStatus: document.getElementById("outputStatus"),
  prevChapter: document.getElementById("prevChapter"),
  nextChapter: document.getElementById("nextChapter"),
  bottomPrevChapter: document.getElementById("bottomPrevChapter"),
  bottomNextChapter: document.getElementById("bottomNextChapter"),
  chapterCounter: document.getElementById("chapterCounter"),
  bottomChapterCounter: document.getElementById("bottomChapterCounter"),
  sourceText: document.getElementById("sourceText"),
  translationText: document.getElementById("translationText"),
  translateButton: document.getElementById("translateButton"),
  retranslateButton: document.getElementById("retranslateButton"),
  themeToggle: document.getElementById("themeToggle"),
  themeLabel: document.getElementById("themeLabel"),
  fontDecrease: document.getElementById("fontDecrease"),
  fontIncrease: document.getElementById("fontIncrease"),
  fontSizeLabel: document.getElementById("fontSizeLabel"),
  widthPreset: document.getElementById("widthPreset"),
  bookViewShare: document.getElementById("bookViewShare"),
  readerShareBtn: document.getElementById("readerShareBtn"),
  bookViewTranslateProgress: document.getElementById("bookViewTranslateProgress"),
  bookViewTranslatePercent: document.getElementById("bookViewTranslatePercent"),
  bookViewTranslateFill: document.getElementById("bookViewTranslateFill"),
  ttsToggleBtn: document.getElementById("ttsToggleBtn"),
  ttsToggleLabel: document.getElementById("ttsToggleLabel"),
  zenModeBtn: document.getElementById("zenModeBtn"),
  zenExitBtn: document.getElementById("zenExitBtn"),
  ttsAudioBar: document.getElementById("ttsAudioBar"),
  ttsStatusText: document.getElementById("ttsStatusText"),
  ttsPrevParBtn: document.getElementById("ttsPrevParBtn"),
  ttsPlayPauseBtn: document.getElementById("ttsPlayPauseBtn"),
  ttsNextParBtn: document.getElementById("ttsNextParBtn"),
  ttsSpeedSelect: document.getElementById("ttsSpeedSelect"),
  ttsVoiceSelect: document.getElementById("ttsVoiceSelect"),
  ttsTimerBtn: document.getElementById("ttsTimerBtn"),
  ttsTimerLabel: document.getElementById("ttsTimerLabel"),
  ttsStopCloseBtn: document.getElementById("ttsStopCloseBtn"),
  sleepTimerDialog: document.getElementById("sleepTimerDialog"),
  sleepTimerClose: document.getElementById("sleepTimerClose")
};

const parser = new DOMParser();

initPreferences();
bindEvents();
initQuoteCardAndSelection();
initSecurityGuards();
registerServiceWorker();
initTTSController();
initZenModeController();
// Before initializeLibrary, because a confirmation link comes back with tokens in
// the URL fragment and they have to be consumed and wiped before anything else
// reads the hash.
const authClient = initAuth({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, els });
userSync = createUserSync({
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  authClient,
  storage: typeof localStorage !== "undefined" ? localStorage : null
});
userSync.subscribe(() => {
  if (activeShelfTab === "myShelf") renderCatalog();
  if (libraryState.detailBook) updateBookViewBookmark(libraryState.detailBook);
});
initializeLibrary();

function bindEvents() {
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("load", () => setTimeout(alignHashedSection, 400));
  els.fileInput?.addEventListener("change", handleFile);
  els.libraryBrand.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  els.librarySearch.addEventListener("input", debounce(resetCatalogPage, SEARCH_DEBOUNCE_MS));
  els.libraryGenre.addEventListener("change", resetCatalogPage);
  els.viewAllBooks?.addEventListener("click", () => {
    activeShelfTab = "all";
    els.viewAllBooks.classList.add("active");
    els.viewAllBooks.setAttribute("aria-selected", "true");
    els.viewMyShelf?.classList.remove("active");
    els.viewMyShelf?.setAttribute("aria-selected", "false");
    resetCatalogPage();
  });
  els.viewMyShelf?.addEventListener("click", () => {
    activeShelfTab = "myShelf";
    els.viewMyShelf.classList.add("active");
    els.viewMyShelf.setAttribute("aria-selected", "true");
    els.viewAllBooks?.classList.remove("active");
    els.viewAllBooks?.setAttribute("aria-selected", "false");
    resetCatalogPage();
  });
  els.statusFilter?.addEventListener("change", resetCatalogPage);
  els.lengthFilter?.addEventListener("change", resetCatalogPage);
  els.sortOrder?.addEventListener("change", resetCatalogPage);
  els.bookViewBookmark?.addEventListener("click", () => {
    const book = libraryState.detailBook;
    if (book && userSync) {
      userSync.toggleBookmark(book.id);
      updateBookViewBookmark(book);
      if (activeShelfTab === "myShelf") resetCatalogPage();
    }
  });
  els.bookViewShare?.addEventListener("click", () => {
    const book = libraryState.detailBook;
    if (!book) return;
    shareContent({
      title: book.title,
      text: `Đọc truyện "${book.title}" (${book.genre || "Tiểu thuyết"}) của tác giả ${book.author || "Khuyết danh"} trên Trạm Chữ`,
      url: `${window.location.origin}/?book=${encodeURIComponent(book.id)}`
    }, showToast);
  });
  els.readerShareBtn?.addEventListener("click", () => {
    const chapterTitle = displayChapterTitle(state.currentIndex);
    shareContent({
      title: `${chapterTitle} — ${state.title}`,
      text: `Đang đọc "${chapterTitle}" trong bộ truyện "${state.title}" trên Trạm Chữ`,
      url: `${window.location.origin}/?book=${encodeURIComponent(state.bookId)}&ch=${state.currentIndex + 1}`
    }, showToast);
  });
  els.readerThemeSelect?.addEventListener("change", (event) => applyTheme(event.target.value));
  els.readerFontFamily?.addEventListener("change", (event) => applyFont(event.target.value));
  els.autoScrollBtn?.addEventListener("click", toggleAutoScroll);
  window.addEventListener("wheel", () => { if (isAutoScrolling) stopAutoScroll(); }, { passive: true });
  window.addEventListener("touchstart", (e) => {
    if (isAutoScrolling && !e.target.closest("#autoScrollBtn")) stopAutoScroll();
  }, { passive: true });
  els.adminOpen?.addEventListener("click", bootstrapAdminPanel);
  els.featuredRead.addEventListener("click", openFeaturedBook);
  els.supportQrOpen.addEventListener("click", () => els.supportDialog.showModal());
  els.supportQrClose.addEventListener("click", () => els.supportDialog.close());
  els.supportDialog.addEventListener("click", (event) => {
    if (event.target === els.supportDialog) els.supportDialog.close();
  });
  trackMobileBar();
  els.rankPrev?.addEventListener("click", () => scrollRail(-1));
  els.rankNext?.addEventListener("click", () => scrollRail(1));
  els.catalogPrevPage.addEventListener("click", () => changeCatalogPage(libraryState.catalogPage - 1));
  els.catalogNextPage.addEventListener("click", () => changeCatalogPage(libraryState.catalogPage + 1));
  els.continueReading.addEventListener("click", resumeCachedBook);
  els.backToLibrary.addEventListener("click", showLibrary);
  els.bookBackToLibrary.addEventListener("click", showLibrary);
  els.bookThemeToggle.addEventListener("click", toggleTheme);
  els.bookViewRead.addEventListener("click", () => {
    const book = libraryState.detailBook;
    if (book) loadCatalogBook(book);
  });
  els.bookViewRestart.addEventListener("click", () => {
    const book = libraryState.detailBook;
    if (book) loadCatalogBook(book, fallbackCoverForBook(book), { startAtFirstChapter: true });
  });
  els.readerImportButton?.addEventListener("click", () => els.fileInput?.click());
  els.readerThemeToggle.addEventListener("click", toggleTheme);
  els.prevChapter.addEventListener("click", () => goToChapter(state.currentIndex - 1));
  els.nextChapter.addEventListener("click", () => goToChapter(state.currentIndex + 1));
  els.bottomPrevChapter.addEventListener("click", () => goToChapter(state.currentIndex - 1));
  els.bottomNextChapter.addEventListener("click", () => goToChapter(state.currentIndex + 1));
  els.chapterSelect.addEventListener("change", () => goToChapter(Number(els.chapterSelect.value)));
  els.chapterList.addEventListener("click", (event) => {
    const item = event.target.closest(".document-item");
    if (item) goToChapter(Number(item.dataset.index));
  });
  els.globalSearch.addEventListener("input", debounce(renderChapterControls, SEARCH_DEBOUNCE_MS));
  els.translateButton.addEventListener("click", () => translateCurrentChapter(false));
  els.retranslateButton.addEventListener("click", () => translateCurrentChapter(true));
  els.themeToggle.addEventListener("click", toggleTheme);
  els.fontDecrease.addEventListener("click", () => changeFontSize(-1));
  els.fontIncrease.addEventListener("click", () => changeFontSize(1));
  els.widthPreset.addEventListener("change", updateReaderSettings);
}

// JSZip (~95 KB) is only needed once a reader actually opens a book, and the
// admin bundle (~110 KB) only for the owner, so neither blocks the first paint.
let jszipPromise = null;

function loadJsZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!jszipPromise) {
    jszipPromise = loadScript(JSZIP_URL)
      .then(() => {
        if (!window.JSZip) throw new Error("JSZip không khởi tạo được.");
        return window.JSZip;
      })
      .catch((error) => {
        jszipPromise = null;
        throw error;
      });
  }
  return jszipPromise;
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Không tải được thư viện đọc EPUB."));
    document.head.appendChild(script);
  });
}

function bootstrapAdminPanel() {
  els.adminOpen.removeEventListener("click", bootstrapAdminPanel);
  els.adminOpen.disabled = true;
  import(ADMIN_MODULE_URL)
    .then((module) => module.mountAdmin())
    .catch((error) => {
      console.warn("Unable to load the admin bundle.", error);
      els.adminOpen.addEventListener("click", bootstrapAdminPanel);
    })
    .finally(() => {
      els.adminOpen.disabled = false;
    });
}

// Anonymous counters for the admin panel. Deliberately once per browser session
// (and once per book) rather than per pageview, so a visitor costs one or two
// function invocations instead of one per navigation.
function countVisit() {
  if (readSessionFlag(ANALYTICS_VISIT_KEY)) return;
  writeSessionFlag(ANALYTICS_VISIT_KEY, "1");
  sendBeacon({ type: "visit" });
}

function countBookOpened(bookId) {
  if (!bookId) return;
  const counted = new Set(String(readSessionFlag(ANALYTICS_READ_KEY) || "").split("|").filter(Boolean));
  if (counted.has(bookId)) return;
  counted.add(bookId);
  writeSessionFlag(ANALYTICS_READ_KEY, [...counted].slice(-40).join("|"));
  sendBeacon({ type: "read", bookId });
}

function sendBeacon(payload) {
  // Analytics is never allowed to affect reading: every path here swallows its
  // own errors and nothing awaits the result.
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify([
        {
          event_type: payload.type,
          book_id: payload.bookId || null,
          session_id: analyticsSessionId()
        }
      ]),
      keepalive: true
    }).catch(() => {});
    return;
  }

  // No fallback: analytics is a nice-to-have and there is no server route to
  // post to. Without Supabase configured, page views simply are not counted.
}

// A random per-session value, kept only in sessionStorage. No IP, no user agent,
// nothing that identifies a person or survives the session.
function analyticsSessionId() {
  const key = "epubTranslator.analyticsSession";
  let id = readSessionFlag(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    writeSessionFlag(key, id);
  }
  return id;
}

function readSessionFlag(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function writeSessionFlag(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch (_error) {
    // Private-mode storage failures must not break the reader.
  }
}

function debounce(callback, delay) {
  let timeoutId = 0;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}

function initPreferences() {
  const theme = localStorage.getItem("epubTranslator.theme") || "dark";
  applyTheme(theme);

  const font = localStorage.getItem("epubTranslator.fontFamily") || "sans";
  applyFont(font);

  localStorage.setItem(
    "epubTranslator.fontSize",
    localStorage.getItem("epubTranslator.fontSize") || "20"
  );
  if (els.widthPreset) els.widthPreset.value = localStorage.getItem("epubTranslator.widthPreset") || "comfortable";
  updateReaderSettings();
}

function applyTheme(theme) {
  document.body.classList.remove("dark", "theme-sepia", "theme-oled");
  if (theme === "dark") {
    document.body.classList.add("dark");
  } else if (theme === "sepia") {
    document.body.classList.add("theme-sepia");
  } else if (theme === "oled") {
    document.body.classList.add("dark", "theme-oled");
  }
  if (els.themeLabel) els.themeLabel.textContent = theme === "dark" || theme === "oled" ? "Light" : "Dark";
  if (els.readerThemeSelect) els.readerThemeSelect.value = theme;
  localStorage.setItem("epubTranslator.theme", theme);
}

function applyFont(font) {
  document.body.classList.toggle("font-serif", font === "serif");
  document.body.classList.toggle("font-sans", font !== "serif");
  if (els.readerFontFamily) els.readerFontFamily.value = font;
  localStorage.setItem("epubTranslator.fontFamily", font);
}

function updateReaderSettings() {
  const fontSize = Number(localStorage.getItem("epubTranslator.fontSize") || "20");
  const widthMap = {
    compact: "680px",
    comfortable: "820px",
    wide: "1020px"
  };

  document.documentElement.style.setProperty("--content-font-size", `${fontSize}px`);
  document.documentElement.style.setProperty("--document-width", widthMap[els.widthPreset?.value] || widthMap.comfortable);
  if (els.fontSizeLabel) els.fontSizeLabel.textContent = `${fontSize}px`;
  if (els.widthPreset) localStorage.setItem("epubTranslator.widthPreset", els.widthPreset.value);
}

function changeFontSize(delta) {
  const current = Number(localStorage.getItem("epubTranslator.fontSize") || "20");
  const next = Math.min(28, Math.max(16, current + delta));
  localStorage.setItem("epubTranslator.fontSize", String(next));
  updateReaderSettings();
}

function toggleTheme() {
  const current = localStorage.getItem("epubTranslator.theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
}

async function initializeLibrary() {
  countVisit();
  await Promise.all([loadLibraryManifest(), loadRecentProgress()]);
  updateContinueReading();
  // Housekeeping never blocks the landing page.
  requestIdle(() => {
    deleteExpiredCachedBooks().catch((error) => console.warn("Unable to prune the EPUB cache.", error));
    migrateLegacyCache().catch((error) => console.warn("Unable to migrate the EPUB cache.", error));
  });
}

function requestIdle(callback) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(callback, { timeout: 4000 });
  else setTimeout(callback, 1200);
}

async function loadLibraryManifest() {
  try {
    // The catalogue snapshot on the CDN, with the bundled /library.json as the
    // only fallback. There is no server-side catalogue endpoint any more.
    let manifest = await loadCatalogSnapshot();
    if (!manifest) {
      const response = await fetch("/library.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      manifest = await response.json();
    }
    applyLibraryManifest(manifest);
  } catch (error) {
    console.warn("Unable to load the source library.", error);
    els.catalogGrid.innerHTML = "";
    els.catalogEmpty.hidden = false;
    els.catalogPagination.hidden = true;
  }
}

// The snapshot stores the same shape the manifest already uses, so the rest of the
// library code is untouched. A miss returns null and the caller falls back.
async function loadCatalogSnapshot() {
  // Deliberately not gated on READER_CDN_ENABLED. That flag controls where
  // chapters are read from; the catalogue is a static object on the CDN and is
  // the only source of the library now, so gating it here emptied the shelf.
  if (!CDN_BASE) return null;
  try {
    const response = await fetch(`${cdnUrl("catalog/latest.json")}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const snapshot = await response.json();
    if (!snapshot || !Array.isArray(snapshot.books)) return null;
    return { site: snapshot.site || {}, books: snapshot.books };
  } catch (error) {
    console.warn("Không đọc được catalog từ CDN, dùng API.", error);
    return null;
  }
}

function applyLibraryManifest(manifest) {
  libraryState.site = manifest?.site && typeof manifest.site === "object" ? manifest.site : {};
  libraryState.books = Array.isArray(manifest?.books) ? manifest.books.filter(isValidLibraryBook) : [];
  applyLibrarySiteSettings();
  renderFeaturedBook();
  renderGenreOptions();
  renderGenrePills();
  renderRankRail();
  renderCatalog();
  // A shared #book/<id> link only resolves once the catalog has arrived.
  if (!openDetailFromHash()) alignHashedSection();
}

function handleHashChange() {
  if (openDetailFromHash()) return;
  if (!els.bookView.hidden) showLibrary();
  alignHashedSection();
}

function alignHashedSection() {
  if (!["#catalog", "#request", "#support"].includes(window.location.hash)) return;
  const align = () => {
    document.querySelector(window.location.hash)?.scrollIntoView({ block: "start" });
  };
  requestAnimationFrame(() => requestAnimationFrame(align));
  setTimeout(align, 300);
}

function renderFeaturedBook() {
  const sorted = [...libraryState.books].sort((a, b) =>
    Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  );
  const book = sorted.find((item) => item.cover) || sorted[0] || null;
  libraryState.featuredBook = book;
  els.featuredStory.hidden = !book;
  els.featuredRead.disabled = !book;
  if (!book) return;

  const fallbackCover = fallbackCoverForBook(book);
  const backdrop = book.cover || heroVariant(fallbackCover);
  if (els.featuredBackdrop.getAttribute("src") !== backdrop) els.featuredBackdrop.src = backdrop;
  els.featuredBackdrop.addEventListener("error", () => { els.featuredBackdrop.src = heroVariant(fallbackCover); }, { once: true });
  // The same artwork twice: blurred and bled across the panel as light, and sharp
  // as a poster. It is decorative - the heading and the button already name and
  // open the book - so it stays out of the accessibility tree and the tab order.
  if (els.featuredPoster) {
    const poster = book.cover || fallbackCover;
    if (els.featuredPoster.getAttribute("src") !== poster) els.featuredPoster.src = poster;
    els.featuredPoster.addEventListener("error", () => { els.featuredPoster.src = fallbackCover; }, { once: true });
  }
  els.featuredGenre.textContent = book.genre || "Đề cử hôm nay";
  els.featuredStatus.textContent = book.status || "Có sẵn";
  els.featuredTitle.textContent = book.title;
  els.featuredDescription.textContent = book.description || "Mở truyện để xem mục lục và bắt đầu dịch theo chương.";
  els.featuredAuthor.textContent = book.author ? `Tác giả ${book.author}` : "Tác giả đang cập nhật";
  els.featuredChapters.textContent = book.chapterCount ? `${book.chapterCount} chương` : "Định dạng EPUB";
}

function openFeaturedBook() {
  const book = libraryState.featuredBook;
  if (book) loadCatalogBook(book, fallbackCoverForBook(book));
}

window.addEventListener("library:refresh", (event) => {
  if (event.detail?.books) applyLibraryManifest(event.detail);
  else loadLibraryManifest();
});

function isValidLibraryBook(book) {
  if (!book || typeof book.id !== "string" || typeof book.title !== "string") return false;
  // A book is readable two ways: chapters on the CDN, addressed by revision, or a
  // legacy single EPUB URL. Requiring `epub` dropped every CDN book on the floor.
  return typeof book.epub === "string" || Number(book.revision) > 0;
}

function applyLibrarySiteSettings() {
  const name = BRAND_NAME;
  const tagline = libraryState.site.tagline || "Thư viện truyện dịch cá nhân";
  const email = libraryState.site.contactEmail || "minhphuc2308031@gmail.com";
  els.libraryName.textContent = name;
  els.libraryTagline.textContent = tagline;
  els.contactEmail.textContent = email;
  els.contactLink.href = `mailto:${email}?subject=${encodeURIComponent("Yêu cầu thêm truyện vào thư viện")}`;
  els.bookCount.textContent = String(libraryState.books.length);
  els.genreCount.textContent = String(new Set(libraryState.books.map((book) => book.genre).filter(Boolean)).size);
}

function renderGenreOptions() {
  const selected = els.libraryGenre.value;
  const genres = Array.from(new Set(libraryState.books.map((book) => book.genre).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "vi")
  );
  els.libraryGenre.innerHTML = '<option value="">Tất cả thể loại</option>';
  genres.forEach((genre) => {
    const option = document.createElement("option");
    option.value = genre;
    option.textContent = genre;
    els.libraryGenre.appendChild(option);
  });
  els.libraryGenre.value = genres.includes(selected) ? selected : "";
}

// Fades tiles in as they come into view, with a small stagger so a shelf builds
// rather than appearing all at once.
//
// Deliberately additive: the .reveal class is applied here, in script, so a page
// without JS never has hidden content waiting for an observer that will not run.
// Anyone who has asked for less motion gets the content immediately.
const revealObserver =
  typeof IntersectionObserver === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches
    ? new IntersectionObserver(
        (entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-visible");
            // One-shot: re-animating on every scroll past is noise, not polish.
            observer.unobserve(entry.target);
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
      )
    : null;

function revealOnScroll(elements) {
  if (!revealObserver) return;
  const targets = [...elements];
  targets.forEach((element, index) => {
    element.classList.add("reveal");
    element.style.transitionDelay = `${Math.min(index, 8) * 45}ms`;
    revealObserver.observe(element);
  });
  // Insurance. A tile starts at opacity 0, so anything that stops the observer
  // from firing - a container that never intersects, a browser quirk - would
  // leave the shelf permanently blank. Animation is a nicety; showing the books
  // is not, so after a moment they are shown regardless.
  setTimeout(() => {
    for (const element of targets) element.classList.add("is-visible");
  }, 1600);
}

// The ranked rail. A shelf of equal tiles says nothing about what to read first,
// so the longest few get a horizontal strip of their own with the position set in
// big numerals beside the artwork.
// One item's width per click, so the arrows move the rail in the same steps the
// snap points use.
// The bottom bar shipped with "Thư viện" marked active in the markup, which is a
// lie the moment you scroll. This keeps the highlight on whichever section is
// actually in view. Cheap: one observer over four sections, no scroll handler.
function trackMobileBar() {
  const items = [...document.querySelectorAll(".mobile-bar-item")];
  if (!items.length || typeof IntersectionObserver !== "function") return;

  const byId = new Map();
  for (const item of items) {
    const id = (item.getAttribute("href") || "").replace("#", "");
    const section = id && document.getElementById(id);
    if (section) byId.set(section, item);
  }
  if (!byId.size) return;

  const observer = new IntersectionObserver(
    (entries) => {
      // The entry closest to filling the viewport wins, so passing through a
      // short section does not steal the highlight from a long one.
      const best = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!best) return;
      for (const item of items) item.classList.remove("is-active");
      byId.get(best.target)?.classList.add("is-active");
    },
    { threshold: [0.25, 0.5, 0.75] }
  );
  for (const section of byId.keys()) observer.observe(section);
}

function scrollRail(direction) {
  if (!els.rankRail) return;
  const first = els.rankRail.firstElementChild;
  const step = first ? first.getBoundingClientRect().width + 32 : 320;
  els.rankRail.scrollBy({ left: step * direction, behavior: "smooth" });
}

function renderRankRail() {
  if (!els.rankRail) return;
  const ranked = [...libraryState.books]
    .sort((a, b) => Number(b.chapterCount || 0) - Number(a.chapterCount || 0))
    .slice(0, 8);
  els.rankSection.hidden = ranked.length < 3;
  els.rankRail.innerHTML = "";
  ranked.forEach((book, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "rank-item";
    item.addEventListener("click", () => showBookDetail(book));

    const position = document.createElement("span");
    position.className = "rank-number";
    position.textContent = String(index + 1);
    position.setAttribute("aria-hidden", "true");

    const art = document.createElement("span");
    art.className = "rank-art";
    const image = document.createElement("img");
    const fallback = fallbackCoverForBook(book);
    image.src = book.cover || fallback;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => { image.src = fallback; }, { once: true });
    art.appendChild(image);

    const text = document.createElement("span");
    text.className = "rank-text";
    appendTextElement(text, "strong", "", book.title);
    appendTextElement(text, "span", "", `${formatNumber(book.chapterCount)} chương`);

    item.append(position, art, text);
    els.rankRail.appendChild(item);
  });
  revealOnScroll(els.rankRail.children);
}

// Pills instead of a <select>. A dropdown hides the genres until you ask; the
// whole point is that they are the first thing you see. The original select stays
// in the DOM as the single source of the current value so every existing filter
// path keeps working, but it is hidden from assistive tech and the tab order -
// these buttons are the real control.
function renderGenrePills() {
  if (!els.genrePills) return;
  const genres = [...new Set(libraryState.books.map((book) => book.genre).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "vi")
  );
  els.genrePills.hidden = !genres.length;
  els.genrePills.innerHTML = "";
  const current = els.libraryGenre.value;
  for (const [value, label] of [["", "Tất cả"], ...genres.map((genre) => [genre, genre])]) {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "genre-pill";
    pill.textContent = label;
    pill.setAttribute("aria-pressed", String(value === current));
    pill.addEventListener("click", () => {
      els.libraryGenre.value = value;
      resetCatalogPage();
      renderGenrePills();
      document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    els.genrePills.appendChild(pill);
  }
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function renderCatalog() {
  const books = getFilteredCatalogBooks()
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  const totalPages = Math.max(1, Math.ceil(books.length / CATALOG_PAGE_SIZE));
  libraryState.catalogPage = Math.min(Math.max(1, libraryState.catalogPage), totalPages);
  const start = (libraryState.catalogPage - 1) * CATALOG_PAGE_SIZE;
  const visibleBooks = books.slice(start, start + CATALOG_PAGE_SIZE);

  els.catalogGrid.innerHTML = "";
  visibleBooks.forEach((book, index) => els.catalogGrid.appendChild(createBookCard(book, start + index)));
  revealOnScroll(els.catalogGrid.children);
  els.catalogEmpty.hidden = books.length > 0;
  renderCatalogPagination(books.length, totalPages, start, visibleBooks.length);
}

function resetCatalogPage() {
  libraryState.catalogPage = 1;
  renderCatalog();
}

function changeCatalogPage(page) {
  const totalPages = Math.max(1, Math.ceil(getFilteredCatalogBooks().length / CATALOG_PAGE_SIZE));
  const nextPage = Math.min(Math.max(1, page), totalPages);
  if (nextPage === libraryState.catalogPage) return;
  libraryState.catalogPage = nextPage;
  renderCatalog();
  document.getElementById("catalog").scrollIntoView({ behavior: "smooth", block: "start" });
}

function getFilteredCatalogBooks() {
  const query = normalizeSearch(els.librarySearch?.value || "");
  const genre = els.libraryGenre?.value || "";
  const status = els.statusFilter?.value || "";
  const length = els.lengthFilter?.value || "";
  const sort = els.sortOrder?.value || "latest";

  let list = libraryState.books;

  if (activeShelfTab === "myShelf") {
    list = list.filter((book) => userSync && userSync.isBookmarked(book.id));
  }

  list = list
    .filter((book) => !genre || book.genre === genre)
    .filter((book) => !status || (book.status || "Đang cập nhật") === status)
    .filter((book) => {
      if (!length) return true;
      const count = Number(book.chapterCount || book.totalChapters || book.total_chapters || 0);
      if (length === "under500") return count < 500;
      if (length === "500to1000") return count >= 500 && count <= 1000;
      if (length === "over1000") return count > 1000;
      return true;
    })
    .filter((book) => !query || normalizeSearch(`${book.title} ${book.author || ""} ${book.genre || ""}`).includes(query));

  return list.sort((a, b) => {
    if (sort === "chaptersDesc") {
      const ca = Number(a.chapterCount || a.totalChapters || a.total_chapters || 0);
      const cb = Number(b.chapterCount || b.totalChapters || b.total_chapters || 0);
      return cb - ca;
    }
    if (sort === "titleAsc") {
      return String(a.title || "").localeCompare(String(b.title || ""), "vi");
    }
    return (
      Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );
  });
}

function renderCatalogPagination(totalBooks, totalPages, start, visibleCount) {
  els.catalogPagination.hidden = totalBooks === 0;
  if (!totalBooks) return;

  els.catalogPaginationSummary.textContent = `${start + 1}–${start + visibleCount} / ${totalBooks} truyện`;
  els.catalogPrevPage.disabled = libraryState.catalogPage === 1;
  els.catalogNextPage.disabled = libraryState.catalogPage === totalPages;
  els.catalogPageNumbers.innerHTML = "";

  paginationItems(totalPages, libraryState.catalogPage).forEach((item) => {
    if (item === "ellipsis") {
      appendTextElement(els.catalogPageNumbers, "span", "pagination-ellipsis", "…");
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "pagination-page";
    button.textContent = String(item);
    button.setAttribute("aria-label", `Trang ${item}`);
    if (item === libraryState.catalogPage) {
      button.classList.add("active");
      button.setAttribute("aria-current", "page");
    }
    button.addEventListener("click", () => changeCatalogPage(item));
    els.catalogPageNumbers.appendChild(button);
  });
}

function paginationItems(totalPages, currentPage) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = Array.from(new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]))
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });
  return items;
}

function createBookCard(book, index = 0) {
  const article = document.createElement("article");
  article.className = "book-card";

  const coverButton = document.createElement("button");
  coverButton.type = "button";
  coverButton.className = "book-cover";
  const image = document.createElement("img");
  const fallbackCover = fallbackCoverForBook(book);
  image.src = book.cover || fallbackCover;
  image.alt = `Bìa truyện ${book.title}`;
  image.loading = "lazy";
  image.decoding = "async";
  image.width = 480;
  image.height = 720;
  image.addEventListener("error", () => {
    image.src = fallbackCover;
  }, { once: true });
  coverButton.appendChild(image);
  appendTextElement(coverButton, "span", "book-order", String(index + 1).padStart(2, "0"));
  const coverAction = document.createElement("span");
  coverAction.className = "book-cover-action";
  coverAction.setAttribute("aria-hidden", "true");
  coverAction.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="m5 3 14 9-14 9V3Z"></path></svg>';
  coverButton.appendChild(coverAction);
  coverButton.setAttribute("aria-label", `Xem giới thiệu ${book.title}`);
  // The cover opens the preview; the explicit button below still reads directly.
  coverButton.addEventListener("click", () => showBookDetail(book));

  const body = document.createElement("div");
  body.className = "book-card-body";
  const meta = document.createElement("div");
  meta.className = "book-card-meta";
  appendTextElement(meta, "span", "genre-tag", book.genre || "Chưa phân loại");
  appendTextElement(meta, "span", "book-status", book.status || "Có sẵn");
  const title = appendTextElement(body, "h3", "", book.title);
  const author = appendTextElement(body, "p", "book-author", book.author ? `Tác giả: ${book.author}` : "Tác giả chưa cập nhật");
  const description = appendTextElement(body, "p", "book-description", book.description || "Mở truyện để xem mục lục và bắt đầu dịch theo chương.");
  const footer = document.createElement("div");
  footer.className = "book-card-footer";
  const catalogBook = libraryState.books.find((b) => b.id === book.id) || book;
  const translated = Number(catalogBook.translatedChapters || book.translatedChapters || 0);
  const total = Number(catalogBook.chapterCount || book.chapterCount || catalogBook.totalChapters || book.totalChapters || 0);
  if (translated > 0) {
    const badge = document.createElement("span");
    badge.className = "catalog-translate-badge";
    const rawPct = total > 0 ? (translated / total) * 100 : 0;
    const pctLabel = rawPct >= 1 ? `${rawPct.toFixed(0)}%` : `${rawPct.toFixed(1)}%`;
    badge.innerHTML = `<svg class="icon" viewBox="0 0 24 24" style="width:12px;height:12px;display:inline"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Dịch ${translated}/${total} (${pctLabel})`;
    footer.appendChild(badge);
  } else {
    appendTextElement(footer, "span", "", total ? `${total} chương` : "EPUB");
  }
  const readButton = document.createElement("button");
  readButton.type = "button";
  readButton.className = "book-read-button";
  readButton.innerHTML = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z"></path></svg><span>Đọc ngay</span>';
  readButton.addEventListener("click", () => loadCatalogBook(book, fallbackCover));
  footer.appendChild(readButton);
  body.append(meta, title, author, description, footer);
  article.append(coverButton, body);
  return article;
}

// The hero spans the viewport, the cards are ~300 px wide, so the bundled
// fallbacks ship in two sizes instead of one oversized file serving both.
function heroVariant(coverUrl) {
  return coverUrl.startsWith("/library/covers/") ? coverUrl.replace(/\.webp$/, "-hero.webp") : coverUrl;
}

function fallbackCoverForBook(book) {
  const seed = String(book.id || book.title || "tang-thu");
  const hash = Array.from(seed).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return FALLBACK_BOOK_COVERS[hash % FALLBACK_BOOK_COVERS.length];
}

function appendTextElement(parent, tagName, className, value) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value;
  parent.appendChild(element);
  return element;
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function showReader() {
  els.libraryView.hidden = true;
  els.bookView.hidden = true;
  els.readerView.hidden = false;
  window.scrollTo({ top: 0 });
}

function showLibrary() {
  updateContinueReading();
  if (ttsEngine) ttsEngine.stop();
  if (isZenMode) {
    isZenMode = false;
    document.body.classList.remove("zen-mode");
    if (els.zenExitBtn) els.zenExitBtn.hidden = true;
    if (els.zenModeBtn) els.zenModeBtn.classList.remove("is-active");
  }
  els.readerView.hidden = true;
  els.bookView.hidden = true;
  els.libraryView.hidden = false;
  libraryState.detailBook = null;
  updatePageMeta();
  if (window.location.hash.startsWith("#book/")) {
    history.replaceState(null, "", `${window.location.pathname}#catalog`);
  }
  window.scrollTo({ top: 0 });
}

function showToast(message, duration = 2500) {
  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove("visible");
  }, duration);
}

// A preview step between the catalog and the reader: everything here comes from
// the catalog manifest, so no EPUB is downloaded until the reader asks for it.
async function showBookDetail(book, { updateHash = true } = {}) {
  libraryState.detailBook = book;
  els.libraryView.hidden = true;
  els.readerView.hidden = true;
  els.bookView.hidden = false;
  if (updateHash) history.replaceState(null, "", `${window.location.pathname}#book/${encodeURIComponent(book.id)}`);
  
  const fallbackCover = fallbackCoverForBook(book);
  const cover = book.cover || fallbackCover;
  const fullCoverUrl = cover.startsWith("http") ? cover : (cover.startsWith("/") ? `${window.location.origin}${cover}` : `${CDN_BASE}/${cover}`);
  updatePageMeta({
    title: book.title,
    description: book.description,
    image: fullCoverUrl,
    url: `${window.location.origin}/?book=${encodeURIComponent(book.id)}`,
    book
  });
  window.scrollTo({ top: 0 });

  els.bookViewCover.src = cover;
  els.bookViewCover.alt = `Bìa truyện ${book.title}`;
  els.bookViewCover.addEventListener("error", () => { els.bookViewCover.src = fallbackCover; }, { once: true });
  els.bookViewBackdrop.src = book.cover || heroVariant(fallbackCover);
  els.bookViewGenre.textContent = book.genre || "Chưa phân loại";
  els.bookViewStatus.textContent = book.status || "Có sẵn";
  els.bookViewTitle.textContent = book.title;
  els.bookViewAuthor.textContent = book.author ? `Tác giả: ${book.author}` : "Tác giả chưa cập nhật";
  els.bookViewChapters.textContent = book.chapterCount ? `${book.chapterCount} chương` : "Định dạng EPUB";
  const catalogBook = libraryState.books.find((b) => b.id === book.id) || book;
  const totalCh = Number(catalogBook.chapterCount || catalogBook.totalChapters || book.chapterCount || book.totalChapters || 0);
  const transCh = Number(catalogBook.translatedChapters || book.translatedChapters || 0);

  let transPctStr = "0%";
  let fillWidthPct = 0;
  if (totalCh > 0 && transCh > 0) {
    const rawPct = (transCh / totalCh) * 100;
    if (rawPct >= 100 || transCh >= totalCh) {
      transPctStr = "100%";
      fillWidthPct = 100;
    } else if (rawPct >= 1) {
      transPctStr = `${rawPct.toFixed(1)}%`;
      fillWidthPct = rawPct;
    } else {
      transPctStr = `${rawPct.toFixed(2)}%`;
      fillWidthPct = Math.max(3.5, rawPct);
    }
  } else if (book.status === "Hoàn thành") {
    transPctStr = "100%";
    fillWidthPct = 100;
  }

  if (els.bookViewTranslateProgress) {
    els.bookViewTranslateProgress.textContent = transCh > 0 ? `${transCh.toLocaleString("vi-VN")} / ${totalCh.toLocaleString("vi-VN")} chương` : (book.status === "Hoàn thành" ? "Hoàn tất" : "Đang cập nhật");
  }
  if (els.bookViewTranslatePercent) {
    els.bookViewTranslatePercent.textContent = transPctStr;
  }
  if (els.bookViewTranslateFill) {
    els.bookViewTranslateFill.style.width = `${fillWidthPct}%`;
  }

  renderBookDescription(book.description);
  renderRelatedBooks(book);
  updateBookViewBookmark(book);

  els.bookViewProgress.textContent = "Đang kiểm tra...";
  els.bookViewReadLabel.textContent = "Đọc từ đầu";
  els.bookViewRestart.hidden = true;

  const progress = await readProgress(`library:${book.id}:${book.updatedAt || "current"}`).catch(() => null);
  if (libraryState.detailBook !== book) return;
  if (progress?.chapterCount) {
    const index = Math.min(Number(progress.currentIndex) || 0, progress.chapterCount - 1);
    els.bookViewProgress.textContent = `${progress.chapterTitle || `Chương ${index + 1}`} · ${index + 1}/${progress.chapterCount}`;
    els.bookViewReadLabel.textContent = `Đọc tiếp chương ${index + 1}`;
    els.bookViewRestart.hidden = false;
  } else {
    els.bookViewProgress.textContent = "Chưa đọc";
  }
}

// The catalog description is plain text from Gemini, so paragraphs are rebuilt
// with textContent rather than innerHTML.
function renderBookDescription(description) {
  const paragraphs = String(description || "").split(/\n{2,}|\n/).map((line) => line.trim()).filter(Boolean);
  if (!paragraphs.length) {
    els.bookViewDescription.replaceChildren();
    appendTextElement(els.bookViewDescription, "p", "book-view-empty", "Truyện này chưa có phần giới thiệu.");
    return;
  }
  const fragment = document.createDocumentFragment();
  paragraphs.forEach((line) => appendTextElement(fragment, "p", "", line));
  els.bookViewDescription.replaceChildren(fragment);
}

function renderRelatedBooks(book) {
  const related = libraryState.books
    .filter((item) => item.id !== book.id && item.genre && item.genre === book.genre)
    .slice(0, 6);

  const fragment = document.createDocumentFragment();
  related.forEach((item) => {
    const fallbackCover = fallbackCoverForBook(item);
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "book-view-related-item";
    const image = document.createElement("img");
    image.src = item.cover || fallbackCover;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.width = 480;
    image.height = 720;
    image.addEventListener("error", () => { image.src = fallbackCover; }, { once: true });
    entry.appendChild(image);
    const copy = document.createElement("span");
    appendTextElement(copy, "strong", "", item.title);
    appendTextElement(copy, "small", "", item.chapterCount ? `${item.chapterCount} chương` : "EPUB");
    entry.appendChild(copy);
    entry.addEventListener("click", () => showBookDetail(item));
    fragment.appendChild(entry);
  });

  els.bookViewRelated.replaceChildren(fragment);
  els.bookViewRelatedEmpty.hidden = related.length > 0;
}

function updateBookViewBookmark(book) {
  if (!els.bookViewBookmark || !book) return;
  const bookmarked = userSync && userSync.isBookmarked(book.id);
  els.bookViewBookmark.classList.toggle("is-bookmarked", Boolean(bookmarked));
  if (els.bookViewBookmarkLabel) {
    els.bookViewBookmarkLabel.textContent = bookmarked ? "Đã lưu vào tủ" : "Lưu vào tủ truyện";
  }
}

function openDetailFromHash() {
  const match = window.location.hash.match(/^#book\/(.+)$/);
  if (!match) return false;
  const id = decodeURIComponent(match[1]);
  const book = libraryState.books.find((item) => item.id === id);
  if (!book) return false;
  showBookDetail(book, { updateHash: false });
  return true;
}

async function resumeCachedBook() {
  const progress = libraryState.recentProgress;
  if (!state.chapters.length && progress) {
    showReader();
    setBusy(`Đang mở ${progress.title || "truyện đã lưu"}...`);
    try {
      const cachedBook = await readCachedBook(progress.id);
      if (!cachedBook) throw new Error("Bản lưu trên thiết bị đã hết hạn.");
      await openCachedBook(cachedBook, progress.currentIndex || 0);
    } catch (error) {
      resetReader(`Không thể mở bản đã lưu: ${error.message}`);
    }
    return;
  }
  if (state.chapters.length) showReader();
}

function updateContinueReading() {
  const progress = libraryState.recentProgress;
  if (!progress || !progress.chapterCount) {
    els.continueSection.hidden = true;
    return;
  }
  const index = Math.min(Number(progress.currentIndex) || 0, progress.chapterCount - 1);
  els.continueTitle.textContent = progress.title || progress.fileName || "EPUB gần đây";
  els.continueMeta.textContent = `${progress.chapterTitle || `Chương ${index + 1}`} · ${index + 1}/${progress.chapterCount}`;
  els.continueSection.hidden = false;
}

async function loadCatalogBook(book, assignedFallbackCover = fallbackCoverForBook(book), { startAtFirstChapter = false } = {}) {
  showReader();
  setBusy(`Đang tải ${book.title}...`);
  els.bookTitle.textContent = book.title;
  els.bookMeta.textContent = "Đang chuẩn bị mục lục...";
  els.readerBookCover.src = book.cover || assignedFallbackCover;

  const bookId = `library:${book.id}:${book.updatedAt || "current"}`;
  const cover = book.cover || assignedFallbackCover;
  countBookOpened(book.id);

  // Preferred path: one small chapter JSON from the CDN. Falls through to the
  // legacy EPUB download if the book has not been ingested yet or the CDN misses.
  if (READER_CDN_ENABLED) {
    try {
      if (await openBookFromCdn(book, cover, { startAtFirstChapter })) return;
    } catch (error) {
      console.warn("Đường CDN lỗi, chuyển sang EPUB.", error);
    }
  }

  // Only a legacy book can go down the EPUB path; a CDN-only book has no archive
  // to fall back to, so say so instead of failing on an undefined URL.
  if (typeof book.epub !== "string" || !book.epub) {
    resetReader("Truyện này chưa tải được từ CDN. Thử lại sau ít phút.");
    return;
  }

  state.mode = "epub";

  try {
    // A parsed copy on the device means no EPUB download and no re-parse at all.
    const cachedBook = await readCachedBook(bookId).catch(() => null);
    if (cachedBook?.chapters?.length) {
      const savedProgress = startAtFirstChapter ? null : await readProgress(bookId).catch(() => null);
      await openCachedBook(cachedBook, Number(savedProgress?.currentIndex) || 0);
      return;
    }

    const response = await fetch(book.epub);
    if (!response.ok) throw new Error(`Không tải được EPUB (HTTP ${response.status}).`);
    const arrayBuffer = await response.arrayBuffer();
    await applyLoadedEpub(arrayBuffer, {
      bookId,
      fileName: book.epub.split("/").pop() || `${book.id}.epub`,
      displayTitle: book.title,
      cover,
      startAtFirstChapter
    });
  } catch (error) {
    resetReader(`Không thể mở truyện: ${error.message}`);
  }
}

async function applyLoadedEpub(arrayBuffer, options) {
  const book = await parseEpub(arrayBuffer, options.fileName);
  if (!book.chapters.length) throw new Error("Không tìm thấy chương có thể đọc.");

  const savedProgress = options.startAtFirstChapter ? null : await readProgress(options.bookId).catch(() => null);
  state.bookId = options.bookId;
  state.fileName = options.fileName;
  state.title = options.displayTitle || book.title || options.fileName.replace(/\.epub$/i, "");
  state.cover = options.cover || fallbackCoverForBook({ id: state.bookId, title: state.title });
  state.chapters = book.chapters;
  state.translations = {};

  applyReaderHeader();
  renderChapterControls();
  // The chapter text is written once per book; navigation only touches progress.
  await putCachedBook(buildBookRecord());
  const savedIndex = options.startAtFirstChapter
    ? 0
    : Number(savedProgress?.currentIndex ?? localStorage.getItem(currentChapterKey()) ?? "0");
  goToChapter(Number.isInteger(savedIndex) ? savedIndex : 0);
}

async function openCachedBook(cachedBook, index) {
  applyCachedBook(cachedBook);
  renderChapterControls();
  await touchCachedBook(cachedBook);
  goToChapter(index);
  showReader();
}

function applyReaderHeader() {
  els.bookTitle.textContent = state.title;
  els.bookMeta.textContent = `${BRAND_NAME} · ${state.chapters.length} chương · Lưu tiến độ 7 ngày`;
  els.readerBookCover.src = state.cover;
  document.title = `${state.title} | ${BRAND_NAME}`;
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  showReader();
  setBusy("Đang mở EPUB từ thiết bị...");

  try {
    const arrayBuffer = await file.arrayBuffer();
    await applyLoadedEpub(arrayBuffer, {
      bookId: makeBookId(file),
      fileName: file.name
    });
  } catch (error) {
    resetReader(`Không thể mở EPUB: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

async function parseEpub(arrayBuffer, fileName) {
  const JSZipModule = await loadJsZip();
  const zip = await JSZipModule.loadAsync(arrayBuffer);
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("Thiếu META-INF/container.xml.");

  const containerXml = parser.parseFromString(await containerFile.async("text"), "application/xml");
  const opfPath = containerXml.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("Không tìm thấy OPF package.");

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error("Không mở được OPF package.");

  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfXml = parser.parseFromString(await opfFile.async("text"), "application/xml");
  const title = textOf(opfXml, "metadata title") || fileName.replace(/\.epub$/i, "");
  const manifest = buildManifest(opfXml, opfDir);
  const spineItems = Array.from(opfXml.querySelectorAll("spine itemref"))
    .map((item) => manifest.get(item.getAttribute("idref")))
    .filter(Boolean);
  const navTitles = await readNavigationTitles(zip, opfXml, manifest);

  const documentItems = spineItems.filter(
    (item) => zip.file(item.href) && isDocumentType(item.mediaType, item.href)
  );

  // Inflating and parsing spine entries in batches keeps a 1000-chapter novel
  // from serialising a thousand round trips through the zip reader.
  const parsed = await mapWithConcurrency(documentItems, CHAPTER_DECODE_CONCURRENCY, async (item) => {
    const html = await zip.file(item.href).async("text");
    const text = extractReadableText(html);
    if (!text) return null;
    return {
      navTitle: navTitles.get(stripFragment(item.href)) || "",
      html,
      text
    };
  });

  const chapters = [];
  for (const entry of parsed) {
    if (!entry) continue;
    chapters.push(
      buildChapter(
        entry.navTitle || guessChapterTitle(entry.html) || `Chương ${chapters.length + 1}`,
        entry.text
      )
    );
  }

  return { title, chapters };
}

// The word count is stored with the chapter so the sidebar never has to re-scan
// the whole book while the reader types in the search box.
function buildChapter(title, text) {
  return { title, text, words: countWords(text) };
}

function countWords(text) {
  const matches = String(text || "").match(/\S+/g);
  return matches ? matches.length : 0;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function buildManifest(opfXml, opfDir) {
  const manifest = new Map();
  for (const item of opfXml.querySelectorAll("manifest item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      href: normalizeZipPath(opfDir + href),
      mediaType: item.getAttribute("media-type") || "",
      properties: item.getAttribute("properties") || ""
    });
  }
  return manifest;
}

async function readNavigationTitles(zip, opfXml, manifest) {
  const titles = new Map();
  const navItem = Array.from(manifest.values()).find((item) => item.properties.includes("nav"));
  if (navItem && zip.file(navItem.href)) {
    const navDoc = parser.parseFromString(await zip.file(navItem.href).async("text"), "text/html");
    for (const link of navDoc.querySelectorAll("nav a[href]")) {
      titles.set(resolveRelative(navItem.href, link.getAttribute("href")), normalizeSpace(link.textContent));
    }
  }

  const ncxId = opfXml.querySelector("spine")?.getAttribute("toc");
  const ncxItem = ncxId ? manifest.get(ncxId) : Array.from(manifest.values()).find((item) => item.href.endsWith(".ncx"));
  if (ncxItem && zip.file(ncxItem.href)) {
    const ncx = parser.parseFromString(await zip.file(ncxItem.href).async("text"), "application/xml");
    for (const navPoint of ncx.querySelectorAll("navPoint")) {
      const src = navPoint.querySelector("content")?.getAttribute("src");
      const label = normalizeSpace(navPoint.querySelector("navLabel text")?.textContent || "");
      if (src && label) titles.set(resolveRelative(ncxItem.href, src), label);
    }
  }

  return titles;
}

function extractReadableText(html) {
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, nav, header, footer, aside").forEach((node) => node.remove());

  const blocks = Array.from(
    doc.body.querySelectorAll("h1, h2, h3, h4, h5, h6, p, div, section, article, blockquote, li")
  );
  const paragraphs = blocks
    .map((node) => normalizeSpace(node.textContent))
    .filter((text, index, list) => text && text !== list[index - 1]);

  if (paragraphs.length) return paragraphs.join("\n\n");
  return normalizeSpace(doc.body.textContent || "");
}

function guessChapterTitle(html) {
  const doc = parser.parseFromString(html, "text/html");
  return normalizeSpace(doc.querySelector("h1, h2, h3, title")?.textContent || "");
}

function renderChapterControls() {
  const query = els.globalSearch.value.trim().toLowerCase();
  const optionFragment = document.createDocumentFragment();
  const listFragment = document.createDocumentFragment();
  let visibleCount = 0;

  state.chapters.forEach((chapter, index) => {
    const title = displayChapterTitle(index);
    if (query && !title.toLowerCase().includes(query)) return;

    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = title;
    optionFragment.appendChild(option);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "document-item";
    button.dataset.index = String(index);
    if (index === state.currentIndex) button.classList.add("active");
    const chapterIndex = appendTextElement(button, "span", "document-index", String(index + 1));
    chapterIndex.setAttribute("aria-hidden", "true");
    appendTextElement(button, "span", "", title);
    appendTextElement(button, "small", "", formatWordCount(chapter));
    listFragment.appendChild(button);
    visibleCount += 1;
  });

  if (!visibleCount) appendTextElement(listFragment, "div", "empty-list", "Không tìm thấy chương phù hợp");

  // One replaceChildren per render instead of two appends per chapter.
  els.chapterSelect.replaceChildren(optionFragment);
  els.chapterList.replaceChildren(listFragment);
  els.documentCount.textContent = String(state.chapters.length);
  els.chapterSelect.disabled = !state.chapters.length;
  if (state.chapters.length) els.chapterSelect.value = String(state.currentIndex);
}

function goToChapter(index) {
  if (!state.chapters.length) return;
  state.currentIndex = Math.min(Math.max(index, 0), state.chapters.length - 1);

  const chapter = state.chapters[state.currentIndex];
  els.sourceText.textContent = chapter.text || "";
  const documentLabel = displayChapterTitle(state.currentIndex);
  const chapterLabel = `${documentLabel} · ${state.currentIndex + 1} / ${state.chapters.length}`;
  const progress = Math.ceil(((state.currentIndex + 1) / state.chapters.length) * 100);
  els.paperTitle.textContent = documentLabel;
  els.progressLabel.textContent = `${progress}%`;
  els.progressBar.style.width = `${progress}%`;
  els.chapterCounter.textContent = chapterLabel;
  els.bottomChapterCounter.textContent = chapterLabel;
  els.chapterSelect.value = String(state.currentIndex);

  if (state.title) {
    const coverUrl = state.cover ? (state.cover.startsWith("http") ? state.cover : (state.cover.startsWith("/") ? `${window.location.origin}${state.cover}` : `${CDN_BASE}/${state.cover}`)) : null;
    updatePageMeta({
      title: `${documentLabel} — ${state.title}`,
      description: `Đọc ${documentLabel} truyện ${state.title} (${state.author || "Khuyết danh"}) trên Trạm Chữ`,
      image: coverUrl,
      url: `${window.location.origin}/?book=${encodeURIComponent(state.bookId)}&ch=${state.currentIndex + 1}`,
      book: { title: state.title, author: state.author, genre: state.genre }
    });
  }

  const isFirstChapter = state.currentIndex === 0;
  const isLastChapter = state.currentIndex === state.chapters.length - 1;
  els.prevChapter.disabled = isFirstChapter;
  els.bottomPrevChapter.disabled = isFirstChapter;
  els.nextChapter.disabled = isLastChapter;
  els.bottomNextChapter.disabled = isLastChapter;
  els.translateButton.disabled = false;

  els.chapterList.querySelector(".document-item.active")?.classList.remove("active");
  els.chapterList.querySelector(`.document-item[data-index="${state.currentIndex}"]`)?.classList.add("active");

  saveProgressSoon();
  if (state.mode === "cdn") loadCdnChapter(state.currentIndex);
  else loadCachedTranslation();
  setTimeout(() => preloadNextChapter(state.currentIndex + 1), 600);
}

function preloadNextChapter(nextIndex) {
  if (!state.bookId || nextIndex >= state.chapters.length) return;
  if (typeof state.translations[nextIndex] === "string") return;

  if (state.mode === "cdn" && state.cdnTemplate) {
    const url = state.cdnTemplate.replace("{index}", String(nextIndex));
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.translated) {
          state.translations[nextIndex] = data.translated;
          putTranslation(state.bookId, nextIndex, data.translated).catch(() => {});
        }
      })
      .catch(() => {});
  } else {
    readTranslation(state.bookId, nextIndex)
      .then((cached) => {
        if (cached) state.translations[nextIndex] = cached;
      })
      .catch(() => {});
  }
}

function toggleAutoScroll() {
  if (isAutoScrolling) stopAutoScroll();
  else startAutoScroll();
}

function startAutoScroll() {
  if (isAutoScrolling) return;
  isAutoScrolling = true;
  els.autoScrollBtn?.classList.add("is-active");
  if (els.autoScrollLabel) els.autoScrollLabel.textContent = "Dừng";

  let lastTimestamp = performance.now();

  function scrollStep(now) {
    if (!isAutoScrolling) return;
    const delta = now - lastTimestamp;
    lastTimestamp = now;

    const speedMultiplier = Number(els.autoScrollSpeed?.value || 1);
    const pixelsPerSecond = 40 * speedMultiplier;
    const scrollAmount = (pixelsPerSecond * delta) / 1000;

    window.scrollBy({ top: scrollAmount, behavior: "auto" });

    // When reaching the bottom of the page, smoothly transition to next chapter
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 30) {
      if (state.currentIndex < state.chapters.length - 1) {
        goToChapter(state.currentIndex + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        stopAutoScroll();
        return;
      }
    }

    autoScrollRaf = requestAnimationFrame(scrollStep);
  }

  autoScrollRaf = requestAnimationFrame(scrollStep);
}

function stopAutoScroll() {
  isAutoScrolling = false;
  if (autoScrollRaf) {
    cancelAnimationFrame(autoScrollRaf);
    autoScrollRaf = null;
  }
  els.autoScrollBtn?.classList.remove("is-active");
  if (els.autoScrollLabel) els.autoScrollLabel.textContent = "Cuộn";
}

function initQuoteCardAndSelection() {
  document.addEventListener("selectionchange", debounce(handleSelectionChange, 120));

  els.quoteCopyBtn?.addEventListener("click", () => {
    if (!selectedQuoteText) return;
    navigator.clipboard?.writeText(selectedQuoteText);
    hideSelectionTooltip();
  });

  els.quoteCardBtn?.addEventListener("click", () => {
    if (!selectedQuoteText) return;
    openQuoteCardModal(selectedQuoteText);
    hideSelectionTooltip();
  });

  els.quoteDialogClose?.addEventListener("click", () => els.quoteDialog?.close());
  els.quoteDialog?.addEventListener("click", (e) => {
    if (e.target === els.quoteDialog) els.quoteDialog.close();
  });

  els.quoteDownloadBtn?.addEventListener("click", () => {
    if (!els.quoteCanvas) return;
    const link = document.createElement("a");
    link.download = `trich-dan-${Date.now()}.png`;
    link.href = els.quoteCanvas.toDataURL("image/png");
    link.click();
  });

  els.quoteCopyImgBtn?.addEventListener("click", () => {
    if (!els.quoteCanvas || !navigator.clipboard) return;
    els.quoteCanvas.toBlob((blob) => {
      if (blob) {
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).catch(() => {});
        if (els.quoteCopyImgBtn) {
          els.quoteCopyImgBtn.textContent = "✓ Đã sao chép";
          setTimeout(() => { if (els.quoteCopyImgBtn) els.quoteCopyImgBtn.textContent = "Sao chép ảnh"; }, 2000);
        }
      }
    });
  });
}

function initZenModeController() {
  function toggleZenMode() {
    isZenMode = !isZenMode;
    document.body.classList.toggle("zen-mode", isZenMode);
    if (els.zenExitBtn) els.zenExitBtn.hidden = !isZenMode;
    if (els.zenModeBtn) els.zenModeBtn.classList.toggle("is-active", isZenMode);

    if (isZenMode) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      showToast("Chế độ Zen: Bấm Esc hoặc Z để thoát");
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  els.zenModeBtn?.addEventListener("click", toggleZenMode);
  els.zenExitBtn?.addEventListener("click", toggleZenMode);

  window.addEventListener("keydown", (e) => {
    if (els.readerView.hidden) return;
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "z" || e.key === "Z" || e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleZenMode();
    } else if (e.key === "Escape" && isZenMode) {
      toggleZenMode();
    }
  });
}

function initTTSController() {
  ttsEngine = createTTS();

  ttsEngine.onParagraphChange = (index) => {
    const paragraphs = els.translationText.querySelectorAll(".tts-paragraph-highlight");
    paragraphs.forEach((p, idx) => {
      if (idx === index) {
        p.classList.add("tts-active");
        p.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        p.classList.remove("tts-active");
      }
    });
  };

  ttsEngine.onStateChange = ({ isPlaying, isPaused, hasTimer, timerLabel }) => {
    if (els.ttsAudioBar) {
      els.ttsAudioBar.hidden = !isPlaying && !isPaused;
      els.ttsAudioBar.classList.toggle("is-paused", isPaused);
    }
    if (els.ttsToggleBtn) {
      els.ttsToggleBtn.classList.toggle("is-active", isPlaying || isPaused);
    }
    if (els.ttsToggleLabel) {
      els.ttsToggleLabel.textContent = isPlaying ? (isPaused ? "Đang dừng" : "Đang đọc") : "Nghe đọc";
    }
    if (els.ttsStatusText) {
      els.ttsStatusText.textContent = isPaused ? "Tạm dừng" : "Đang phát...";
    }
    const playIcon = els.ttsPlayPauseBtn?.querySelector(".tts-icon-play");
    const pauseIcon = els.ttsPlayPauseBtn?.querySelector(".tts-icon-pause");
    if (playIcon) playIcon.hidden = isPlaying && !isPaused;
    if (pauseIcon) pauseIcon.hidden = !isPlaying || isPaused;

    if (els.ttsTimerBtn) {
      els.ttsTimerBtn.classList.toggle("has-timer", hasTimer);
    }
    if (els.ttsTimerLabel) {
      els.ttsTimerLabel.textContent = timerLabel || "Hẹn giờ";
    }
  };

  ttsEngine.onTimerTick = (timeStr) => {
    if (els.ttsTimerLabel) els.ttsTimerLabel.textContent = timeStr || "Hẹn giờ";
  };

  ttsEngine.onFinished = () => {
    if (state.currentIndex < state.chapters.length - 1) {
      showToast("Chuyển sang chương tiếp theo...");
      goToChapter(state.currentIndex + 1);
      setTimeout(() => {
        startTTSFromCurrent();
      }, 1000);
    } else {
      ttsEngine.stop();
      showToast("Đã đọc hết bộ truyện.");
    }
  };

  function startTTSFromCurrent() {
    const chapter = state.chapters[state.currentIndex];
    const text = state.translations[state.currentIndex] || (chapter && chapter.text ? chapter.text : "");
    if (!text || isChineseText(text) || els.translationText.classList.contains("empty") || text.includes("Chưa có bản dịch") || text.includes("Đang tải")) {
      showToast("Chương này chưa có bản dịch tiếng Việt để đọc");
      return;
    }

    const rawParagraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    els.translationText.innerHTML = "";
    rawParagraphs.forEach((pText, i) => {
      const pEl = document.createElement("p");
      pEl.className = "tts-paragraph-highlight";
      pEl.dataset.parIndex = String(i);
      pEl.textContent = pText;
      pEl.addEventListener("click", () => {
        if (ttsEngine.isPlaying) {
          ttsEngine.speakParagraph(i);
        }
      });
      els.translationText.appendChild(pEl);
    });

    ttsEngine.loadText(text);
    ttsEngine.play(0);
  }

  els.ttsToggleBtn?.addEventListener("click", () => {
    if (ttsEngine.isPlaying || ttsEngine.isPaused) {
      if (ttsEngine.isPaused) ttsEngine.resume();
      else ttsEngine.pause();
    } else {
      startTTSFromCurrent();
    }
  });

  els.ttsPlayPauseBtn?.addEventListener("click", () => {
    if (ttsEngine.isPaused) ttsEngine.resume();
    else if (ttsEngine.isPlaying) ttsEngine.pause();
    else startTTSFromCurrent();
  });

  els.ttsPrevParBtn?.addEventListener("click", () => ttsEngine.previous());
  els.ttsNextParBtn?.addEventListener("click", () => ttsEngine.next());

  function populateVoiceSelect(voices, currentSelected) {
    if (!els.ttsVoiceSelect) return;
    const available = ttsEngine.getAvailableVoices();
    els.ttsVoiceSelect.innerHTML = "";
    if (!available.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Giọng mặc định";
      els.ttsVoiceSelect.appendChild(opt);
      return;
    }
    const savedVoice = localStorage.getItem("epubTranslator.ttsVoice");
    available.forEach((v) => {
      const opt = document.createElement("option");
      const uri = v.voiceURI || v.name;
      opt.value = uri;
      const isVi = ttsEngine.isVietnameseVoice(v);
      const prefix = isVi ? "🇻🇳 " : "🌐 ";
      opt.textContent = `${prefix}${v.name.replace(/(Microsoft|Google|Apple)\s*/i, "").slice(0, 18)}`;
      if (savedVoice ? savedVoice === uri : (currentSelected && (currentSelected.voiceURI === uri || currentSelected.name === uri))) {
        opt.selected = true;
      }
      els.ttsVoiceSelect.appendChild(opt);
    });
    if (savedVoice) {
      ttsEngine.setVoice(savedVoice);
    }
  }

  ttsEngine.onVoicesLoaded = (voices, selected) => {
    populateVoiceSelect(voices, selected);
  };

  els.ttsVoiceSelect?.addEventListener("change", (e) => {
    ttsEngine.setVoice(e.target.value);
    localStorage.setItem("epubTranslator.ttsVoice", e.target.value);
    showToast("Đã đổi giọng đọc");
  });

  els.ttsSpeedSelect?.addEventListener("change", (e) => {
    ttsEngine.setSpeed(Number(e.target.value));
  });

  els.ttsTimerBtn?.addEventListener("click", () => {
    els.sleepTimerDialog?.showModal();
  });

  els.sleepTimerClose?.addEventListener("click", () => {
    els.sleepTimerDialog?.close();
  });

  els.sleepTimerDialog?.addEventListener("click", (e) => {
    if (e.target === els.sleepTimerDialog) els.sleepTimerDialog.close();
  });

  document.querySelectorAll(".sleep-option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mins = Number(btn.dataset.minutes);
      ttsEngine.setSleepTimer(mins);
      els.sleepTimerDialog?.close();
      if (mins === 0) showToast("Đã tắt hẹn giờ");
      else if (mins === -1) showToast("Sẽ dừng sau khi đọc xong chương này");
      else showToast(`Sẽ tự động tắt sau ${mins} phút`);
    });
  });

  els.ttsStopCloseBtn?.addEventListener("click", () => {
    ttsEngine.stop();
  });
}

function handleSelectionChange() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideSelectionTooltip();
    return;
  }

  const text = selection.toString().trim();
  if (text.length < 5 || text.length > 500) {
    hideSelectionTooltip();
    return;
  }

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const isInsideReader = els.translationText?.contains(container) || els.sourceText?.contains(container);

  if (!isInsideReader) {
    hideSelectionTooltip();
    return;
  }

  selectedQuoteText = text;
  const rect = range.getBoundingClientRect();
  if (els.selectionTooltip) {
    els.selectionTooltip.style.top = `${rect.top + window.scrollY}px`;
    els.selectionTooltip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
    els.selectionTooltip.hidden = false;
  }
}

function hideSelectionTooltip() {
  if (els.selectionTooltip) els.selectionTooltip.hidden = true;
}

function openQuoteCardModal(text) {
  if (!els.quoteCanvas || !els.quoteDialog) return;
  const theme = localStorage.getItem("epubTranslator.theme") || "dark";
  const bookTitle = state.title || libraryState.detailBook?.title || "Trạm Chữ";
  const author = libraryState.detailBook?.author || "";

  renderQuoteCard({
    canvas: els.quoteCanvas,
    quote: text,
    bookTitle,
    author,
    theme
  });

  if (els.quotePreviewImg) {
    els.quotePreviewImg.src = els.quoteCanvas.toDataURL("image/png");
  }
  els.quoteDialog.showModal();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

// Translations live in their own object store, so switching chapters reads and
// writes a single small record instead of the whole book.
function loadCachedTranslation() {
  const index = state.currentIndex;
  const bookId = state.bookId;
  const inMemory = state.translations[index];
  if (typeof inMemory === "string") {
    renderTranslation(inMemory, index);
    return;
  }

  renderTranslation("", index);
  readTranslation(bookId, index)
    .then((cached) => {
      if (!cached || bookId !== state.bookId || index !== state.currentIndex) return;
      state.translations[index] = cached;
      renderTranslation(cached, index);
    })
    .catch((error) => console.warn("Unable to read the cached translation.", error));
}

function renderTranslation(cached, index) {
  const chapter = state.chapters[index];
  if (cached && chapter && !isUsableTranslation(chapter.text, cached)) {
    delete state.translations[index];
    deleteTranslation(state.bookId, index).catch(() => {});
    cached = "";
  }

  if (cached) {
    const watermarked = applyInvisibleWatermark(cached);
    const rawParagraphs = watermarked.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    els.translationText.innerHTML = "";
    rawParagraphs.forEach((pText, i) => {
      const pEl = document.createElement("p");
      pEl.className = "tts-paragraph-highlight";
      pEl.dataset.parIndex = String(i);
      pEl.textContent = pText;
      pEl.addEventListener("click", () => {
        if (ttsEngine && ttsEngine.isPlaying) {
          ttsEngine.speakParagraph(i);
        }
      });
      els.translationText.appendChild(pEl);
    });

    els.translationText.classList.remove("empty", "status-error", "is-loading");
    els.outputStatus.textContent = "Đã lưu";
    els.translateButton.hidden = true;
    els.retranslateButton.hidden = false;

    if (ttsEngine && ttsEngine.isPlaying && !ttsEngine.isPaused) {
      ttsEngine.loadText(cached);
      ttsEngine.play(0);
    }

    const extracted = extractTitleFromContent(cached);
    if (extracted && chapter && chapter.translatedTitle !== extracted) {
      chapter.translatedTitle = extracted;
      syncChapterUiTitle(index);
    }
  } else {
    els.translationText.textContent = "Chưa có bản dịch.";
    els.translationText.classList.add("empty");
    els.translationText.classList.remove("status-error", "is-loading");
    els.outputStatus.textContent = "Chờ dịch";
    els.translateButton.hidden = false;
    els.retranslateButton.hidden = true;
  }
}

async function translateCurrentChapter(force) {
  // CDN chapters arrive already translated. Guard so no reader can ever trigger
  // a Gemini call, even if a stale button is clicked.
  if (state.mode === "cdn") return;
  const chapter = state.chapters[state.currentIndex];
  if (!chapter) return;

  if (!force) {
    const cached = state.translations[state.currentIndex] || (await readTranslation(state.bookId, state.currentIndex));
    if (cached) {
      state.translations[state.currentIndex] = cached;
      renderTranslation(cached, state.currentIndex);
      return;
    }
  }
  setTranslationStatus("Processing document...");
  els.outputStatus.textContent = "Đang dịch";
  els.translateButton.disabled = true;
  els.retranslateButton.disabled = true;

  try {
    // On-demand translation needed a server that could call Gemini. Nothing in
    // this deployment can: translation happens once, during ingest, in GitHub
    // Actions, and the result is served as a static file. A chapter that arrives
    // untranslated is waiting in the queue, not waiting for a click.
    throw new Error(
      "Bản dịch được tạo sẵn khi thêm truyện, không dịch trực tiếp trên trang. Chương này đang trong hàng đợi dịch."
    );
  } catch (error) {
    setTranslationStatus(error.message, true);
  } finally {
    els.translateButton.disabled = false;
    els.retranslateButton.disabled = false;
  }
}

function setTranslationStatus(message, isError = false) {
  els.translationText.textContent = message;
  els.translationText.classList.toggle("status-error", isError);
  els.translationText.classList.toggle("empty", !isError);
  els.translationText.classList.toggle("is-loading", !isError);
  if (isError) els.outputStatus.textContent = "Lỗi";
}

function setBusy(message) {
  els.sourceText.textContent = message;
  els.translationText.textContent = "Chưa có bản dịch.";
  els.translationText.classList.add("empty");
  els.translationText.classList.remove("is-loading", "status-error");
  els.outputStatus.textContent = "Đang tải";
}

function resetReader(message) {
  state.bookId = "";
  state.fileName = "";
  state.title = "";
  state.cover = "";
  state.chapters = [];
  state.currentIndex = 0;
  state.translations = {};
  els.bookTitle.textContent = BRAND_NAME;
  els.bookMeta.textContent = message;
  els.readerBookCover.src = FALLBACK_BOOK_COVERS[1];
  els.sourceText.textContent = message;
  els.chapterCounter.textContent = "Chưa có mục lục";
  els.bottomChapterCounter.textContent = "Chưa có mục lục";
  els.paperTitle.textContent = "Nội dung chương";
  els.outputStatus.textContent = "Chờ dịch";
  els.progressLabel.textContent = "0%";
  els.progressBar.style.width = "0%";
  els.documentCount.textContent = "0";
  els.chapterSelect.innerHTML = "";
  els.chapterSelect.disabled = true;
  els.chapterList.innerHTML = "";
  els.prevChapter.disabled = true;
  els.bottomPrevChapter.disabled = true;
  els.nextChapter.disabled = true;
  els.bottomNextChapter.disabled = true;
  els.translateButton.disabled = true;
}

// Only the small progress record is read at startup; the chapter text of every
// cached book used to be deserialised here just to fill the "continue" band.
async function loadRecentProgress() {
  try {
    libraryState.recentProgress = await readMostRecentProgress();
  } catch (error) {
    console.warn("Unable to read the local reading progress.", error);
  }
}

function applyCachedBook(cachedBook) {
  state.bookId = cachedBook.id;
  state.fileName = cachedBook.fileName || "";
  state.title = cachedBook.title || cachedBook.fileName || "Truyện đã lưu";
  state.cover = cachedBook.cover || fallbackCoverForBook({ id: state.bookId, title: state.title });
  state.chapters = Array.isArray(cachedBook.chapters) ? cachedBook.chapters : [];
  state.currentIndex = Number(cachedBook.currentIndex) || 0;
  state.translations = {};
  els.bookTitle.textContent = state.title;
  els.bookMeta.textContent = `${BRAND_NAME} · ${state.chapters.length} chương · Đã lưu trên thiết bị`;
  els.readerBookCover.src = state.cover;
  document.title = `${state.title} | ${BRAND_NAME}`;
}

function buildBookRecord() {
  const now = Date.now();
  return {
    id: state.bookId,
    fileName: state.fileName,
    title: state.title,
    cover: state.cover,
    chapters: state.chapters,
    createdAt: now,
    expiresAt: now + CACHE_TTL_MS
  };
}

function buildProgressRecord() {
  const now = Date.now();
  return {
    id: state.bookId,
    title: state.title,
    fileName: state.fileName,
    cover: state.cover,
    chapterCount: state.chapters.length,
    chapterTitle: displayChapterTitle(state.currentIndex),
    currentIndex: state.currentIndex,
    lastOpenedAt: now,
    expiresAt: now + CACHE_TTL_MS
  };
}

const flushProgress = debounce(() => {
  const progress = libraryState.recentProgress;
  if (progress) putProgress(progress).catch((error) => console.warn("Unable to save reading progress.", error));
}, CACHE_WRITE_DEBOUNCE_MS);

// In-memory state updates right away so the library band stays accurate; only
// the IndexedDB write waits for the reader to settle on a chapter.
function saveProgressSoon() {
  if (!state.bookId || !state.chapters.length) return;
  libraryState.recentProgress = buildProgressRecord();
  flushProgress();
  if (userSync) {
    const pct = state.chapters.length ? Math.round(((state.currentIndex + 1) / state.chapters.length) * 100) : 0;
    userSync.saveProgress(state.bookId, {
      chapterIndex: state.currentIndex,
      chapterTitle: displayChapterTitle(state.currentIndex),
      progressPct: pct
    });
  }
}

async function touchCachedBook(cachedBook) {
  const now = Date.now();
  await putCachedBook({ ...cachedBook, chapters: state.chapters, expiresAt: now + CACHE_TTL_MS }).catch((error) =>
    console.warn("Unable to refresh the EPUB cache.", error)
  );
}

function openCacheDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: "id" });
        store.createIndex("lastOpenedAt", "lastOpenedAt");
        store.createIndex("expiresAt", "expiresAt");
      }
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
        const store = db.createObjectStore(PROGRESS_STORE, { keyPath: "id" });
        store.createIndex("lastOpenedAt", "lastOpenedAt");
      }
      if (!db.objectStoreNames.contains(TRANSLATION_STORE)) {
        const store = db.createObjectStore(TRANSLATION_STORE, { keyPath: "key" });
        store.createIndex("bookId", "bookId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    let callbackResult;

    transaction.oncomplete = () => {
      db.close();
      resolve(callbackResult);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error("IndexedDB transaction aborted."));
    };

    callbackResult = callback(transaction.objectStore(storeName), transaction);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putCachedBook(cachedBook) {
  return withStore(CACHE_STORE, "readwrite", (store) => {
    store.put(cachedBook);
  });
}

async function readCachedBook(bookId) {
  const cachedBook = await withStore(CACHE_STORE, "readonly", (store) => requestToPromise(store.get(bookId)));
  if (!cachedBook || cachedBook.expiresAt <= Date.now()) return null;
  return cachedBook;
}

function putProgress(progress) {
  return withStore(PROGRESS_STORE, "readwrite", (store) => {
    store.put(progress);
  });
}

function readProgress(bookId) {
  return withStore(PROGRESS_STORE, "readonly", (store) => requestToPromise(store.get(bookId)));
}

// A reverse cursor stops at the first live record instead of loading them all.
function readMostRecentProgress() {
  return withStore(PROGRESS_STORE, "readonly", (store) => {
    const request = store.index("lastOpenedAt").openCursor(null, "prev");
    return new Promise((resolve, reject) => {
      const now = Date.now();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(null);
        const progress = cursor.value;
        if (progress.expiresAt > now && progress.chapterCount) return resolve(progress);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

function translationRecordKey(bookId, index) {
  return `${bookId}::${index}`;
}

async function readTranslation(bookId, index) {
  if (!bookId) return "";
  try {
    const record = await withStore(TRANSLATION_STORE, "readonly", (store) =>
      requestToPromise(store.get(translationRecordKey(bookId, index)))
    );
    if (record?.text) return record.text;
  } catch (error) {
    console.warn("Unable to read the translation store.", error);
  }
  return localStorage.getItem(`epubTranslator.translation.${bookId}.${index}`) || "";
}

function putTranslation(bookId, index, text) {
  if (!bookId) return Promise.resolve();
  return withStore(TRANSLATION_STORE, "readwrite", (store) => {
    store.put({ key: translationRecordKey(bookId, index), bookId, index, text, updatedAt: Date.now() });
  });
}

function deleteTranslation(bookId, index) {
  localStorage.removeItem(`epubTranslator.translation.${bookId}.${index}`);
  if (!bookId) return Promise.resolve();
  return withStore(TRANSLATION_STORE, "readwrite", (store) => {
    store.delete(translationRecordKey(bookId, index));
  });
}

async function deleteExpiredCachedBooks() {
  const now = Date.now();
  const expiredIds = await withStore(CACHE_STORE, "readonly", (store) =>
    requestToPromise(store.index("expiresAt").getAllKeys(IDBKeyRange.upperBound(now)))
  );
  if (!expiredIds.length) return;

  await withStore(CACHE_STORE, "readwrite", (store) => {
    expiredIds.forEach((id) => store.delete(id));
  });
  await withStore(PROGRESS_STORE, "readwrite", (store) => {
    expiredIds.forEach((id) => store.delete(id));
  });
  await withStore(TRANSLATION_STORE, "readwrite", (store) => {
    expiredIds.forEach((id) => {
      store.index("bookId").openKeyCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
    });
  });
}

// One-off move of v1 records, where every book carried its whole translation map.
async function migrateLegacyCache() {
  if (localStorage.getItem(LEGACY_MIGRATION_KEY) === "done") return;

  const books = await withStore(CACHE_STORE, "readonly", (store) => requestToPromise(store.getAll()));
  for (const book of books) {
    if (!Array.isArray(book.chapters) || !book.chapters.length) continue;
    const legacyTranslations = book.translations && typeof book.translations === "object" ? book.translations : {};

    for (const [index, text] of Object.entries(legacyTranslations)) {
      if (typeof text === "string" && text.trim()) await putTranslation(book.id, Number(index), text);
    }

    const currentIndex = Math.min(Number(book.currentIndex) || 0, book.chapters.length - 1);
    if (!(await readProgress(book.id))) {
      await putProgress({
        id: book.id,
        title: book.title || book.fileName || "Truyện đã lưu",
        fileName: book.fileName || "",
        cover: book.cover || "",
        chapterCount: book.chapters.length,
        chapterTitle: book.chapters[currentIndex]?.title || `Chương ${currentIndex + 1}`,
        currentIndex,
        lastOpenedAt: Number(book.lastOpenedAt) || Date.now(),
        expiresAt: Number(book.expiresAt) || Date.now() + CACHE_TTL_MS
      });
    }

    if ("translations" in book || "currentIndex" in book) {
      const { translations: _translations, currentIndex: _currentIndex, lastOpenedAt: _lastOpenedAt, ...rest } = book;
      await putCachedBook(rest);
    }
  }

  localStorage.setItem(LEGACY_MIGRATION_KEY, "done");
  if (!libraryState.recentProgress) {
    await loadRecentProgress();
    updateContinueReading();
  }
}

function currentChapterKey() {
  return `epubTranslator.currentChapter.${state.bookId}`;
}

function makeBookId(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function displayChapterTitle(index) {
  const chapter = state.chapters[index];
  if (!chapter) return `Chương ${index + 1}`;

  if (chapter.translatedTitle) return chapter.translatedTitle;

  const content = state.translations[index] || (typeof chapter.text === "string" ? chapter.text : "");
  if (content) {
    const extracted = extractTitleFromContent(content);
    if (extracted) {
      chapter.translatedTitle = extracted;
      return extracted;
    }
  }

  return formatVietnameseChapterTitle(chapter.title, index + 1);
}

function formatWordCount(chapter) {
  // In CDN mode the body has not been fetched yet, so there is nothing to count.
  if (!Number.isFinite(chapter.words) && typeof chapter.text !== "string") return "";
  if (!Number.isFinite(chapter.words)) chapter.words = countWords(chapter.text);
  if (chapter.words >= 1000) return `${Math.round(chapter.words / 100) / 10}k từ`;
  return `${chapter.words} từ`;
}

function isDocumentType(mediaType, href) {
  return mediaType.includes("html") || /\.(xhtml|html|htm)$/i.test(href);
}

function textOf(doc, selector) {
  return normalizeSpace(doc.querySelector(selector)?.textContent || "");
}

function normalizeSpace(value) {
  return value
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim()
    .normalize("NFC");
}

function isUsableTranslation(source, translation) {
  const sourceStats = getScriptStats(source);
  if (sourceStats.han < 20 || sourceStats.hanRatio < 0.3) return Boolean(translation?.trim());

  const outputStats = getScriptStats(translation);
  return Boolean(translation?.trim()) && !(outputStats.han >= 12 && outputStats.hanRatio >= 0.25);
}

function getScriptStats(value) {
  const text = String(value || "");
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const latin = (text.match(/\p{Script=Latin}/gu) || []).length;
  return {
    han,
    latin,
    hanRatio: han / Math.max(1, han + latin)
  };
}

function normalizeZipPath(path) {
  const parts = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(decodeURIComponent(part));
  }
  return parts.join("/");
}

function resolveRelative(baseFile, relativePath) {
  const cleanRelative = stripFragment(relativePath);
  const baseDir = baseFile.includes("/") ? baseFile.slice(0, baseFile.lastIndexOf("/") + 1) : "";
  return normalizeZipPath(baseDir + cleanRelative);
}

function stripFragment(path) {
  return normalizeZipPath(path.split("#")[0]);
}

// ---------------------------------------------------------------------------
// Reader CDN path
//
// A book that has been ingested has an index at
//   {CDN_BASE}/books/{bookId}/index.json
// which lists chapter titles and a URL template. Chapter bodies are fetched one
// at a time and rendered directly: the JSON already holds the translated text,
// so this path never calls /api/translate and never touches Gemini.
// Any failure here returns false and the caller falls back to the EPUB reader.
// ---------------------------------------------------------------------------

function cdnUrl(pathname) {
  return `${CDN_BASE}/${String(pathname).replace(/^\//, "")}`;
}

async function fetchBookIndex(bookId) {
  if (!READER_CDN_ENABLED) return null;
  try {
    const response = await fetch(cdnUrl(`books/${bookId}/index.json`), { cache: "no-cache" });
    if (!response.ok) return null;
    const index = await response.json();
    if (!index || !Array.isArray(index.chapters) || !index.chapters.length) return null;
    return index;
  } catch (error) {
    console.warn("Không đọc được index từ CDN, dùng đường EPUB.", error);
    return null;
  }
}

function chapterUrlFor(index, chapterNumber) {
  const template = String(index.chapterUrlTemplate || "");
  if (!template) return cdnUrl(`books/${index.bookId}/r${index.revision}/ch/${chapterNumber}.json`);
  // Ingest writes an absolute URL when a public base was configured at ingest
  // time, and a bucket-relative one otherwise; both resolve here.
  const resolved = template.replace("{n}", String(chapterNumber));
  return /^https?:\/\//i.test(resolved) ? resolved : cdnUrl(resolved);
}

// Returns true when the book was opened from the CDN.
async function openBookFromCdn(book, cover, { startAtFirstChapter = false } = {}) {
  const index = await fetchBookIndex(book.id);
  if (!index) return false;

  state.mode = "cdn";
  state.cdnTemplate = index.chapterUrlTemplate || "";
  state.bookId = `cdn:${book.id}:r${index.revision}`;
  state.fileName = "";
  state.title = book.title || index.title || "Truyện";
  state.cover = cover || index.cover || fallbackCoverForBook(book);
  state.translations = {};
  // Only titles live in memory. Bodies are fetched per chapter, so a
  // 4,000-chapter novel costs the same as a short one to open.
  state.chapters = index.chapters.map((entry) => ({
    title: entry.title || `Chương ${entry.n}`,
    chapterNumber: entry.n,
    status: entry.status || "pending",
    text: null,
    words: null
  }));

  applyReaderHeader();
  els.bookMeta.textContent = `${BRAND_NAME} · ${index.totalChapters} chương · ${index.translatedChapters} đã dịch`;
  renderChapterControls();

  const savedProgress = await readProgress(state.bookId).catch(() => null);
  // "Đọc từ đầu" must ignore saved progress, which is why the flag reaches here
  // rather than skipping the CDN path entirely.
  goToChapter(startAtFirstChapter ? 0 : Number(savedProgress?.currentIndex) || 0);
  return true;
}

// Fetches and renders one chapter. Immutable URL, so the CDN and the browser
// cache do the work on every revisit.
async function loadCdnChapter(index) {
  const chapter = state.chapters[index];
  if (!chapter) return;

  if (typeof chapter.text === "string") {
    renderCdnChapter(chapter, index);
    return;
  }

  els.translationText.textContent = "Đang tải chương...";
  els.translationText.classList.add("empty", "is-loading");
  els.translationText.classList.remove("status-error");
  els.outputStatus.textContent = "Đang tải";

  try {
    const response = await fetch(chapterUrlFor({ bookId: bookIdFromState(), revision: revisionFromState(), chapterUrlTemplate: state.cdnTemplate }, chapter.chapterNumber));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const document_ = await response.json();
    if (index !== state.currentIndex) return;
    chapter.text = String(document_.content || "");
    chapter.status = document_.translationStatus || chapter.status;
    chapter.words = countWords(chapter.text);
    renderCdnChapter(chapter, index);
  } catch (error) {
    if (index !== state.currentIndex) return;
    console.warn("Không tải được chương từ CDN.", error);
    els.translationText.textContent = "Không tải được chương này. Hãy thử lại.";
    els.translationText.classList.remove("empty", "is-loading");
    els.translationText.classList.add("status-error");
    els.outputStatus.textContent = "Lỗi";
  }
}

function renderCdnChapter(chapter, index) {
  if (index !== state.currentIndex) return;
  els.sourceText.textContent = chapter.text || "";

  const isTranslated = chapter.status === "completed" || !isChineseText(chapter.text);

  if (isTranslated && chapter.text) {
    const watermarked = applyInvisibleWatermark(chapter.text);
    const rawParagraphs = watermarked.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    els.translationText.innerHTML = "";
    rawParagraphs.forEach((pText, i) => {
      const pEl = document.createElement("p");
      pEl.className = "tts-paragraph-highlight";
      pEl.dataset.parIndex = String(i);
      pEl.textContent = pText;
      pEl.addEventListener("click", () => {
        if (ttsEngine && ttsEngine.isPlaying) {
          ttsEngine.speakParagraph(i);
        }
      });
      els.translationText.appendChild(pEl);
    });
    els.translationText.classList.remove("empty", "is-loading", "status-error");
    els.outputStatus.textContent = "Đã dịch";

    if (ttsEngine && ttsEngine.isPlaying && !ttsEngine.isPaused) {
      ttsEngine.loadText(chapter.text);
      ttsEngine.play(0);
    }
  } else {
    // Untranslated Chinese chapter
    els.translationText.innerHTML = `
      <div class="untranslated-notice">
        <p><strong>⏳ Chương này đang trong hàng đợi dịch tự động.</strong></p>
        <p>Hệ thống đang dịch lần lượt từng chương. Dưới đây là văn bản gốc tiếng Trung:</p>
      </div>
      <div class="raw-chinese-text">${escapeHtml(chapter.text || "Chưa có nội dung.")}</div>
    `;
    els.translationText.classList.remove("is-loading", "status-error");
    els.translationText.classList.add("empty");
    els.outputStatus.textContent = "Chưa dịch";
  }

  const extracted = extractTitleFromContent(chapter.text);
  if (extracted && chapter.translatedTitle !== extracted) {
    chapter.translatedTitle = extracted;
    syncChapterUiTitle(index);
  }

  // Translation happened at ingest, so the reader has nothing to trigger.
  els.translateButton.hidden = true;
  els.retranslateButton.hidden = true;
}

function isChineseText(text) {
  if (!text) return false;
  const chineseMatches = text.match(/[\u4e00-\u9fa5]/g) || [];
  return chineseMatches.length > 20 && (chineseMatches.length / text.length) > 0.15;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function syncChapterUiTitle(index) {
  const documentLabel = displayChapterTitle(index);
  els.paperTitle.textContent = documentLabel;
  const chapterLabel = `${documentLabel} · ${index + 1} / ${state.chapters.length}`;
  els.chapterCounter.textContent = chapterLabel;
  els.bottomChapterCounter.textContent = chapterLabel;

  const itemEl = els.chapterList?.querySelector(`.document-item[data-index="${index}"] span:not(.document-index)`);
  if (itemEl) itemEl.textContent = documentLabel;

  const selectOpt = els.chapterSelect?.querySelector(`option[value="${index}"]`);
  if (selectOpt) selectOpt.textContent = documentLabel;
}

function bookIdFromState() {
  return String(state.bookId || "").split(":")[1] || "";
}

function revisionFromState() {
  const match = String(state.bookId || "").match(/:r(\d+)$/);
  return match ? Number(match[1]) : 1;
}
