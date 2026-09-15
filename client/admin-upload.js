
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
  uploadDialog: document.getElementById("adminUploadDialog"),
  uploadClose: document.getElementById("adminUploadClose"),
  uploadCancel: document.getElementById("adminUploadCancel"),
  tabs: document.getElementById("adminTabs"),
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
  crawlerAlert: document.getElementById("crawlerAlert"),
  crawlerRecent: document.getElementById("crawlerRecent"),
  crawlerRecentList: document.getElementById("crawlerRecentList"),
  crawlerErrors: document.getElementById("crawlerErrors"),
  crawlerErrorsList: document.getElementById("crawlerErrorsList"),
  crawlerWorkerWarning: document.getElementById("crawlerWorkerWarning"),
  crawlerRefresh: document.getElementById("crawlerRefresh"),
  crawlerSearchQuery: document.getElementById("crawlerSearchQuery"),
  crawlerSearchBtn: document.getElementById("crawlerSearchBtn"),
  crawlerSearchResults: document.getElementById("crawlerSearchResults"),
  audioTab: document.getElementById("adminAudioTab"),
  audioPanel: document.getElementById("adminAudioPanel"),
  audioForm: document.getElementById("adminAudioForm"),
  audioBook: document.getElementById("adminAudioBook"),
  audioCreate: document.getElementById("adminAudioCreate"),
  audioSubmitText: document.getElementById("adminAudioSubmitText"),
  audioBookStatusBanner: document.getElementById("audioBookStatusBanner"),
  audioBookProgressBadge: document.getElementById("audioBookProgressBadge"),
  audioBookProgressBar: document.getElementById("audioBookProgressBar"),
  audioBookStatusNote: document.getElementById("audioBookStatusNote"),
  audioForce: document.getElementById("adminAudioForce"),
  audioStartChapter: document.getElementById("adminAudioStartChapter"),
  audioRefresh: document.getElementById("adminAudioRefresh"),
  audioJobs: document.getElementById("adminAudioJobs"),
  audioActiveJobsCount: document.getElementById("audioActiveJobsCount"),
  audioJobsBadge: document.getElementById("audioJobsBadge"),
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
  adminQaConsole: document.getElementById("adminQaConsole"),
  adminQaSummaryBadge: document.getElementById("adminQaSummaryBadge"),
  adminQaRefreshBtn: document.getElementById("adminQaRefreshBtn"),
  adminQaReportsList: document.getElementById("adminQaReportsList"),
  adminQaFailedList: document.getElementById("adminQaFailedList"),
  adminQaGlossaryList: document.getElementById("adminQaGlossaryList"),
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
  communityTab: document.getElementById("adminCommunityTab"),
  communityPanel: document.getElementById("adminCommunityPanel"),
  communityRefresh: document.getElementById("adminCommunityRefresh"),

  // Video Review Generator elements
  videoTab: document.getElementById("adminVideoTab"),
  videoPanel: document.getElementById("adminVideoPanel"),
  videoForm: document.getElementById("adminVideoForm"),
  videoBookSelect: document.getElementById("videoBookSelect"),
  videoStartChapter: document.getElementById("videoStartChapter"),
  videoEndChapter: document.getElementById("videoEndChapter"),
  videoMode: document.getElementById("videoMode"),
  videoTone: document.getElementById("videoTone"),
  videoVoice: document.getElementById("videoVoice"),
  videoAspectRatio: document.getElementById("videoAspectRatio"),
  videoAiVisuals: document.getElementById("videoAiVisuals"),
  videoAutoApprove: document.getElementById("videoAutoApprove"),
  videoAutoUploadYt: document.getElementById("videoAutoUploadYt"),
  videoSubmitBtn: document.getElementById("videoSubmitBtn"),
  videoDailyBudgetBadge: document.getElementById("videoDailyBudgetBadge"),
  videoYouTubeBadge: document.getElementById("videoYouTubeBadge"),
  videoConnectYtBtn: document.getElementById("videoConnectYtBtn"),
  videoRefresh: document.getElementById("adminVideoRefresh"),
  videoQueueList: document.getElementById("videoQueueList"),
  videoScriptDialog: document.getElementById("videoScriptDialog"),
  videoScriptClose: document.getElementById("videoScriptClose"),
  videoScriptCancelBtn: document.getElementById("videoScriptCancelBtn"),
  videoScriptSaveBtn: document.getElementById("videoScriptSaveBtn"),
  videoScriptApproveBtn: document.getElementById("videoScriptApproveBtn"),
  videoScriptEditTitle: document.getElementById("videoScriptEditTitle"),
  videoScriptEditSummary: document.getElementById("videoScriptEditSummary"),
  videoScriptScenesList: document.getElementById("videoScriptScenesList"),
  videoPlayerDialog: document.getElementById("videoPlayerDialog"),
  videoPlayerClose: document.getElementById("videoPlayerClose"),
  videoPreviewPlayer: document.getElementById("videoPreviewPlayer"),
  videoDownloadMp4Btn: document.getElementById("videoDownloadMp4Btn"),
  videoDownloadSrtBtn: document.getElementById("videoDownloadSrtBtn"),
  videoUploadYtFromModalBtn: document.getElementById("videoUploadYtFromModalBtn"),

  // Books Management & Bilingual QA Editor elements
  booksTab: document.getElementById("adminBooksTab"),
  booksPanel: document.getElementById("adminBooksPanel"),
  booksListView: document.getElementById("adminBooksListView"),
  booksSearch: document.getElementById("adminBooksSearch"),
  addBookBtn: document.getElementById("adminAddBookBtn"),
  booksTbody: document.getElementById("adminBooksTbody"),
  bilingualView: document.getElementById("adminBilingualView"),
  bilingualBackBtn: document.getElementById("adminBilingualBackBtn"),
  bilingualBookTitle: document.getElementById("adminBilingualBookTitle"),
  adminBilingualBookTitle: document.getElementById("adminBilingualBookTitle"),
  bilingualBookMeta: document.getElementById("adminBilingualBookMeta"),
  adminBilingualBookMeta: document.getElementById("adminBilingualBookMeta"),
  bilingualPrevCh: document.getElementById("adminBilingualPrevCh"),
  adminBilingualPrevCh: document.getElementById("adminBilingualPrevCh"),
  bilingualJumpInput: document.getElementById("adminBilingualJumpInput"),
  adminBilingualJumpInput: document.getElementById("adminBilingualJumpInput"),
  bilingualTotalChText: document.getElementById("adminBilingualTotalChText"),
  adminBilingualTotalChText: document.getElementById("adminBilingualTotalChText"),
  bilingualChSelect: document.getElementById("adminBilingualChSelect"),
  bilingualNextCh: document.getElementById("adminBilingualNextCh"),
  adminBilingualNextCh: document.getElementById("adminBilingualNextCh"),
  bilingualCopyZh: document.getElementById("adminBilingualCopyZh"),
  adminBilingualCopyZh: document.getElementById("adminBilingualCopyZh"),
  bilingualZhTitle: document.getElementById("adminBilingualZhTitle"),
  adminBilingualZhTitle: document.getElementById("adminBilingualZhTitle"),
  bilingualZhContent: document.getElementById("adminBilingualZhContent"),
  adminBilingualZhContent: document.getElementById("adminBilingualZhContent"),
  bilingualZhCharCount: document.getElementById("adminBilingualZhCharCount"),
  adminBilingualZhCharCount: document.getElementById("adminBilingualZhCharCount"),
  bilingualViStatusBadge: document.getElementById("adminBilingualViStatusBadge"),
  adminBilingualViStatusBadge: document.getElementById("adminBilingualViStatusBadge"),
  bilingualAiTranslate: document.getElementById("adminBilingualAiTranslate"),
  adminBilingualAiTranslate: document.getElementById("adminBilingualAiTranslate"),
  bilingualViTitle: document.getElementById("adminBilingualViTitle"),
  adminBilingualViTitle: document.getElementById("adminBilingualViTitle"),
  bilingualViTextarea: document.getElementById("adminBilingualViTextarea"),
  adminBilingualViTextarea: document.getElementById("adminBilingualViTextarea"),
  bilingualViCharCount: document.getElementById("adminBilingualViCharCount"),
  adminBilingualViCharCount: document.getElementById("adminBilingualViCharCount"),
  bilingualViWordCount: document.getElementById("adminBilingualViWordCount"),
  adminBilingualViWordCount: document.getElementById("adminBilingualViWordCount"),
  bilingualSaveNotice: document.getElementById("adminBilingualSaveNotice"),
  adminBilingualSaveNotice: document.getElementById("adminBilingualSaveNotice"),
  bilingualSaveBtn: document.getElementById("adminBilingualSaveBtn"),
  adminBilingualSaveBtn: document.getElementById("adminBilingualSaveBtn"),
  bilingualDownloadEpub: document.getElementById("adminBilingualDownloadEpub"),
  adminBilingualDownloadEpub: document.getElementById("adminBilingualDownloadEpub"),
  exportEpubDialog: document.getElementById("adminExportEpubDialog"),
  exportEpubClose: document.getElementById("adminExportEpubClose"),
  exportEpubCancel: document.getElementById("adminExportEpubCancel"),
  exportEpubBookTitle: document.getElementById("exportEpubBookTitle"),
  exportEpubBookMeta: document.getElementById("exportEpubBookMeta"),
  exportEpubProgressBar: document.getElementById("exportEpubProgressBar"),
  exportEpubProgressText: document.getElementById("exportEpubProgressText"),
  exportEpubPercentText: document.getElementById("exportEpubPercentText"),
  exportEpubStatus: document.getElementById("exportEpubStatus"),

  // Edit Book Dialog Elements
  bookEditDialog: document.getElementById("adminBookEditDialog"),
  bookEditClose: document.getElementById("adminBookEditClose"),
  bookEditCancel: document.getElementById("adminBookEditCancel"),
  bookEditForm: document.getElementById("adminBookEditForm"),
  editBookId: document.getElementById("editBookId"),
  editBookTitle: document.getElementById("editBookTitle"),
  editBookAuthor: document.getElementById("editBookAuthor"),
  editBookGenre: document.getElementById("editBookGenre"),
  editBookStatus: document.getElementById("editBookStatus"),
  editBookChapterCount: document.getElementById("editBookChapterCount"),
  editBookCover: document.getElementById("editBookCover"),
  editBookDescription: document.getElementById("editBookDescription"),
  editBookFeatured: document.getElementById("editBookFeatured"),
  statTotalComments: document.getElementById("statTotalComments"),
  statTodayComments: document.getElementById("statTodayComments"),
  statTopDiscussedBook: document.getElementById("statTopDiscussedBook"),
  adminCommentsSearch: document.getElementById("adminCommentsSearch"),
  adminCommentsTbody: document.getElementById("adminCommentsTbody"),
  adminCommentsEmpty: document.getElementById("adminCommentsEmpty"),
  adminCommunityLoading: document.getElementById("adminCommunityLoading"),
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
let activeAdminTab = "books";
let mounted = false;
let translateTimer = null;
let qaLastLoadedAt = 0;

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
    els.close?.addEventListener("click", () => els.dialog.close());
    els.dialog?.addEventListener("click", (event) => {
      if (event.target === els.dialog) {
        const rect = els.dialog.getBoundingClientRect();
        const isOutside = (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        );
        if (isOutside) els.dialog.close();
      }
    });
    els.dialog?.addEventListener("close", () => {
      stopTranslatePolling();
      stopCrawlerPolling();
    });
    els.loginForm?.addEventListener("submit", login);
    els.studioAuthForm?.addEventListener("submit", handleStudioLogin);
    els.uploadForm?.addEventListener("submit", submitBook);
    els.crawlerForm?.addEventListener("submit", (event) => event.preventDefault());
    els.booksTab?.addEventListener("click", () => selectAdminTab("books"));
    els.booksSearch?.addEventListener("input", renderAdminBooksCatalog);
    els.addBookBtn?.addEventListener("click", openUploadDialog);
    els.uploadClose?.addEventListener("click", closeUploadDialog);
    els.uploadCancel?.addEventListener("click", closeUploadDialog);
    els.uploadDialog?.addEventListener("click", (e) => {
      if (e.target === els.uploadDialog) closeUploadDialog();
    });
    els.bilingualBackBtn?.addEventListener("click", closeBilingualEditor);
    els.bilingualPrevCh?.addEventListener("click", () => loadBilingualChapter(bilingualState.currentChapterIndex - 1));
    els.bilingualNextCh?.addEventListener("click", () => loadBilingualChapter(bilingualState.currentChapterIndex + 1));
    els.bilingualChSelect?.addEventListener("change", (e) => loadBilingualChapter(Number(e.target.value) || 0));
    els.bilingualJumpInput?.addEventListener("change", handleBilingualJump);
    els.bilingualJumpInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleBilingualJump(); });
    els.bilingualCopyZh?.addEventListener("click", () => {
      const text = els.bilingualZhContent?.textContent || "";
      navigator.clipboard?.writeText(text);
      alert("Đã sao chép nội dung tiếng Trung!");
    });
    els.bilingualViTextarea?.addEventListener("input", (e) => updateBilingualViCounts(e.target.value));
    els.bilingualSaveBtn?.addEventListener("click", saveBilingualChapter);
    els.bilingualAiTranslate?.addEventListener("click", aiTranslateBilingualChapter);
    els.bilingualDownloadEpub?.addEventListener("click", () => {
      if (bilingualState.activeBook) {
        exportBookToEpub(bilingualState.activeBook);
      }
    });
    els.exportEpubClose?.addEventListener("click", cancelEpubExport);
    els.exportEpubCancel?.addEventListener("click", cancelEpubExport);
    els.bookEditClose?.addEventListener("click", () => els.bookEditDialog?.close());
    els.bookEditCancel?.addEventListener("click", () => els.bookEditDialog?.close());
    els.bookEditForm?.addEventListener("submit", handleBookEditSubmit);
    els.translateTab?.addEventListener("click", () => selectAdminTab("translate"));
    els.keysTab?.addEventListener("click", () => selectAdminTab("keys"));
    els.crawlerTab?.addEventListener("click", () => selectAdminTab("crawler"));
    els.audioTab?.addEventListener("click", () => selectAdminTab("audio"));
    els.audioForm?.addEventListener("submit", createAudioJob);
    els.audioRefresh?.addEventListener("click", loadAudioJobs);
    els.audioBook?.addEventListener("change", handleAudioBookSelectionChange);
    els.audioForce?.addEventListener("change", updateAudioSubmitState);
    els.statsTab?.addEventListener("click", () => selectAdminTab("stats"));
    els.usersTab?.addEventListener("click", () => selectAdminTab("users"));
    els.communityTab?.addEventListener("click", () => selectAdminTab("community"));
    els.communityRefresh?.addEventListener("click", loadAdminCommunity);
    els.adminCommentsSearch?.addEventListener("input", filterAdminComments);
    els.keysPingBtn?.addEventListener("click", runKeysPingTest);
    els.addKeyForm?.addEventListener("submit", handleAddKeySubmit);
    els.translateStartBtn?.addEventListener("click", handleStartTranslate);
    els.translateRefresh?.addEventListener("click", loadTranslateStatus);
    els.adminQaRefreshBtn?.addEventListener("click", () => loadAdminQa(true));
    els.adminQaConsole?.addEventListener("click", handleAdminQaClick);
    els.translateFocusSave?.addEventListener("click", saveTranslationFocus);
    els.statsRefresh?.addEventListener("click", loadAnalytics);
    els.usersRefresh?.addEventListener("click", loadAdminUsers);
    els.usersSearch?.addEventListener("input", filterAdminUsers);
    els.usersSchoolFilter?.addEventListener("change", filterAdminUsers);
    els.crawlerRefresh?.addEventListener("click", loadCrawlerConfig);
    els.crawlerSearchBtn?.addEventListener("click", searchCrawlerBooks);
    els.crawlerSearchQuery?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); searchCrawlerBooks(); } });
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
  if (!els.dialog) return;
  // Keep the modal outside any transformed/contained application ancestor.
  // Some browsers otherwise paint the backdrop in the top layer while the
  // dialog itself remains clipped or invisible.
  if (els.dialog.parentElement !== document.body) {
    document.body.appendChild(els.dialog);
  }
  if (!els.dialog.open) {
    els.dialog.showModal();
  }
  if (options?.tab) {
    pendingAdminTab = options.tab;
    selectAdminTab(options.tab);
  }
  
  // Show login form immediately so user never sees an empty backdrop
  if (!els.dialog.classList.contains("is-authenticated")) {
    if (els.loginForm) els.loginForm.hidden = false;
    if (els.tabs) els.tabs.hidden = true;
    if (els.password) {
      setTimeout(() => els.password?.focus(), 60);
    }
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
    renderBookOptions(result.book?.id);
    renderAdminBooksCatalog();
    setStatus("Upload thành công. Truyện đã xuất hiện trong thư viện.");
    window.dispatchEvent(new CustomEvent("library:refresh", { detail: result.catalog }));
    setTimeout(() => {
      closeUploadDialog();
    }, 600);
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
  renderAdminBooksCatalog();
}

