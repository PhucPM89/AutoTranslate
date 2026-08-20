
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
  crawlerWorkerWarning: document.getElementById("crawlerWorkerWarning"),
  crawlerRefresh: document.getElementById("crawlerRefresh"),
  statsTab: document.getElementById("adminStatsTab"),
  statsPanel: document.getElementById("adminStatsPanel"),
  statsGrid: document.getElementById("adminStatsGrid"),
  statsBooks: document.getElementById("adminStatsBooks"),
  statsBooksEmpty: document.getElementById("adminStatsBooksEmpty"),
  statsNote: document.getElementById("adminStatsNote"),
  statsRefresh: document.getElementById("adminStatsRefresh"),
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
    els.crawlerTab?.addEventListener("click", () => selectAdminTab("crawler"));
    els.statsTab?.addEventListener("click", () => selectAdminTab("stats"));
    els.statsRefresh?.addEventListener("click", loadAnalytics);
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
  setStatus("Đang tải số liệu truy cập...");
  try {
    renderAnalytics(await requestJson("/api/admin/analytics"));
    setStatus("");
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderAnalytics(summary) {
  const tiles = [
    { label: "Hôm nay", data: summary.today },
    { label: "7 ngày qua", data: summary.last7Days },
    { label: "30 ngày qua", data: summary.last30Days },
    { label: "Tổng cộng", data: summary.allTime }
  ];

  const grid = document.createDocumentFragment();
  tiles.forEach((tile) => {
    const card = document.createElement("div");
    card.className = "stats-card";
    appendText(card, "span", "stats-card-label", tile.label);
    appendText(card, "strong", "stats-card-value", formatCount(tile.data?.visits));
    appendText(card, "small", "stats-card-meta", `${formatCount(tile.data?.reads)} lượt mở truyện`);
    grid.appendChild(card);
  });
  els.statsGrid.replaceChildren(grid);

  const books = Array.isArray(summary.topBooks) ? summary.topBooks : [];
  const list = document.createDocumentFragment();
  books.forEach((book) => {
    const item = document.createElement("li");
    appendText(item, "span", "stats-book-title", book.title || book.bookId);
    appendText(item, "span", "stats-book-count", `${formatCount(book.reads)} lượt`);
    list.appendChild(item);
  });
  els.statsBooks.replaceChildren(list);
  els.statsBooksEmpty.hidden = books.length > 0;

  const range = summary.firstDay ? `từ ${summary.firstDay}` : "chưa có dữ liệu";
  els.statsNote.textContent = summary.storageReady
    ? `Đếm theo phiên truy cập của trình duyệt (${range}, giữ 60 ngày gần nhất). Không lưu IP, cookie hay danh tính người đọc, nên con số là số phiên chứ không phải số người chính xác.`
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

function renderCrawlerStatus(status = {}) {
  const labels = { idle: "Chưa chạy", running: "Đang chạy", success: "Hoàn tất", error: "Có lỗi", disabled: "Đang tắt" };
  els.crawlerStateBadge.textContent = labels[status.state] || labels.idle;
  els.crawlerStateBadge.dataset.state = status.state || "idle";
  els.crawlerStateMessage.textContent = status.message || "Crawler chưa chạy.";
  const finished = status.finishedAt ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(status.finishedAt)) : "Chưa có lượt chạy";
  els.crawlerStateMeta.textContent = `${finished} · Đã thêm ${status.published || 0} · Lỗi ${status.failed || 0} · Lịch 15 phút`;
}

const ADMIN_TABS = [
  { key: "library", tab: "libraryTab", panel: "uploadForm" },
  { key: "crawler", tab: "crawlerTab", panel: "crawlerForm" },
  { key: "stats", tab: "statsTab", panel: "statsPanel" }
];

function selectAdminTab(tab) {
  activeAdminTab = ADMIN_TABS.some((entry) => entry.key === tab) ? tab : "library";
  ADMIN_TABS.forEach(({ key, tab: tabId, panel }) => {
    const active = key === activeAdminTab;
    els[tabId]?.classList.toggle("active", active);
    els[tabId]?.setAttribute("aria-selected", String(active));
    if (els[panel]) els[panel].hidden = !active;
  });
  setStatus("");
  if (activeAdminTab === "stats") loadAnalytics();
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
