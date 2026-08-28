
const CDN_BASE = String(__CDN_BASE__ || "").replace(/\/$/, "");
const {
  DEFAULT_STUDIO_MODEL,
  normalizeStudioModel,
  extractStudioDocumentText,
  splitStudioText,
  buildStudioTranslationPrompt,
  assessStudioTranslation,
  countStudioTextUnits,
  mergeStoredStudioTranslations
} = require("./epub-studio-core.js");

const els = {
  open: document.getElementById("adminOpen"),
  close: document.getElementById("adminClose"),
  dialog: document.getElementById("adminDialog"),
  loginForm: document.getElementById("adminLoginForm"),
  uploadForm: document.getElementById("adminUploadForm"),
  tabs: document.getElementById("adminTabs"),
  libraryTab: document.getElementById("adminLibraryTab"),
  crawlerTab: document.getElementById("adminCrawlerTab"),
  crawlerForm: document.getElementById("adminCrawlerForm"),
  crawlerEnabled: document.getElementById("crawlerEnabled"),
  crawlerWordCount: document.getElementById("crawlerWordCount"),
  crawlerCreationStatus: document.getElementById("crawlerCreationStatus"),
  crawlerReach: document.getElementById("crawlerReach"),
  crawlerMaxBooks: document.getElementById("crawlerMaxBooks"),
  crawlerMaxBacklog: document.getElementById("crawlerMaxBacklog"),
  crawlerUpdateExisting: document.getElementById("crawlerUpdateExisting"),
  crawlerStateBadge: document.getElementById("crawlerStateBadge"),
  crawlerStateMessage: document.getElementById("crawlerStateMessage"),
  crawlerStateMeta: document.getElementById("crawlerStateMeta"),
  crawlerProgress: document.getElementById("crawlerProgress"),
  crawlerProgressFill: document.getElementById("crawlerProgressFill"),
  crawlerProgressLabel: document.getElementById("crawlerProgressLabel"),
  crawlerRecent: document.getElementById("crawlerRecent"),
  crawlerRecentList: document.getElementById("crawlerRecentList"),
  crawlerErrors: document.getElementById("crawlerErrors"),
  crawlerErrorsList: document.getElementById("crawlerErrorsList"),
  crawlerWorkerWarning: document.getElementById("crawlerWorkerWarning"),
  crawlerRefresh: document.getElementById("crawlerRefresh"),
  translateTab: document.getElementById("adminTranslateTab"),
  translatePanel: document.getElementById("adminTranslatePanel"),
  translateStartBtn: document.getElementById("adminTranslateStartBtn"),
  translateRefresh: document.getElementById("adminTranslateRefresh"),
  translateFocusBook: document.getElementById("adminTranslateFocusBook"),
  translateFocusSave: document.getElementById("adminTranslateFocusSave"),
  translateFocusHint: document.getElementById("adminTranslateFocusHint"),
  translateStateBadge: document.getElementById("translateStateBadge"),
  translateStateMessage: document.getElementById("translateStateMessage"),
  translateStateMeta: document.getElementById("translateStateMeta"),
  translateLiveProgress: document.getElementById("translateLiveProgress"),
  translateProgressFill: document.getElementById("translateProgressFill"),
  translateProgressLabel: document.getElementById("translateProgressLabel"),
  translateRecentActivity: document.getElementById("translateRecentActivity"),
  translateRecentList: document.getElementById("translateRecentList"),
  translateQueueList: document.getElementById("translateQueueList"),
  transStatCurrentBook: document.getElementById("transStatCurrentBook"),
  transStatCurrentCh: document.getElementById("transStatCurrentCh"),
  transStatLastHourCh: document.getElementById("transStatLastHourCh"),
  transStatLastHourBooks: document.getElementById("transStatLastHourBooks"),
  transStatSpeed: document.getElementById("transStatSpeed"),
  transStatThroughput: document.getElementById("transStatThroughput"),
  transStatKeysActive: document.getElementById("transStatKeysActive"),
  transActiveCoverImg: document.getElementById("transActiveCoverImg"),
  transActiveBookTitle: document.getElementById("transActiveBookTitle"),
  transActiveChapterBadge: document.getElementById("transActiveChapterBadge"),
  transActivePercentBadge: document.getElementById("transActivePercentBadge"),
  transActiveRemainingBadge: document.getElementById("transActiveRemainingBadge"),
  transActiveEtaBadge: document.getElementById("transActiveEtaBadge"),
  transSessionCountBadge: document.getElementById("transSessionCountBadge"),
  transCurrentChapterNameBadge: document.getElementById("transCurrentChapterNameBadge"),
  transAttemptCountBadge: document.getElementById("transAttemptCountBadge"),
  transLastSuccessBadge: document.getElementById("transLastSuccessBadge"),
  transLiveState: document.getElementById("transLiveState"),
  transHeartbeatText: document.getElementById("transHeartbeatText"),
  transHourlySummaryText: document.getElementById("transHourlySummaryText"),
  transNextBookTitle: document.getElementById("transNextBookTitle"),
  transStopReasonBox: document.getElementById("transStopReasonBox"),
  transWorkerStatusBadge: document.getElementById("transWorkerStatusBadge"),
  transStopReasonTitle: document.getElementById("transStopReasonTitle"),
  transStopReasonDesc: document.getElementById("transStopReasonDesc"),
  transDailyScannedSection: document.getElementById("transDailyScannedSection"),
  transDailyScannedCount: document.getElementById("transDailyScannedCount"),
  transDailyScannedTbody: document.getElementById("transDailyScannedTbody"),
  keysDailyQuotaText: document.getElementById("keysDailyQuotaText"),
  statsTab: document.getElementById("adminStatsTab"),
  statsPanel: document.getElementById("adminStatsPanel"),
  statsGrid: document.getElementById("adminStatsGrid"),
  statsBooks: document.getElementById("adminStatsBooks"),
  statsBooksEmpty: document.getElementById("adminStatsBooksEmpty"),
  statsNote: document.getElementById("adminStatsNote"),
  statsRefresh: document.getElementById("adminStatsRefresh"),
  keysTab: document.getElementById("adminKeysTab"),
  keysPanel: document.getElementById("adminKeysPanel"),
  keysPingBtn: document.getElementById("adminKeysPingBtn"),
  keysTotalCount: document.getElementById("keysTotalCount"),
  keysActiveModel: document.getElementById("keysActiveModel"),
  keysList: document.getElementById("adminKeysList"),
  addKeyForm: document.getElementById("adminAddKeyForm"),
  newApiKeyInput: document.getElementById("newApiKeyInput"),
  addKeyBtn: document.getElementById("adminAddKeyBtn"),
  usersTab: document.getElementById("adminUsersTab"),
  usersPanel: document.getElementById("adminUsersPanel"),
  usersRefresh: document.getElementById("adminUsersRefresh"),
  usersSearch: document.getElementById("adminUsersSearch"),
  usersSchoolFilter: document.getElementById("adminUsersSchoolFilter"),
  usersTbody: document.getElementById("adminUsersTbody"),
  usersEmpty: document.getElementById("adminUsersEmpty"),
  usersLoading: document.getElementById("adminUsersLoading"),
  statTotalUsers: document.getElementById("statTotalUsers"),
  statActive7Days: document.getElementById("statActive7Days"),
  statTotalReadChapters: document.getElementById("statTotalReadChapters"),
  statTotalUserExp: document.getElementById("statTotalUserExp"),
  bookSelect: document.getElementById("adminBookSelect"),
  password: document.getElementById("adminPassword"),
  epub: document.getElementById("adminEpub"),
  epubLabel: document.getElementById("adminEpubLabel"),
  cover: document.getElementById("adminCover"),
  coverLabel: document.getElementById("adminCoverLabel"),
  existingFiles: document.getElementById("adminExistingFiles"),
  logout: document.getElementById("adminLogout"),
  deleteBook: document.getElementById("adminDelete"),
  submit: document.getElementById("adminSubmit"),
  status: document.getElementById("adminStatus"),
  progress: document.querySelector(".admin-progress"),
  progressBar: document.getElementById("adminProgressBar"),

  // EPUB VIP Studio Elements
  studioAuthGate: document.getElementById("studioAuthGate"),
  studioAuthForm: document.getElementById("studioAuthForm"),
  studioAuthPassword: document.getElementById("studioAuthPassword"),
  studioAuthError: document.getElementById("studioAuthError"),
  studioMainContent: document.getElementById("studioMainContent"),
  studioTopKeyGroup: document.getElementById("studioTopKeyGroup"),
  studioTopActions: document.getElementById("studioTopActions"),
  studioHeaderBookMeta: document.getElementById("studioHeaderBookMeta"),
  studioNotice: document.getElementById("studioNotice"),
  studioKeyForm: document.getElementById("studioKeyForm"),
  studioGeminiKey: document.getElementById("studioGeminiKey"),
  studioToggleKey: document.getElementById("studioToggleKey"),
  studioGeminiModel: document.getElementById("studioGeminiModel"),
  studioPingKeyBtn: document.getElementById("studioPingKeyBtn"),
  studioKeyStatus: document.getElementById("studioKeyStatus"),
  studioUploadZone: document.getElementById("studioUploadZone"),
  studioEpubFileInput: document.getElementById("studioEpubFileInput"),
  studioSelectFileBtn: document.getElementById("studioSelectFileBtn"),
  studioBookTitle: document.getElementById("studioBookTitle"),
  studioBookStats: document.getElementById("studioBookStats"),
  studioProgressText: document.getElementById("studioProgressText"),
  studioMiniProgressFill: document.getElementById("studioMiniProgressFill"),
  studioExportBtn: document.getElementById("studioExportBtn"),
  studioChangeFileBtn: document.getElementById("studioChangeFileBtn"),
  studioClearCacheBtn: document.getElementById("studioClearCacheBtn"),
  studioWorkspace: document.getElementById("studioWorkspace"),
  studioChapterSearch: document.getElementById("studioChapterSearch"),
  studioFilterUntranslated: document.getElementById("studioFilterUntranslated"),
  studioPageRange: document.getElementById("studioPageRange"),
  studioChapterList: document.getElementById("studioChapterList"),
  studioPrevChBtn: document.getElementById("studioPrevChBtn"),
  studioNextChBtn: document.getElementById("studioNextChBtn"),
  studioChapterIndicator: document.getElementById("studioChapterIndicator"),
  studioTranslateCurrentBtn: document.getElementById("studioTranslateCurrentBtn"),
  studioPromptTranslateBtn: document.getElementById("studioPromptTranslateBtn"),
  studioViewTranslated: document.getElementById("studioViewTranslated"),
  studioViewOriginal: document.getElementById("studioViewOriginal"),
  studioViewSplit: document.getElementById("studioViewSplit"),
  studioTransStateBanner: document.getElementById("studioTransStateBanner"),
  studioTransIcon: document.getElementById("studioTransIcon"),
  studioTransTitle: document.getElementById("studioTransTitle"),
  studioTransDesc: document.getElementById("studioTransDesc"),
  studioReaderContent: document.getElementById("studioReaderContent"),
  studioPaperTranslated: document.getElementById("studioPaperTranslated"),
  studioPaperOriginal: document.getElementById("studioPaperOriginal"),
  studioCurrentTitleDisplay: document.getElementById("studioCurrentTitleDisplay"),
  studioCurrentMetaDisplay: document.getElementById("studioCurrentMetaDisplay"),
  studioTranslationTimestamp: document.getElementById("studioTranslationTimestamp"),
  studioTranslatedBody: document.getElementById("studioTranslatedBody"),
  studioOriginalTitleDisplay: document.getElementById("studioOriginalTitleDisplay"),
  studioOriginalMetaDisplay: document.getElementById("studioOriginalMetaDisplay"),
  studioOriginalBody: document.getElementById("studioOriginalBody"),
  studioAutoTranslateNext: document.getElementById("studioAutoTranslateNext")
};

let adminCatalog = { books: [] };
let activeAdminTab = "library";
let mounted = false;
let translateTimer = null;

let pendingAdminTab = null;

function setStudioAuth(authenticated) {
  if (els.studioAuthGate) els.studioAuthGate.hidden = authenticated;
  if (els.studioMainContent) els.studioMainContent.hidden = !authenticated;
  if (els.studioTopKeyGroup) els.studioTopKeyGroup.hidden = !authenticated;
  if (els.studioTopActions) els.studioTopActions.hidden = !authenticated;
  if (authenticated) {
    initEpubStudio();
  } else if (els.studioAuthPassword) {
    requestAnimationFrame(() => els.studioAuthPassword?.focus());
  }
}

async function handleStudioLogin(e) {
  e?.preventDefault();
  if (els.studioAuthError) els.studioAuthError.hidden = true;
  const pass = String(els.studioAuthPassword?.value || "").trim();
  if (!pass) return;
  try {
    const res = await requestJson("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass })
    });
    if (res?.authenticated) {
      if (els.studioAuthPassword) els.studioAuthPassword.value = "";
      setStudioAuth(true);
      showAuthenticated(true);
    }
  } catch (err) {
    if (els.studioAuthError) {
      els.studioAuthError.hidden = false;
      els.studioAuthError.textContent = err.message || "Mật khẩu không chính xác.";
    }
  }
}