let crawlerPollTimer = null;
let crawlerPollIntervalMs = 15000;

// Only the status is fetched on a tick - never the config - so polling can never
// stomp on a value being edited in the form.
function startCrawlerPolling(interval = null) {
  if (typeof interval === "number") {
    crawlerPollIntervalMs = interval;
  }
  stopCrawlerPolling();
  const poll = async () => {
    if (activeAdminTab !== "crawler" || document.hidden) return;
    try {
      const result = await requestJson("/api/admin/crawler");
      renderCrawlerStatus(result.status);
      const isBusy = result.status && (result.status.state === "queued" || result.status.state === "running");
      if (isBusy && crawlerPollIntervalMs !== 2500) {
        startCrawlerPolling(2500);
      } else if (!isBusy && crawlerPollIntervalMs === 2500) {
        startCrawlerPolling(15000);
      }
    } catch {
      // A failed poll is not worth interrupting the admin over; the next tick
      // either recovers or the heartbeat goes stale, which is the real signal.
    }
  };
  crawlerPollTimer = setInterval(poll, crawlerPollIntervalMs);
}

function stopCrawlerPolling() {
  if (crawlerPollTimer) clearInterval(crawlerPollTimer);
  crawlerPollTimer = null;
}

async function loadCrawlerConfig() {
  const result = await requestJson("/api/admin/crawler");
  fillChoices(els.crawlerWordCount, result.wordCountBuckets, result.config.wordCountBucket);
  fillChoices(els.crawlerCreationStatus, result.creationStatuses, result.config.creationStatus);
  els.crawlerEnabled.checked = false;
  els.crawlerMaxBooks.value = String(result.config.maxNewBooksPerRun || 2);
  if (els.crawlerMaxBacklog) els.crawlerMaxBacklog.value = String(result.config.maxPendingBooksBacklog || 5);
  els.crawlerUpdateExisting.checked = result.config.updateExisting !== false;
  const selected = new Set(result.config.categories || []);
  els.crawlerForm.querySelectorAll('[name="crawlerCategory"]').forEach((input) => { input.checked = selected.has(input.value); });
  els.crawlerWorkerWarning.hidden = result.workerReady;
  renderCrawlerStatus(result.status);
  describeCrawlerReach();
  if (result.status && (result.status.state === "queued" || result.status.state === "running")) {
    startCrawlerPolling(2500);
  }
}

