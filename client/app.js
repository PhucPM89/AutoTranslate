"use strict";

const state = {
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
  featuredBook: null,
  catalogPage: 1
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BRAND_NAME = "Trạm Chữ";
const CATALOG_PAGE_SIZE = 10;
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
const FALLBACK_BOOK_COVERS = [
  "/library/covers/night-temple.webp",
  "/library/covers/misty-pagoda.webp",
  "/library/covers/lantern-temple.webp"
];
const SPEECH_VOICE_KEY = "epubTranslator.speechVoice";
const SPEECH_RATE_KEY = "epubTranslator.speechRate";
const SPEECH_GENRE_KEY = "epubTranslator.speechGenre";
const SPEECH_CACHE_NAME = "epubTranslator.speech.v2";
const LEGACY_SPEECH_CACHE_NAME = "epubTranslator.speech.v1";
const SPEECH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SPEECH_DAILY_USAGE_KEY = "epubTranslator.speechDailyUsage";
const SPEECH_DAILY_REQUEST_BUDGET = 95;
const SPEECH_GENRE_PRESETS = {
  fantasy: { voice: "Puck", rate: "1" },
  horror: { voice: "Charon", rate: "0.8" },
  apocalypse: { voice: "Kore", rate: "1" },
  detective: { voice: "Charon", rate: "1" },
  xianxia: { voice: "Aoede", rate: "1" }
};

const speechState = {
  audio: null,
  abortControllers: new Set(),
  audioUrls: new Map(),
  audioPromises: new Map(),
  chunks: [],
  settings: null,
  index: 0,
  mode: "idle",
  session: 0
};

const els = {
  adminOpen: document.getElementById("adminOpen"),
  libraryView: document.getElementById("libraryView"),
  readerView: document.getElementById("readerView"),
  libraryBrand: document.getElementById("libraryBrand"),
  libraryName: document.getElementById("libraryName"),
  libraryTagline: document.getElementById("libraryTagline"),
  featuredBackdrop: document.getElementById("featuredBackdrop"),
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
  catalogGrid: document.getElementById("catalogGrid"),
  catalogEmpty: document.getElementById("catalogEmpty"),
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
  readerThemeToggle: document.getElementById("readerThemeToggle"),
  readerImportButton: document.getElementById("readerImportButton"),
  fileInput: document.getElementById("fileInput"),
  bookTitle: document.getElementById("bookTitle"),
  bookMeta: document.getElementById("bookMeta"),
  readerBookCover: document.getElementById("readerBookCover"),
  globalSearch: document.getElementById("globalSearch"),
  chapterSelect: document.getElementById("chapterSelect"),
  chapterList: document.getElementById("chapterList"),
  documentCount: document.getElementById("documentCount"),
  documentTitle: document.getElementById("documentTitle"),
  documentStatus: document.getElementById("documentStatus"),
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
  speechGenre: document.getElementById("speechGenre"),
  speechVoice: document.getElementById("speechVoice"),
  speechRate: document.getElementById("speechRate"),
  speechPlay: document.getElementById("speechPlay"),
  speechPlayLabel: document.getElementById("speechPlayLabel"),
  speechStop: document.getElementById("speechStop"),
  speechStatus: document.getElementById("speechStatus"),
  themeToggle: document.getElementById("themeToggle"),
  themeLabel: document.getElementById("themeLabel"),
  fontDecrease: document.getElementById("fontDecrease"),
  fontIncrease: document.getElementById("fontIncrease"),
  fontSizeLabel: document.getElementById("fontSizeLabel"),
  widthPreset: document.getElementById("widthPreset")
};

const parser = new DOMParser();

initPreferences();
bindEvents();
initSpeech();
initializeLibrary();

function bindEvents() {
  window.addEventListener("hashchange", alignHashedSection);
  window.addEventListener("load", () => setTimeout(alignHashedSection, 400));
  els.fileInput?.addEventListener("change", handleFile);
  els.libraryBrand.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  els.librarySearch.addEventListener("input", debounce(resetCatalogPage, SEARCH_DEBOUNCE_MS));
  els.libraryGenre.addEventListener("change", resetCatalogPage);
  els.adminOpen?.addEventListener("click", bootstrapAdminPanel);
  els.featuredRead.addEventListener("click", openFeaturedBook);
  els.supportQrOpen.addEventListener("click", () => els.supportDialog.showModal());
  els.supportQrClose.addEventListener("click", () => els.supportDialog.close());
  els.supportDialog.addEventListener("click", (event) => {
    if (event.target === els.supportDialog) els.supportDialog.close();
  });
  els.catalogPrevPage.addEventListener("click", () => changeCatalogPage(libraryState.catalogPage - 1));
  els.catalogNextPage.addEventListener("click", () => changeCatalogPage(libraryState.catalogPage + 1));
  els.continueReading.addEventListener("click", resumeCachedBook);
  els.backToLibrary.addEventListener("click", showLibrary);
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
  els.speechGenre.addEventListener("change", applySpeechGenrePreset);
  els.speechVoice.addEventListener("change", saveSpeechPreferences);
  els.speechRate.addEventListener("change", saveSpeechPreferences);
  els.speechPlay.addEventListener("click", toggleSpeech);
  els.speechStop.addEventListener("click", () => stopSpeech());
  document.addEventListener("visibilitychange", pauseSpeechWhenHidden);
  window.addEventListener("beforeunload", () => stopSpeech());
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
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.(("/api/analytics"), new Blob([body], { type: "application/json" }))) return;
  } catch (_error) {
    // Fall through to fetch below.
  }
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  }).catch(() => {});
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
  document.body.classList.toggle("dark", theme === "dark");
  els.themeLabel.textContent = theme === "dark" ? "Light" : "Dark";

  localStorage.setItem(
    "epubTranslator.fontSize",
    localStorage.getItem("epubTranslator.fontSize") || "20"
  );
  els.widthPreset.value = localStorage.getItem("epubTranslator.widthPreset") || "comfortable";
  updateReaderSettings();
}