export function mountAdmin(options = {}) {
  if (!mounted) {
    mounted = true;
    els.open?.addEventListener("click", () => openAdmin());
    els.close?.addEventListener("click", () => els.dialog.close());
    els.dialog?.addEventListener("click", (event) => {
      if (event.target === els.dialog) els.dialog.close();
    });
    els.loginForm?.addEventListener("submit", login);
    els.studioAuthForm?.addEventListener("submit", handleStudioLogin);
    els.uploadForm?.addEventListener("submit", submitBook);
    els.crawlerForm?.addEventListener("submit", saveCrawlerConfig);
    els.libraryTab?.addEventListener("click", () => selectAdminTab("library"));
    els.translateTab?.addEventListener("click", () => selectAdminTab("translate"));
    els.keysTab?.addEventListener("click", () => selectAdminTab("keys"));
    els.crawlerTab?.addEventListener("click", () => selectAdminTab("crawler"));
    els.statsTab?.addEventListener("click", () => selectAdminTab("stats"));
    els.usersTab?.addEventListener("click", () => selectAdminTab("users"));
    els.keysPingBtn?.addEventListener("click", runKeysPingTest);
    els.addKeyForm?.addEventListener("submit", handleAddKeySubmit);
    els.translateStartBtn?.addEventListener("click", handleStartTranslate);
    els.translateRefresh?.addEventListener("click", loadTranslateStatus);
    els.translateFocusSave?.addEventListener("click", saveTranslationFocus);
    els.statsRefresh?.addEventListener("click", loadAnalytics);
    els.usersRefresh?.addEventListener("click", loadAdminUsers);
    els.usersSearch?.addEventListener("input", filterAdminUsers);
    els.usersSchoolFilter?.addEventListener("change", filterAdminUsers);
    els.crawlerRefresh?.addEventListener("click", loadCrawlerConfig);
    els.crawlerWordCount?.addEventListener("change", describeCrawlerReach);
    els.crawlerForm?.querySelectorAll('[name="crawlerCategory"]').forEach((input) => {
      input.addEventListener("change", describeCrawlerReach);
    });
    els.bookSelect?.addEventListener("change", selectBook);
    els.logout?.addEventListener("click", logout);
    els.deleteBook?.addEventListener("click", deleteSelectedBook);

    // EPUB VIP Studio Listeners
    els.studioSelectFileBtn?.addEventListener("click", () => els.studioEpubFileInput?.click());
    els.studioUploadZone?.addEventListener("click", (e) => {
      if (e.target !== els.studioSelectFileBtn) els.studioEpubFileInput?.click();
    });
    els.studioUploadZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      els.studioUploadZone.classList.add("dragover");
    });
    els.studioUploadZone?.addEventListener("dragleave", () => {
      els.studioUploadZone.classList.remove("dragover");
    });
    els.studioUploadZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      els.studioUploadZone.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) handleStudioEpubFile(file);
    });
    els.studioEpubFileInput?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) handleStudioEpubFile(file);
    });
    els.studioPingKeyBtn?.addEventListener("click", pingStudioGeminiKey);
    els.studioKeyForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      pingStudioGeminiKey();
    });
    els.studioGeminiModel?.addEventListener("change", () => {
      localStorage.setItem("tangthu_gemini_model", els.studioGeminiModel.value);
    });
    els.studioChangeFileBtn?.addEventListener("click", () => {
      els.studioEpubFileInput?.click();
    });
    els.studioClearCacheBtn?.addEventListener("click", clearStudioCache);
    els.studioExportBtn?.addEventListener("click", exportStudioTranslations);
    els.studioChapterSearch?.addEventListener("input", (e) => {
      studioState.searchTerm = e.target.value;
      renderStudioChapterList();
    });
    els.studioFilterUntranslated?.addEventListener("change", (e) => {
      studioState.filterUntranslated = e.target.checked;
      renderStudioChapterList();
    });
    els.studioPageRange?.addEventListener("change", (e) => {
      studioState.pageRange = e.target.value;
      renderStudioChapterList();
    });
    els.studioPrevChBtn?.addEventListener("click", () => {
      selectStudioChapter(studioState.activeChapterIndex - 1);
    });
    els.studioNextChBtn?.addEventListener("click", () => {
      selectStudioChapter(studioState.activeChapterIndex + 1);
    });
    els.studioTranslateCurrentBtn?.addEventListener("click", translateCurrentStudioChapter);
    els.studioPromptTranslateBtn?.addEventListener("click", translateCurrentStudioChapter);
    els.studioViewTranslated?.addEventListener("click", () => setStudioViewMode("translated"));
    els.studioViewOriginal?.addEventListener("click", () => setStudioViewMode("original"));
    els.studioViewSplit?.addEventListener("click", () => setStudioViewMode("split"));

    // Keyboard navigation in EPUB Studio
    window.addEventListener("keydown", (e) => {
      const epubView = document.getElementById("epubStudioView");
      if (!epubView || epubView.hidden) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        selectStudioChapter(studioState.activeChapterIndex - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        selectStudioChapter(studioState.activeChapterIndex + 1);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        translateCurrentStudioChapter();
      }
    });
  }

  if (options?.view === "epubStudio") {
    requestJson("/api/admin/session")
      .then((session) => setStudioAuth(Boolean(session?.authenticated)))
      .catch(() => setStudioAuth(false));
    return;
  }

  if (options?.tab) {
    pendingAdminTab = options.tab;
    selectAdminTab(options.tab);
  }

  return openAdmin(options);
}

async function openAdmin(options = {}) {
  els.dialog.showModal();
  if (options?.tab) {
    pendingAdminTab = options.tab;
    selectAdminTab(options.tab);
  }
  setStatus("Đang kiểm tra phiên quản trị...");
  try {
    const session = await requestJson("/api/admin/session");
    showAuthenticated(session.authenticated);
    if (session.authenticated && !session.storageReady) setStatus("R2 chưa được cấu hình trên Worker nên chưa upload được.", true);
    else if (session.authenticated) {
      if (pendingAdminTab) {
        selectAdminTab(pendingAdminTab);
        pendingAdminTab = null;
      }
      await Promise.all([loadAdminCatalog(), loadCrawlerConfig()]);
      if (activeAdminTab === "epubStudio") {
        initEpubStudio();
        setStatus("Không gian Dịch EPUB Cá Nhân (VIP) - Gemini AI.");
      } else {
        setStatus("Chọn một truyện để chỉnh sửa hoặc thêm truyện mới.");
      }
    } else setStatus("");
  } catch (error) {
    showAuthenticated(false);
    setStatus(error.message, true);
  }
}

async function login(event) {
  event.preventDefault();
  setBusy(true);
  setStatus("Đang xác thực...");
  try {
    await requestJson("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: els.password.value })
    });
    els.password.value = "";
    if (pendingAdminTab) {
      selectAdminTab(pendingAdminTab);
      pendingAdminTab = null;
    }
    showAuthenticated(true);
    await Promise.all([loadAdminCatalog(), loadCrawlerConfig()]);
    if (activeAdminTab === "epubStudio") {
      initEpubStudio();
      setStatus("Đã mở quyền VIP: Dịch EPUB Cá Nhân với Gemini.");
    } else {
      setStatus("Đã mở quyền quản trị trong 30 phút.");
    }
  } catch (error) {
    els.password.value = "";
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function logout() {
  setBusy(true);
  try {
    await requestJson("/api/admin/session", { method: "DELETE" });
    showAuthenticated(false);
    setStatus("Đã đăng xuất.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function submitBook(event) {
  event.preventDefault();
  const existingBook = getSelectedBook();
  const epub = els.epub.files[0];
  const cover = els.cover.files[0];
  if (!existingBook && !epub) return setStatus("Hãy chọn file EPUB cho truyện mới.", true);
  if (epub && !/\.epub$/i.test(epub.name)) return setStatus("Hãy chọn đúng file EPUB.", true);
  if (epub && epub.size > 200 * 1024 * 1024) return setStatus("EPUB vượt quá 200 MB.", true);
  if (cover && (cover.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(cover.type))) return setStatus("Ảnh bìa không đúng định dạng hoặc vượt quá 5 MB.", true);

  const form = new FormData(els.uploadForm);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 30 * 60 * 1000);
  setBusy(true);
  setProgress(1);
  try {
    let epubUrl = existingBook?.epub || "";
    let archiveKey = "";
    let coverKey = "";
    if (epub) {
      setStatus("Đang upload EPUB...");
      archiveKey = await uploadToR2(epub, "epub", abortController.signal, (percentage) =>
        setProgress(Math.round(percentage * (cover ? 0.7 : 0.9)))
      );
    }

    let coverUrl = existingBook?.cover || "";
    if (cover) {
      setStatus("Đang upload ảnh bìa...");
      coverKey = await uploadToR2(cover, "cover", abortController.signal, (percentage) =>
        setProgress(70 + Math.round(percentage * 0.2))
      );
      coverUrl = coverKey;
    }

    setStatus("Đang cập nhật danh mục...");
    setProgress(94);
    const result = await requestJson("/api/admin/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: existingBook?.id,
        title: form.get("title"),
        author: form.get("author"),
        genre: form.get("genre"),
        status: form.get("status"),
        chapterCount: form.get("chapterCount"),
        description: form.get("description"),
        featured: form.get("featured") === "on",
        epub: epubUrl,
        cover: coverUrl
      })
    });
    // The EPUB is in the private bucket; ingest itself takes minutes, so it runs
    // in GitHub Actions rather than blocking this request.
    if (archiveKey) {
      setStatus("Đang gửi lệnh ingest...");
      setProgress(97);
      const dispatch = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ingest",
          archiveKey,
          coverKey,
          title: form.get("title"),
          author: form.get("author"),
          genre: form.get("genre")
        })
      });
      if (!dispatch.ok) {
        // The upload and the catalogue row both succeeded, so say exactly what
        // failed rather than implying the whole thing was lost.
        setStatus("Đã upload nhưng chưa chạy được ingest. Chạy workflow \"Ingest uploaded book\" thủ công.", true);
      }
    }

    setProgress(100);
    adminCatalog = result.catalog;
    renderBookOptions(result.book.id);
    populateBookForm(result.book);
    setStatus(existingBook ? "Đã lưu thay đổi thông tin truyện." : "Upload thành công. Truyện đã xuất hiện trong thư viện.");
    window.dispatchEvent(new CustomEvent("library:refresh", { detail: result.catalog }));
  } catch (error) {
    if (/hết hạn|quyền/.test(error.message)) showAuthenticated(false);
    setStatus(error.name === "AbortError" ? "Upload quá 30 phút và đã được dừng. Hãy kiểm tra mạng rồi thử lại." : error.message, true);
  } finally {
    clearTimeout(timeoutId);
    setBusy(false);
    setTimeout(() => setProgress(0), 1200);
  }
}

