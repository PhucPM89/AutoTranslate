"use strict";

const state = {
  bookId: "",
  fileName: "",
  title: "",
  chapters: [],
  currentIndex: 0
};

const els = {
  fileInput: document.getElementById("fileInput"),
  bookTitle: document.getElementById("bookTitle"),
  bookMeta: document.getElementById("bookMeta"),
  chapterSelect: document.getElementById("chapterSelect"),
  chapterList: document.getElementById("chapterList"),
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
  fontSize: document.getElementById("fontSize"),
  readerWidth: document.getElementById("readerWidth")
};

const parser = new DOMParser();

initPreferences();
bindEvents();

function bindEvents() {
  els.fileInput.addEventListener("change", handleFile);
  els.prevChapter.addEventListener("click", () => goToChapter(state.currentIndex - 1));
  els.nextChapter.addEventListener("click", () => goToChapter(state.currentIndex + 1));
  els.bottomPrevChapter.addEventListener("click", () => goToChapter(state.currentIndex - 1));
  els.bottomNextChapter.addEventListener("click", () => goToChapter(state.currentIndex + 1));
  els.chapterSelect.addEventListener("change", () => goToChapter(Number(els.chapterSelect.value)));
  els.translateButton.addEventListener("click", () => translateCurrentChapter(false));
  els.retranslateButton.addEventListener("click", () => translateCurrentChapter(true));
  els.themeToggle.addEventListener("click", toggleTheme);
  els.fontSize.addEventListener("input", updateReaderSettings);
  els.readerWidth.addEventListener("input", updateReaderSettings);
}

function initPreferences() {
  const theme = localStorage.getItem("epubTranslator.theme") || "light";
  document.body.classList.toggle("dark", theme === "dark");
  els.themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";

  els.fontSize.value = localStorage.getItem("epubTranslator.fontSize") || "20";
  els.readerWidth.value = localStorage.getItem("epubTranslator.readerWidth") || "760";
  updateReaderSettings();
}

function updateReaderSettings() {
  document.documentElement.style.setProperty("--reader-font-size", `${els.fontSize.value}px`);
  document.documentElement.style.setProperty("--reader-width", `${els.readerWidth.value}px`);
  localStorage.setItem("epubTranslator.fontSize", els.fontSize.value);
  localStorage.setItem("epubTranslator.readerWidth", els.readerWidth.value);
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("epubTranslator.theme", isDark ? "dark" : "light");
  els.themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setBusy(`Đang đọc ${file.name}...`);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const book = await parseEpub(arrayBuffer, file.name);
    state.bookId = makeBookId(file);
    state.fileName = file.name;
    state.title = book.title || file.name.replace(/\.epub$/i, "");
    state.chapters = book.chapters;

    if (!state.chapters.length) {
      throw new Error("Không tìm thấy chương có nội dung trong EPUB.");
    }

    els.bookTitle.textContent = state.title;
    els.bookMeta.textContent = `${file.name} · ${state.chapters.length} chương`;
    renderChapterControls();

    const savedIndex = Number(localStorage.getItem(currentChapterKey()) || "0");
    goToChapter(Number.isInteger(savedIndex) ? savedIndex : 0);
  } catch (error) {
    resetReader(`Không đọc được EPUB: ${error.message}`);
  }
}

async function parseEpub(arrayBuffer, fileName) {
  const zip = await JSZip.loadAsync(arrayBuffer);
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

  const chapters = [];
  for (let i = 0; i < spineItems.length; i += 1) {
    const item = spineItems[i];
    const file = zip.file(item.href);
    if (!file || !isDocumentType(item.mediaType, item.href)) continue;

    const html = await file.async("text");
    const text = extractReadableText(html);
    if (!text) continue;

    chapters.push({
      title: navTitles.get(stripFragment(item.href)) || guessChapterTitle(html) || `Chương ${chapters.length + 1}`,
      text
    });
  }

  return { title, chapters };
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
  els.chapterSelect.innerHTML = "";
  els.chapterList.innerHTML = "";

  state.chapters.forEach((chapter, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = chapter.title;
    els.chapterSelect.appendChild(option);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "chapter-link";
    button.textContent = chapter.title;
    button.addEventListener("click", () => goToChapter(index));
    els.chapterList.appendChild(button);
  });

  els.chapterSelect.disabled = false;
}