function updateReaderSettings() {
  const fontSize = Number(localStorage.getItem("epubTranslator.fontSize") || "20");
  const widthMap = {
    compact: "680px",
    comfortable: "820px",
    wide: "1020px"
  };

  document.documentElement.style.setProperty("--content-font-size", `${fontSize}px`);
  document.documentElement.style.setProperty("--document-width", widthMap[els.widthPreset.value] || widthMap.comfortable);
  els.fontSizeLabel.textContent = `${fontSize}px`;
  localStorage.setItem("epubTranslator.widthPreset", els.widthPreset.value);
}

function changeFontSize(delta) {
  const current = Number(localStorage.getItem("epubTranslator.fontSize") || "20");
  const next = Math.min(28, Math.max(16, current + delta));
  localStorage.setItem("epubTranslator.fontSize", String(next));
  updateReaderSettings();
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("epubTranslator.theme", isDark ? "dark" : "light");
  els.themeLabel.textContent = isDark ? "Light" : "Dark";
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
    let response = await fetch("/api/library");
    if (!response.ok) response = await fetch("/library.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    applyLibraryManifest(await response.json());
  } catch (error) {
    console.warn("Unable to load the source library.", error);
    els.catalogGrid.innerHTML = "";
    els.catalogEmpty.hidden = false;
    els.catalogPagination.hidden = true;
  }
}