async function deleteSelectedBook() {
  const book = getSelectedBook();
  if (!book) return setStatus("Hãy chọn truyện cần xóa.", true);
  const confirmed = window.confirm(`Xóa “${book.title}”? EPUB và ảnh bìa của truyện cũng sẽ bị xóa khỏi kho lưu trữ.`);
  if (!confirmed) return;

  setBusy(true);
  setStatus(`Đang xóa ${book.title}...`);
  try {
    const result = await requestJson("/api/admin/catalog", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: book.id })
    });
    adminCatalog = result.catalog;
    renderBookOptions();
    renderTranslationFocusOptions();
    startNewBook();
    setStatus(
      result.cleanupFailed ? "Đã gỡ truyện khỏi thư viện, nhưng có file Blob chưa xóa được." : `Đã xóa ${result.deleted.title} khỏi thư viện.`,
      Boolean(result.cleanupFailed)
    );
    window.dispatchEvent(new CustomEvent("library:refresh", { detail: result.catalog }));
  } catch (error) {
    if (/hết hạn|quyền/.test(error.message)) showAuthenticated(false);
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function loadAdminCatalog() {
  // The same published snapshot the reader uses. The cache-busting query matters:
  // the CDN holds it for 60s and an admin needs to see their own edit at once.
  adminCatalog = CDN_BASE
    ? await requestJson(`${CDN_BASE}/catalog/latest.json?admin=${Date.now()}`)
    : { books: [] };
  renderBookOptions();
  renderTranslationFocusOptions();
  startNewBook();
}

let crawlerPollTimer = null;

// Only the status is fetched on a tick - never the config - so polling can never
// stomp on a value being edited in the form.
function startCrawlerPolling() {
  stopCrawlerPolling();
  crawlerPollTimer = setInterval(async () => {
    if (activeAdminTab !== "crawler" || document.hidden) return;
    try {
      const result = await requestJson("/api/admin/crawler");
      renderCrawlerStatus(result.status);
    } catch {
      // A failed poll is not worth interrupting the admin over; the next tick
      // either recovers or the heartbeat goes stale, which is the real signal.
    }
  }, 15000);
}

function stopCrawlerPolling() {
  if (crawlerPollTimer) clearInterval(crawlerPollTimer);
  crawlerPollTimer = null;
}

async function loadCrawlerConfig() {
  const result = await requestJson("/api/admin/crawler");
  fillChoices(els.crawlerWordCount, result.wordCountBuckets, result.config.wordCountBucket);
  fillChoices(els.crawlerCreationStatus, result.creationStatuses, result.config.creationStatus);
  els.crawlerEnabled.checked = Boolean(result.config.enabled);
  els.crawlerMaxBooks.value = String(result.config.maxNewBooksPerRun || 2);
  if (els.crawlerMaxBacklog) els.crawlerMaxBacklog.value = String(result.config.maxPendingBooksBacklog || 5);
  els.crawlerUpdateExisting.checked = result.config.updateExisting !== false;
  const selected = new Set(result.config.categories || []);
  els.crawlerForm.querySelectorAll('[name="crawlerCategory"]').forEach((input) => { input.checked = selected.has(input.value); });
  els.crawlerWorkerWarning.hidden = result.workerReady;
  renderCrawlerStatus(result.status);
  describeCrawlerReach();
}

function fillChoices(select, choices, current) {
  if (!select || !Array.isArray(choices)) return;
  const fragment = document.createDocumentFragment();
  choices.forEach((choice) => {
    const option = document.createElement("option");
    option.value = String(choice.value);
    option.textContent = choice.label;
    if (Number.isFinite(choice.minWords)) option.dataset.minWords = String(choice.minWords);
    fragment.appendChild(option);
  });
  select.replaceChildren(fragment);
  select.value = String(current);
}

// Shows what the chosen length filter actually guarantees, so the chapter minimum
// below it can be set to something the filter can really deliver.
function describeCrawlerReach() {
  if (!els.crawlerReach) return;
  const option = els.crawlerWordCount?.selectedOptions?.[0];
  const minWords = Number(option?.dataset.minWords || 0);
  const genres = els.crawlerForm.querySelectorAll('[name="crawlerCategory"]:checked').length;
  if (!minWords) {
    els.crawlerReach.textContent = genres
      ? `${genres} thể loại · bộ lọc độ dài đang tắt nên crawler phải tự kiểm tra số chương từng truyện.`
      : "Hãy chọn ít nhất một thể loại.";
    return;
  }
  const floor = Math.floor(minWords / 2200);
  els.crawlerReach.textContent = `${genres} thể loại · mỗi truyện có tối thiểu ~${minWords.toLocaleString("vi-VN")} chữ (khoảng ${floor}+ chương). Fanqie lọc sẵn nên không cần quét từng truyện.`;
}

async function loadAnalytics() {
  setStatus("Đang tải số liệu độc giả thực tế...");
  try {
    renderAnalytics(await requestJson("/api/admin/analytics"));
    setStatus("");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderAnalytics(data = {}) {
  const summary = data.summary || data;
  const tiles = [
    {
      label: "Hôm nay",
      readers: summary.today?.sessions || summary.today?.visits || 0,
      reads: summary.today?.reads || 0,
      sub: "độc giả thật hôm nay"
    },
    {
      label: "7 ngày qua",
      readers: summary.last7?.sessions || summary.last7?.visits || 0,
      reads: summary.last7?.reads || 0,
      sub: "độc giả trong tuần"
    },
    {
      label: "30 ngày qua",
      readers: summary.last30?.sessions || summary.last30?.visits || 0,
      reads: summary.last30?.reads || 0,
      sub: "độc giả trong tháng"
    },
    {
      label: "Tổng toàn thời gian",
      readers: summary.allTime?.sessions || summary.allTime?.visits || 0,
      reads: summary.allTime?.reads || 0,
      sub: `${formatCount(summary.bookmarks || 0)} lượt lưu tủ truyện`
    }
  ];

  const grid = document.createDocumentFragment();
  tiles.forEach((tile) => {
    const card = document.createElement("div");
    card.className = "stats-card";
    appendText(card, "span", "stats-card-label", tile.label);
    appendText(card, "strong", "stats-card-value", `${formatCount(tile.readers)} độc giả`);
    appendText(card, "small", "stats-card-meta", `${formatCount(tile.reads)} chương đã đọc · ${tile.sub}`);
    grid.appendChild(card);
  });
  els.statsGrid.replaceChildren(grid);

  const books = Array.isArray(data.books) ? data.books : [];
  const list = document.createDocumentFragment();
  books.forEach((book, idx) => {
    const item = document.createElement("li");
    const matchedBook = (adminCatalog.books || []).find((b) => b.id === book.bookId);
    const title = matchedBook ? matchedBook.title : (book.title || book.bookId);
    
    appendText(item, "span", "stats-book-rank", `#${idx + 1}`);
    appendText(item, "span", "stats-book-title", title);
    appendText(item, "span", "stats-book-count", `${formatCount(book.reads)} lượt`);
    list.appendChild(item);
  });
  els.statsBooks.replaceChildren(list);
  els.statsBooksEmpty.hidden = books.length > 0;

  const range = summary.firstDay ? `từ ${summary.firstDay}` : "hệ thống bắt đầu ghi nhận";
  els.statsNote.textContent = summary.storageReady
    ? `Thống kê theo số lượng độc giả thật (Unique Sessions) và số chương truyện thực đọc (${range}). Tuyệt đối không lưu IP hay thông tin cá nhân.`
    : "Chưa cấu hình Supabase cho phần quản trị nên chưa đọc được số liệu.";
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function appendText(parent, tagName, className, value) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value;
  parent.appendChild(element);
  return element;
}

// ---- translate monitor -----------------------------------------------------

function startTranslatePolling() {
  stopTranslatePolling();
  loadTranslateStatus();
  translateTimer = setInterval(() => {
    if (activeAdminTab !== "translate" || document.hidden) return;
    loadTranslateStatus();
  }, 10000);
}

function stopTranslatePolling() {
  if (translateTimer) {
    clearInterval(translateTimer);
    translateTimer = null;
  }
}

async function handleStartTranslate() {
  if (!els.translateStartBtn || els.translateStartBtn.disabled) return;
  els.translateStartBtn.disabled = true;
  const originalText = els.translateStartBtn.innerHTML;
  els.translateStartBtn.innerHTML = "<span>⏳ Đang gọi Actions...</span>";
  setStatus("Đang gửi lệnh kích hoạt tiến trình dịch lên GitHub Actions...");

  try {
    const res = await requestJson("/api/admin/translate", {
      method: "POST",
      body: JSON.stringify({ budget: "5000" })
    });
    setStatus(res.message || "Đã kích hoạt worker dịch trên GitHub Actions.");
    if (els.translateStateBadge) {
      els.translateStateBadge.textContent = "Khởi động";
      els.translateStateBadge.dataset.state = "running";
    }
    if (els.translateStateMessage) {
      els.translateStateMessage.textContent = "Đang kết nối worker dịch trên GitHub Actions...";
    }
    setTimeout(loadTranslateStatus, 3000);
  } catch (err) {
    setStatus(`Lỗi kích hoạt dịch: ${err.message}`, true);
  } finally {
    els.translateStartBtn.disabled = false;
    els.translateStartBtn.innerHTML = originalText;
  }
}

async function loadTranslateStatus() {
  try {
    const res = await requestJson("/api/admin/translate");
    renderTranslationFocusOptions(res.config?.focusBookId || "");
    renderTranslationFocusHint(res.config || {});
    renderTranslateStatus(res.status);
  } catch (err) {
    console.warn("Unable to load translate status:", err);
  }
}

function renderTranslationFocusOptions(selectedId) {
  if (!els.translateFocusBook) return;
  const current = selectedId === undefined ? els.translateFocusBook.value : selectedId;
  const fragment = document.createDocumentFragment();
  const automatic = document.createElement("option");
  automatic.value = "";
  automatic.textContent = "Tự động chọn khi không có bộ ưu tiên";
  fragment.appendChild(automatic);
  [...(adminCatalog.books || [])]
    .filter((book) => {
      const total = Number(book.chapterCount || book.totalChapters || 0);
      const translated = Number(book.translatedChapters || 0);
      return total > translated;
    })
    .sort((a, b) => String(a.title).localeCompare(String(b.title), "vi"))
    .forEach((book) => {
      const total = Number(book.chapterCount || book.totalChapters || 0);
      const translated = Number(book.translatedChapters || 0);
      const option = document.createElement("option");
      option.value = book.id;
      option.textContent = `${book.title} — ${translated}/${total} chương`;
      fragment.appendChild(option);
    });
  els.translateFocusBook.replaceChildren(fragment);
  els.translateFocusBook.value = [...els.translateFocusBook.options].some((option) => option.value === current) ? current : "";
}

function renderTranslationFocusHint(config = {}) {
  if (!els.translateFocusHint) return;
  const focusBookId = String(config.focusBookId || "");
  const book = (adminCatalog.books || []).find((item) => item.id === focusBookId);
  els.translateFocusHint.dataset.mode = focusBookId ? "focused" : "automatic";
  els.translateFocusHint.textContent = focusBookId
    ? `Đang khóa ưu tiên: ${book?.title || focusBookId}. Khi dịch đủ 100%, worker sẽ tự trả về chế độ tự động.`
    : "Chế độ tự động: worker sẽ chọn bộ phù hợp nhất trong hàng đợi.";
}

async function saveTranslationFocus() {
  if (!els.translateFocusBook || !els.translateFocusSave) return;
  els.translateFocusSave.disabled = true;
  try {
    const result = await requestJson("/api/admin/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "focus", focusBookId: els.translateFocusBook.value })
    });
    renderTranslationFocusHint(result.config || {});
    setStatus(result.message || "Đã lưu lựa chọn ưu tiên.");
    if (result.dispatchStarted) {
      setTimeout(loadTranslateStatus, 3000);
    }
  } catch (error) {
    setStatus(`Không lưu được bộ ưu tiên: ${error.message}`, true);
  } finally {
    els.translateFocusSave.disabled = false;
  }
}

function renderTranslateStatus(status = {}) {
  if (!els.translateStateBadge) return;
  const labels = {
    idle: "Tạm nghỉ",
    running: "Đang dịch AI",
    paused_quota: "Chờ quota hồi đầy",
    completed: "Hoàn tất",
    error: "Có lỗi"
  };
  els.translateStateBadge.textContent = labels[status.state] || labels.idle;
  els.translateStateBadge.dataset.state = status.state || "idle";

  const beat = status.updatedAt || status.finishedAt;
  const heartbeatStale = Boolean(beat && Date.now() - new Date(beat).getTime() > 5 * 60 * 1000);
  if (els.transHeartbeatText) {
    els.transHeartbeatText.textContent = beat
      ? `${heartbeatStale ? "⚠️ Mất tín hiệu" : "Nhịp tim"}: ${describeAge(beat)}`
      : "Nhịp tim: Đang chờ";
  }

  const isRunning = status.state === "running" && !heartbeatStale;
  const isQuotaPaused = status.state === "paused_quota" || status.stopReason === "quota_tpd_rpd" || status.activityState === "waiting_quota";
  const isAllKeysDead = status.stopReason === "all_keys_dead";
  const isCompleted = status.stopReason === "completed_all" || status.state === "completed";

  // Render Stop Reason & Worker Alive/Dead Diagnostic Card
  if (els.transStopReasonBox) {
    if (isRunning) {
      els.transStopReasonBox.className = "trans-stop-reason-box is-alive";
    } else if (isQuotaPaused) {
      els.transStopReasonBox.className = "trans-stop-reason-box is-quota-stop";
    } else if (isCompleted) {
      els.transStopReasonBox.className = "trans-stop-reason-box is-completed-stop";
    } else {
      els.transStopReasonBox.className = "trans-stop-reason-box is-offline-stop";
    }
  }

  if (els.transWorkerStatusBadge) {
    if (isRunning) {
      els.transWorkerStatusBadge.className = "worker-alive-badge is-online";
      els.transWorkerStatusBadge.textContent = "🟢 ONLINE (24/7)";
    } else if (isQuotaPaused) {
      els.transWorkerStatusBadge.className = "worker-alive-badge is-paused";
      els.transWorkerStatusBadge.textContent = "🟡 CHỜ QUOTA";
    } else if (isAllKeysDead) {
      els.transWorkerStatusBadge.className = "worker-alive-badge is-offline";
      els.transWorkerStatusBadge.textContent = "🔴 LỖI KEY";
    } else if (isCompleted) {
      els.transWorkerStatusBadge.className = "worker-alive-badge is-online";
      els.transWorkerStatusBadge.textContent = "🎉 HOÀN TẤT";
    } else {
      els.transWorkerStatusBadge.className = "worker-alive-badge is-offline";
      els.transWorkerStatusBadge.textContent = "🔴 OFFLINE";
    }
  }

  if (els.transStopReasonTitle) {
    let title = status.stopReasonTitle || (isRunning ? "Worker đang quét & chuẩn hóa các bộ truyện" : "Hệ thống đang tạm nghỉ");
    // Strip leading emojis if present to avoid redundancy with the badge
    title = title.replace(/^[🟢🟡🔴🎉⚠️\s]+/, "");
    els.transStopReasonTitle.textContent = title;
  }

  if (els.transStopReasonDesc) {
    els.transStopReasonDesc.textContent = status.stopReasonDetails || status.message || "Chưa có tác vụ quét AI đang chạy.";
  }

  // 1. Current Active Focus Novel Info
  const total = Number(status.currentTotalChapters || 0);
  const saved = Number(status.currentCompleted || status.currentChapter || 0);
  const matched = (adminCatalog.books || []).find((b) => b.id === status.currentBookId);
  const bookTitle = status.currentBookTitle || (matched ? matched.title : status.currentBookId) || "Đang chờ lượt...";
  const percent = total ? Math.min(100, Math.round((saved / total) * 1000) / 10) : 0;
  const activityState = String(status.activityState || "");
  const hasProgressThisRun = Number(status.translatedThisRun || status.sessionChaptersTranslated || 0) > 0;

  if (els.transActiveBookTitle) {
    els.transActiveBookTitle.textContent = isRunning || isQuotaPaused ? bookTitle : (status.state === "idle" ? "Hệ thống đang sẵn sàng" : "Đang tạm dừng");
  }
  if (els.transActiveCoverImg) {
    if (matched && matched.cover) {
      els.transActiveCoverImg.src = matched.cover;
    } else if (status.currentBookId) {
      els.transActiveCoverImg.src = `${CDN_BASE}/covers/${status.currentBookId}.jpg`;
    } else {
      els.transActiveCoverImg.src = "/library/covers/misty-pagoda.webp";
    }
  }
  if (els.translateStateMessage) {
    let stateMsg = isRunning && bookTitle
      ? (status.activityMessage || `Worker đang xử lý bộ [${bookTitle}], nhưng chưa nhận được chi tiết lượt dịch.`)
      : (status.message || "Chưa có tác vụ dịch đang chạy.");
    const lastErr = String(status.lastError || "").trim();
    const stalled = activityState === "waiting_quota" || activityState === "retrying" || isQuotaPaused;
    if (lastErr && stalled) {
      stateMsg += ` · Lỗi gần nhất: ${lastErr}`;
    }
    els.translateStateMessage.textContent = stateMsg;
  }
  if (els.transLiveState) {
    const label = heartbeatStale && isRunning
      ? "Worker có thể đã dừng"
      : activityState === "waiting_quota"
        ? status.resumesAt
          ? `Không gửi request · tiếp tục ${new Date(status.resumesAt).toLocaleString("vi-VN")}`
          : "Đang chờ quota · không gửi request"
      : activityState === "translating"
      ? "Đang gọi AI"
      : activityState === "progress"
        ? "Vừa lưu chương mới"
        : activityState === "retrying"
          ? "Đang retry · chưa có đầu ra"
          : isRunning ? "Worker còn hoạt động" : "Không có lượt dịch";
    els.transLiveState.lastChild.textContent = ` ${label}`;
    els.transLiveState.dataset.activity = heartbeatStale && isRunning ? "stale" : activityState || (isRunning ? "alive" : "idle");
  }
  if (els.transActiveChapterBadge) {
    els.transActiveChapterBadge.textContent = total > 0 ? `Chương ${saved.toLocaleString("vi-VN")} / ${total.toLocaleString("vi-VN")}` : `Chương ${saved || 0}`;
  }
  if (els.transActivePercentBadge) {
    els.transActivePercentBadge.textContent = `Tiến độ: ${percent}%`;
  }
  if (els.transActiveRemainingBadge) {
    els.transActiveRemainingBadge.textContent = total > 0 ? `Còn lại: ${Math.max(0, total - saved).toLocaleString("vi-VN")} chương` : "Còn lại: --";
  }

  const sessionCount = Number(status.translatedThisRun || status.sessionChaptersTranslated || 0);
  if (els.transSessionCountBadge) {
    els.transSessionCountBadge.textContent = `⚡ Phiên này: +${sessionCount.toLocaleString("vi-VN")} chương`;
  }
  const currentCh = status.currentChapter || status.currentChapterNum || "";
  if (els.transCurrentChapterNameBadge) {
    const chapters = Array.isArray(status.activeChapters) ? status.activeChapters : [];
    const chapterText = chapters.length > 1 ? `${chapters[0]}–${chapters[chapters.length - 1]}` : currentCh;
    const verb = activityState === "waiting_quota"
      ? "Đang chờ quota"
      : activityState === "retrying" ? "Đang retry" : activityState === "progress" ? "Vừa xong" : "Đang xử lý";
    els.transCurrentChapterNameBadge.textContent = chapterText ? `📖 ${verb}: Chương ${chapterText}` : "📖 Đang sẵn sàng";
  }
  if (els.transAttemptCountBadge) {
    const attempts = Number(status.spentRequests || 0);
    const currentAttempt = Number(status.currentAttempt || 0);
    els.transAttemptCountBadge.textContent = `🔄 Lượt xử lý: ${attempts}${currentAttempt ? ` · lần ${currentAttempt} của chương` : ""}`;
  }
  if (els.transLastSuccessBadge) {
    if (status.lastSuccessAt) {
      const chapter = Number(status.lastSuccessfulChapter || 0);
      els.transLastSuccessBadge.textContent = `✅ Thành công gần nhất${chapter ? `: Chương ${chapter}` : ""} · ${describeAge(status.lastSuccessAt)}`;
    } else {
      els.transLastSuccessBadge.textContent = hasProgressThisRun
        ? `✅ Phiên này đã lưu ${sessionCount} chương`
        : `⚠️ Chưa có chương thành công${status.startedAt ? ` sau ${describeAge(status.startedAt)}` : " trong phiên"}`;
    }
  }

  // Speed & ETA
  const speed = Number(status.speed || 0);
  const pending = Math.max(0, total - saved);
  let etaText = "Dự kiến: --";
  if (speed > 0 && pending > 0) {
    const mins = Math.ceil(pending / speed);
    etaText = mins > 60 ? `Dự kiến: ~${Math.floor(mins / 60)}h${mins % 60}m` : `Dự kiến: ~${mins} phút`;
  } else if (pending === 0 && total > 0) {
    etaText = "Dự kiến: Sắp hoàn tất";
  }
  if (els.transActiveEtaBadge) els.transActiveEtaBadge.textContent = etaText;

  if (els.transStatSpeed) {
    els.transStatSpeed.textContent = speed > 0
      ? `Tốc độ thực: ${speed} ch/phút (~${Math.round(speed * 60).toLocaleString("vi-VN")} ch/giờ)`
      : isRunning
        ? "Tốc độ thực: 0 chương/giờ · chưa có đầu ra thành công"
        : "Tốc độ thực: 0 chương/giờ";
  }

  // Progress Bar
  if (els.translateProgressFill) els.translateProgressFill.style.width = `${percent}%`;
  if (els.translateProgressLabel) {
    els.translateProgressLabel.textContent = total > 0 ? `Đã dịch: ${saved}/${total} chương (${percent}%)` : "Đang khởi tạo...";
  }

  // 2. Operational Specs
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const recentActs = Array.isArray(status.recentActivity) ? status.recentActivity : [];
  const now = Date.now();
  const lastHourActs = recentActs.filter((a) => a.at && now - new Date(a.at).getTime() <= ONE_HOUR_MS);
  const lastHourCh = lastHourActs.reduce((sum, a) => sum + Number(a.count || 0), 0);

  if (els.transStatLastHourCh) {
    els.transStatLastHourCh.textContent = `+${lastHourCh.toLocaleString("vi-VN")} chương`;
  }
  if (els.transHourlySummaryText) {
    els.transHourlySummaryText.textContent = status.startedAt ? `bắt đầu từ ${describeAge(status.startedAt)}` : "trong phiên hiện tại";
  }
  if (els.translateStateMeta) {
    const spacing = Number(status.spacingMs || 0);
    const keys = Number(status.activeKeyCount || 0);
    els.translateStateMeta.textContent = spacing
      ? `${spacing.toLocaleString("vi-VN")}ms / lượt (${keys || "?"} keys)`
      : "Điều tốc tự động theo quota";
  }
  if (els.transStatKeysActive) {
    const keys = Number(status.activeKeyCount || 0);
    const ready = Number(status.readyKeyCount);
    const dead = Number(status.deadKeyCount || 0);
    const daily = Number(status.dailyExhaustedKeyCount || 0);
    const cooldown = Number(status.cooldownKeyCount || 0);
    if (!keys) {
      els.transStatKeysActive.textContent = "Đang kiểm tra Keys";
    } else if (Number.isFinite(ready)) {
      const parts = [`${ready}/${keys} key sẵn sàng`];
      if (daily) parts.push(`${daily} hết quota ngày`);
      if (cooldown) parts.push(`${cooldown} đang nghỉ`);
      if (dead) parts.push(`⚠️ ${dead} key lỗi/khoá — cần thay`);
      els.transStatKeysActive.textContent = parts.join(" · ");
    } else {
      els.transStatKeysActive.textContent = `${keys} Keys đủ điều kiện`;
    }
  }

  // 3. Next In Line Teaser
  const catalogBooks = Array.isArray(adminCatalog.books) ? adminCatalog.books : [];
  const publishedBookIds = new Set(catalogBooks.map((book) => book.id));
  let queue = Array.isArray(status.queue) && status.queue.length
    ? status.queue.filter((job) => publishedBookIds.has(job.bookId))
    : [];
  if (!queue.length && catalogBooks.length) {
    queue = catalogBooks
      .map((b) => {
        const totalCh = Number(b.chapterCount || b.totalChapters || 0);
        const doneCh = Number(b.translatedChapters || 0);
        return {
          bookId: b.id,
          total: totalCh,
          pending: Math.max(0, totalCh - doneCh),
          highPriority: false
        };
      })
      .filter((b) => b.total > 0 && b.pending > 0);
  }

  const waitingQueue = queue.filter((j) => !(status.state === "running" && status.currentBookId === j.bookId));
  const sortedQueue = [...waitingQueue].sort((a, b) => {
    if (a.highPriority !== b.highPriority) return (b.highPriority ? 1 : 0) - (a.highPriority ? 1 : 0);
    const aDone = (a.total || 0) - (a.pending || 0);
    const bDone = (b.total || 0) - (b.pending || 0);
    if (aDone > 0 || bDone > 0) return bDone - aDone;
    return (b.pending || 0) - (a.pending || 0);
  });

  if (els.transNextBookTitle) {
    if (sortedQueue.length > 0) {
      const nextBook = sortedQueue[0];
      const matchedNext = (adminCatalog.books || []).find((b) => b.id === nextBook.bookId);
      const nextTitle = matchedNext ? matchedNext.title : nextBook.bookId;
      const totalNext = Number(nextBook.total || 0);
      const pendingNext = Number(nextBook.pending || 0);
      const doneNext = Math.max(0, totalNext - pendingNext);
      els.transNextBookTitle.textContent = `${nextTitle} (Đã có ${doneNext.toLocaleString("vi-VN")}/${totalNext.toLocaleString("vi-VN")} chương — Còn ${pendingNext.toLocaleString("vi-VN")} chương)`;
    } else {
      els.transNextBookTitle.textContent = "Không còn bộ truyện nào đang chờ (Tất cả 100% hoàn tất).";
    }
  }

  // 4. Render Daily Scanned Books Table
  const scannedList = Array.isArray(status.dailyScannedBooks) ? status.dailyScannedBooks : [];
  if (els.transDailyScannedCount) {
    els.transDailyScannedCount.textContent = `${scannedList.length} bộ đã quét hôm nay`;
  }
  if (els.transDailyScannedTbody) {
    if (!scannedList.length) {
      els.transDailyScannedTbody.innerHTML = '<tr><td colspan="6" class="stats-empty">Chưa có dữ liệu quét trong phiên hôm nay.</td></tr>';
    } else {
      els.transDailyScannedTbody.innerHTML = "";
      scannedList.forEach((b) => {
        const tr = document.createElement("tr");
        const bMatched = (adminCatalog.books || []).find((book) => book.id === b.bookId);
        const bTitle = b.bookTitle || (bMatched ? bMatched.title : b.bookId) || b.bookId;
        const bCover = bMatched?.cover || `${CDN_BASE}/covers/${b.bookId}.jpg` || "/library/covers/misty-pagoda.webp";
        const scannedCh = Number(b.scannedChapters || 0);
        const totalCh = Number(b.totalChapters || bMatched?.chapterCount || 0);
        const repairedCh = Number(b.repairedChapters || 0);
        const fluency = Number(b.fluencyScore || 10);
        const statusClass = b.status === "scanning" ? "is-scanning" : b.status === "paused_quota" ? "is-paused" : "is-done";

        tr.innerHTML = `
          <td>
            <div class="scanned-book-title-cell">
              <img class="scanned-book-mini-cover" src="${bCover}" alt="Bìa" onerror="this.src='/library/covers/misty-pagoda.webp'">
              <div>
                <div class="scanned-book-name">${escapeHtml(bTitle)}</div>
                <small class="text-muted" style="font-size: 0.72rem; color: #64748b;">ID: ${escapeHtml(b.bookId)}</small>
              </div>
            </div>
          </td>
          <td><strong>${scannedCh.toLocaleString("vi-VN")}</strong> / ${totalCh ? totalCh.toLocaleString("vi-VN") : "?"} ch</td>
          <td><strong style="color: #4ade80;">+${repairedCh.toLocaleString("vi-VN")} ch đã sửa</strong></td>
          <td><span class="quality-score-badge">⭐ ${fluency}/10 Chuẩn</span></td>
          <td><span class="scanned-time-tag">${describeAge(b.lastScannedAt)}</span></td>
          <td><span class="scanned-status-pill ${statusClass}">${escapeHtml(b.statusLabel || "Đã kiểm định")}</span></td>
        `;
        els.transDailyScannedTbody.appendChild(tr);
      });
    }
  }
}

async function saveCrawlerConfig(event) {
  event.preventDefault();
  const categories = Array.from(els.crawlerForm.querySelectorAll('[name="crawlerCategory"]:checked'), (input) => input.value);
  if (!categories.length) return setStatus("Hãy chọn ít nhất một thể loại cho crawler.", true);
  setBusy(true);
  setStatus("Đang lưu cấu hình crawler...");
  try {
    const result = await requestJson("/api/admin/crawler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: els.crawlerEnabled.checked,
        categories,
        wordCountBucket: els.crawlerWordCount.value,
        creationStatus: els.crawlerCreationStatus.value,
        maxNewBooksPerRun: els.crawlerMaxBooks.value,
        maxPendingBooksBacklog: els.crawlerMaxBacklog ? els.crawlerMaxBacklog.value : 5,
        updateExisting: els.crawlerUpdateExisting.checked
      })
    });
    renderCrawlerStatus(result.status);
    els.crawlerWorkerWarning.hidden = result.workerReady;
    setStatus(result.config.enabled ? "Đã bật crawler tự động." : "Đã lưu cấu hình; crawler đang tắt.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

// How long ago, in words. The point of showing this is to answer one question -
// is the crawler still alive - and an absolute timestamp does not answer it.
function describeAge(iso) {
  if (!iso) return "";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds} giây trước`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
}

function renderCrawlerStatus(status = {}) {
  const labels = { idle: "Chưa chạy", running: "Đang chạy", success: "Hoàn tất", error: "Có lỗi", disabled: "Đang tắt" };
  els.crawlerStateBadge.textContent = labels[status.state] || labels.idle;
  els.crawlerStateBadge.dataset.state = status.state || "idle";
  els.crawlerStateMessage.textContent = status.message || "Crawler chưa chạy.";
  // The heartbeat, not the start time. A run that began 40 minutes ago tells you
  // nothing; a heartbeat 20 seconds old tells you it is working, and one an hour
  // old tells you it is not.
  const beat = status.updatedAt || status.finishedAt;
  const parts = [];
  if (beat) parts.push(`Cập nhật ${describeAge(beat)}`);
  if (status.state === "running" && status.startedAt) parts.push(`chạy từ ${describeAge(status.startedAt)}`);
  parts.push(`đã thêm ${status.published || 0}`);
  if (status.failed) parts.push(`lỗi ${status.failed}`);
  // The heartbeat is every 45 seconds, so five minutes of silence is real.
  const stale = beat && Date.now() - new Date(beat).getTime() > 5 * 60 * 1000;
  if (status.state === "running" && stale) parts.push("⚠ không có nhịp mới, có thể đã chết");
  els.crawlerStateMeta.textContent = parts.join(" · ");

  // Live progress on the book being downloaded.
  const total = Number(status.currentTotalChapters || 0);
  const saved = Number(status.currentChapters || 0);
  const showProgress = status.state === "running" && total > 0;
  if (els.crawlerProgress) {
    els.crawlerProgress.hidden = !showProgress;
    if (showProgress) {
      const percent = Math.min(100, Math.round((saved / total) * 100));
      if (els.crawlerProgressFill) els.crawlerProgressFill.style.width = `${percent}%`;
      if (els.crawlerProgressLabel) {
        els.crawlerProgressLabel.textContent =
          `${status.currentBookTitle || "Đang tải"} — ${saved.toLocaleString("vi-VN")}/${total.toLocaleString("vi-VN")} chương (${percent}%)`;
      }
    }
  }

  // What actually arrived, so "đã thêm 1" is backed by a name and a length.
  const recent = Array.isArray(status.recent) ? status.recent : [];
  if (els.crawlerRecent) {
    els.crawlerRecent.hidden = !recent.length;
    els.crawlerRecentList.innerHTML = "";
    for (const entry of recent) {
      const item = document.createElement("li");
      appendText(item, "span", "crawler-recent-name", entry.title);
      appendText(item, "span", "crawler-recent-count", `${Number(entry.chapters || 0).toLocaleString("vi-VN")} chương`);
      appendText(item, "span", "crawler-recent-age", describeAge(entry.at));
      els.crawlerRecentList.appendChild(item);
    }
  }

  // Recent errors log with clear reason
  const recentErrors = Array.isArray(status.recentErrors) ? status.recentErrors : [];
  if (els.crawlerErrors) {
    els.crawlerErrors.hidden = !recentErrors.length;
    if (els.crawlerErrorsList) {
      els.crawlerErrorsList.innerHTML = "";
      for (const entry of recentErrors) {
        const item = document.createElement("li");
        appendText(item, "span", "crawler-error-name", entry.title || `Book ${entry.sourceId}`);
        appendText(item, "span", "crawler-error-msg", entry.error);
        appendText(item, "span", "crawler-error-age", describeAge(entry.at));
        els.crawlerErrorsList.appendChild(item);
      }
    }
  }
}

const ADMIN_TABS = [
  { key: "library", tab: "libraryTab", panel: "uploadForm" },
  { key: "translate", tab: "translateTab", panel: "translatePanel" },
  { key: "keys", tab: "keysTab", panel: "keysPanel" },
  { key: "crawler", tab: "crawlerTab", panel: "crawlerForm" },
  { key: "stats", tab: "statsTab", panel: "statsPanel" },
  { key: "users", tab: "usersTab", panel: "usersPanel" }
];

let adminUsersData = [];

function selectAdminTab(tab) {
  activeAdminTab = ADMIN_TABS.some((entry) => entry.key === tab) ? tab : "library";
  ADMIN_TABS.forEach(({ key, tab: tabId, panel }) => {
    const active = key === activeAdminTab;
    els[tabId]?.classList.toggle("active", active);
    els[tabId]?.setAttribute("aria-selected", String(active));
    if (els[panel]) els[panel].hidden = !active;
  });
  setStatus("");
  if (activeAdminTab === "epubStudio") initEpubStudio();
  if (activeAdminTab === "translate") startTranslatePolling();
  else stopTranslatePolling();
  if (activeAdminTab === "keys") loadAdminKeys();
  if (activeAdminTab === "stats") loadAnalytics();
  if (activeAdminTab === "users") loadAdminUsers();
  if (activeAdminTab === "crawler") startCrawlerPolling();
  else stopCrawlerPolling();
}

async function loadAdminKeys() {
  if (!els.keysList) return;
  els.keysList.innerHTML = '<p class="stats-empty">Đang nạp dữ liệu key...</p>';
  try {
    const data = await requestJson("/api/admin/keys");
    if (els.keysTotalCount) els.keysTotalCount.textContent = `${data.totalKeys || 0} Keys`;
    if (els.keysActiveModel) els.keysActiveModel.textContent = data.activeModel || "gemini-3.6-flash";
    if (els.keysDailyQuotaText) {
      els.keysDailyQuotaText.textContent = data.dailyCapacityEstimate || `~${Math.round((data.totalKeys || 1) * 2500).toLocaleString("vi-VN")} chương/ngày`;
    }
    renderKeysList(data.keys || []);
  } catch (error) {
    els.keysList.innerHTML = `<p class="stats-empty text-error">Không tải được thông tin key: ${escapeHtml(error.message)}</p>`;
  }
}

async function runKeysPingTest() {
  if (!els.keysPingBtn || !els.keysList) return;
  const originalText = els.keysPingBtn.innerHTML;
  els.keysPingBtn.disabled = true;
  els.keysPingBtn.innerHTML = '<svg class="icon spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/></svg>Đang ping kiểm tra Keys...';
  try {
    const data = await requestJson("/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ping" })
    });
    if (els.keysTotalCount) els.keysTotalCount.textContent = `${data.totalKeys || 0} Keys`;
    if (els.keysActiveModel) els.keysActiveModel.textContent = data.activeModel || "gemini-3.6-flash";
    if (els.keysDailyQuotaText) {
      els.keysDailyQuotaText.textContent = data.dailyCapacityEstimate || `~${Math.round((data.totalKeys || 1) * 2500).toLocaleString("vi-VN")} chương/ngày`;
    }
    renderKeysList(data.keys || [], true);
    const capacityText = data.dailyCapacityEstimate ? ` [Công suất 24/7: ~${data.dailyCapacityEstimate}, ${data.safePacingEstimate}]` : "";
    setStatus(`Đã hoàn tất kiểm tra tải thực tế toàn bộ Key (${data.healthyKeys || 0}/${data.totalKeys || 0} sẵn sàng).${capacityText}`);
  } catch (error) {
    setStatus(`Lỗi khi ping keys: ${error.message}`, true);
  } finally {
    els.keysPingBtn.disabled = false;
    els.keysPingBtn.innerHTML = originalText;
  }
}

async function handleAddKeySubmit(event) {
  event.preventDefault();
  const key = String(els.newApiKeyInput?.value || "").trim();
  if (!key) return;

  if (els.addKeyBtn) {
    els.addKeyBtn.disabled = true;
    els.addKeyBtn.innerHTML = '<svg class="icon spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/></svg><span>Đang lưu...</span>';
  }

  try {
    const data = await requestJson("/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", key })
    });
    if (els.newApiKeyInput) els.newApiKeyInput.value = "";
    if (els.keysTotalCount) els.keysTotalCount.textContent = `${data.totalKeys || 0} Keys`;
    if (els.keysActiveModel) els.keysActiveModel.textContent = data.activeModel || "gemini-3.6-flash";
    renderKeysList(data.keys || []);
    setStatus("Đã thêm API Key mới thành công.");
  } catch (error) {
    setStatus(`Lỗi khi thêm key: ${error.message}`, true);
  } finally {
    if (els.addKeyBtn) {
      els.addKeyBtn.disabled = false;
      els.addKeyBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg><span>Thêm Key</span>';
    }
  }
}

async function handleDeleteKey(masked, index) {
  if (!confirm(`Bạn có chắc chắn muốn xóa API Key [${masked}] khỏi hệ thống?`)) return;
  setStatus("Đang xóa API Key...");
  try {
    const data = await requestJson("/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", masked, index })
    });
    if (els.keysTotalCount) els.keysTotalCount.textContent = `${data.totalKeys || 0} Keys`;
    if (els.keysActiveModel) els.keysActiveModel.textContent = data.activeModel || "gemini-3.6-flash";
    renderKeysList(data.keys || []);
    setStatus("Đã xóa API Key thành công.");
  } catch (error) {
    setStatus(`Lỗi khi xóa key: ${error.message}`, true);
  }
}

function renderKeysList(keys, isPingResult = false) {
  if (!els.keysList) return;
  els.keysList.innerHTML = "";
  if (!keys.length) {
    els.keysList.innerHTML = '<p class="stats-empty">Chưa có API Key nào được cấu hình.</p>';
    return;
  }

  keys.forEach((k, idx) => {
    const card = document.createElement("div");
    card.className = "key-card";
    const latencyHtml = k.latencyMs != null
      ? `<span class="ping-badge ${k.ok ? "ping-fast" : "ping-fail"}">${k.latencyMs}ms</span>`
      : '<span class="ping-badge">Chưa ping</span>';

    let statusBadge = '<span class="key-status-badge is-ready">🟢 Sẵn sàng (24/7)</span>';
    if (k.status === "tpd_limited") {
      statusBadge = `<span class="key-status-badge is-warning" title="${escapeHtml(k.error || "Hết hạn mức Quota RPD/TPD ngày")}">🟡 Hết Quota (RPD/TPD)</span>`;
    } else if (k.status === "tpm_limited" || k.status === "rate_limited") {
      statusBadge = '<span class="key-status-badge is-warning" title="Đang điều tốc">🟡 Đang chờ TPM</span>';
    } else if (k.ok === false) {
      statusBadge = `<span class="key-status-badge is-error" title="${escapeHtml(k.error || "Lỗi")}">🔴 Lỗi</span>`;
    }

    let quotaHtml = "";
    if (k.ok) {
      if (k.usageInfo) {
        quotaHtml = `
          <div class="key-quota-row">
            <span class="key-quota-pill highlight-purple" title="Hạn mức & Giới hạn API">⚡ ${escapeHtml(k.usageInfo)}</span>
          </div>
        `;
      } else if (k.remainingTokens != null) {
        quotaHtml = `
          <div class="key-quota-row">
            <span class="key-quota-pill" title="Tokens Per Minute">⚡ ${Number(k.remainingTokens).toLocaleString("vi-VN")} / ${Number(k.limitTokens || 8000).toLocaleString("vi-VN")} TPM</span>
            <span class="key-quota-pill recovery" title="Thời gian khôi phục quota">⏱ Hồi phục: ${escapeHtml(k.resetTokens || "0s")}</span>
            ${k.remainingRequests != null ? `<span class="key-quota-pill daily" title="Requests hôm nay">📅 Còn: ${k.remainingRequests}/1.000 req</span>` : ""}
          </div>
        `;
      }
    } else if (k.error) {
      let errorText = k.error;
      if (errorText.includes("User location is not supported")) {
        errorText = "Vùng IP máy chủ Cloudflare bị Google chặn địa lý (User location not supported). Cần cấu hình GEMINI_BASE_URL (Cloudflare AI Gateway / Proxy US) để kết nối.";
      }
      quotaHtml = `
        <div class="key-quota-row">
          <div class="key-error-box" title="${escapeHtml(k.error)}">
            <span class="key-error-icon">⚠️</span>
            <span class="key-error-text">${escapeHtml(errorText)}</span>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="key-card-header">
        <div class="key-card-info">
          <span class="key-card-num">Key #${idx + 1}</span>
          <strong class="key-card-masked">${k.masked || "AQ.Ab8..."}</strong>
        </div>
        <div class="key-card-header-actions">
          ${statusBadge}
          <button class="key-delete-btn" type="button" title="Xóa API Key này" aria-label="Xóa key">
            <svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
      <div class="key-card-meta">
        <span class="key-provider-tag">${k.provider || "Google Gemini"}</span>
        ${latencyHtml}
      </div>
      ${quotaHtml}
    `;

    card.querySelector(".key-delete-btn")?.addEventListener("click", () => {
      handleDeleteKey(k.masked, idx);
    });

    els.keysList.appendChild(card);
  });
}

function renderBookOptions(selectedId = "") {
  els.bookSelect.innerHTML = "";
  const newOption = document.createElement("option");
  newOption.value = "";
  newOption.textContent = "Thêm truyện mới";
  els.bookSelect.appendChild(newOption);
  [...(adminCatalog.books || [])]
    .sort((a, b) => String(a.title).localeCompare(String(b.title), "vi"))
    .forEach((book) => {
      const option = document.createElement("option");
      option.value = book.id;
      option.textContent = book.title;
      els.bookSelect.appendChild(option);
    });
  els.bookSelect.value = selectedId;
}

function selectBook() {
  const book = getSelectedBook();
  if (book) populateBookForm(book);
  else startNewBook();
}

function getSelectedBook() {
  return (adminCatalog.books || []).find((book) => book.id === els.bookSelect.value) || null;
}

function startNewBook() {
  els.uploadForm.reset();
  els.bookSelect.value = "";
  els.epub.required = true;
  els.epubLabel.innerHTML = "File EPUB <small>Tối đa 200 MB</small>";
  els.coverLabel.innerHTML = "Ảnh bìa <small>JPG, PNG hoặc WebP; tối đa 5 MB</small>";
  els.existingFiles.hidden = true;
  els.deleteBook.hidden = true;
  els.submit.textContent = "Upload truyện";
}

function populateBookForm(book) {
  els.uploadForm.reset();
  els.bookSelect.value = book.id;
  setField("title", book.title);
  setField("author", book.author);
  setField("genre", book.genre);
  setField("status", book.status || "Có sẵn");
  setField("chapterCount", book.chapterCount || "");
  setField("description", book.description);
  els.uploadForm.elements.featured.checked = Boolean(book.featured);
  els.epub.required = false;
  els.epubLabel.innerHTML = "Thay file EPUB <small>Không chọn để giữ file hiện tại</small>";
  els.coverLabel.innerHTML = "Thay ảnh bìa <small>Không chọn để giữ ảnh hiện tại</small>";
  els.existingFiles.textContent = `Đang chỉnh sửa: ${book.title}. EPUB hiện tại được giữ nguyên nếu bạn không chọn file mới.`;
  els.existingFiles.hidden = false;
  els.deleteBook.hidden = false;
  els.submit.textContent = "Lưu thay đổi";
}

function setField(name, value) {
  els.uploadForm.elements[name].value = value || "";
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  } catch (err) {
    if (typeof window !== "undefined" && window.location.protocol === "file:") {
      throw new Error("Không thể gọi API từ file://. Vui lòng mở trang web qua https://tram-chu.online hoặc dev server.");
    }
    throw new Error(`Không thể kết nối máy chủ (${err.message}). Vui lòng kiểm tra lại mạng hoặc tạm tắt tiện ích chặn quảng cáo/tracker.`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Yêu cầu thất bại (HTTP ${response.status}).`);
  return body;
}

