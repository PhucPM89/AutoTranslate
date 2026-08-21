
const CDN_BASE = String(__CDN_BASE__ || "").replace(/\/$/, "");

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
  crawlerUpdateExisting: document.getElementById("crawlerUpdateExisting"),
  crawlerStateBadge: document.getElementById("crawlerStateBadge"),
  crawlerStateMessage: document.getElementById("crawlerStateMessage"),
  crawlerStateMeta: document.getElementById("crawlerStateMeta"),
  crawlerProgress: document.getElementById("crawlerProgress"),
  crawlerProgressFill: document.getElementById("crawlerProgressFill"),
  crawlerProgressLabel: document.getElementById("crawlerProgressLabel"),
  crawlerRecent: document.getElementById("crawlerRecent"),
  crawlerRecentList: document.getElementById("crawlerRecentList"),
  crawlerWorkerWarning: document.getElementById("crawlerWorkerWarning"),
  crawlerRefresh: document.getElementById("crawlerRefresh"),
  translateTab: document.getElementById("adminTranslateTab"),
  translatePanel: document.getElementById("adminTranslatePanel"),
  translateRefresh: document.getElementById("adminTranslateRefresh"),
  translateStateBadge: document.getElementById("translateStateBadge"),
  translateStateMessage: document.getElementById("translateStateMessage"),
  translateStateMeta: document.getElementById("translateStateMeta"),
  translateLiveProgress: document.getElementById("translateLiveProgress"),
  translateProgressFill: document.getElementById("translateProgressFill"),
  translateProgressLabel: document.getElementById("translateProgressLabel"),
  translateQueueList: document.getElementById("translateQueueList"),
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
  progressBar: document.getElementById("adminProgressBar")
};

let adminCatalog = { books: [] };
let activeAdminTab = "library";
let mounted = false;
let translateTimer = null;

// app.js imports this module the first time the lock button is pressed, so the
// so the admin code never lands in a regular reader's bundle.
export function mountAdmin() {
  if (!mounted) {
    mounted = true;
    els.open?.addEventListener("click", openAdmin);
    els.close?.addEventListener("click", () => els.dialog.close());
    els.dialog?.addEventListener("click", (event) => {
      if (event.target === els.dialog) els.dialog.close();
    });
    els.loginForm?.addEventListener("submit", login);
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
    els.translateRefresh?.addEventListener("click", loadTranslateStatus);
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
  }
  return openAdmin();
}