async function searchCrawlerBooks() {
  const query = String(els.crawlerSearchQuery?.value || "").trim();
  if (!query) return setStatus("Hãy nhập tên hoặc ID truyện.", true);
  els.crawlerSearchBtn.disabled = true;
  els.crawlerSearchResults.innerHTML = '<p class="stats-empty">Đang tìm kiếm...</p>';
  try {
    const data = await requestJson(`/api/admin/crawler/search?q=${encodeURIComponent(query)}`);
    renderCrawlerSearchResults(data.results || []);
  } catch (error) { els.crawlerSearchResults.innerHTML = `<p class="stats-empty text-error">${escapeHtml(error.message)}</p>`; }
  finally { els.crawlerSearchBtn.disabled = false; }
}
function renderCrawlerSearchResults(results) {
  if (!results.length) { els.crawlerSearchResults.innerHTML = '<p class="stats-empty">Không tìm thấy bộ phù hợp.</p>'; return; }
  els.crawlerSearchResults.innerHTML = results.map((book) => {
    const sourceTag = book.source === "bianhua" ? "Bianhuaxs" : book.source === "qidian" ? "Qidian" : "Fanqie";
    const authorLine = book.author ? `${book.author} · ` : "";
    return `<article class="crawler-preview-card">
      <div class="crawler-preview-cover">${book.cover && /^https:\/\//.test(book.cover) ? `<img src="${escapeHtml(book.cover)}" alt="Bìa ${escapeHtml(book.title)}" referrerpolicy="no-referrer" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<span>📚</span>';">` : '<span>📚</span>'}</div>
      <div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:0.75rem;padding:2px 6px;border-radius:4px;background:rgba(217,119,6,0.2);color:#f59e0b;font-weight:600;text-transform:uppercase;">${sourceTag}</span>
          <strong style="font-size:1.05rem;">${escapeHtml(book.title)}</strong>
        </div>
        <small>${escapeHtml(`${authorLine}${sourceTag} ID: ${book.sourceId}`)}</small>
        <p>${escapeHtml(book.description || "Chưa có giới thiệu từ nguồn tìm kiếm.")}</p>
        <a href="${escapeHtml(book.sourceUrl)}" target="_blank" rel="noopener noreferrer">Xem nguồn gốc ↗</a>
      </div>
      <button class="primary-action" type="button" data-crawl-source="${escapeHtml(book.source)}" data-crawl-id="${escapeHtml(book.sourceId)}" data-crawl-title="${escapeHtml(book.title)}">Chọn và cào</button>
    </article>`;
  }).join("");
  els.crawlerSearchResults.querySelectorAll("[data-crawl-id]").forEach((button) => button.addEventListener("click", () => startSelectedCrawler(button)));
}
async function startSelectedCrawler(button) {
  const source = button.dataset.crawlSource || "fanqie";
  const sourceId = button.dataset.crawlId;
  const title = button.dataset.crawlTitle || `Book ${sourceId}`;
  const card = button.closest(".crawler-preview-card");

  button.disabled = true;
  const originalText = button.innerHTML;
  button.innerHTML = '<span class="spinner-inline" aria-hidden="true"></span> Đang gửi lệnh...';
  if (card) card.classList.add("is-crawling");

  let inlineProg = card?.querySelector(".crawler-inline-progress");
  if (!inlineProg && card) {
    inlineProg = document.createElement("div");
    inlineProg.className = "crawler-inline-progress";
    card.appendChild(inlineProg);
  }
  if (inlineProg) {
    inlineProg.innerHTML = `
      <div class="crawler-progress-bar"><span class="is-indeterminate" style="width: 100%"></span></div>
      <small class="crawler-inline-label">Đang kết nối và khởi chạy máy chủ cào truyện...</small>
    `;
  }

  // Optimistic UI update so user immediately sees state and progress bar without delay
  renderCrawlerStatus({
    state: "queued",
    message: `Đã xếp hàng cào ${title}. Đang gửi lệnh khởi chạy...`,
    currentBookId: sourceId,
    currentBookTitle: title,
    currentChapters: 0,
    currentTotalChapters: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  els.crawlerProgress?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    await requestJson("/api/admin/crawler/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, sourceId, title })
    });
    setStatus(`Đã bắt đầu cào ${title}.`);
    button.innerHTML = '<span class="spinner-inline" aria-hidden="true"></span> Đang cào...';
    if (inlineProg) {
      inlineProg.innerHTML = `
        <div class="crawler-progress-bar"><span class="is-indeterminate" style="width: 100%"></span></div>
        <small class="crawler-inline-label">Đang chuẩn bị tải các chương truyện...</small>
      `;
    }
    startCrawlerPolling(2500);
    await loadCrawlerConfig();
  } catch (error) {
    setStatus(error.message, true);
    button.disabled = false;
    button.innerHTML = originalText;
    if (card) card.classList.remove("is-crawling");
    if (inlineProg) {
      inlineProg.innerHTML = `<small class="text-error" style="color: var(--danger, #ef4444); font-weight: 600;">Lỗi: ${escapeHtml(error.message)}</small>`;
    }
    renderCrawlerStatus({
      state: "error",
      message: `Không thể bắt đầu cào: ${error.message}`,
      currentBookId: sourceId,
      currentBookTitle: title,
      finishedAt: new Date().toISOString()
    });
  }
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
    if (activeAdminTab !== "translate" || document.hidden || (els.dialog && !els.dialog.open)) return;
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
    if (!qaLastLoadedAt || Date.now() - qaLastLoadedAt > 30000) {
      loadAdminQa().catch((err) => console.warn("Unable to load QA queue:", err));
    }
  } catch (err) {
    console.warn("Unable to load translate status:", err);
  }
}

async function loadAdminQa(force = false) {
  if (!els.adminQaConsole) return;
  if (!force && qaLastLoadedAt && Date.now() - qaLastLoadedAt < 30000) return;
  qaLastLoadedAt = Date.now();
  try {
    const res = await requestJson("/api/admin/qa");
    renderAdminQa(res);
  } catch (err) {
    console.warn("Unable to load admin QA:", err);
    if (els.adminQaSummaryBadge) els.adminQaSummaryBadge.textContent = `QA lỗi: ${err.message || "không rõ"}`.slice(0, 80);
    renderQaError(err);
  }
}

function renderAdminQa(data = {}) {
  const summary = data.summary || {};
  const reports = Array.isArray(data.reports) ? data.reports : [];
  const failed = Array.isArray(data.failedChapters) ? data.failedChapters : [];
  const glossary = Array.isArray(data.glossarySuggestions) ? data.glossarySuggestions : [];
  if (els.adminQaSummaryBadge) {
    const total = reports.length + failed.length + glossary.length;
    const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
    els.adminQaSummaryBadge.textContent = warnings.length
      ? `QA có cảnh báo: ${warnings[0]}`.slice(0, 80)
      : total
      ? `${total.toLocaleString("vi-VN")} mục cần xem`
      : "QA sạch";
  }
  renderQaReports(reports);
  renderQaFailed(failed);
  renderQaGlossary(glossary);
}

function renderQaError(err) {
  const message = escapeHtml(err?.message || "Không tải được hàng chờ QA.");
  const html = `<p class="stats-empty">Lỗi tải QA: ${message}</p>`;
  if (els.adminQaReportsList) els.adminQaReportsList.innerHTML = html;
  if (els.adminQaFailedList) els.adminQaFailedList.innerHTML = '<p class="stats-empty">Chưa có dữ liệu.</p>';
  if (els.adminQaGlossaryList) els.adminQaGlossaryList.innerHTML = '<p class="stats-empty">Chưa có dữ liệu.</p>';
}

function renderQaReports(reports) {
  if (!els.adminQaReportsList) return;
  if (!reports.length) {
    els.adminQaReportsList.innerHTML = '<p class="stats-empty">Chưa có báo lỗi mới.</p>';
    return;
  }
  els.adminQaReportsList.innerHTML = reports.slice(0, 15).map((item) => {
    const chNum = Number(item.chapterNumber || (Number(item.chapterIndex || 0) + 1));
    const parIdx = Number(item.paragraphIndex || 0);
    return `
    <article class="trans-qa-item">
      <div>
        <strong>${escapeHtml(item.bookTitle || item.bookId || "Không rõ truyện")}</strong>
        <span>Chương ${chNum.toLocaleString("vi-VN")} · đoạn ${(parIdx + 1).toLocaleString("vi-VN")}</span>
      </div>
      <p>${escapeHtml(item.selectedText || item.note || "")}</p>
      ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
      <div class="trans-qa-item-actions">
        <button class="secondary-action" type="button" data-qa-open="${escapeHtml(item.bookId || "")}" data-qa-ch="${chNum}" data-qa-par="${parIdx}">Mở đoạn</button>
        <button class="ghost-action is-danger" type="button" data-qa-action="delete-report" data-qa-id="${escapeHtml(item.id || "")}">Xóa</button>
      </div>
    </article>
  `;
  }).join("");
}

function renderQaFailed(rows) {
  if (!els.adminQaFailedList) return;
  if (!rows.length) {
    els.adminQaFailedList.innerHTML = '<p class="stats-empty">Không có chương retry/failed.</p>';
    return;
  }
  els.adminQaFailedList.innerHTML = rows.slice(0, 10).map((item) => `
    <article class="trans-qa-item">
      <div>
        <strong>${escapeHtml(item.bookTitle || item.bookId || "Không rõ truyện")}</strong>
        <span>Chương ${Number(item.chapter || 0).toLocaleString("vi-VN")} · ${escapeHtml(item.status || "failed")} · ${Number(item.attempts || 0)} lần</span>
      </div>
      <p>${escapeHtml(item.lastError || "Chưa có mô tả lỗi.")}</p>
      <div class="trans-qa-item-actions">
        <button class="secondary-action" type="button" data-qa-open="${escapeHtml(item.bookId || "")}" data-qa-ch="${Number(item.chapter || 1)}">Mở chương</button>
      </div>
    </article>
  `).join("");
}

function renderQaGlossary(rows) {
  if (!els.adminQaGlossaryList) return;
  if (!rows.length) {
    els.adminQaGlossaryList.innerHTML = '<p class="stats-empty">Chưa có gợi ý thuật ngữ.</p>';
    return;
  }
  els.adminQaGlossaryList.innerHTML = rows.slice(0, 10).map((item) => `
    <article class="trans-qa-item">
      <div>
        <strong>${escapeHtml(item.sourceTerm || "")} → ${escapeHtml(item.suggestedTerm || "")}</strong>
        <span>${escapeHtml(item.bookId || "general")}</span>
      </div>
      <p>${escapeHtml(item.contextSnippet || item.note || "")}</p>
      <div class="trans-qa-item-actions">
        <button class="secondary-action" type="button" data-qa-action="approve-glossary" data-qa-id="${escapeHtml(item.id || "")}" data-qa-book="${escapeHtml(item.bookId || "")}" data-qa-source="${escapeHtml(item.sourceTerm || "")}" data-qa-term="${escapeHtml(item.suggestedTerm || "")}">Duyệt</button>
        <button class="ghost-action" type="button" data-qa-action="reject-glossary" data-qa-id="${escapeHtml(item.id || "")}">Từ chối</button>
      </div>
    </article>
  `).join("");
}

async function handleAdminQaClick(event) {
  const openBtn = event.target.closest("[data-qa-open]");
  if (openBtn) {
    const bookId = openBtn.dataset.qaOpen;
    const ch = Math.max(1, Number(openBtn.dataset.qaCh || 1));
    const par = openBtn.dataset.qaPar !== undefined && openBtn.dataset.qaPar !== "" ? Number(openBtn.dataset.qaPar) : null;
    if (bookId) {
      els.dialog?.close();
      const hash = `#read/${encodeURIComponent(bookId)}/${ch}${par !== null && par >= 0 ? `?p=${par}` : ""}`;
      window.location.hash = hash;
      window.dispatchEvent(new CustomEvent("reader:jump-paragraph", { detail: { bookId, chapter: ch, paragraph: par } }));
    }
    return;
  }

  const actionBtn = event.target.closest("[data-qa-action]");
  if (!actionBtn || actionBtn.disabled) return;
  const action = actionBtn.dataset.qaAction;
  const payload = {
    action,
    id: actionBtn.dataset.qaId || "",
    bookId: actionBtn.dataset.qaBook || "",
    sourceTerm: actionBtn.dataset.qaSource || "",
    suggestedTerm: actionBtn.dataset.qaTerm || ""
  };
  actionBtn.disabled = true;
  try {
    const res = await requestJson("/api/admin/qa", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setStatus(res.message || "Đã cập nhật hàng chờ QA.");
    qaLastLoadedAt = 0;
    await loadAdminQa(true);
  } catch (err) {
    setStatus(`Lỗi QA: ${err.message}`, true);
  } finally {
    actionBtn.disabled = false;
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
  const labels = {
    idle: "Chưa chạy",
    queued: "Đang xếp hàng",
    running: "Đang cào truyện",
    success: "Hoàn tất",
    error: "Có lỗi",
    paused_quota: "Tạm dừng (hết quota)",
    disabled: "Đang tắt"
  };
  if (els.crawlerStateBadge) {
    els.crawlerStateBadge.textContent = labels[status.state] || labels.idle;
    els.crawlerStateBadge.dataset.state = status.state || "idle";
  }
  if (els.crawlerStateMessage) {
    els.crawlerStateMessage.textContent = status.message || "Crawler chưa chạy.";
  }
  // The heartbeat, not the start time.
  const beat = status.updatedAt || status.finishedAt;
  const parts = [];
  if (beat) parts.push(`Cập nhật ${describeAge(beat)}`);
  if (status.state === "queued") parts.push("Đang chuẩn bị container");
  if (status.state === "running" && status.startedAt) parts.push(`chạy từ ${describeAge(status.startedAt)}`);
  parts.push(`đã thêm ${status.published || 0}`);
  if (status.failed) parts.push(`lỗi ${status.failed}`);
  const stale = beat && Date.now() - new Date(beat).getTime() > 5 * 60 * 1000;
  if (status.state === "running" && stale) parts.push("⚠ không có nhịp mới, có thể đã dừng");
  if (els.crawlerStateMeta) {
    els.crawlerStateMeta.textContent = parts.join(" · ");
  }

  // Active error or pause warning banner
  if (els.crawlerAlert) {
    if (status.state === "error" || status.state === "paused_quota") {
      els.crawlerAlert.hidden = false;
      const isQuota = status.state === "paused_quota";
      els.crawlerAlert.className = `crawler-alert ${isQuota ? "warning" : "error"}`;
      els.crawlerAlert.innerHTML = `
        <div class="crawler-alert-icon">${isQuota ? "⏳" : "⚠️"}</div>
        <div class="crawler-alert-content">
          <strong>${isQuota ? "Tạm dừng cào do hết hạn mức API dịch" : "Tiến trình cào truyện gặp sự cố"}</strong>
          <p>${escapeHtml(status.message || "Đã xảy ra lỗi trong quá trình cào.")}</p>
          <small>${isQuota ? "Hệ thống tự động tạm dừng để bảo vệ kho truyện. Vui lòng nạp thêm API key hoặc chờ reset quota." : "Vui lòng kiểm tra lại kết nối hoặc log trên GitHub Actions."}</small>
        </div>
      `;
    } else {
      els.crawlerAlert.hidden = true;
    }
  }

  // Live progress on the book being downloaded.
  const total = Number(status.currentTotalChapters || 0);
  const saved = Number(status.currentChapters || 0);
  const isBusy = status.state === "running" || status.state === "queued";
  if (els.crawlerProgress) {
    els.crawlerProgress.hidden = !isBusy;
    if (isBusy) {
      if (total > 0) {
        const percent = Math.min(100, Math.round((saved / total) * 100));
        if (els.crawlerProgressFill) {
          els.crawlerProgressFill.classList.remove("is-indeterminate");
          els.crawlerProgressFill.style.width = `${percent}%`;
        }
        if (els.crawlerProgressLabel) {
          els.crawlerProgressLabel.textContent =
            `${status.currentBookTitle || "Đang tải"} — ${saved.toLocaleString("vi-VN")}/${total.toLocaleString("vi-VN")} chương (${percent}%)`;
        }
      } else {
        if (els.crawlerProgressFill) {
          els.crawlerProgressFill.classList.add("is-indeterminate");
          els.crawlerProgressFill.style.width = "100%";
        }
        if (els.crawlerProgressLabel) {
          els.crawlerProgressLabel.textContent = status.state === "queued"
            ? `${status.currentBookTitle || "Đang xếp hàng"} — Đang khởi động máy chủ cào...`
            : `${status.currentBookTitle || "Đang kết nối"} — ${status.message || "Đang kết nối nguồn truyện và phân tích danh sách chương..."}`;
        }
      }
    }
  }

  // Also reflect status directly onto any matching search card
  if (els.crawlerSearchResults) {
    const currentId = String(status.currentBookId || "").replace(/^(?:fanqie|qidian)-/, "");
    const matchingBtn = currentId ? els.crawlerSearchResults.querySelector(`[data-crawl-id="${currentId}"]`) : null;
    if (matchingBtn) {
      const card = matchingBtn.closest(".crawler-preview-card");
      if (card) {
        let inlineProg = card.querySelector(".crawler-inline-progress");
        if (!inlineProg) {
          inlineProg = document.createElement("div");
          inlineProg.className = "crawler-inline-progress";
          card.appendChild(inlineProg);
        }
        if (isBusy) {
          matchingBtn.disabled = true;
          matchingBtn.innerHTML = '<span class="spinner-inline" aria-hidden="true"></span> Đang cào...';
          card.classList.add("is-crawling");
          if (total > 0) {
            const percent = Math.min(100, Math.round((saved / total) * 100));
            inlineProg.innerHTML = `
              <div class="crawler-progress-bar"><span style="width: ${percent}%"></span></div>
              <small class="crawler-inline-label">${saved.toLocaleString("vi-VN")}/${total.toLocaleString("vi-VN")} chương (${percent}%)</small>
            `;
          } else {
            inlineProg.innerHTML = `
              <div class="crawler-progress-bar"><span class="is-indeterminate" style="width: 100%"></span></div>
              <small class="crawler-inline-label">${escapeHtml(status.message || (status.state === "queued" ? "Đang xếp hàng khởi động..." : "Đang kết nối..."))}</small>
            `;
          }
        } else if (status.state === "success") {
          matchingBtn.disabled = false;
          matchingBtn.textContent = "Cào lại";
          card.classList.remove("is-crawling");
          inlineProg.innerHTML = `<small class="text-success" style="color: var(--accent-strong, #10b981); font-weight: 600;">✓ Hoàn tất (${(status.currentChapters || total || 0).toLocaleString("vi-VN")} chương)</small>`;
        } else if (status.state === "error" || status.state === "paused_quota") {
          matchingBtn.disabled = false;
          matchingBtn.textContent = "Thử lại";
          card.classList.remove("is-crawling");
          inlineProg.innerHTML = `<small class="text-error" style="color: var(--danger, #ef4444); font-weight: 600;">⚠ ${escapeHtml(status.message)}</small>`;
        }
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
  { key: "books", tab: "booksTab", panel: "booksPanel" },
  { key: "translate", tab: "translateTab", panel: "translatePanel" },
  { key: "keys", tab: "keysTab", panel: "keysPanel" },
  { key: "crawler", tab: "crawlerTab", panel: "crawlerForm" },
  { key: "audio", tab: "audioTab", panel: "audioPanel" },
  { key: "stats", tab: "statsTab", panel: "statsPanel" },
  { key: "users", tab: "usersTab", panel: "usersPanel" },
  { key: "community", tab: "communityTab", panel: "communityPanel" }
];

let adminUsersData = [];
let adminCommentsData = [];

function openUploadDialog() {
  if (!els.uploadDialog) return;
  startNewBook();
  els.uploadDialog.showModal();
}

function closeUploadDialog() {
  els.uploadDialog?.close();
}

function selectAdminTab(tab) {
  activeAdminTab = ADMIN_TABS.some((entry) => entry.key === tab) ? tab : "books";
  ADMIN_TABS.forEach(({ key, tab: tabId, panel }) => {
    const active = key === activeAdminTab;
    els[tabId]?.classList.toggle("active", active);
    els[tabId]?.setAttribute("aria-selected", String(active));
    if (els[panel]) els[panel].hidden = !active;
  });
  setStatus("");
  if (activeAdminTab === "epubStudio") initEpubStudio();
  if (activeAdminTab === "books") loadAdminBooksCatalog();
  if (activeAdminTab === "translate") startTranslatePolling();
  else stopTranslatePolling();
  if (activeAdminTab === "keys") loadAdminKeys();
  if (activeAdminTab === "stats") loadAnalytics();
  if (activeAdminTab === "users") loadAdminUsers();
  if (activeAdminTab === "community") loadAdminCommunity();
  if (activeAdminTab === "crawler") { loadCrawlerConfig(); startCrawlerPolling(); }
  else stopCrawlerPolling();
  if (activeAdminTab === "audio") { renderAudioBookOptions(); startAudioPolling(); }
  else stopAudioPolling();
}

let audioPollTimer = null;
let currentAudioBookStatus = null;
let audioStatusFetchSeq = 0;

function renderAudioBookOptions() {
  if (!els.audioBook) return;
  els.audioBook.replaceChildren(...(adminCatalog.books || []).map((book) => {
    const option = document.createElement("option");
    option.value = book.id;
    option.textContent = `${book.title || book.id} · ${Number(book.chapterCount || book.totalChapters || 0).toLocaleString("vi-VN")} chương`;
    return option;
  }));
  handleAudioBookSelectionChange();
}

async function handleAudioBookSelectionChange() {
  const bookId = els.audioBook?.value;
  if (!bookId) {
    currentAudioBookStatus = null;
    if (els.audioBookStatusBanner) els.audioBookStatusBanner.hidden = true;
    updateAudioSubmitState();
    return;
  }

  const seq = ++audioStatusFetchSeq;
  if (els.audioBookStatusBanner) {
    els.audioBookStatusBanner.hidden = false;
    if (els.audioBookStatusNote) els.audioBookStatusNote.textContent = "Đang kiểm tra tiến độ audio...";
    if (els.audioBookProgressBadge) {
      els.audioBookProgressBadge.className = "crawler-state-badge badge-status-waiting";
      els.audioBookProgressBadge.textContent = "Đang kiểm tra...";
    }
  }

  try {
    const status = await requestJson(`/api/admin/audio/books/${encodeURIComponent(bookId)}/status`);
    if (seq !== audioStatusFetchSeq) return;
    currentAudioBookStatus = status;
    renderAudioBookStatus(status);
  } catch (err) {
    if (seq !== audioStatusFetchSeq) return;
    currentAudioBookStatus = null;
    if (els.audioBookStatusBanner) {
      if (els.audioBookStatusNote) els.audioBookStatusNote.textContent = `Không kiểm tra được: ${err.message}`;
      if (els.audioBookProgressBadge) {
        els.audioBookProgressBadge.className = "crawler-state-badge badge-status-error";
        els.audioBookProgressBadge.textContent = "Lỗi kiểm tra";
      }
    }
    updateAudioSubmitState();
  }
}

function renderAudioBookStatus(status) {
  if (!els.audioBookStatusBanner) return;
  els.audioBookStatusBanner.hidden = false;
  const total = Number(status.totalChapters || 0);
  const done = Number(status.audioChaptersCount || 0);
  const percent = status.percent || (total > 0 ? Math.round((done / total) * 100) : 0);

  if (els.audioBookProgressBar) {
    els.audioBookProgressBar.style.width = `${percent}%`;
  }

  if (els.audioBookProgressBadge) {
    if (status.isFullyCreated) {
      els.audioBookProgressBadge.className = "crawler-state-badge badge-status-completed";
      els.audioBookProgressBadge.textContent = `✓ Đã đủ ${done}/${total} chương (100%)`;
    } else if (done > 0) {
      els.audioBookProgressBadge.className = "crawler-state-badge badge-status-running";
      els.audioBookProgressBadge.textContent = `${done}/${total} chương (${percent}%)`;
    } else {
      els.audioBookProgressBadge.className = "crawler-state-badge badge-status-pending";
      els.audioBookProgressBadge.textContent = `Chưa có audio (0/${total} chương)`;
    }
  }

  if (els.audioBookStatusNote) {
    if (status.isFullyCreated) {
      els.audioBookStatusNote.textContent = `Toàn bộ ${total} chương của bộ truyện đã có audio sẵn sàng. Nếu muốn tạo lại, hãy chọn "Ghi đè".`;
    } else if (done > 0) {
      els.audioBookStatusNote.textContent = `Đã có audio cho ${done} chương. Hệ thống sẽ tự động bỏ qua và tạo tiếp từ chương ${status.firstMissingChapter}.`;
    } else {
      els.audioBookStatusNote.textContent = `Chưa có chương nào được tạo audio. Sẽ tạo từ chương 1 đến chương ${total}.`;
    }
  }

  if (els.audioStartChapter && !els.audioStartChapter.value) {
    els.audioStartChapter.placeholder = String(status.firstMissingChapter || 1);
  }

  updateAudioSubmitState();
}

function updateAudioSubmitState() {
  const isForce = Boolean(els.audioForce?.checked);
  const status = currentAudioBookStatus;
  const submitText = els.audioSubmitText;

  if (!status) {
    if (submitText) submitText.textContent = "Tạo audio toàn bộ";
    if (els.audioCreate) els.audioCreate.disabled = false;
    return;
  }

  if (isForce) {
    if (submitText) submitText.textContent = "⟳ Tạo lại từ đầu (Ghi đè)";
    if (els.audioCreate) els.audioCreate.disabled = false;
    return;
  }

  if (status.isFullyCreated) {
    if (submitText) submitText.textContent = `✓ Đã đủ audio (${status.totalChapters}/${status.totalChapters} chương)`;
    if (els.audioCreate) els.audioCreate.disabled = true;
    return;
  }

  if (status.audioChaptersCount > 0) {
    if (submitText) submitText.textContent = `▶ Tiếp tục từ chương ${status.firstMissingChapter} (còn ${status.missingChaptersCount} ch)`;
    if (els.audioCreate) els.audioCreate.disabled = false;
    return;
  }

  if (submitText) submitText.textContent = "▷ Tạo audio toàn bộ";
  if (els.audioCreate) els.audioCreate.disabled = false;
}

function startAudioPolling() {
  stopAudioPolling();
  loadAudioJobs();
  audioPollTimer = setInterval(() => { if (activeAdminTab === "audio" && !document.hidden) loadAudioJobs(); }, 5000);
}
function stopAudioPolling() { if (audioPollTimer) clearInterval(audioPollTimer); audioPollTimer = null; }

async function createAudioJob(event) {
  event.preventDefault();
  const bookId = els.audioBook?.value;
  if (!bookId) return setStatus("Hãy chọn bộ truyện.", true);
  const isForce = Boolean(els.audioForce?.checked);
  const startCh = els.audioStartChapter?.value ? parseInt(els.audioStartChapter.value, 10) : null;

  els.audioCreate.disabled = true;
  try {
    const payload = {
      bookId,
      mode: isForce ? "force_all" : "missing_only",
      forceAll: isForce
    };
    if (startCh && Number.isInteger(startCh) && startCh > 0) {
      payload.startChapter = startCh;
    }
    const res = await requestJson("/api/admin/audio/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    setStatus(`Đã đưa bộ truyện vào hàng đợi tạo audio (${res.stageMessage || ""})`);
    await loadAudioJobs();
    await handleAudioBookSelectionChange();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    updateAudioSubmitState();
  }
}
async function loadAudioJobs() {
  if (!els.audioJobs) return;
  try { renderAudioJobs((await requestJson("/api/admin/audio/jobs")).jobs || []); }
  catch (error) { els.audioJobs.innerHTML = `<p class="stats-empty text-error">${escapeHtml(error.message)}</p>`; }
}
function renderAudioJobs(jobs) {
  if (els.audioJobsBadge) {
    els.audioJobsBadge.textContent = jobs.length ? `${jobs.length} tiến trình` : "0 tiến trình";
  }
  const runningCount = jobs.filter((j) => j.status === "running" || j.status === "pending" || j.status === "retrying").length;
  if (els.audioActiveJobsCount) {
    els.audioActiveJobsCount.textContent = runningCount > 0 ? `${runningCount} đang chạy` : "Sẵn sàng";
  }

  if (!jobs.length) {
    els.audioJobs.innerHTML = `
      <div class="audio-empty-state">
        <svg class="icon audio-empty-icon" viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>
        <p class="audio-empty-title">Chưa có job audio nào trong hàng đợi</p>
        <span class="audio-empty-desc">Chọn bộ truyện ở phía trên và bấm "Tạo audio toàn bộ" để bắt đầu tiến trình chuyển văn bản thành giọng nói.</span>
      </div>`;
    return;
  }

  const statusMap = {
    running: { label: "Đang chạy", class: "badge-status-running", pulse: true },
    pending: { label: "Chờ xử lý", class: "badge-status-pending" },
    retrying: { label: "Đang thử lại", class: "badge-status-retrying" },
    waiting: { label: "Đang chờ", class: "badge-status-waiting" },
    completed: { label: "Hoàn tất", class: "badge-status-completed" },
    error: { label: "Lỗi", class: "badge-status-error" },
    canceled: { label: "Đã hủy", class: "badge-status-canceled" }
  };

  els.audioJobs.innerHTML = jobs.map((job) => {
    const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
    const st = statusMap[job.status] || { label: job.status, class: `badge-status-${escapeHtml(job.status)}` };
    const retryBtn = (job.status === "retrying" || job.status === "error") ? `<button class="secondary-action icon-text-btn" data-audio-retry="${escapeHtml(job.id)}" type="button" title="Thử lại tiến trình này"><svg class="icon" viewBox="0 0 24 24"><path d="M20 6v6h-6M4 18v-6h6"></path><path d="M18.49 9A7 7 0 0 0 5.64 6.64L4 9M20 15l-1.64 2.36A7 7 0 0 1 5.51 15"></path></svg><span>Thử lại</span></button>` : "";
    const cancelBtn = (job.status === "pending" || job.status === "running") ? `<button class="ghost-action icon-text-btn" data-audio-cancel="${escapeHtml(job.id)}" type="button" title="Hủy tiến trình này"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg><span>Hủy</span></button>` : "";

    return `
      <article class="audio-job-card">
        <div class="audio-job-head">
          <strong class="audio-job-title">${escapeHtml(job.bookTitle || job.bookId)}</strong>
          <div class="audio-job-actions">
            <span class="${st.class}">${st.pulse ? '<span class="pulse-dot"></span> ' : ""}${st.label}</span>
            ${retryBtn}
            ${cancelBtn}
          </div>
        </div>
        <div class="crawler-progress-bar">
          <span style="width:${progress}%"></span>
        </div>
        <div class="audio-job-meta">
          <span class="audio-job-meta-pill"><svg class="icon" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path></svg>${Number(job.completedChapters || 0).toLocaleString("vi-VN")}/${Number(job.totalChapters || 0).toLocaleString("vi-VN")} chương · ${progress}%</span>
          <small>${escapeHtml(job.stageMessage || "")}</small>
        </div>
        ${job.error ? `<p class="crawler-warning">${escapeHtml(job.error)}</p>` : ""}
      </article>`;
  }).join("");

  els.audioJobs.querySelectorAll("[data-audio-retry]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await requestJson(`/api/admin/audio/jobs/${button.dataset.audioRetry}/retry`, { method: "POST" });
      loadAudioJobs();
    } catch (e) { setStatus(e.message, true); button.disabled = false; }
  }));

  els.audioJobs.querySelectorAll("[data-audio-cancel]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Bạn có chắc chắn muốn hủy tiến trình audio này?")) return;
    button.disabled = true;
    try {
      await requestJson(`/api/admin/audio/jobs/${button.dataset.audioCancel}/cancel`, { method: "POST" });
      loadAudioJobs();
    } catch (e) { setStatus(e.message, true); button.disabled = false; }
  }));
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
  if (!els.bookSelect) return;
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
  els.uploadForm?.reset();
  if (els.bookSelect) els.bookSelect.value = "";
  if (els.epub) els.epub.required = true;
  if (els.epubLabel) els.epubLabel.innerHTML = "File EPUB <small>Tối đa 200 MB</small>";
  if (els.coverLabel) els.coverLabel.innerHTML = "Ảnh bìa <small>JPG, PNG hoặc WebP; tối đa 5 MB</small>";
  if (els.existingFiles) els.existingFiles.hidden = true;
  if (els.deleteBook) els.deleteBook.hidden = true;
  if (els.submit) els.submit.textContent = "Upload truyện";
  setStatus("");
  setProgress(0);
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
  els.dialog?.classList.toggle("is-authenticated", Boolean(authenticated));
  els.loginForm.hidden = authenticated;
  els.tabs.hidden = !authenticated;
  if (els.logout) els.logout.hidden = !authenticated;
  ADMIN_TABS.forEach(({ key, panel }) => {
    if (els[panel]) els[panel].hidden = !authenticated || activeAdminTab !== key;
  });
  if (!authenticated) {
    setTimeout(() => els.password?.focus(), 60);
  }
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