function applyLibraryManifest(manifest) {
  libraryState.site = manifest?.site && typeof manifest.site === "object" ? manifest.site : {};
  libraryState.books = Array.isArray(manifest?.books) ? manifest.books.filter(isValidLibraryBook) : [];
  applyLibrarySiteSettings();
  renderFeaturedBook();
  renderGenreOptions();
  renderCatalog();
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
  return Boolean(book && typeof book.id === "string" && typeof book.title === "string" && typeof book.epub === "string");
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

function renderCatalog() {
  const books = getFilteredCatalogBooks()
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  const totalPages = Math.max(1, Math.ceil(books.length / CATALOG_PAGE_SIZE));
  libraryState.catalogPage = Math.min(Math.max(1, libraryState.catalogPage), totalPages);
  const start = (libraryState.catalogPage - 1) * CATALOG_PAGE_SIZE;
  const visibleBooks = books.slice(start, start + CATALOG_PAGE_SIZE);

  els.catalogGrid.innerHTML = "";
  visibleBooks.forEach((book, index) => els.catalogGrid.appendChild(createBookCard(book, start + index)));
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
  const query = normalizeSearch(els.librarySearch.value);
  const genre = els.libraryGenre.value;
  return libraryState.books
    .filter((book) => !genre || book.genre === genre)
    .filter((book) => !query || normalizeSearch(`${book.title} ${book.author || ""} ${book.genre || ""}`).includes(query));
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
  coverButton.setAttribute("aria-label", `Đọc ${book.title}`);
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
  coverButton.addEventListener("click", () => loadCatalogBook(book, fallbackCover));

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
  appendTextElement(footer, "span", "", book.chapterCount ? `${book.chapterCount} chương` : "EPUB");
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
  els.readerView.hidden = false;
  window.scrollTo({ top: 0 });
}

function showLibrary() {
  stopSpeech();
  updateContinueReading();
  els.readerView.hidden = true;
  els.libraryView.hidden = false;
  document.title = BRAND_NAME;
  window.scrollTo({ top: 0 });
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

async function loadCatalogBook(book, assignedFallbackCover = fallbackCoverForBook(book)) {
  showReader();
  setBusy(`Đang tải ${book.title}...`);
  els.bookTitle.textContent = book.title;
  els.bookMeta.textContent = "Đang chuẩn bị mục lục...";
  els.readerBookCover.src = book.cover || assignedFallbackCover;

  const bookId = `library:${book.id}:${book.updatedAt || "current"}`;
  const cover = book.cover || assignedFallbackCover;
  countBookOpened(book.id);

  try {
    // A parsed copy on the device means no EPUB download and no re-parse at all.
    const cachedBook = await readCachedBook(bookId).catch(() => null);
    if (cachedBook?.chapters?.length) {
      const savedProgress = await readProgress(bookId).catch(() => null);
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
      cover
    });
  } catch (error) {
    resetReader(`Không thể mở truyện: ${error.message}`);
  }
}

async function applyLoadedEpub(arrayBuffer, options) {
  const book = await parseEpub(arrayBuffer, options.fileName);
  if (!book.chapters.length) throw new Error("Không tìm thấy chương có thể đọc.");

  const savedProgress = await readProgress(options.bookId).catch(() => null);
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
  const savedIndex = Number(savedProgress?.currentIndex ?? localStorage.getItem(currentChapterKey()) ?? "0");
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

function initSpeech() {
  const savedGenre = localStorage.getItem(SPEECH_GENRE_KEY) || "fantasy";
  els.speechGenre.value = SPEECH_GENRE_PRESETS[savedGenre] ? savedGenre : "fantasy";
  const preset = SPEECH_GENRE_PRESETS[els.speechGenre.value];
  const savedVoice = localStorage.getItem(SPEECH_VOICE_KEY) || preset.voice;
  const savedRate = localStorage.getItem(SPEECH_RATE_KEY) || preset.rate;
  els.speechVoice.value = Array.from(els.speechVoice.options).some((option) => option.value === savedVoice)
    ? savedVoice
    : "Kore";
  els.speechRate.value = Array.from(els.speechRate.options).some((option) => option.value === savedRate)
    ? savedRate
    : "1";
  speechState.audio = new Audio();
  saveSpeechPreferences();
  pruneSpeechCache();
  updateSpeechAvailability();
}

function saveSpeechPreferences() {
  localStorage.setItem(SPEECH_GENRE_KEY, els.speechGenre.value);
  localStorage.setItem(SPEECH_VOICE_KEY, els.speechVoice.value);
  localStorage.setItem(SPEECH_RATE_KEY, els.speechRate.value);
}

function applySpeechGenrePreset() {
  const preset = SPEECH_GENRE_PRESETS[els.speechGenre.value] || SPEECH_GENRE_PRESETS.fantasy;
  els.speechVoice.value = preset.voice;
  els.speechRate.value = preset.rate;
  saveSpeechPreferences();
  els.speechStatus.textContent = `${els.speechGenre.options[els.speechGenre.selectedIndex].text} · ${preset.voice}`;
}

function pauseSpeechWhenHidden() {
  if (!document.hidden || speechState.mode !== "speaking") return;
  speechState.audio.pause();
  setSpeechMode("paused", "Đã tạm dừng khi chuyển tab");
}

async function toggleSpeech() {
  if (els.speechPlay.disabled) return;

  if (speechState.mode === "speaking") {
    speechState.audio.pause();
    setSpeechMode("paused", "Đã tạm dừng");
    return;
  }

  if (speechState.mode === "paused") {
    await speechState.audio.play();
    setSpeechMode("speaking", speechProgressLabel("Đang phát"));
    return;
  }

  const text = getCurrentTranslation();
  speechState.chunks = splitSpeechText(text);
  speechState.settings = Object.freeze({
    genre: els.speechGenre.value,
    voice: els.speechVoice.value,
    rate: els.speechRate.value
  });
  speechState.index = 0;
  if (!speechState.chunks.length) return;
  const remainingRequests = getRemainingSpeechRequests();
  if (speechState.chunks.length > remainingRequests) {
    const required = speechState.chunks.length;
    speechState.chunks = [];
    speechState.settings = null;
    setSpeechMode("idle", `Chương này cần ${required} lượt TTS, hôm nay còn ${remainingRequests}/${SPEECH_DAILY_REQUEST_BUDGET}.`);
    return;
  }

  speechState.session += 1;
  await playCurrentSpeechChunk(speechState.session);
}

async function playCurrentSpeechChunk(session) {
  if (session !== speechState.session) return;
  if (speechState.index >= speechState.chunks.length) {
    finishSpeech();
    return;
  }

  const audioWasBuffered = speechState.audioUrls.has(speechState.index);
  if (!audioWasBuffered) {
    const action = speechState.index === 0 ? "Generating" : "Buffering";
    setSpeechMode("generating", speechProgressLabel(action));
  }

  try {
    const chunkIndex = speechState.index;
    const audioUrl = await prepareSpeechChunk(chunkIndex, session);
    if (!audioUrl || session !== speechState.session) return;

    speechState.audio.src = audioUrl;
    speechState.audio.onended = () => {
      if (session !== speechState.session) return;
      releaseSpeechUrl(chunkIndex);
      speechState.index += 1;
      playCurrentSpeechChunk(session);
    };
    speechState.audio.onerror = () => {
      if (session === speechState.session) stopSpeech("Audio playback failed");
    };

    await speechState.audio.play();
    setSpeechMode("speaking", speechProgressLabel("Đang phát"));
    prefetchNextSpeechChunk(session);
  } catch (error) {
    if (error.name !== "AbortError" && session === speechState.session) {
      stopSpeech(error.message || "Không thể tạo giọng đọc");
    }
  }
}

function prepareSpeechChunk(index, session) {
  if (speechState.audioUrls.has(index)) {
    return Promise.resolve(speechState.audioUrls.get(index));
  }
  if (speechState.audioPromises.has(index)) {
    return speechState.audioPromises.get(index);
  }

  let controller = null;
  let promise;
  promise = (async () => {
    const cacheRequest = await createSpeechCacheRequest(speechState.chunks[index], speechState.settings);
    const cachedBlob = await readSpeechCache(cacheRequest);
    if (cachedBlob && session === speechState.session) {
      const cachedUrl = URL.createObjectURL(cachedBlob);
      speechState.audioUrls.set(index, cachedUrl);
      return cachedUrl;
    }

    controller = new AbortController();
    speechState.abortControllers.add(controller);
    if (getRemainingSpeechRequests() <= 0) {
      throw new Error(`Đã dùng hết ngân sách ${SPEECH_DAILY_REQUEST_BUDGET} lượt TTS hôm nay.`);
    }
    recordSpeechRequest();
    const response = await fetch("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text: speechState.chunks[index],
        genre: speechState.settings.genre,
        voice: speechState.settings.voice,
        rate: speechState.settings.rate,
        segmentIndex: index,
        segmentCount: speechState.chunks.length
      })
    });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(
          data.code === "quota_exceeded"
            ? "Đã hết hạn mức giọng đọc AI. Hãy thử lại sau hoặc kiểm tra billing."
            : data.error || "Không thể tạo giọng đọc."
        );
        error.code = data.code;
        throw error;
      }
      if (session !== speechState.session) return "";

      const audioBlob = base64ToBlob(data.audio, data.mimeType || "audio/wav");
      await writeSpeechCache(cacheRequest, audioBlob);
      const audioUrl = URL.createObjectURL(audioBlob);
      speechState.audioUrls.set(index, audioUrl);
      return audioUrl;
    })()
    .finally(() => {
      if (controller) speechState.abortControllers.delete(controller);
      if (speechState.audioPromises.get(index) === promise) {
        speechState.audioPromises.delete(index);
      }
    });

  speechState.audioPromises.set(index, promise);
  return promise;
}