function showAuthenticated(authenticated) {
  els.loginForm.hidden = authenticated;
  els.tabs.hidden = !authenticated;
  ADMIN_TABS.forEach(({ key, panel }) => {
    if (els[panel]) els[panel].hidden = !authenticated || activeAdminTab !== key;
  });
  if (!authenticated) requestAnimationFrame(() => els.password.focus());
}

function setBusy(busy) {
  els.loginForm.querySelectorAll("button, input").forEach((element) => { element.disabled = busy; });
  els.uploadForm.querySelectorAll("button, input, select, textarea").forEach((element) => { element.disabled = busy; });
  els.crawlerForm.querySelectorAll("button, input, select").forEach((element) => { element.disabled = busy; });
}

function setStatus(message, error = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", error);
}

function setProgress(value) {
  els.progress.hidden = value <= 0;
  els.progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

// Two steps and no bytes through a serverless function: ask the server for a
// short-lived PUT URL, then send the file straight to R2. XHR rather than fetch
// because fetch still has no upload progress.
async function uploadToR2(file, kind, signal, onProgress) {
  const presign = await requestJson("/api/admin/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      size: file.size,
      contentType: kind === "epub" ? "application/epub+zip" : file.type
    })
  });

  await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", presign.uploadUrl, true);
    request.setRequestHeader(
      "Content-Type",
      kind === "epub" ? "application/epub+zip" : file.type || "application/octet-stream"
    );
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    });
    request.addEventListener("load", () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`R2 trả về ${request.status}.`))
    );
    request.addEventListener("error", () => reject(new Error("Mất kết nối khi upload.")));
    request.addEventListener("abort", () => reject(new Error("Upload đã bị huỷ.")));
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(file);
  });

  return presign.key;
}