async function loadAdminCommunity() {
  if (!els.adminCommentsTbody) return;
  if (els.adminCommunityLoading) els.adminCommunityLoading.hidden = false;
  if (els.adminCommentsEmpty) els.adminCommentsEmpty.hidden = true;

  try {
    const data = await requestJson("/api/admin/community");
    adminCommentsData = data.comments || [];

    if (els.statTotalComments) els.statTotalComments.textContent = Number(data.stats?.totalComments || 0).toLocaleString("vi-VN");
    if (els.statTodayComments) els.statTodayComments.textContent = Number(data.stats?.todayComments || 0).toLocaleString("vi-VN");
    if (els.statTopDiscussedBook) els.statTopDiscussedBook.textContent = data.stats?.topDiscussedBook || "Chưa có";

    renderAdminComments(adminCommentsData);
  } catch (error) {
    els.adminCommentsTbody.innerHTML = `<tr><td colspan="5" class="users-error-row">Lỗi tải dữ liệu bình luận: ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    if (els.adminCommunityLoading) els.adminCommunityLoading.hidden = true;
  }
}

function filterAdminComments() {
  const query = String(els.adminCommentsSearch?.value || "").toLowerCase().trim();
  if (!query) {
    renderAdminComments(adminCommentsData);
    return;
  }
  const filtered = adminCommentsData.filter((c) => {
    return (
      String(c.authorName || "").toLowerCase().includes(query) ||
      String(c.bookTitle || "").toLowerCase().includes(query) ||
      String(c.content || "").toLowerCase().includes(query) ||
      String(c.bookId || "").toLowerCase().includes(query)
    );
  });
  renderAdminComments(filtered);
}

function renderAdminComments(comments) {
  if (!els.adminCommentsTbody) return;
  if (!comments || !comments.length) {
    els.adminCommentsTbody.innerHTML = "";
    if (els.adminCommentsEmpty) els.adminCommentsEmpty.hidden = false;
    return;
  }
  if (els.adminCommentsEmpty) els.adminCommentsEmpty.hidden = true;

  els.adminCommentsTbody.innerHTML = comments.map((c) => {
    const timeFormatted = c.createdAt ? formatRelativeTime(c.createdAt) : "—";
    return `
      <tr class="user-table-row comment-table-row" data-comment-id="${escapeHtml(String(c.id))}">
        <td>
          <div class="user-info-cell">
            <span class="user-avatar-initial" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8;">💬</span>
            <div class="user-name-group">
              <strong class="user-display-name">${escapeHtml(c.authorName)}</strong>
              <small class="user-id-text">ID: #${escapeHtml(String(c.id))}</small>
            </div>
          </div>
        </td>
        <td>
          <div class="comment-book-cell">
            <strong class="comment-book-title">${escapeHtml(c.bookTitle)}</strong>
            <span class="comment-chapter-badge">Chương ${c.chapterNumber} (Đoạn #${c.paragraphIndex + 1})</span>
          </div>
        </td>
        <td>
          <div class="comment-content-cell">
            <p class="comment-bubble-text">${escapeHtml(c.content)}</p>
          </div>
        </td>
        <td>
          <span class="user-last-active">${escapeHtml(timeFormatted)}</span>
        </td>
        <td>
          <button class="danger-action-btn delete-comment-btn" type="button" data-id="${escapeHtml(String(c.id))}" title="Xóa bình luận này">
            <svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"></path></svg>
            <span>Xóa</span>
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Attach delete handlers
  els.adminCommentsTbody.querySelectorAll(".delete-comment-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      if (!id) return;
      if (!confirm("Bạn có chắc chắn muốn xóa bình luận này không?")) return;
      btn.disabled = true;
      btn.textContent = "Đang xóa...";
      try {
        await requestJson(`/api/admin/community?type=comment&id=${encodeURIComponent(id)}`, { method: "DELETE" });
        adminCommentsData = adminCommentsData.filter((c) => String(c.id) !== String(id));
        renderAdminComments(adminCommentsData);
        if (els.statTotalComments) {
          els.statTotalComments.textContent = Number(adminCommentsData.length).toLocaleString("vi-VN");
        }
        setStatus("✓ Đã xóa bình luận thành công.");
      } catch (err) {
        alert(`Lỗi khi xóa bình luận: ${err.message}`);
        btn.disabled = false;
        btn.textContent = "Xóa";
      }
    });
  });
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