function goToChapter(index) {
  if (!state.chapters.length) return;
  state.currentIndex = Math.min(Math.max(index, 0), state.chapters.length - 1);
  localStorage.setItem(currentChapterKey(), String(state.currentIndex));

  const chapter = state.chapters[state.currentIndex];
  els.sourceText.textContent = chapter.text;
  const chapterLabel = `${chapter.title} · ${state.currentIndex + 1} / ${state.chapters.length}`;
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

  Array.from(els.chapterList.children).forEach((button, i) => {
    button.classList.toggle("active", i === state.currentIndex);
  });

  loadCachedTranslation();
}

function loadCachedTranslation() {
  const cached = localStorage.getItem(translationKey());
  if (cached) {
    els.translationText.textContent = cached;
    els.translationText.classList.remove("empty", "status-error");
    els.translateButton.hidden = true;
    els.retranslateButton.hidden = false;
  } else {
    els.translationText.textContent = "Chưa dịch.";
    els.translationText.classList.add("empty");
    els.translationText.classList.remove("status-error");
    els.translateButton.hidden = false;
    els.retranslateButton.hidden = true;
  }
}

async function translateCurrentChapter(force) {
  const chapter = state.chapters[state.currentIndex];
  if (!chapter) return;

  if (!force) {
    const cached = localStorage.getItem(translationKey());
    if (cached) {
      loadCachedTranslation();
      return;
    }
  }

  setTranslationStatus("Đang dịch chương... Server sẽ tự chia chương dài thành nhiều phần để dịch nhanh hơn.");
  els.translateButton.disabled = true;
  els.retranslateButton.disabled = true;

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chapter.text })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không dịch được chương.");

    localStorage.setItem(translationKey(), data.translation);
    els.translationText.textContent = data.translation;
    els.translationText.classList.remove("empty", "status-error");
    els.translateButton.hidden = true;
    els.retranslateButton.hidden = false;
    if (data.elapsedMs) {
      const modelNote = Array.isArray(data.modelsUsed) && data.modelsUsed.length ? ` · ${data.modelsUsed.join(", ")}` : "";
      els.bookMeta.textContent = `${state.fileName} · ${state.chapters.length} chương · dịch ${data.chunkCount || 1} phần trong ${formatSeconds(
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
  els.translationText.textContent = message;
  els.translationText.classList.toggle("status-error", isError);
  els.translationText.classList.toggle("empty", !isError);
}

function setBusy(message) {
  els.sourceText.textContent = message;
  els.sourceText.classList.add("empty");
  els.translationText.textContent = "Chưa dịch.";
  els.translationText.classList.add("empty");
}

function resetReader(message) {
  state.bookId = "";
  state.chapters = [];
  state.currentIndex = 0;
  els.bookTitle.textContent = "EPUB Translator";
  els.bookMeta.textContent = message;
  els.sourceText.textContent = message;
  els.sourceText.classList.add("empty", "status-error");
  els.chapterCounter.textContent = "Chưa có EPUB";
  els.bottomChapterCounter.textContent = "Chưa có EPUB";
  els.chapterSelect.innerHTML = "";
  els.chapterSelect.disabled = true;
  els.chapterList.innerHTML = "";
  els.prevChapter.disabled = true;
  els.bottomPrevChapter.disabled = true;
  els.nextChapter.disabled = true;
  els.bottomNextChapter.disabled = true;
  els.translateButton.disabled = true;
}

function currentChapterKey() {
  return `epubTranslator.currentChapter.${state.bookId}`;
}

function translationKey() {
  return `epubTranslator.translation.${state.bookId}.${state.currentIndex}`;
}

function makeBookId(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
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
