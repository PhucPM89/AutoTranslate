import { upload } from "@vercel/blob/client";

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
  crawlerMaxBooks: document.getElementById("crawlerMaxBooks"),
  crawlerUpdateExisting: document.getElementById("crawlerUpdateExisting"),
  crawlerStateBadge: document.getElementById("crawlerStateBadge"),
  crawlerStateMessage: document.getElementById("crawlerStateMessage"),
  crawlerStateMeta: document.getElementById("crawlerStateMeta"),
  crawlerWorkerWarning: document.getElementById("crawlerWorkerWarning"),
  crawlerRefresh: document.getElementById("crawlerRefresh"),
  bookSelect: document.getElementById("adminBookSelect"),
  password: document.getElementById("adminPassword"),
  epub: document.getElementById("adminEpub"),
  epubLabel: document.getElementById("adminEpubLabel"),
  cover: document.getElementById("adminCover"),
  coverLabel: document.getElementById("adminCoverLabel"),
  existingFiles: document.getElementById("adminExistingFiles"),
  logout: document.getElementById("adminLogout"),
  submit: document.getElementById("adminSubmit"),
  status: document.getElementById("adminStatus"),
  progress: document.querySelector(".admin-progress"),
  progressBar: document.getElementById("adminProgressBar")
};

let adminCatalog = { books: [] };
let activeAdminTab = "library";

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
els.crawlerRefresh?.addEventListener("click", loadCrawlerConfig);
els.bookSelect?.addEventListener("change", selectBook);
els.logout?.addEventListener("click", logout);

async function openAdmin() {
  els.dialog.showModal();
  setStatus("Đang kiểm tra phiên quản trị...");
  try {
    const session = await requestJson("/api/admin/session");
    showAuthenticated(session.authenticated);
    if (session.authenticated && !session.storageReady) setStatus("Vercel Blob chưa được kết nối với dự án.", true);
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
    await requestJson("/api/admin/logout", { method: "POST" });
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
    const baseName = slug(form.get("title")) || "truyen";
    let epubUrl = existingBook?.epub || "";
    if (epub) {
      setStatus("Đang upload EPUB...");
      const epubBlob = await upload(`library/books/${baseName}.epub`, epub, {
        access: "public",
        contentType: "application/epub+zip",
        handleUploadUrl: "/api/admin/upload",
        clientPayload: JSON.stringify({ kind: "epub" }),
        multipart: epub.size > 100 * 1024 * 1024,
        abortSignal: abortController.signal,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage * (cover ? 0.7 : 0.9)))
      });
      epubUrl = epubBlob.url;
    }

    let coverUrl = existingBook?.cover || "";
    if (cover) {
      setStatus("Đang upload ảnh bìa...");
      const extension = extensionOf(cover.name);
      const coverBlob = await upload(`library/covers/${baseName}${extension}`, cover, {
        access: "public",
        contentType: cover.type,
        handleUploadUrl: "/api/admin/upload",
        clientPayload: JSON.stringify({ kind: "cover" }),
        abortSignal: abortController.signal,
        onUploadProgress: ({ percentage }) => setProgress(70 + Math.round(percentage * 0.2))
      });
      coverUrl = coverBlob.url;
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

async function loadAdminCatalog() {
  adminCatalog = await requestJson(`/api/library?admin=${Date.now()}`);
  renderBookOptions();
  startNewBook();
}

async function loadCrawlerConfig() {
  const result = await requestJson("/api/admin/crawler");
  els.crawlerEnabled.checked = Boolean(result.config.enabled);
  els.crawlerMaxBooks.value = String(result.config.maxNewBooksPerRun || 1);
  els.crawlerUpdateExisting.checked = result.config.updateExisting !== false;
  const selected = new Set(result.config.categories || []);
  els.crawlerForm.querySelectorAll('[name="crawlerCategory"]').forEach((input) => { input.checked = selected.has(input.value); });
  els.crawlerWorkerWarning.hidden = result.workerReady;
  renderCrawlerStatus(result.status);
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

function selectAdminTab(tab) {
  activeAdminTab = tab === "crawler" ? "crawler" : "library";
  const crawlerActive = activeAdminTab === "crawler";
  els.libraryTab.classList.toggle("active", !crawlerActive);
  els.libraryTab.setAttribute("aria-selected", String(!crawlerActive));
  els.crawlerTab.classList.toggle("active", crawlerActive);
  els.crawlerTab.setAttribute("aria-selected", String(crawlerActive));
  els.uploadForm.hidden = crawlerActive;
  els.crawlerForm.hidden = !crawlerActive;
  setStatus("");
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
  els.uploadForm.hidden = !authenticated || activeAdminTab !== "library";
  els.crawlerForm.hidden = !authenticated || activeAdminTab !== "crawler";
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

function slug(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}

function extensionOf(name) {
  const match = String(name).toLowerCase().match(/\.(jpe?g|png|webp)$/);
  return match ? match[0] : ".webp";
}