// ---- Admin Books Catalog & Bilingual QA Editor -----------------------------

function cleanBookId(rawId) {
  if (!rawId) return "";
  let id = String(rawId).replace(/^(cdn|library):/, "").split(":")[0];
  const match = id.match(/--([A-Za-z0-9._-]+)$/);
  return match ? match[1] : id;
}

function shouldProxyReaderCdn() {
  if (typeof window === "undefined") return false;
  return window.location.hostname !== "tram-chu.online";
}

function readerContentUrl(url) {
  if (!shouldProxyReaderCdn()) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    const cdn = new URL(CDN_BASE);
    if (parsed.origin !== cdn.origin) return url;
    const key = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    return `/api/reader/content?key=${encodeURIComponent(key)}`;
  } catch {
    return url;
  }
}

function readerContentProxyUrl(url) {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://tram-chu.online");
    const cdn = new URL(CDN_BASE);
    if (parsed.origin === cdn.origin || parsed.pathname.startsWith("/books/") || parsed.pathname.startsWith("/catalog/")) {
      const key = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      return `/api/reader/content?key=${encodeURIComponent(key)}`;
    }
  } catch {}
  return "";
}

async function fetchCdnOrProxy(url, options) {
  const primaryUrl = readerContentUrl(url);
  try {
    const response = await fetch(primaryUrl, options);
    if (response.ok) return response;
  } catch {}

  const proxy = readerContentProxyUrl(url);
  if (proxy && proxy !== primaryUrl) {
    try {
      const response = await fetch(proxy, options);
      if (response.ok) return response;
    } catch {}
  }

  try {
    const separator = url.includes("?") ? "&" : "?";
    const bustUrl = `${url}${separator}_t=${Date.now()}`;
    const response = await fetch(readerContentUrl(bustUrl), options);
    if (response.ok) return response;
  } catch {}

  throw new Error("Không tải được nội dung từ CDN.");
}

async function fetchBookIndex(bookId) {
  const clean = cleanBookId(bookId);
  if (!clean) return null;
  const cdnIndexUrl = `${CDN_BASE}/books/${encodeURIComponent(clean)}/index.json?_v=${Date.now()}`;
  try {
    const res = await fetchCdnOrProxy(cdnIndexUrl);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("fetchBookIndex error:", err);
    return null;
  }
}

const bilingualState = {
  activeBook: null,
  chapters: [],
  currentChapterIndex: 0,
  isZhLoading: false,
  isViLoading: false,
  isSaving: false
};

function renderAdminBooksCatalog() {
  if (!els.booksTbody) return;
  const books = adminCatalog.books || [];
  const query = (els.booksSearch?.value || "").toLowerCase().trim();

  const filtered = query
    ? books.filter((b) =>
        (b.title || "").toLowerCase().includes(query) ||
        (b.author || "").toLowerCase().includes(query) ||
        (b.genre || "").toLowerCase().includes(query)
      )
    : books;

  if (!filtered.length) {
    els.booksTbody.innerHTML = '<tr><td colspan="6" class="stats-empty">' + (query ? 'Không tìm thấy truyện phù hợp.' : 'Chưa có truyện nào trong thư viện.') + '</td></tr>';
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach((book) => {
    const tr = document.createElement("tr");

    // 1. Cover
    const tdCover = document.createElement("td");
    const img = document.createElement("img");
    img.src = book.cover || "/library/covers/misty-pagoda-hero.webp";
    img.alt = "";
    img.className = "admin-book-thumb";
    img.loading = "lazy";
    tdCover.appendChild(img);
    tr.appendChild(tdCover);

    // 2. Title & Author
    const tdTitle = document.createElement("td");
    tdTitle.className = "admin-book-title-cell";
    const strong = document.createElement("strong");
    strong.textContent = book.title || "Chưa có tên";
    if (book.featured) {
      const featBadge = document.createElement("span");
      featBadge.className = "admin-book-genre-pill";
      featBadge.style.cssText = "background: rgba(245, 158, 11, 0.15); color: #f59e0b; margin-left: 0.4rem; display: inline-block;";
      featBadge.textContent = "⭐ Nổi bật";
      strong.appendChild(featBadge);
    }
    const spanAuthor = document.createElement("span");
    spanAuthor.textContent = book.author ? ("Tác giả: " + book.author) : "Chưa rõ tác giả";
    tdTitle.appendChild(strong);
    tdTitle.appendChild(spanAuthor);
    tr.appendChild(tdTitle);

    // 3. Genre
    const tdGenre = document.createElement("td");
    if (book.genre) {
      const genrePill = document.createElement("span");
      genrePill.className = "admin-book-genre-pill";
      genrePill.textContent = book.genre;
      tdGenre.appendChild(genrePill);
    } else {
      tdGenre.textContent = "—";
    }
    tr.appendChild(tdGenre);

    // 4. Progress
    const tdProgress = document.createElement("td");
    const total = Number(book.chapterCount || book.totalChapters || 0);
    const translated = Number(book.translatedChapters || 0);
    const pct = total > 0 ? Math.min(100, Math.round((translated / total) * 100)) : 0;

    const progBox = document.createElement("div");
    progBox.className = "admin-book-progress-bar";
    const progLabel = document.createElement("small");
    progLabel.textContent = translated.toLocaleString("vi-VN") + "/" + total.toLocaleString("vi-VN") + " (" + pct + "%)";
    const track = document.createElement("div");
    track.className = "admin-book-progress-track";
    const fill = document.createElement("div");
    fill.className = "admin-book-progress-fill";
    fill.style.width = pct + "%";
    track.appendChild(fill);
    progBox.appendChild(progLabel);
    progBox.appendChild(track);
    tdProgress.appendChild(progBox);
    tr.appendChild(tdProgress);

    // 5. Status
    const tdStatus = document.createElement("td");
    tdStatus.textContent = book.status || "Đang cập nhật";
    tr.appendChild(tdStatus);

    // 6. Actions
    const tdActions = document.createElement("td");
    tdActions.className = "admin-book-actions-cell";

    // Bilingual QA Button
    const btnBilingual = document.createElement("button");
    btnBilingual.type = "button";
    btnBilingual.className = "admin-book-btn bilingual-btn";
    btnBilingual.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg> Biên tập Song ngữ';
    btnBilingual.addEventListener("click", () => openBilingualEditor(book));
    tdActions.appendChild(btnBilingual);

    // EPUB Download Button
    const btnEpub = document.createElement("button");
    btnEpub.type = "button";
    btnEpub.className = "admin-book-btn epub-btn";
    btnEpub.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Tải EPUB';
    btnEpub.title = "Tải toàn bộ bản dịch định dạng EPUB";
    btnEpub.addEventListener("click", () => exportBookToEpub(book));
    tdActions.appendChild(btnEpub);

    // Edit Metadata Button
    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "admin-book-btn edit-btn";
    btnEdit.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Sửa';
    btnEdit.addEventListener("click", () => openEditBookDialog(book));
    tdActions.appendChild(btnEdit);

    // Delete Button
    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "admin-book-btn delete-btn";
    btnDelete.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg> Xóa';
    btnDelete.addEventListener("click", () => deleteBookPrompt(book));
    tdActions.appendChild(btnDelete);

    tr.appendChild(tdActions);
    fragment.appendChild(tr);
  });

  els.booksTbody.replaceChildren(fragment);
}

async function loadAdminBooksCatalog() {
  if (els.bilingualView) els.bilingualView.hidden = true;
  if (els.booksListView) els.booksListView.hidden = false;
  await loadAdminCatalog();
  renderAdminBooksCatalog();
}

async function openBilingualEditor(book, startChapterIndex = null) {
  bilingualState.activeBook = book;

  if (els.booksListView) els.booksListView.hidden = true;
  if (els.bilingualView) els.bilingualView.hidden = false;

  if (els.adminBilingualBookTitle) els.adminBilingualBookTitle.textContent = book.title || "Truyện";
  const total = Number(book.chapterCount || book.totalChapters || 0);
  if (els.adminBilingualBookMeta) {
    els.adminBilingualBookMeta.textContent = (book.author ? ("Tác giả: " + book.author + " · ") : "") + total.toLocaleString("vi-VN") + " chương";
  }

  // Load index to get chapters
  const cleanId = cleanBookId(book.id);
  try {
    const idx = await fetchBookIndex(cleanId);
    bilingualState.chapters = Array.isArray(idx?.chapters) ? idx.chapters : [];
  } catch {
    bilingualState.chapters = [];
  }

  let initialIndex = 0;
  if (typeof startChapterIndex === "number") {
    initialIndex = startChapterIndex;
  } else if (bilingualState.chapters.length) {
    const storyIdx = bilingualState.chapters.findIndex((c) => /chương|第|hồi/i.test(c.title || ""));
    initialIndex = storyIdx >= 0 ? storyIdx : 0;
  }
  bilingualState.currentChapterIndex = initialIndex;

  renderBilingualChapterSelect();
  loadBilingualChapter(initialIndex);
}

function closeBilingualEditor() {
  if (els.bilingualView) els.bilingualView.hidden = true;
  if (els.booksListView) els.booksListView.hidden = false;
  loadAdminBooksCatalog();
}

function handleBilingualJump() {
  if (!els.bilingualJumpInput) return;
  const val = parseInt(els.bilingualJumpInput.value, 10);
  if (isNaN(val) || val < 1) return;
  const total = bilingualState.chapters.length || 1;
  const targetNumber = Math.max(1, Math.min(val, total));
  let targetIndex = bilingualState.chapters.findIndex((c) => c.n === targetNumber);
  if (targetIndex < 0) targetIndex = targetNumber - 1;
  loadBilingualChapter(targetIndex);
}

function renderBilingualChapterSelect() {
  if (!els.bilingualChSelect) return;
  const fragment = document.createDocumentFragment();
  const total = bilingualState.chapters.length || 1;

  if (els.bilingualJumpInput) {
    els.bilingualJumpInput.max = String(total);
  }
  if (els.bilingualTotalChText) {
    els.bilingualTotalChText.textContent = "/ " + total.toLocaleString("vi-VN");
  }

  if (!bilingualState.chapters.length) {
    const opt = document.createElement("option");
    opt.value = "0";
    opt.textContent = "Chương 1 (Mặc định)";
    fragment.appendChild(opt);
  } else {
    bilingualState.chapters.forEach((ch, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      const isDone = ch.status === "completed";
      const chNum = ch.n || i + 1;
      const titleText = ch.title ? (ch.title.startsWith("Chương") ? ch.title : "Chương " + chNum + ": " + ch.title) : "Chương " + chNum;
      opt.textContent = titleText + " " + (isDone ? "✓ [Đã dịch]" : "⏳ [Chờ dịch]");
      fragment.appendChild(opt);
    });
  }

  els.bilingualChSelect.replaceChildren(fragment);
  els.bilingualChSelect.value = String(bilingualState.currentChapterIndex);
}

async function loadBilingualChapter(index) {
  const book = bilingualState.activeBook;
  if (!book) return;
  const totalChapters = bilingualState.chapters.length || 1;
  const chIdx = Math.max(0, Math.min(index, totalChapters - 1));
  bilingualState.currentChapterIndex = chIdx;

  if (els.bilingualChSelect) els.bilingualChSelect.value = String(chIdx);
  if (els.adminBilingualPrevCh) els.adminBilingualPrevCh.disabled = chIdx <= 0;
  if (els.adminBilingualNextCh) els.adminBilingualNextCh.disabled = chIdx >= totalChapters - 1;

  const chObj = bilingualState.chapters[chIdx] || { n: chIdx + 1, title: ("Chương " + (chIdx + 1)) };
  const chapterNumber = chObj.n || chIdx + 1;
  const cleanId = cleanBookId(book.id);

  if (els.bilingualJumpInput) els.bilingualJumpInput.value = String(chapterNumber);

  // 1. Fetch Chinese Original
  if (els.adminBilingualZhTitle) els.adminBilingualZhTitle.value = "Đang tải...";
  if (els.adminBilingualZhContent) els.adminBilingualZhContent.textContent = "Đang tải nội dung tiếng Trung...";
  if (els.adminBilingualZhCharCount) els.adminBilingualZhCharCount.textContent = "0 ký tự chữ Hán";

  // 2. Fetch Vietnamese Translation
  if (els.adminBilingualViTitle) els.adminBilingualViTitle.value = "Đang tải...";
  if (els.adminBilingualViTextarea) els.adminBilingualViTextarea.value = "Đang tải bản dịch...";
  updateBilingualViCounts("");

  const zhUrl = `${CDN_BASE}/books/${encodeURIComponent(cleanId)}/r1/ch/${chapterNumber}.original.json?_v=${Date.now()}`;
  const viUrl = `${CDN_BASE}/books/${encodeURIComponent(cleanId)}/r1/ch/${chapterNumber}.json?_v=${Date.now()}`;

  const [zhRes, viRes] = await Promise.all([
    fetchCdnOrProxy(zhUrl).catch(() => null),
    fetchCdnOrProxy(viUrl).catch(() => null)
  ]);

  // Render ZH
  if (zhRes && zhRes.ok) {
    const zhData = await zhRes.json().catch(() => ({}));
    if (els.adminBilingualZhTitle) els.adminBilingualZhTitle.value = zhData.title || chObj.title || ("Chương " + chapterNumber);
    const zhText = zhData.content || "";
    if (els.adminBilingualZhContent) els.adminBilingualZhContent.textContent = zhText;
    if (els.adminBilingualZhCharCount) els.adminBilingualZhCharCount.textContent = zhText.length.toLocaleString("vi-VN") + " ký tự chữ Hán";
  } else {
    if (els.adminBilingualZhTitle) els.adminBilingualZhTitle.value = chObj.title || ("Chương " + chapterNumber);
    if (els.adminBilingualZhContent) els.adminBilingualZhContent.textContent = "(Không tìm thấy bản tiếng Trung gốc trong R2 Archive)";
  }

  // Render VI
  if (viRes && viRes.ok) {
    const viData = await viRes.json().catch(() => ({}));
    if (els.adminBilingualViTitle) els.adminBilingualViTitle.value = viData.title || chObj.title || ("Chương " + chapterNumber);
    const viText = viData.content || "";
    if (els.adminBilingualViTextarea) els.adminBilingualViTextarea.value = viText;
    updateBilingualViCounts(viText);
    if (els.adminBilingualViStatusBadge) {
      const isDone = viData.translationStatus === "completed" || viData.status === "completed";
      els.adminBilingualViStatusBadge.textContent = isDone ? "Đã dịch" : "Chờ dịch";
      els.adminBilingualViStatusBadge.className = "status-pill " + (isDone ? "completed" : "pending");
    }
  } else {
    if (els.adminBilingualViTitle) els.adminBilingualViTitle.value = chObj.title || ("Chương " + chapterNumber);
    if (els.adminBilingualViTextarea) els.adminBilingualViTextarea.value = "";
    updateBilingualViCounts("");
  }
}

function updateBilingualViCounts(text) {
  const str = String(text || "");
  const chars = str.length;
  const words = str.trim() ? str.trim().split(/\s+/).length : 0;
  if (els.adminBilingualViCharCount) els.adminBilingualViCharCount.textContent = chars.toLocaleString("vi-VN") + " ký tự";
  if (els.adminBilingualViWordCount) els.adminBilingualViWordCount.textContent = words.toLocaleString("vi-VN") + " từ";
}

async function saveBilingualChapter() {
  const book = bilingualState.activeBook;
  if (!book) return;
  const chIdx = bilingualState.currentChapterIndex;
  const chObj = bilingualState.chapters[chIdx] || { n: chIdx + 1 };
  const chapterNumber = chObj.n || chIdx + 1;
  const cleanId = cleanBookId(book.id);

  const title = String(els.adminBilingualViTitle?.value || "").trim();
  const content = String(els.adminBilingualViTextarea?.value || "").trim();

  if (!content) {
    alert("Nội dung chương không được để trống.");
    return;
  }

  if (els.bilingualSaveBtn) {
    els.bilingualSaveBtn.disabled = true;
    els.bilingualSaveBtn.textContent = "Đang lưu lên R2...";
  }

  try {
    const res = await requestJson("/api/admin/chapter-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: cleanId,
        chapterNumber,
        revision: 1,
        title,
        content,
        status: "completed"
      })
    });

    if (res.ok) {
      if (els.bilingualSaveNotice) {
        els.bilingualSaveNotice.hidden = false;
        setTimeout(() => { if (els.bilingualSaveNotice) els.bilingualSaveNotice.hidden = true; }, 3000);
      }
      if (bilingualState.chapters[chIdx]) {
        bilingualState.chapters[chIdx].status = "completed";
        bilingualState.chapters[chIdx].title = title;
        renderBilingualChapterSelect();
      }
    }
  } catch (err) {
    alert("Lỗi khi lưu chương: " + err.message);
  } finally {
    if (els.bilingualSaveBtn) {
      els.bilingualSaveBtn.disabled = false;
      els.bilingualSaveBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Lưu bản dịch lên R2';
    }
  }
}