// ------------------------------------------------------------- USERS CONTROLLER

async function loadAdminUsers() {
  if (!els.usersTbody) return;
  if (els.usersLoading) els.usersLoading.hidden = false;
  if (els.usersEmpty) els.usersEmpty.hidden = true;
  els.usersTbody.innerHTML = "";

  try {
    const data = await requestJson("/api/admin/users");
    adminUsersData = data.users || [];
    if (els.statTotalUsers) els.statTotalUsers.textContent = String(data.totalUsers || 0);
    if (els.statActive7Days) els.statActive7Days.textContent = String(data.active7Days || 0);
    if (els.statTotalReadChapters) els.statTotalReadChapters.textContent = Number(data.totalChaptersRead || 0).toLocaleString("vi-VN");
    if (els.statTotalUserExp) els.statTotalUserExp.textContent = `${Number(data.totalExp || 0).toLocaleString("vi-VN")} EXP`;
    
    renderAdminUsers(adminUsersData);
  } catch (error) {
    els.usersTbody.innerHTML = `<tr><td colspan="6" class="users-error-row">Lỗi tải dữ liệu người dùng: ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    if (els.usersLoading) els.usersLoading.hidden = true;
  }
}

function filterAdminUsers() {
  const query = String(els.usersSearch?.value || "").toLowerCase().trim();
  const school = els.usersSchoolFilter?.value || "all";

  const filtered = adminUsersData.filter((user) => {
    const matchSchool = school === "all" || user.school === school;
    if (!matchSchool) return false;
    if (!query) return true;

    const name = String(user.displayName || "").toLowerCase();
    const fullName = String(user.fullName || "").toLowerCase();
    const email = String(user.email || "").toLowerCase();
    const id = String(user.id || "").toLowerCase();

    return name.includes(query) || fullName.includes(query) || email.includes(query) || id.includes(query);
  });

  renderAdminUsers(filtered);
}

function renderAdminUsers(users) {
  if (!els.usersTbody) return;
  if (!users || !users.length) {
    els.usersTbody.innerHTML = "";
    if (els.usersEmpty) els.usersEmpty.hidden = false;
    return;
  }
  if (els.usersEmpty) els.usersEmpty.hidden = true;

  const schoolIcons = {
    cultivation: "🔮 Tu Tiên",
    scholarly: "📜 Khoa Bảng",
    modern: "⚡ Hiện Đại"
  };

  els.usersTbody.innerHTML = users.map((user) => {
    const initial = (user.displayName || user.email || "?").charAt(0).toUpperCase();
    const avatarHtml = user.avatarUrl
      ? `<img class="user-avatar-img" src="${escapeHtml(user.avatarUrl)}" alt="" loading="lazy">`
      : `<span class="user-avatar-initial">${escapeHtml(initial)}</span>`;

    const schoolLabel = schoolIcons[user.school] || "🔮 Tu Tiên";
    const lastActiveFormatted = user.lastActiveAt ? formatRelativeTime(user.lastActiveAt) : "Chưa rõ";
    const joinedFormatted = user.createdAt ? new Date(user.createdAt).toLocaleDateString("vi-VN") : "—";
    const googleBadge = !user.isGuest
      ? `<span class="user-auth-badge google" title="Đã liên kết tài khoản Google">✓ Google Auth</span>`
      : `<span class="user-auth-badge guest" title="Chưa liên kết tài khoản">Ẩn danh</span>`;

    return `
      <tr class="user-table-row">
        <td>
          <div class="user-info-cell">
            ${avatarHtml}
            <div class="user-name-group">
              <strong class="user-display-name">${escapeHtml(user.displayName)}</strong>
              <small class="user-email-text">${escapeHtml(user.email)} ${googleBadge}</small>
              <span class="user-id-text">${escapeHtml(user.id.slice(0, 13))}...</span>
            </div>
          </div>
        </td>
        <td>
          <div class="user-rank-cell">
            <span class="reader-rank-badge ${escapeHtml(user.badgeClass)}">[${escapeHtml(user.levelTitle)}]</span>
            <small class="user-school-tag">${schoolLabel}</small>
          </div>
        </td>
        <td>
          <strong class="user-exp-val">${Number(user.exp || 0).toLocaleString("vi-VN")}</strong>
          <small class="user-exp-unit">EXP</small>
        </td>
        <td>
          <strong class="user-chapters-val">${Number(user.chaptersRead || 0).toLocaleString("vi-VN")}</strong>
          <small class="user-exp-unit">chương</small>
        </td>
        <td>
          <span class="user-bookmarks-tag">📚 ${user.bookmarkCount || 0} bộ</span>
        </td>
        <td>
          <div class="user-time-cell">
            <span class="user-last-active">${escapeHtml(lastActiveFormatted)}</span>
            <small class="user-joined-date">Gia nhập: ${escapeHtml(joinedFormatted)}</small>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function formatRelativeTime(isoString) {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 60000) return "Vừa xong";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    return new Date(isoString).toLocaleDateString("vi-VN");
  } catch {
    return isoString;
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ------------------------------------------------------------- EPUB VIP STUDIO CONTROLLER

let studioState = {
  db: null,
  currentBook: null,
  activeChapterIndex: 0,
  viewMode: "translated",
  isTranslating: false,
  isInitializing: false,
  requestController: null,
  searchTerm: "",
  filterUntranslated: false,
  pageRange: "all"
};

const DB_NAME = "tramchu_admin_epub_db";
const DB_VERSION = 1;

async function openStudioDb() {
  if (studioState.db) return studioState.db;
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return resolve(null);
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("books")) {
        db.createObjectStore("books", { keyPath: "bookId" });
      }
      if (!db.objectStoreNames.contains("chapters")) {
        const chapterStore = db.createObjectStore("chapters", { keyPath: ["bookId", "chapterIndex"] });
        chapterStore.createIndex("bookId", "bookId", { unique: false });
      }
    };
    request.onsuccess = (event) => {
      studioState.db = event.target.result;
      resolve(studioState.db);
    };
    request.onerror = () => {
      console.warn("IndexedDB open error:", request.error);
      resolve(null);
    };
  });
}