async function openAdmin() {
  els.dialog.showModal();
  setStatus("Đang kiểm tra phiên quản trị...");
  try {
    const session = await requestJson("/api/admin/session");
    showAuthenticated(session.authenticated);
    if (session.authenticated && !session.storageReady) setStatus("R2 chưa được cấu hình trên Worker nên chưa upload được.", true);
    else if (session.authenticated) {
      await Promise.all([loadAdminCatalog(), loadCrawlerConfig()]);
      setStatus("Chọn một truyện để chỉnh sửa hoặc thêm truyện mới.");
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
    showAuthenticated(true);
    await Promise.all([loadAdminCatalog(), loadCrawlerConfig()]);
    setStatus("Đã mở quyền quản trị trong 30 phút.");
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
  els.crawlerMaxBooks.value = String(result.config.maxNewBooksPerRun || 1);
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
  translateTimer = setInterval(loadTranslateStatus, 5000);
}

function stopTranslatePolling() {
  if (translateTimer) {
    clearInterval(translateTimer);
    translateTimer = null;
  }
}

async function loadTranslateStatus() {
  try {
    const res = await requestJson("/api/admin/translate");
    renderTranslateStatus(res.status);
  } catch (err) {
    console.warn("Unable to load translate status:", err);
  }
}

function renderTranslateStatus(status = {}) {
  if (!els.translateStateBadge) return;
  const labels = {
    idle: "Tạm nghỉ",
    running: "Đang dịch AI",
    paused_quota: "Hết Quota Groq",
    completed: "Hoàn tất",
    error: "Có lỗi"
  };
  els.translateStateBadge.textContent = labels[status.state] || labels.idle;
  els.translateStateBadge.dataset.state = status.state || "idle";
  els.translateStateMessage.textContent = status.message || "Chưa có tiến trình dịch nào.";

  const beat = status.updatedAt || status.finishedAt;
  const parts = [];
  if (beat) parts.push(`Nhịp tim: ${describeAge(beat)}`);
  if (status.spentRequests) parts.push(`${status.spentRequests} requests Groq AI`);
  if (status.translatedThisRun) parts.push(`đã dịch ${status.translatedThisRun} chương mới`);
  els.translateStateMeta.textContent = parts.join(" · ");

  // Live progress
  const total = Number(status.currentTotalChapters || 0);
  const saved = Number(status.currentCompleted || status.currentChapter || 0);
  const showProgress = status.state === "running" && total > 0;
  if (els.translateLiveProgress) {
    els.translateLiveProgress.hidden = !showProgress;
    if (showProgress) {
      const percent = Math.min(100, Math.round((saved / total) * 100));
      els.translateProgressFill.style.width = `${percent}%`;
      const matched = (adminCatalog.books || []).find((b) => b.id === status.currentBookId);
      const bookTitle = matched ? matched.title : status.currentBookId;
      els.translateProgressLabel.textContent =
        `Đang dịch: ${bookTitle} — Chương ${saved}/${total} (${percent}%)`;
    }
  }

  // Queue List
  let queue = Array.isArray(status.queue) && status.queue.length ? status.queue : [];
  if (!queue.length && Array.isArray(adminCatalog.books) && adminCatalog.books.length) {
    queue = adminCatalog.books
      .map((b) => {
        const total = Number(b.chapterCount || b.totalChapters || 0);
        const done = Number(b.translatedChapters || 0);
        return {
          bookId: b.id,
          total,
          pending: Math.max(0, total - done),
          highPriority: false
        };
      })
      .filter((b) => b.total > 0);
  }

  if (els.translateQueueList) {
    els.translateQueueList.innerHTML = "";
    if (!queue.length) {
      els.translateQueueList.innerHTML = `<p class="stats-empty">Hàng đợi trống. Tất cả truyện đã dịch xong hoặc chưa thêm truyện mới.</p>`;
    } else {
      // Sort: current translating book first, then high-priority books, then pending > 0
      const sortedQueue = [...queue].sort((a, b) => {
        const isCurrentA = status.state === "running" && status.currentBookId === a.bookId ? 1 : 0;
        const isCurrentB = status.state === "running" && status.currentBookId === b.bookId ? 1 : 0;
        if (isCurrentA !== isCurrentB) return isCurrentB - isCurrentA;
        if (a.highPriority !== b.highPriority) return (b.highPriority ? 1 : 0) - (a.highPriority ? 1 : 0);
        return (b.pending || 0) - (a.pending || 0);
      });

      // Show top 5 active items to keep UI lightweight and lightning-fast
      const MAX_VISIBLE = 5;
      const visibleItems = sortedQueue.slice(0, MAX_VISIBLE);
      const remainingCount = sortedQueue.length - visibleItems.length;

      for (const item of visibleItems) {
        const row = document.createElement("div");
        row.className = "translate-queue-item";
        const matched = (adminCatalog.books || []).find((b) => b.id === item.bookId);
        const title = matched ? matched.title : item.bookId;
        const totalCh = Number(item.total || 0);
        const pendingCh = Number(item.pending || 0);
        const doneCh = Math.max(0, totalCh - pendingCh);
        const pct = totalCh ? Math.round((doneCh / totalCh) * 100) : 0;
        const isCurrent = status.state === "running" && status.currentBookId === item.bookId;

        row.innerHTML = `
          <div class="queue-item-info">
            <strong class="queue-item-title">${isCurrent ? "⚡ " : ""}${title}</strong>
            <small class="queue-item-meta">
              <span>${doneCh.toLocaleString("vi-VN")} / ${totalCh.toLocaleString("vi-VN")} chương</span>
              <span class="queue-pct-badge ${pct === 100 ? 'is-done' : ''}">${pct}%</span>
              ${item.highPriority ? '<span class="queue-priority-badge">Ưu tiên cao</span>' : ''}
            </small>
          </div>
          <div class="queue-item-bar"><span style="width: ${pct}%"></span></div>
        `;
        els.translateQueueList.appendChild(row);
      }

      if (remainingCount > 0) {
        const moreNote = document.createElement("div");
        moreNote.className = "queue-more-note";
        moreNote.textContent = `... và ${remainingCount} bộ truyện khác đang xếp hàng xoay vòng`;
        els.translateQueueList.appendChild(moreNote);
      }
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
      els.crawlerProgressFill.style.width = `${percent}%`;
      els.crawlerProgressLabel.textContent =
        `${status.currentBookTitle || "Đang tải"} — ${saved.toLocaleString("vi-VN")}/${total.toLocaleString("vi-VN")} chương (${percent}%)`;
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
    if (els.keysActiveModel) els.keysActiveModel.textContent = data.activeModel || "qwen/qwen3.6-27b";
    renderKeysList(data.keys || []);
  } catch (error) {
    els.keysList.innerHTML = `<p class="stats-empty text-error">Không tải được thông tin key: ${error.message}</p>`;
  }
}

async function runKeysPingTest() {
  if (!els.keysPingBtn || !els.keysList) return;
  const originalText = els.keysPingBtn.innerHTML;
  els.keysPingBtn.disabled = true;
  els.keysPingBtn.innerHTML = '<svg class="icon spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/></svg>Đang ping 7 keys...';
  try {
    const data = await requestJson("/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ping" })
    });
    renderKeysList(data.keys || [], true);
    setStatus("Đã hoàn tất kiểm tra kết nối toàn bộ Key.");
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

    const statusBadge = k.ok !== false
      ? '<span class="key-status-badge is-ready">🟢 Sẵn sàng</span>'
      : '<span class="key-status-badge is-error">🔴 Lỗi</span>';

    card.innerHTML = `
      <div class="key-card-header">
        <div class="key-card-info">
          <span class="key-card-num">Key #${idx + 1}</span>
          <strong class="key-card-masked">${k.masked || "gsk_..."}</strong>
        </div>
        <div class="key-card-header-actions">
          ${statusBadge}
          <button class="key-delete-btn" type="button" title="Xóa API Key này" aria-label="Xóa key">
            <svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
      <div class="key-card-meta">
        <span class="key-provider-tag">${k.provider || "Groq LPU"}</span>
        ${latencyHtml}
      </div>
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
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
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