async function aiTranslateBilingualChapter() {
  const zhText = String(els.adminBilingualZhContent?.textContent || "").trim();
  if (!zhText || zhText.startsWith("(") || zhText.startsWith("Đang tải")) {
    alert("Chưa có văn bản tiếng Trung gốc để dịch.");
    return;
  }

  if (els.bilingualAiTranslate) {
    els.bilingualAiTranslate.disabled = true;
    els.bilingualAiTranslate.textContent = "🤖 AI đang dịch...";
  }

  try {
    const res = await requestJson("/api/admin/gemini-translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: zhText,
        title: els.adminBilingualZhTitle?.value || "",
        model: normalizeStudioModel(els.studioGeminiModel?.value || DEFAULT_STUDIO_MODEL)
      })
    });

    if (res.translation) {
      if (els.adminBilingualViTextarea) {
        els.adminBilingualViTextarea.value = res.translation;
        updateBilingualViCounts(res.translation);
      }
      alert("Đã dịch xong chương bằng AI! Bạn có thể kiểm tra, chỉnh sửa câu từ và bấm 'Lưu bản dịch lên R2'.");
    }
  } catch (err) {
    alert("Lỗi AI dịch: " + err.message);
  } finally {
    if (els.bilingualAiTranslate) {
      els.bilingualAiTranslate.disabled = false;
      els.bilingualAiTranslate.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z"/></svg> <span>Dịch lại bằng AI</span>';
    }
  }
}

let epubExportAbort = false;

function showExportEpubModal(bookTitle, metaText) {
  epubExportAbort = false;
  if (els.exportEpubBookTitle) els.exportEpubBookTitle.textContent = bookTitle || "Đang xuất EPUB";
  if (els.exportEpubBookMeta) els.exportEpubBookMeta.textContent = metaText || "Đang chuẩn bị danh mục chương...";
  if (els.exportEpubProgressBar) els.exportEpubProgressBar.style.width = "0%";
  if (els.exportEpubProgressText) els.exportEpubProgressText.textContent = "0%";
  if (els.exportEpubPercentText) els.exportEpubPercentText.textContent = "0%";
  if (els.exportEpubStatus) els.exportEpubStatus.textContent = "Đang kết nối CDN máy chủ...";
  if (els.exportEpubCancel) {
    els.exportEpubCancel.textContent = "Hủy tải";
    els.exportEpubCancel.disabled = false;
  }
  if (els.exportEpubDialog && !els.exportEpubDialog.open) {
    els.exportEpubDialog.showModal();
  }
}

function updateExportEpubProgress(current, total, statusText) {
  const pct = Math.min(100, Math.max(0, Math.round((current / (total || 1)) * 100)));
  if (els.exportEpubProgressBar) els.exportEpubProgressBar.style.width = `${pct}%`;
  if (els.exportEpubProgressText) els.exportEpubProgressText.textContent = `${current.toLocaleString("vi-VN")} / ${total.toLocaleString("vi-VN")} chương`;
  if (els.exportEpubPercentText) els.exportEpubPercentText.textContent = `${pct}%`;
  if (statusText && els.exportEpubStatus) els.exportEpubStatus.textContent = statusText;
}

function closeExportEpubModal() {
  if (els.exportEpubDialog && els.exportEpubDialog.open) {
    els.exportEpubDialog.close();
  }
}