async function saveStudioBookToDb(book) {
  const db = await openStudioDb();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["books", "chapters"], "readwrite");
    const bookStore = tx.objectStore("books");
    const chapterStore = tx.objectStore("chapters");

    bookStore.put({
      bookId: book.bookId,
      title: book.title,
      fileName: book.fileName,
      chapterCount: book.chapters.length,
      totalWords: book.totalWords,
      updatedAt: Date.now()
    });

    book.chapters.forEach((ch, idx) => {
      chapterStore.put({
        bookId: book.bookId,
        chapterIndex: idx,
        title: ch.title,
        originalText: ch.originalText,
        words: ch.words,
        translatedText: ch.translatedText || "",
        translatedAt: ch.translatedAt || null,
        model: ch.model || ""
      });
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function saveStudioTranslationToDb(bookId, chapterIndex, translatedText, model) {
  const db = await openStudioDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(["chapters", "books"], "readwrite");
    const chapterStore = tx.objectStore("chapters");
    const getReq = chapterStore.get([bookId, chapterIndex]);
    getReq.onsuccess = () => {
      const record = getReq.result || {};
      record.bookId = bookId;
      record.chapterIndex = chapterIndex;
      record.translatedText = translatedText;
      record.translatedAt = Date.now();
      record.model = model;
      chapterStore.put(record);
    };
    const bookStore = tx.objectStore("books");
    const bookReq = bookStore.get(bookId);
    bookReq.onsuccess = () => {
      if (bookReq.result) {
        bookReq.result.updatedAt = Date.now();
        bookStore.put(bookReq.result);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function loadLatestStudioBookFromDb() {
  const db = await openStudioDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(["books", "chapters"], "readonly");
    const bookStore = tx.objectStore("books");
    const getAllReq = bookStore.getAll();
    getAllReq.onsuccess = () => {
      const books = getAllReq.result || [];
      if (!books.length) return resolve(null);
      books.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const latest = books[0];

      const chapterStore = tx.objectStore("chapters");
      const index = chapterStore.index("bookId");
      const chReq = index.getAll(latest.bookId);
      chReq.onsuccess = () => {
        const chapters = chReq.result || [];
        chapters.sort((a, b) => a.chapterIndex - b.chapterIndex);
        latest.chapters = chapters;
        resolve(latest);
      };
      chReq.onerror = () => resolve(null);
    };
    getAllReq.onerror = () => resolve(null);
  });
}

async function loadStudioBookFromDb(bookId) {
  const db = await openStudioDb();
  if (!db || !bookId) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(["books", "chapters"], "readonly");
    const bookReq = tx.objectStore("books").get(bookId);
    bookReq.onsuccess = () => {
      if (!bookReq.result) return resolve(null);
      const chapterReq = tx.objectStore("chapters").index("bookId").getAll(bookId);
      chapterReq.onsuccess = () => resolve({
        ...bookReq.result,
        chapters: (chapterReq.result || []).sort((a, b) => a.chapterIndex - b.chapterIndex)
      });
      chapterReq.onerror = () => resolve(null);
    };
    bookReq.onerror = () => resolve(null);
  });
}

async function deleteStudioBookFromDb(bookId) {
  const db = await openStudioDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(["books", "chapters"], "readwrite");
    tx.objectStore("books").delete(bookId);
    const chapterStore = tx.objectStore("chapters");
    const index = chapterStore.index("bookId");
    const req = index.openCursor(IDBKeyRange.only(bookId));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

function initEpubStudio() {
  const savedModel = normalizeStudioModel(localStorage.getItem("tangthu_gemini_model"));
  localStorage.setItem("tangthu_gemini_model", savedModel);
  localStorage.removeItem("tangthu_gemini_api_key");
  if (els.studioGeminiModel) els.studioGeminiModel.value = savedModel;

  if (!studioState.currentBook && !studioState.isInitializing) {
    studioState.isInitializing = true;
    setStudioNotice("Đang khôi phục EPUB và các bản dịch đã lưu trên thiết bị...");
    loadLatestStudioBookFromDb().then((book) => {
      if (book && book.chapters && book.chapters.length) {
        studioState.currentBook = book;
        renderStudioBookLoaded();
        setStudioNotice(`Đã khôi phục “${book.title}” cùng ${book.chapters.filter((chapter) => chapter.translatedText).length} chương đã dịch.`, "success");
      } else {
        renderStudioBookLoaded();
        setStudioNotice("");
      }
    }).catch((error) => {
      setStudioNotice(`Không khôi phục được dữ liệu cục bộ: ${error.message}`, "error");
    }).finally(() => {
      studioState.isInitializing = false;
    });
  }
}

let studioNoticeTimer = null;
function setStudioNotice(message, type = "") {
  if (!els.studioNotice) return;
  if (studioNoticeTimer) {
    clearTimeout(studioNoticeTimer);
    studioNoticeTimer = null;
  }
  els.studioNotice.hidden = !message;
  els.studioNotice.textContent = message || "";
  els.studioNotice.className = `studio-notice${type ? ` is-${type}` : ""}`;
  if (message && type === "success") {
    studioNoticeTimer = setTimeout(() => {
      els.studioNotice.hidden = true;
      els.studioNotice.textContent = "";
      studioNoticeTimer = null;
    }, 4500);
  }
}

let jszipModulePromise = null;
async function getJsZipModule() {
  if (typeof window !== "undefined" && window.JSZip) return window.JSZip;
  if (!jszipModulePromise) {
    jszipModulePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/jszip.min.js";
      script.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error("Không tìm thấy JSZip.")));
      script.onerror = () => reject(new Error("Không tải được thư viện JSZip."));
      document.head.appendChild(script);
    });
  }
  return jszipModulePromise;
}