async function createSpeechCacheRequest(text, settings) {
  const source = JSON.stringify({ text, ...settings });
  let key = "";
  if (window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } else {
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
    }
    key = String(hash);
  }
  return new Request(`/__speech-cache/${key}`);
}

async function readSpeechCache(request) {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(SPEECH_CACHE_NAME);
    const response = await cache.match(request);
    if (!response) return null;
    if (Number(response.headers.get("X-Speech-Expires")) <= Date.now()) {
      await cache.delete(request);
      return null;
    }
    return response.blob();
  } catch (error) {
    console.warn("Unable to read the local audio cache.", error);
    return null;
  }
}

async function writeSpeechCache(request, audioBlob) {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(SPEECH_CACHE_NAME);
    await cache.put(
      request,
      new Response(audioBlob, {
        headers: {
          "Content-Type": audioBlob.type || "audio/wav",
          "X-Speech-Expires": String(Date.now() + SPEECH_CACHE_TTL_MS)
        }
      })
    );
  } catch (error) {
    console.warn("Unable to save the local audio cache.", error);
  }
}

async function pruneSpeechCache() {
  if (!("caches" in window)) return;
  try {
    await caches.delete(LEGACY_SPEECH_CACHE_NAME);
    localStorage.removeItem("epubTranslator.edgeFallbackUntil");
    const cache = await caches.open(SPEECH_CACHE_NAME);
    const requests = await cache.keys();
    await Promise.all(
      requests.map(async (request) => {
        const response = await cache.match(request);
        if (!response || Number(response.headers.get("X-Speech-Expires")) <= Date.now()) {
          await cache.delete(request);
        }
      })
    );
  } catch (error) {
    console.warn("Unable to prune the local audio cache.", error);
  }
}