function cancelEpubExport() {
  epubExportAbort = true;
  if (els.exportEpubStatus) els.exportEpubStatus.textContent = "Đang hủy tiến trình...";
  setTimeout(() => {
    closeExportEpubModal();
  }, 300);
}

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sanitizeFilename(name) {
  return (name || "truyen")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

async function exportBookToEpub(book) {
  if (!book || !book.id) {
    alert("Không xác định được thông tin truyện.");
    return;
  }

  const cleanId = cleanBookId(book.id);
  const bookTitle = book.title || "Truyện";
  const bookAuthor = book.author || "Khuyết danh";

  showExportEpubModal(bookTitle, `Tác giả: ${bookAuthor}`);

  try {
    // 1. Fetch index to know chapters
    let chapters = [];
    if (bilingualState.activeBook && cleanBookId(bilingualState.activeBook.id) === cleanId && bilingualState.chapters.length > 0) {
      chapters = bilingualState.chapters;
    } else {
      updateExportEpubProgress(0, 100, "Đang tải danh mục chương từ CDN...");
      const idx = await fetchBookIndex(cleanId);
      chapters = Array.isArray(idx?.chapters) ? idx.chapters : [];
    }

    if (!chapters || chapters.length === 0) {
      throw new Error("Không tìm thấy danh sách chương của bộ truyện này trên hệ thống.");
    }

    // Determine target chapters to download
    // Prefer completed chapters if marked
    const hasCompletedFlag = chapters.some((c) => c.status === "completed");
    let targetList = hasCompletedFlag ? chapters.filter((c) => c.status === "completed") : chapters;
    if (targetList.length === 0) targetList = chapters;

    // Sort by chapter number
    targetList.sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0));
    const totalChapters = targetList.length;

    updateExportEpubProgress(0, totalChapters, `Bắt đầu tải ${totalChapters} chương bản dịch...`);

    // 2. Concurrently fetch chapter JSONs
    const concurrency = 15;
    const downloadedChapters = new Array(totalChapters);
    let nextIndex = 0;
    let completedCount = 0;

    async function downloadWorker() {
      while (nextIndex < totalChapters && !epubExportAbort) {
        const i = nextIndex++;
        const chItem = targetList[i];
        const chNum = chItem.n || (i + 1);
        const url = `${CDN_BASE}/books/${encodeURIComponent(cleanId)}/r1/ch/${chNum}.json?_v=${Date.now()}`;

        try {
          const res = await fetchCdnOrProxy(url);
          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            const content = data?.content || data?.text || "";
            if (content.trim()) {
              downloadedChapters[i] = {
                n: chNum,
                title: data.title || chItem.title || `Chương ${chNum}`,
                content: content.trim()
              };
            }
          }
        } catch (err) {
          console.warn(`Lỗi tải dữ liệu chương ${chNum}:`, err);
        }

        completedCount++;
        if (completedCount % 5 === 0 || completedCount === totalChapters) {
          updateExportEpubProgress(completedCount, totalChapters, `Đang tải nội dung chương ${chNum} (${completedCount}/${totalChapters})...`);
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, totalChapters) }, () => downloadWorker());
    await Promise.all(workers);

    if (epubExportAbort) return;

    // Filter valid chapters
    const validChapters = downloadedChapters.filter(Boolean);
    if (validChapters.length === 0) {
      throw new Error("Không có chương nào có nội dung bản dịch hợp lệ để xuất file EPUB.");
    }

    updateExportEpubProgress(totalChapters, totalChapters, "Đang nạp công cụ đóng gói EPUB...");

    // 3. Load JSZip
    const JSZip = await getJsZipModule();
    const zip = new JSZip();

    // EPUB specification: mimetype MUST be uncompressed STORE and first
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    // META-INF/container.xml
    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    // OEBPS/style.css
    const cssContent = `@charset "utf-8";
body {
  font-family: "Times New Roman", Times, Georgia, serif;
  line-height: 1.68;
  margin: 5%;
  text-align: justify;
  color: #111827;
}
h1.book-title {
  text-align: center;
  margin-top: 20%;
  margin-bottom: 0.5em;
  font-size: 2.2em;
  font-weight: bold;
}
p.book-author {
  text-align: center;
  font-size: 1.25em;
  color: #374151;
  margin-bottom: 2em;
}
p.book-meta {
  text-align: center;
  font-size: 0.92em;
  color: #6b7280;
  margin-top: 2em;
}
h2.chapter-title {
  text-align: center;
  margin-top: 1.5em;
  margin-bottom: 1.2em;
  font-size: 1.45em;
  font-weight: bold;
  page-break-before: always;
}
p.chapter-paragraph {
  text-indent: 1.8em;
  margin-top: 0;
  margin-bottom: 0.85em;
  text-align: justify;
}
.cover-container {
  text-align: center;
  margin: 0;
  padding: 0;
}
.cover-container img {
  max-width: 100%;
  max-height: 100vh;
  object-fit: contain;
}
`;
    zip.file("OEBPS/style.css", cssContent);

    // Cover image handling
    let hasCover = false;
    let coverExt = "jpg";
    let coverMediaType = "image/jpeg";
    if (book.cover) {
      updateExportEpubProgress(totalChapters, totalChapters, "Đang tải ảnh bìa truyện...");
      try {
        const coverRes = await fetch(readerContentUrl(book.cover));
        if (coverRes && coverRes.ok) {
          const coverBuf = await coverRes.arrayBuffer();
          if (coverBuf && coverBuf.byteLength > 0) {
            const ct = coverRes.headers.get("content-type") || "";
            if (ct.includes("png")) {
              coverExt = "png";
              coverMediaType = "image/png";
            } else if (ct.includes("webp")) {
              coverExt = "webp";
              coverMediaType = "image/webp";
            }
            zip.file(`OEBPS/cover.${coverExt}`, coverBuf);
            hasCover = true;
          }
        }
      } catch (e) {
        console.warn("Không tải được ảnh bìa:", e);
      }
    }

    // Cover page (if cover image exists)
    if (hasCover) {
      zip.file(
        "OEBPS/cover.xhtml",
        `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="vi" xml:lang="vi">
<head>
  <title>Bìa sách</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body style="margin:0;padding:0;text-align:center;">
  <div class="cover-container">
    <img src="cover.${coverExt}" alt="Bìa sách" />
  </div>
</body>
</html>`
      );
    }

    // Title page
    const dateStr = new Date().toLocaleDateString("vi-VN");
    zip.file(
      "OEBPS/titlepage.xhtml",
      `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="vi" xml:lang="vi">
<head>
  <title>${escapeXml(bookTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1 class="book-title">${escapeXml(bookTitle)}</h1>
  <p class="book-author">Tác giả: ${escapeXml(bookAuthor)}</p>
  <p class="book-meta">Dịch &amp; Biên tập bởi Trạm Chữ (tram-chu.online)</p>
  <p class="book-meta">Quy mô: ${validChapters.length.toLocaleString("vi-VN")} chương dịch</p>
  <p class="book-meta" style="font-size:0.82em;margin-top:4em;">Thời gian xuất bản: ${escapeXml(dateStr)}</p>
</body>
</html>`
    );

    // 4. Chapter XHTML files
    updateExportEpubProgress(totalChapters, totalChapters, "Đang định dạng các chương XHTML...");

    validChapters.forEach((ch, idx) => {
      const paras = ch.content.split(/\r?\n+/);
      const parasHtml = paras
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `  <p class="chapter-paragraph">${escapeXml(p)}</p>`)
        .join("\n");

      const chXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="vi" xml:lang="vi">
<head>
  <title>${escapeXml(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2 class="chapter-title">${escapeXml(ch.title)}</h2>
${parasHtml}
</body>
</html>`;
      zip.file(`OEBPS/chap-${idx + 1}.xhtml`, chXhtml);
    });

    // 5. Navigation: nav.xhtml (EPUB 3) & toc.ncx (EPUB 2)
    const navOl = validChapters
      .map((ch, idx) => `      <li><a href="chap-${idx + 1}.xhtml">${escapeXml(ch.title)}</a></li>`)
      .join("\n");

    zip.file(
      "OEBPS/nav.xhtml",
      `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="vi" xml:lang="vi">
<head>
  <title>Mục lục</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Mục lục</h1>
    <ol>
${navOl}
    </ol>
  </nav>
</body>
</html>`
    );

    const ncxPoints = validChapters
      .map(
        (ch, idx) => `    <navPoint id="navpoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
      <content src="chap-${idx + 1}.xhtml"/>
    </navPoint>`
      )
      .join("\n");

    zip.file(
      "OEBPS/toc.ncx",
      `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:tramchu:book:${escapeXml(cleanId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(bookTitle)}</text>
  </docTitle>
  <navMap>
${ncxPoints}
  </navMap>
</ncx>`
    );

    // 6. content.opf
    const manifestItems = [
      `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
      `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `    <item id="style" href="style.css" media-type="text/css"/>`,
      `    <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>`
    ];

    if (hasCover) {
      manifestItems.push(`    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
      manifestItems.push(`    <item id="cover-image" href="cover.${coverExt}" media-type="${coverMediaType}" properties="cover-image"/>`);
    }

    validChapters.forEach((_, idx) => {
      manifestItems.push(`    <item id="chap-${idx + 1}" href="chap-${idx + 1}.xhtml" media-type="application/xhtml+xml"/>`);
    });

    const spineItems = [];
    if (hasCover) {
      spineItems.push(`    <itemref idref="cover-page"/>`);
    }
    spineItems.push(`    <itemref idref="titlepage"/>`);
    validChapters.forEach((_, idx) => {
      spineItems.push(`    <itemref idref="chap-${idx + 1}"/>`);
    });

    const nowIso = new Date().toISOString();
    const opfXml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">urn:tramchu:book:${escapeXml(cleanId)}</dc:identifier>
    <dc:title>${escapeXml(bookTitle)}</dc:title>
    <dc:language>vi</dc:language>
    <dc:creator>${escapeXml(bookAuthor)}</dc:creator>
    <dc:publisher>Trạm Chữ (tram-chu.online)</dc:publisher>
    <meta property="dcterms:modified">${nowIso}</meta>
    ${hasCover ? '<meta name="cover" content="cover-image"/>' : ""}
  </metadata>
  <manifest>
${manifestItems.join("\n")}
  </manifest>
  <spine toc="ncx">
${spineItems.join("\n")}
  </spine>
</package>`;

    zip.file("OEBPS/content.opf", opfXml);

    // 7. Generate EPUB Zip Blob
    updateExportEpubProgress(totalChapters, totalChapters, "Đang nén toàn bộ ebook thành file EPUB...");
    if (els.exportEpubCancel) els.exportEpubCancel.disabled = true;

    const blob = await zip.generateAsync(
      {
        type: "blob",
        mimeType: "application/epub+zip",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      },
      (meta) => {
        if (meta && typeof meta.percent === "number") {
          const zipPct = Math.round(meta.percent);
          if (els.exportEpubPercentText) els.exportEpubPercentText.textContent = `${zipPct}%`;
          if (els.exportEpubProgressBar) els.exportEpubProgressBar.style.width = `${zipPct}%`;
          if (els.exportEpubStatus) els.exportEpubStatus.textContent = `Đang nén dữ liệu (${zipPct}%)...`;
        }
      }
    );

    updateExportEpubProgress(totalChapters, totalChapters, "✅ Hoàn tất! Trình duyệt đang tải file về...");
    if (els.exportEpubProgressBar) els.exportEpubProgressBar.style.width = "100%";
    if (els.exportEpubPercentText) els.exportEpubPercentText.textContent = "100%";

    // Trigger download
    const cleanFileName = sanitizeFilename(bookTitle);
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${cleanFileName}.epub`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
      a.remove();
      closeExportEpubModal();
    }, 1600);
  } catch (err) {
    console.error("exportBookToEpub error:", err);
    alert("Lỗi xuất file EPUB: " + (err?.message || err));
    closeExportEpubModal();
  }
}

function openEditBookDialog(book) {
  if (!els.bookEditDialog || !els.bookEditForm) return;
  els.editBookId.value = book.id || "";
  els.editBookTitle.value = book.title || "";
  els.editBookAuthor.value = book.author || "";

  const rawGenre = String(book.genre || "").trim();
  if (els.editBookGenre) {
    let matched = false;
    for (const opt of els.editBookGenre.options) {
      if (opt.value.toLowerCase() === rawGenre.toLowerCase() || (rawGenre && (opt.value.toLowerCase().includes(rawGenre.toLowerCase()) || rawGenre.toLowerCase().includes(opt.value.toLowerCase())))) {
        els.editBookGenre.value = opt.value;
        matched = true;
        break;
      }
    }
    if (!matched && rawGenre) {
      const customOpt = document.createElement("option");
      customOpt.value = rawGenre;
      customOpt.textContent = rawGenre;
      els.editBookGenre.appendChild(customOpt);
      els.editBookGenre.value = rawGenre;
    }
  }

  els.editBookStatus.value = book.status || "Đang cập nhật";
  els.editBookChapterCount.value = Number(book.chapterCount || book.totalChapters || 0);
  els.editBookCover.value = book.cover || "";
  els.editBookDescription.value = book.description || "";
  els.editBookFeatured.checked = Boolean(book.featured);
  els.bookEditDialog.showModal();
}

async function handleBookEditSubmit(event) {
  event.preventDefault();
  const id = String(els.editBookId.value || "").trim();
  if (!id) return;

  const payload = {
    id,
    title: els.editBookTitle.value.trim(),
    author: els.editBookAuthor.value.trim(),
    genre: els.editBookGenre.value.trim(),
    status: els.editBookStatus.value,
    cover: els.editBookCover.value.trim(),
    description: els.editBookDescription.value.trim(),
    featured: els.editBookFeatured.checked
  };

  try {
    await requestJson("/api/admin/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    els.bookEditDialog.close();
    await loadAdminBooksCatalog();
    setStatus("Đã cập nhật thông tin truyện thành công!");
  } catch (err) {
    alert("Không thể lưu thông tin truyện: " + err.message);
  }
}

async function deleteBookPrompt(book) {
  if (!book || !book.id) return;
  const confirmed = confirm('Bạn có chắc chắn muốn xóa vĩnh viễn bộ truyện "' + book.title + '" khỏi hệ thống?\nThao tác này sẽ xóa mọi chương trên R2 và Database.');
  if (!confirmed) return;

  try {
    await requestJson("/api/admin/catalog", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: book.id })
    });
    await loadAdminBooksCatalog();
    if (!els.dialog.open) els.dialog.showModal();
    els.dialog.classList.add("is-authenticated");
    selectAdminTab("books");
    setStatus('Đã xóa bộ truyện "' + book.title + '".');
  } catch (err) {
    alert("Không thể xóa truyện: " + err.message);
  } finally {
    // Native confirm can desynchronise Chromium's modal top-layer on mobile.
    // Reassert the dashboard state so no orphan backdrop can cover the UI.
    requestAnimationFrame(() => {
      if (els.dialog?.open) {
        els.dialog.classList.add("is-authenticated");
        els.dialog.style.removeProperty("display");
      }
      document.body.classList.toggle("dialog-open", Boolean(document.querySelector("dialog[open]")));
      document.documentElement.classList.toggle("dialog-open", Boolean(document.querySelector("dialog[open]")));
    });
  }
}

// ============================================================================
// 8. Automated Video Review Generator UI & Queue Manager
// ============================================================================

let videoJobsData = [];
let videoPollingTimer = null;
let currentEditingJobId = null;

function bindVideoReviewEvents() {
  els.videoRefresh?.addEventListener("click", () => loadAdminVideoData());
  els.videoForm?.addEventListener("submit", handleVideoFormSubmit);
  els.videoBookSelect?.addEventListener("change", handleVideoBookSelectChange);
  els.videoScriptClose?.addEventListener("click", () => els.videoScriptDialog?.close());
  els.videoScriptCancelBtn?.addEventListener("click", () => els.videoScriptDialog?.close());
  els.videoScriptSaveBtn?.addEventListener("click", handleVideoScriptSave);
  els.videoScriptApproveBtn?.addEventListener("click", handleVideoScriptApprove);
  els.videoPlayerClose?.addEventListener("click", () => {
    if (els.videoPreviewPlayer) {
      els.videoPreviewPlayer.pause();
      els.videoPreviewPlayer.src = "";
    }
    els.videoPlayerDialog?.close();
  });
}

function startVideoPolling() {
  if (videoPollingTimer) return;
  videoPollingTimer = setInterval(async () => {
    if (activeAdminTab !== "video") {
      stopVideoPolling();
      return;
    }
    await loadAdminVideoData(true);
  }, 4000);
}

function stopVideoPolling() {
  if (videoPollingTimer) {
    clearInterval(videoPollingTimer);
    videoPollingTimer = null;
  }
}

async function loadAdminVideoData(isPoll = false) {
  try {
    if (!isPoll && adminBooksList.length === 0) {
      await loadAdminBooksCatalog();
    }
    populateVideoBookSelect();

    // Fetch jobs & budget
    const data = await requestJson("/api/admin/video/jobs");
    videoJobsData = data.jobs || [];

    // Render budget
    if (data.budget && els.videoDailyBudgetBadge) {
      const b = data.budget;
      els.videoDailyBudgetBadge.textContent = `Hạn mức hôm nay: ${b.count}/${b.maxPerDay} video (còn ${b.remaining})`;
      els.videoDailyBudgetBadge.className = b.remaining > 0 ? "badge badge-info" : "badge badge-warning";
    }

    // Check YouTube connection status
    try {
      const ytData = await requestJson("/api/admin/video/youtube-auth");
      if (els.videoYouTubeBadge) {
        if (ytData.hasToken) {
          els.videoYouTubeBadge.textContent = "YouTube: Đã kết nối";
          els.videoYouTubeBadge.className = "badge badge-success";
          if (els.videoConnectYtBtn) els.videoConnectYtBtn.style.display = "none";
        } else if (ytData.isConfigured && ytData.authUrl) {
          els.videoYouTubeBadge.textContent = "YouTube: Chưa xác thực";
          els.videoYouTubeBadge.className = "badge badge-warning";
          if (els.videoConnectYtBtn) {
            els.videoConnectYtBtn.style.display = "inline-flex";
            els.videoConnectYtBtn.onclick = () => window.open(ytData.authUrl, "_blank");
          }
        } else {
          els.videoYouTubeBadge.textContent = "YouTube: Chưa cấu hình";
          els.videoYouTubeBadge.className = "badge badge-secondary";
          if (els.videoConnectYtBtn) els.videoConnectYtBtn.style.display = "none";
        }
      }
    } catch (_) {}

    renderVideoQueue(videoJobsData);

    // Auto-poll if any job is active
    const hasActive = videoJobsData.some(j =>
      ["pending", "fetching_content", "generating_script", "generating_media", "rendering", "uploading"].includes(j.status)
    );
    if (hasActive) {
      startVideoPolling();
    } else {
      stopVideoPolling();
    }
  } catch (err) {
    if (!isPoll) console.error("Không thể tải danh sách video review:", err.message);
  }
}