async function handleStudioEpubFile(file) {
  if (!file) return;
  if (!/\.epub$/i.test(file.name)) {
    alert("Vui lòng chọn đúng tệp có đuôi định dạng .epub");
    return;
  }
  if (file.size > 200 * 1024 * 1024) {
    alert("Tệp EPUB vượt quá giới hạn 200 MB.");
    return;
  }

  setStudioNotice(`Đang giải mã EPUB “${file.name}”...`);
  if (els.studioSelectFileBtn) els.studioSelectFileBtn.disabled = true;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const parsed = await parseStudioEpub(arrayBuffer, file.name);
    if (!parsed.chapters.length) throw new Error("Không tìm thấy chương văn bản nào trong tệp EPUB này.");

    const bookId = await createStudioBookId(file, arrayBuffer);
    const storedBook = await loadStudioBookFromDb(bookId);
    parsed.chapters = mergeStoredStudioTranslations(parsed.chapters, storedBook?.chapters);
    const totalWords = parsed.chapters.reduce((sum, ch) => sum + (ch.words || 0), 0);

    const book = {
      bookId,
      title: parsed.title,
      fileName: file.name,
      totalWords,
      chapters: parsed.chapters
    };

    studioState.currentBook = book;
    studioState.activeChapterIndex = 0;
    await saveStudioBookToDb(book);
    renderStudioBookLoaded();
    const restored = book.chapters.filter((chapter) => chapter.translatedText).length;
    setStudioNotice(
      `Đã mở “${book.title}”: ${book.chapters.length.toLocaleString("vi-VN")} chương${restored ? `, khôi phục ${restored} bản dịch` : ""}.`,
      "success"
    );
  } catch (error) {
    alert(`Lỗi đọc file EPUB: ${error.message}`);
    setStudioNotice(`Lỗi đọc EPUB: ${error.message}`, "error");
  } finally {
    if (els.studioSelectFileBtn) els.studioSelectFileBtn.disabled = false;
    if (els.studioEpubFileInput) els.studioEpubFileInput.value = "";
  }
}