function prefetchNextSpeechChunk(session) {
  const nextIndex = speechState.index + 1;
  if (nextIndex >= speechState.chunks.length) return;
  prepareSpeechChunk(nextIndex, session).catch((error) => {
    if (error.name !== "AbortError" && session === speechState.session) {
      console.warn("Unable to buffer the next audio segment.", error);
    }
  });
}

function finishSpeech() {
  releaseAllSpeechUrls();
  speechState.chunks = [];
  speechState.settings = null;
  speechState.index = 0;
  setSpeechMode("idle", "Đã đọc xong chương");
}

function stopSpeech(statusMessage = "") {
  speechState.session += 1;
  for (const controller of speechState.abortControllers) controller.abort();
  speechState.abortControllers.clear();
  speechState.audioPromises.clear();
  speechState.mode = "idle";
  speechState.chunks = [];
  speechState.settings = null;
  speechState.index = 0;
  if (speechState.audio) {
    speechState.audio.pause();
    speechState.audio.onended = null;
    speechState.audio.onerror = null;
    speechState.audio.removeAttribute("src");
    speechState.audio.load();
  }
  releaseAllSpeechUrls();
  setSpeechMode("idle", statusMessage || (hasSpeakableOutput() ? "Sẵn sàng" : "Chưa có bản dịch"));
}

function releaseSpeechUrl(index) {
  const audioUrl = speechState.audioUrls.get(index);
  if (!audioUrl) return;
  URL.revokeObjectURL(audioUrl);
  speechState.audioUrls.delete(index);
}