function populateVideoBookSelect() {
  if (!els.videoBookSelect) return;
  const currentVal = els.videoBookSelect.value;
  const options = ['<option value="">-- Chọn một truyện trong thư viện --</option>'];
  adminBooksList.forEach(b => {
    options.push(`<option value="${escapeHtml(b.id)}">${escapeHtml(b.title)} (${escapeHtml(b.author || "Khuyết danh")})</option>`);
  });
  els.videoBookSelect.innerHTML = options.join("");
  if (currentVal) els.videoBookSelect.value = currentVal;
}

function handleVideoBookSelectChange() {
  const bookId = els.videoBookSelect?.value;
  if (!bookId) return;
  const book = adminBooksList.find(b => b.id === bookId);
  if (book && els.videoStartChapter && els.videoEndChapter) {
    els.videoStartChapter.value = 1;
    const maxCh = book.totalChapters || 5;
    els.videoEndChapter.value = Math.min(maxCh, 5);
  }
}

async function handleVideoFormSubmit(e) {
  e.preventDefault();
  const bookId = els.videoBookSelect.value;
  if (!bookId) {
    alert("Vui lòng chọn một tác phẩm truyện.");
    return;
  }

  const payload = {
    bookId,
    startChapter: Number(els.videoStartChapter.value) || 1,
    endChapter: Number(els.videoEndChapter.value) || 5,
    mode: els.videoMode.value,
    tone: els.videoTone.value,
    voice: els.videoVoice.value,
    aspectRatio: els.videoAspectRatio?.value || "9:16",
    enableAiVisuals: Boolean(els.videoAiVisuals?.checked),
    autoApprove: Boolean(els.videoAutoApprove?.checked),
    autoUploadYouTube: Boolean(els.videoAutoUploadYt?.checked)
  };

  els.videoSubmitBtn.disabled = true;
  els.videoSubmitBtn.textContent = "⏳ Đang khởi tạo...";

  try {
    const job = await requestJson("/api/admin/video/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setStatus(`Đã tạo yêu cầu Video Review (${job.id}) thành công!`);
    await loadAdminVideoData();
  } catch (err) {
    alert("Lỗi tạo video review: " + err.message);
  } finally {
    els.videoSubmitBtn.disabled = false;
    els.videoSubmitBtn.textContent = "🚀 Bắt đầu tạo Video Review";
  }
}

function renderVideoQueue(jobs) {
  if (!els.videoQueueList) return;
  if (!jobs || jobs.length === 0) {
    els.videoQueueList.innerHTML = '<p class="empty-hint">Chưa có job tạo video nào. Hãy tạo video đầu tiên từ cột bên trái!</p>';
    return;
  }

  const statusMap = {
    pending: { label: "Đang chờ", class: "badge-status-pending" },
    fetching_content: { label: "Nạp dữ liệu", class: "badge-status-rendering" },
    generating_script: { label: "Viết kịch bản", class: "badge-status-rendering" },
    waiting_approval: { label: "Chờ duyệt kịch bản", class: "badge-status-waiting" },
    generating_media: { label: "Thu âm & Hình ảnh", class: "badge-status-rendering" },
    rendering: { label: "Render MP4", class: "badge-status-rendering" },
    ready: { label: "Đã xong (MP4)", class: "badge-status-ready" },
    uploading: { label: "Upload YouTube", class: "badge-status-rendering" },
    completed: { label: "Hoàn tất", class: "badge-status-completed" },
    error: { label: "Lỗi", class: "badge-status-error" },
    canceled: { label: "Đã hủy", class: "badge-status-error" }
  };

  const html = jobs.map(j => {
    const st = statusMap[j.status] || { label: j.status, class: "badge-status-pending" };
    const pct = j.progress || 0;
    const book = adminBooksList.find(b => b.id === j.bookId);
    const bookTitle = book?.title || j.bookId;
    const chRange = `Chương ${j.chapterRange?.start || 1} - ${j.chapterRange?.end || 5}`;

    let actions = "";
    actions += `<button class="secondary-action btn-sm" onclick="openScriptEditorModal('${escapeHtml(j.id)}')">📝 Xem/Sửa kịch bản</button>`;

    if (j.status === "waiting_approval") {
      actions += `<button class="primary-action btn-sm highlight-btn" onclick="handleVideoApproveJob('${escapeHtml(j.id)}')">✓ Duyệt render</button>`;
    }

    if (j.status === "ready" || j.status === "completed" || j.assets?.videoUrl) {
      actions += `<button class="primary-action btn-sm" onclick="openVideoPlayerModal('${escapeHtml(j.id)}')">▶ Xem Video</button>`;
      if (j.assets?.videoUrl) {
        actions += `<a class="secondary-action btn-sm" href="${escapeHtml(j.assets.videoUrl)}" download>⬇ MP4</a>`;
      }
      if (j.assets?.subtitlesUrl) {
        actions += `<a class="secondary-action btn-sm" href="${escapeHtml(j.assets.subtitlesUrl)}" download>⬇ SRT</a>`;
      }
      if (!j.youtube?.videoId) {
        actions += `<button class="secondary-action btn-sm" onclick="handleVideoUploadToYouTube('${escapeHtml(j.id)}')">↗ YouTube (Private)</button>`;
      }
    }

    if (j.youtube?.videoId) {
      actions += `<a class="secondary-action btn-sm" href="https://www.youtube.com/watch?v=${escapeHtml(j.youtube.videoId)}" target="_blank">📺 Xem trên YouTube</a>`;
    }

    if (j.status === "error") {
      actions += `<button class="secondary-action btn-sm" onclick="handleVideoRetryJob('${escapeHtml(j.id)}')">↻ Thử lại</button>`;
    }

    if (["pending", "waiting_approval", "error"].includes(j.status)) {
      actions += `<button class="secondary-action btn-sm" style="color:#f87171" onclick="handleVideoCancelJob('${escapeHtml(j.id)}')">✕ Hủy</button>`;
    }

    return `
      <div class="video-job-item">
        <div class="video-job-header">
          <div>
            <div class="video-job-title">${escapeHtml(bookTitle)}</div>
            <div class="video-job-meta">
              <span>${escapeHtml(chRange)}</span>
              <span>•</span>
              <span>${j.options?.mode === "teaser" ? "Teaser" : "Summary Review"}</span>
              <span>•</span>
              <span>Giọng ${j.options?.voice === "male" ? "Nam" : "Nữ"}</span>
            </div>
          </div>
          <span class="badge ${st.class}">${escapeHtml(st.label)}</span>
        </div>

        <div class="video-job-progress">
          <div class="video-job-progress-fill" style="width: ${pct}%"></div>
        </div>

        <div style="font-size:0.8rem;color:var(--text-muted);display:flex;justify-content:space-between;">
          <span>${escapeHtml(j.stageMessage || "")}</span>
          <span>${pct}%</span>
        </div>

        <div class="video-job-actions">
          ${actions}
        </div>
      </div>
    `;
  }).join("");

  els.videoQueueList.innerHTML = html;
}

window.openScriptEditorModal = async function(jobId) {
  currentEditingJobId = jobId;
  try {
    const job = await requestJson(`/api/admin/video/jobs/${encodeURIComponent(jobId)}`);
    if (!job) return;

    const script = job.script || { title: "", summary: "", scenes: [] };
    if (els.videoScriptEditTitle) els.videoScriptEditTitle.value = script.title || "";
    if (els.videoScriptEditSummary) els.videoScriptEditSummary.value = script.summary || "";

    if (els.videoScriptScenesList) {
      if (!script.scenes || script.scenes.length === 0) {
        els.videoScriptScenesList.innerHTML = '<p class="empty-hint">Kịch bản chưa được tạo. Khi worker chạy xong giai đoạn viết kịch bản, các phân cảnh sẽ hiển thị tại đây.</p>';
      } else {
        els.videoScriptScenesList.innerHTML = script.scenes.map((sc, i) => `
          <div class="video-scene-item" data-scene-index="${i}">
            <div class="video-scene-header">
              <span>Cảnh ${i + 1}: ${escapeHtml(sc.section || sc.type || "")} (${escapeHtml(sc.badge || "")})</span>
              <span style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(sc.visualKeyword || "")}</span>
            </div>
            <label class="admin-field" style="margin-bottom:6px;">
              <span style="font-size:0.75rem;">Lời bình thu âm (Narration)</span>
              <textarea class="admin-textarea scene-text-input" rows="3">${escapeHtml(sc.text || "")}</textarea>
            </label>
            <label class="admin-field">
              <span style="font-size:0.75rem;">Prompt hình ảnh (Visual description)</span>
              <input type="text" class="admin-input scene-prompt-input" value="${escapeHtml(sc.visualPrompt || "")}">
            </label>
          </div>
        `).join("");
      }
    }

    els.videoScriptDialog?.showModal();
  } catch (err) {
    alert("Không thể tải kịch bản: " + err.message);
  }
};

async function handleVideoScriptSave() {
  if (!currentEditingJobId) return;
  const job = await requestJson(`/api/admin/video/jobs/${encodeURIComponent(currentEditingJobId)}`);
  if (!job) return;

  const script = job.script || { scenes: [] };
  script.title = els.videoScriptEditTitle?.value || script.title;
  script.summary = els.videoScriptEditSummary?.value || script.summary;

  const sceneItems = els.videoScriptScenesList?.querySelectorAll(".video-scene-item") || [];
  sceneItems.forEach((item, idx) => {
    const text = item.querySelector(".scene-text-input")?.value;
    const prompt = item.querySelector(".scene-prompt-input")?.value;
    if (script.scenes[idx]) {
      if (text !== undefined) script.scenes[idx].text = text;
      if (prompt !== undefined) script.scenes[idx].visualPrompt = prompt;
    }
  });

  try {
    await requestJson(`/api/admin/video/jobs/${encodeURIComponent(currentEditingJobId)}/script`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script })
    });
    alert("Đã lưu kịch bản thành công!");
    els.videoScriptDialog?.close();
    await loadAdminVideoData();
  } catch (err) {
    alert("Lỗi khi lưu kịch bản: " + err.message);
  }
}

async function handleVideoScriptApprove() {
  if (!currentEditingJobId) return;
  await handleVideoScriptSave();
  await handleVideoApproveJob(currentEditingJobId);
  els.videoScriptDialog?.close();
}

window.handleVideoApproveJob = async function(jobId) {
  try {
    await requestJson(`/api/admin/video/jobs/${encodeURIComponent(jobId)}/approve`, {
      method: "POST"
    });
    setStatus("Đã duyệt kịch bản, đưa job vào hàng đợi render.");
    await loadAdminVideoData();
  } catch (err) {
    alert("Lỗi khi duyệt job: " + err.message);
  }
};

window.handleVideoRetryJob = async function(jobId) {
  try {
    await requestJson(`/api/admin/video/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: "POST"
    });
    setStatus("Đã đặt lại job để thử render lại.");
    await loadAdminVideoData();
  } catch (err) {
    alert("Lỗi khi thử lại job: " + err.message);
  }
};

window.handleVideoCancelJob = async function(jobId) {
  if (!confirm("Bạn có chắc muốn hủy job này không?")) return;
  try {
    await requestJson(`/api/admin/video/jobs/${encodeURIComponent(jobId)}`, {
      method: "DELETE"
    });
    setStatus("Đã hủy job.");
    await loadAdminVideoData();
  } catch (err) {
    alert("Lỗi khi hủy job: " + err.message);
  }
};

window.openVideoPlayerModal = async function(jobId) {
  const job = videoJobsData.find(j => j.id === jobId) || await requestJson(`/api/admin/video/jobs/${encodeURIComponent(jobId)}`);
  if (!job) return;

  const videoUrl = job.assets?.videoUrl;
  const subtitlesUrl = job.assets?.subtitlesUrl;

  if (els.videoPreviewPlayer && videoUrl) {
    els.videoPreviewPlayer.src = videoUrl;
    els.videoPreviewPlayer.load();
  }

  if (els.videoDownloadMp4Btn) {
    els.videoDownloadMp4Btn.href = videoUrl || "#";
    els.videoDownloadMp4Btn.style.display = videoUrl ? "inline-flex" : "none";
  }

  if (els.videoDownloadSrtBtn) {
    els.videoDownloadSrtBtn.href = subtitlesUrl || "#";
    els.videoDownloadSrtBtn.style.display = subtitlesUrl ? "inline-flex" : "none";
  }

  if (els.videoUploadYtFromModalBtn) {
    els.videoUploadYtFromModalBtn.onclick = () => handleVideoUploadToYouTube(job.id);
  }

  els.videoPlayerDialog?.showModal();
};

window.handleVideoUploadToYouTube = async function(jobId) {
  if (!confirm("Tải video này lên kênh YouTube ở chế độ Riêng tư (Private)?")) return;
  try {
    const res = await requestJson(`/api/admin/video/jobs/${encodeURIComponent(jobId)}/upload-youtube`, {
      method: "POST"
    });
    alert(res.message || "Đã gửi yêu cầu upload YouTube!");
    await loadAdminVideoData();
  } catch (err) {
    alert("Lỗi upload YouTube: " + err.message);
  }
};