async function createStudioBookId(file, arrayBuffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `epub_${hash.slice(0, 24)}`;
  }
  return `epub_${file.name}_${file.size}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 100);
}

async function parseStudioEpub(arrayBuffer, fileName) {
  const JSZipModule = await getJsZipModule();
  const zip = await JSZipModule.loadAsync(arrayBuffer);

  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("Cấu trúc EPUB không hợp lệ (thiếu META-INF/container.xml).");

  const domParser = new DOMParser();
  const containerXml = domParser.parseFromString(await containerFile.async("text"), "application/xml");
  const opfPath = containerXml.querySelector("rootfile")?.getAttribute("full-path");
  if (!opfPath) throw new Error("Không tìm thấy tệp OPF package trong EPUB.");

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error("Không mở được tệp OPF package.");

  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfXml = domParser.parseFromString(await opfFile.async("text"), "application/xml");
  const title = (opfXml.querySelector("title")?.textContent || "").trim() || fileName.replace(/\.epub$/i, "");

  const manifest = new Map();
  for (const item of opfXml.querySelectorAll("manifest item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifest.set(id, {
      href: normalizePathHelper(opfDir + href),
      mediaType: item.getAttribute("media-type") || ""
    });
  }

  const spineItems = Array.from(opfXml.querySelectorAll("spine itemref"))
    .map((item) => manifest.get(item.getAttribute("idref")))
    .filter(Boolean);

  const documentItems = spineItems.filter((item) => {
    return (
      zip.file(item.href) &&
      (item.mediaType === "application/xhtml+xml" ||
        item.mediaType === "text/html" ||
        /\.(x?html?|xml)$/i.test(item.href))
    );
  });

  const chapters = [];
  for (let i = 0; i < documentItems.length; i++) {
    const item = documentItems[i];
    const html = await zip.file(item.href).async("text");
    const doc = domParser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, nav, header, footer, aside").forEach((n) => n.remove());

    const text = extractStudioDocumentText(doc);
    if (!text || text.length < 5) continue;

    const chapterHeading = (doc.querySelector("h1, h2, h3, title")?.textContent || "").replace(/\s+/g, " ").trim();
    const chapterTitle = chapterHeading || `Chương ${chapters.length + 1}`;

    const words = countStudioTextUnits(text);
    chapters.push({
      chapterIndex: chapters.length,
      title: chapterTitle,
      originalText: text,
      words,
      translatedText: "",
      translatedAt: null,
      model: ""
    });
  }

  return { title, chapters };
}

function normalizePathHelper(path) {
  const parts = path.split("/");
  const stack = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

async function pingStudioGeminiKey() {
  const model = normalizeStudioModel(els.studioGeminiModel?.value || DEFAULT_STUDIO_MODEL);
  if (els.studioPingKeyBtn) els.studioPingKeyBtn.disabled = true;
  if (els.studioKeyStatus) {
    els.studioKeyStatus.hidden = false;
    els.studioKeyStatus.className = "epub-studio-key-status";
    els.studioKeyStatus.textContent = "⏳ Đang kiểm tra kết nối tới Gemini API...";
  }

  const startTime = Date.now();
  try {
    const proxyRes = await requestJson("/api/admin/gemini-translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, content: "Ping test", title: "Test" })
    });
    const ok = Boolean(proxyRes.ok);

    const latency = Date.now() - startTime;
    localStorage.setItem("tangthu_gemini_model", model);

    if (els.studioKeyStatus) {
      els.studioKeyStatus.className = "epub-studio-key-status is-valid";
      els.studioKeyStatus.textContent = `🟢 Cụm VIP hoạt động tốt (${latency}ms) · Model: ${model}`;
    }
  } catch (error) {
    if (els.studioKeyStatus) {
      els.studioKeyStatus.className = "epub-studio-key-status is-invalid";
      els.studioKeyStatus.textContent = `🔴 Lỗi cụm VIP: ${error.message}`;
    }
  } finally {
    if (els.studioPingKeyBtn) els.studioPingKeyBtn.disabled = false;
  }
}

async function translateCurrentStudioChapter() {
  const book = studioState.currentBook;
  if (!book || !book.chapters || !book.chapters.length) return;
  const chapterIndex = studioState.activeChapterIndex;
  const chapter = book.chapters[chapterIndex];
  if (!chapter) return;

  if (studioState.isTranslating) return;

  const model = normalizeStudioModel(els.studioGeminiModel?.value || DEFAULT_STUDIO_MODEL);
  localStorage.setItem("tangthu_gemini_model", model);

  studioState.isTranslating = true;
  studioState.requestController = new AbortController();
  setStudioTranslatingUI(true, chapter.title);

  try {
    const chunks = splitStudioText(chapter.originalText, 10000);
    if (!chunks.length) throw new Error("Chương hiện tại không có nội dung để dịch.");
    const translatedChunks = [];
    let usedModel = model;
    for (let index = 0; index < chunks.length; index += 1) {
      setStudioTranslatingUI(true, chapter.title, index + 1, chunks.length);
      const timeout = setTimeout(() => studioState.requestController?.abort(), 120000);
      let result;
      try {
        result = await requestStudioGeminiPart({
          model,
          bookTitle: book.title,
          chapterTitle: chapter.title,
          content: chunks[index],
          part: index + 1,
          totalParts: chunks.length,
          signal: studioState.requestController.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      translatedChunks.push(result.translation);
      usedModel = result.model;
    }
    const translatedText = translatedChunks.join("\n\n").trim();

    chapter.translatedText = translatedText;
    chapter.translatedAt = Date.now();
    chapter.model = usedModel;

    await saveStudioTranslationToDb(book.bookId, chapterIndex, translatedText, usedModel);

    if (studioState.activeChapterIndex === chapterIndex) renderStudioChapterContent();
    renderStudioChapterList();
    renderStudioProgress();
    setStudioNotice(`Đã dịch và lưu chương ${chapterIndex + 1} bằng ${usedModel}.`, "success");
  } catch (error) {
    const message = error.name === "AbortError" ? "Yêu cầu dịch đã bị huỷ hoặc quá thời gian." : error.message;
    alert(`Không thể dịch chương: ${message}`);
    setStudioNotice(`Lỗi dịch chương ${chapterIndex + 1}: ${message}`, "error");
  } finally {
    studioState.isTranslating = false;
    studioState.requestController = null;
    setStudioTranslatingUI(false);
    renderStudioChapterContent();
  }
}

async function requestStudioGeminiPart({ model, chapterTitle, content, part, totalParts, signal }) {
  const proxy = await requestJson("/api/admin/gemini-translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model,
      content,
      title: `${chapterTitle}${totalParts > 1 ? ` (phần ${part}/${totalParts})` : ""}`
    })
  });
  const assessment = assessStudioTranslation(content, proxy.translation, proxy.finishReason);
  if (!assessment.ok) throw new Error(assessment.reason);
  return { translation: assessment.output, model: proxy.model || model };
}

function selectStudioChapter(index) {
  if (studioState.isTranslating) return;
  if (!studioState.currentBook || !studioState.currentBook.chapters) return;
  if (index < 0 || index >= studioState.currentBook.chapters.length) return;
  studioState.activeChapterIndex = index;
  renderStudioChapterContent();
  updateStudioActiveListItem();

  const activeEl = els.studioChapterList?.querySelector(`.studio-chapter-item[data-index="${index}"]`);
  if (activeEl) activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });

  const ch = studioState.currentBook.chapters[index];
  if (els.studioAutoTranslateNext?.checked && ch && !ch.translatedText && !studioState.isTranslating) {
    translateCurrentStudioChapter();
  }
}

function setStudioViewMode(mode) {
  studioState.viewMode = mode;
  els.studioViewTranslated?.classList.toggle("active", mode === "translated");
  els.studioViewTranslated?.setAttribute("aria-selected", String(mode === "translated"));
  els.studioViewOriginal?.classList.toggle("active", mode === "original");
  els.studioViewOriginal?.setAttribute("aria-selected", String(mode === "original"));
  els.studioViewSplit?.classList.toggle("active", mode === "split");
  els.studioViewSplit?.setAttribute("aria-selected", String(mode === "split"));

  if (mode === "split") {
    els.studioReaderContent?.classList.add("is-split-view");
    if (els.studioPaperTranslated) els.studioPaperTranslated.hidden = false;
    if (els.studioPaperOriginal) els.studioPaperOriginal.hidden = false;
  } else if (mode === "original") {
    els.studioReaderContent?.classList.remove("is-split-view");
    if (els.studioPaperTranslated) els.studioPaperTranslated.hidden = true;
    if (els.studioPaperOriginal) els.studioPaperOriginal.hidden = false;
  } else {
    els.studioReaderContent?.classList.remove("is-split-view");
    if (els.studioPaperTranslated) els.studioPaperTranslated.hidden = false;
    if (els.studioPaperOriginal) els.studioPaperOriginal.hidden = true;
  }
}

function renderStudioChapterContent() {
  const book = studioState.currentBook;
  if (!book || !book.chapters || !book.chapters.length) return;
  const idx = studioState.activeChapterIndex;
  const ch = book.chapters[idx];
  if (!ch) return;

  if (els.studioChapterIndicator) {
    els.studioChapterIndicator.textContent = `Chương ${idx + 1} / ${book.chapters.length}`;
  }
  if (els.studioPrevChBtn) els.studioPrevChBtn.disabled = idx === 0;
  if (els.studioNextChBtn) els.studioNextChBtn.disabled = idx >= book.chapters.length - 1;

  if (els.studioCurrentTitleDisplay) els.studioCurrentTitleDisplay.textContent = ch.title;
  if (els.studioOriginalTitleDisplay) els.studioOriginalTitleDisplay.textContent = `[Gốc] ${ch.title}`;
  if (els.studioCurrentMetaDisplay) {
    els.studioCurrentMetaDisplay.textContent = `${(ch.words || 0).toLocaleString("vi-VN")} chữ`;
  }

  if (els.studioOriginalBody) {
    const rawParagraphs = (ch.originalText || "").split(/\n\n+/).filter(Boolean);
    els.studioOriginalBody.innerHTML = rawParagraphs
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("");
  }

  if (els.studioTranslatedBody) {
    if (ch.translatedText) {
      if (els.studioTranslationTimestamp) {
        els.studioTranslationTimestamp.hidden = false;
        els.studioTranslationTimestamp.textContent = `✓ Đã dịch (${ch.model || "Gemini"})`;
      }
      const transParagraphs = ch.translatedText.split(/\n\n+/).filter(Boolean);
      els.studioTranslatedBody.innerHTML = transParagraphs
        .map((p) => `<p>${escapeHtml(p)}</p>`)
        .join("");
      if (els.studioTranslateCurrentBtn) {
        els.studioTranslateCurrentBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg><span>Dịch lại chương này</span>';
      }
    } else {
      if (els.studioTranslationTimestamp) els.studioTranslationTimestamp.hidden = true;
      els.studioTranslatedBody.innerHTML = `
        <div class="studio-untranslated-prompt">
          <div class="untranslated-icon">📖</div>
          <h4>Chương này chưa được dịch</h4>
          <p>Nhấp vào nút bên dưới hoặc nhấn phím <kbd>T</kbd> để dịch tức thời chương này bằng Gemini API</p>
          <button id="studioPromptTranslateBtn" class="primary-action studio-translate-btn" type="button">
            <svg class="icon" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            <span>Dịch chương này ngay</span>
          </button>
        </div>
      `;
      els.studioTranslatedBody.querySelector("#studioPromptTranslateBtn")?.addEventListener("click", translateCurrentStudioChapter);
      if (els.studioTranslateCurrentBtn) {
        els.studioTranslateCurrentBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg><span>⚡ Dịch chương này với Gemini</span>';
      }
    }
  }

  setStudioViewMode(studioState.viewMode);
}

function renderStudioBookLoaded() {
  const book = studioState.currentBook;
  if (!book) {
    if (els.studioUploadZone) els.studioUploadZone.hidden = false;
    if (els.studioWorkspace) els.studioWorkspace.hidden = true;
    if (els.studioExportBtn) els.studioExportBtn.hidden = true;
    if (els.studioChangeFileBtn) els.studioChangeFileBtn.hidden = true;
    if (els.studioClearCacheBtn) els.studioClearCacheBtn.hidden = true;
    if (els.studioHeaderBookMeta) els.studioHeaderBookMeta.textContent = "Tải file EPUB & Dịch tức thời từng chương bằng Gemini AI";
    return;
  }

  if (els.studioUploadZone) els.studioUploadZone.hidden = true;
  if (els.studioWorkspace) els.studioWorkspace.hidden = false;
  if (els.studioExportBtn) els.studioExportBtn.hidden = false;
  if (els.studioChangeFileBtn) els.studioChangeFileBtn.hidden = false;
  if (els.studioClearCacheBtn) els.studioClearCacheBtn.hidden = false;

  if (els.studioBookTitle) els.studioBookTitle.textContent = book.title;
  if (els.studioHeaderBookMeta) {
    els.studioHeaderBookMeta.textContent = `${book.title} · ${book.chapters.length.toLocaleString("vi-VN")} chương`;
  }
  if (els.studioBookStats) {
    els.studioBookStats.textContent = `${book.chapters.length.toLocaleString("vi-VN")} chương · ${(book.totalWords || 0).toLocaleString("vi-VN")} chữ (${book.fileName || "EPUB"})`;
  }

  buildStudioPageRanges(book.chapters.length);
  renderStudioProgress();
  renderStudioChapterList();
  selectStudioChapter(studioState.activeChapterIndex || 0);
}

function buildStudioPageRanges(total) {
  if (!els.studioPageRange) return;
  els.studioPageRange.innerHTML = '<option value="all">Tất cả chương</option>';
  if (total > 100) {
    const chunkSize = 100;
    const count = Math.ceil(total / chunkSize);
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize + 1;
      const end = Math.min((i + 1) * chunkSize, total);
      const opt = document.createElement("option");
      opt.value = `${start}-${end}`;
      opt.textContent = `Chương ${start} – ${end}`;
      els.studioPageRange.appendChild(opt);
    }
  }
}

function renderStudioProgress() {
  const book = studioState.currentBook;
  if (!book || !book.chapters) return;
  const total = book.chapters.length;
  const done = book.chapters.filter((c) => Boolean(c.translatedText)).length;
  const percent = total > 0 ? Math.round((done / total) * 1000) / 10 : 0;

  if (els.studioProgressText) {
    els.studioProgressText.textContent = `Đã dịch: ${done.toLocaleString("vi-VN")}/${total.toLocaleString("vi-VN")} (${percent}%)`;
  }
  if (els.studioMiniProgressFill) {
    els.studioMiniProgressFill.style.width = `${percent}%`;
  }
}

function renderStudioChapterList() {
  const book = studioState.currentBook;
  if (!els.studioChapterList || !book || !book.chapters) return;

  const query = (studioState.searchTerm || "").toLowerCase().trim();
  const filterUntranslated = Boolean(studioState.filterUntranslated);
  const range = studioState.pageRange || "all";

  let rangeStart = 1;
  let rangeEnd = book.chapters.length;
  if (range !== "all" && range.includes("-")) {
    const parts = range.split("-").map(Number);
    if (parts[0] && parts[1]) {
      rangeStart = parts[0];
      rangeEnd = parts[1];
    }
  }

  const fragment = document.createDocumentFragment();

  book.chapters.forEach((ch, idx) => {
    const chNum = idx + 1;
    if (chNum < rangeStart || chNum > rangeEnd) return;

    const isTranslated = Boolean(ch.translatedText);
    if (filterUntranslated && isTranslated) return;

    if (query && !ch.title.toLowerCase().includes(query) && !String(chNum).includes(query)) {
      return;
    }

    const item = document.createElement("button");
    item.type = "button";
    item.className = "studio-chapter-item";
    item.dataset.index = String(idx);
    if (idx === studioState.activeChapterIndex) item.classList.add("active");

    const info = document.createElement("div");
    info.className = "studio-ch-item-info";
    const titleSpan = document.createElement("span");
    titleSpan.className = "studio-ch-item-title";
    titleSpan.textContent = ch.title;
    const wordsSpan = document.createElement("small");
    wordsSpan.className = "studio-ch-item-words";
    wordsSpan.textContent = `${(ch.words || 0).toLocaleString("vi-VN")} chữ`;
    info.appendChild(titleSpan);
    info.appendChild(wordsSpan);

    const pill = document.createElement("span");
    pill.className = `studio-ch-status-pill ${isTranslated ? "is-translated" : "is-untranslated"}`;
    pill.textContent = isTranslated ? "✓ Đã dịch" : "Chưa dịch";

    item.appendChild(info);
    item.appendChild(pill);

    item.addEventListener("click", () => selectStudioChapter(idx));
    fragment.appendChild(item);
  });

  els.studioChapterList.replaceChildren(fragment);
}

function updateStudioActiveListItem() {
  if (!els.studioChapterList) return;
  els.studioChapterList.querySelectorAll(".studio-chapter-item").forEach((el) => {
    const idx = Number(el.dataset.index);
    el.classList.toggle("active", idx === studioState.activeChapterIndex);
  });
}

function setStudioTranslatingUI(isTranslating, chapterTitle = "", part = 1, totalParts = 1) {
  if (els.studioTransStateBanner) {
    els.studioTransStateBanner.hidden = !isTranslating;
  }
  if (els.studioTransTitle && isTranslating) {
    els.studioTransTitle.textContent = `Đang dịch "${chapterTitle || "Chương"}" với Gemini...`;
  }
  if (els.studioTransDesc && isTranslating) {
    els.studioTransDesc.textContent = totalParts > 1
      ? `Đang chuyển ngữ phần ${part}/${totalParts}; bản dịch chỉ được lưu khi toàn chương hoàn tất.`
      : "Đang chuyển ngữ và kiểm tra độ đầy đủ của bản dịch...";
  }
  if (els.studioTranslateCurrentBtn) {
    els.studioTranslateCurrentBtn.disabled = isTranslating;
    if (isTranslating) {
      els.studioTranslateCurrentBtn.innerHTML = '<svg class="icon spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/></svg><span>Đang dịch...</span>';
    }
  }
  if (els.studioPrevChBtn) els.studioPrevChBtn.disabled = isTranslating || studioState.activeChapterIndex === 0;
  if (els.studioNextChBtn) {
    els.studioNextChBtn.disabled = isTranslating || !studioState.currentBook || studioState.activeChapterIndex >= studioState.currentBook.chapters.length - 1;
  }
  if (els.studioChangeFileBtn) els.studioChangeFileBtn.disabled = isTranslating;
}

function exportStudioTranslations() {
  const book = studioState.currentBook;
  if (!book || !book.chapters) return;
  const translatedChapters = book.chapters.filter((c) => Boolean(c.translatedText));
  if (!translatedChapters.length) {
    alert("Chưa có chương nào được dịch trong bộ truyện này.");
    return;
  }

  const lines = [
    `=== BỘ TRUYỆN: ${book.title} ===`,
    `TỔNG SỐ CHƯƠNG ĐÃ DỊCH: ${translatedChapters.length} / ${book.chapters.length}`,
    `XUẤT BẢN NGÀY: ${new Date().toLocaleString("vi-VN")}`,
    `DỊCH THUẬT: VIP EPUB STUDIO (GEMINI API)`,
    "=========================================\n\n"
  ];

  translatedChapters.forEach((ch) => {
    lines.push(`\n\n=========================================`);
    lines.push(`Chương ${ch.chapterIndex + 1}: ${ch.title}`);
    lines.push(`=========================================\n`);
    lines.push(ch.translatedText);
  });

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${book.title.replace(/[\/\\?%*:|"<>]/g, "_")}_BanDich_Gemini.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function clearStudioCache() {
  const book = studioState.currentBook;
  if (!book) return;
  if (!confirm(`Bạn có chắc muốn xoá toàn bộ bản dịch đã lưu của truyện "${book.title}" khỏi bộ nhớ cục bộ?`)) return;
  await deleteStudioBookFromDb(book.bookId);
  studioState.currentBook = null;
  studioState.activeChapterIndex = 0;
  renderStudioBookLoaded();
  setStudioNotice("Đã xoá EPUB và các bản dịch cục bộ của truyện.", "success");
}