function releaseAllSpeechUrls() {
  for (const audioUrl of speechState.audioUrls.values()) URL.revokeObjectURL(audioUrl);
  speechState.audioUrls.clear();
}

function setSpeechMode(mode, statusMessage) {
  speechState.mode = mode;
  els.speechPlay.classList.toggle("is-speaking", mode === "speaking");
  els.speechPlay.classList.toggle("is-paused", mode === "paused");
  els.speechPlayLabel.textContent =
    mode === "generating" ? "Đang tạo" : mode === "speaking" ? "Tạm dừng" : mode === "paused" ? "Tiếp tục" : "Nghe";
  els.speechPlay.setAttribute(
    "aria-label",
    mode === "speaking" ? "Tạm dừng audio" : mode === "paused" ? "Tiếp tục audio" : "Nghe bản dịch"
  );
  els.speechPlay.title = els.speechPlay.getAttribute("aria-label");
  els.speechStop.disabled = mode === "idle";
  els.speechPlay.disabled = mode === "generating" || (mode === "idle" && !hasSpeakableOutput());
  els.speechGenre.disabled = mode !== "idle";
  els.speechVoice.disabled = mode !== "idle";
  els.speechRate.disabled = mode !== "idle";
  if (statusMessage) {
    els.speechStatus.textContent = statusMessage;
    els.speechStatus.title = statusMessage;
  }
}

function updateSpeechAvailability() {
  const available = hasSpeakableOutput();
  els.speechPlay.disabled = !available || speechState.mode === "generating";
  if (!available && speechState.mode !== "idle") {
    stopSpeech();
  } else if (speechState.mode === "idle") {
    const renderedOutput =
      !els.translationText.classList.contains("empty") && Boolean(els.translationText.textContent.trim());
    els.speechStatus.textContent = available
      ? `Sẵn sàng · Gemini AI · còn ${getRemainingSpeechRequests()}/${SPEECH_DAILY_REQUEST_BUDGET} lượt hôm nay`
      : renderedOutput
        ? "Output is not Vietnamese"
        : "Chưa có bản dịch";
  }
}

function hasSpeakableOutput() {
  const chapter = state.chapters[state.currentIndex];
  const translation = getCurrentTranslation();
  return (
    Boolean(chapter && translation) &&
    isUsableTranslation(chapter.text, translation) &&
    !els.translationText.classList.contains("empty") &&
    !els.translationText.classList.contains("is-loading") &&
    !els.translationText.classList.contains("status-error")
  );
}

function getCurrentTranslation() {
  return String(state.translations[state.currentIndex] || "").trim();
}

function speechProgressLabel(action) {
  return `${action} ${speechState.index + 1} / ${speechState.chunks.length}`;
}

function splitSpeechText(text, maxLength = 5000) {
  const sentences = String(text || "")
    .split(/\n{2,}/)
    .flatMap((paragraph) => paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [paragraph])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .flatMap((sentence) => {
      if (sentence.length <= maxLength) return [sentence];
      const pieces = [];
      for (let start = 0; start < sentence.length; start += maxLength) {
        pieces.push(sentence.slice(start, start + maxLength));
      }
      return pieces;
    });

  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function getSpeechUsage() {
  const today = localDateKey();
  try {
    const usage = JSON.parse(localStorage.getItem(SPEECH_DAILY_USAGE_KEY) || "null");
    if (usage?.date === today && Number.isInteger(usage.count)) return usage;
  } catch (_error) {
    // Reset malformed local usage data below.
  }
  return { date: today, count: 0 };
}

function getRemainingSpeechRequests() {
  return Math.max(0, SPEECH_DAILY_REQUEST_BUDGET - getSpeechUsage().count);
}

function recordSpeechRequest() {
  const usage = getSpeechUsage();
  usage.count += 1;
  localStorage.setItem(SPEECH_DAILY_USAGE_KEY, JSON.stringify(usage));
}

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
    const chapterIcon = document.createElement("span");
    chapterIcon.className = "document-icon";
    chapterIcon.setAttribute("aria-hidden", "true");
    button.appendChild(chapterIcon);
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
  stopSpeech();
  state.currentIndex = Math.min(Math.max(index, 0), state.chapters.length - 1);

  const chapter = state.chapters[state.currentIndex];
  els.sourceText.textContent = chapter.text;
  const documentLabel = displayChapterTitle(state.currentIndex);
  const chapterLabel = `${documentLabel} · ${state.currentIndex + 1} / ${state.chapters.length}`;
  const progress = Math.ceil(((state.currentIndex + 1) / state.chapters.length) * 100);
  els.documentTitle.textContent = documentLabel;
  els.paperTitle.textContent = documentLabel;
  els.progressLabel.textContent = `${progress}%`;
  els.progressBar.style.width = `${progress}%`;
  els.documentStatus.textContent = "Đang mở";
  els.chapterCounter.textContent = chapterLabel;
  els.bottomChapterCounter.textContent = chapterLabel;
  els.chapterSelect.value = String(state.currentIndex);

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
  loadCachedTranslation();
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
    els.translationText.textContent = cached;
    els.translationText.classList.remove("empty", "status-error", "is-loading");
    els.outputStatus.textContent = "Đã lưu";
    els.translateButton.hidden = true;
    els.retranslateButton.hidden = false;
  } else {
    els.translationText.textContent = "Chưa có bản dịch.";
    els.translationText.classList.add("empty");
    els.translationText.classList.remove("status-error", "is-loading");
    els.outputStatus.textContent = "Chờ dịch";
    els.translateButton.hidden = false;
    els.retranslateButton.hidden = true;
  }
  updateSpeechAvailability();
}

async function translateCurrentChapter(force) {
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

  stopSpeech();
  setTranslationStatus("Processing document...");
  els.outputStatus.textContent = "Đang dịch";
  els.translateButton.disabled = true;
  els.retranslateButton.disabled = true;

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chapter.text })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không thể dịch chương này.");
    if (!isUsableTranslation(chapter.text, data.translation)) {
      throw new Error("Gemini vẫn trả lại nội dung tiếng Trung. Kết quả này chưa được lưu; hãy thử dịch lại.");
    }

    state.translations[state.currentIndex] = data.translation;
    await putTranslation(state.bookId, state.currentIndex, data.translation);
    els.translationText.textContent = data.translation;
    els.translationText.classList.remove("empty", "status-error", "is-loading");
    updateSpeechAvailability();
    els.outputStatus.textContent = "Hoàn tất";
    els.translateButton.hidden = true;
    els.retranslateButton.hidden = false;
    if (data.elapsedMs) {
      const modelNote = Array.isArray(data.modelsUsed) && data.modelsUsed.length ? ` · ${data.modelsUsed.join(", ")}` : "";
      els.bookMeta.textContent = `${state.chapters.length} chương · ${data.chunkCount || 1} phần trong ${formatSeconds(
        data.elapsedMs
      )}${modelNote}`;
    }
  } catch (error) {
    setTranslationStatus(error.message, true);
  } finally {
    els.translateButton.disabled = false;
    els.retranslateButton.disabled = false;
  }
}

function formatSeconds(ms) {
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

function setTranslationStatus(message, isError = false) {
  stopSpeech();
  els.translationText.textContent = message;
  els.translationText.classList.toggle("status-error", isError);
  els.translationText.classList.toggle("empty", !isError);
  els.translationText.classList.toggle("is-loading", !isError);
  if (isError) els.outputStatus.textContent = "Lỗi";
  updateSpeechAvailability();
}

function setBusy(message) {
  stopSpeech();
  els.sourceText.textContent = message;
  els.translationText.textContent = "Chưa có bản dịch.";
  els.translationText.classList.add("empty");
  els.translationText.classList.remove("is-loading", "status-error");
  els.outputStatus.textContent = "Đang tải";
  updateSpeechAvailability();
}

function resetReader(message) {
  stopSpeech();
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
  els.documentTitle.textContent = "Chưa chọn chương";
  els.paperTitle.textContent = "Nội dung chương";
  els.documentStatus.textContent = "Chờ";
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
  updateSpeechAvailability();
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
  return state.chapters[index]?.title || `Chương ${index + 1}`;
}

function formatWordCount(chapter) {
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
