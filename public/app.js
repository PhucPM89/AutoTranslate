"use strict";

const state = {
  bookId: "",
  fileName: "",
  title: "",
  chapters: [],
  currentIndex: 0,
  translations: {}
};

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_DB_NAME = "epubTranslator.cache";
const CACHE_DB_VERSION = 1;
const CACHE_STORE = "books";
const SPEECH_VOICE_KEY = "epubTranslator.speechVoice";
const SPEECH_RATE_KEY = "epubTranslator.speechRate";
const SPEECH_GENRE_KEY = "epubTranslator.speechGenre";
const SPEECH_CACHE_NAME = "epubTranslator.speech.v2";
const LEGACY_SPEECH_CACHE_NAME = "epubTranslator.speech.v1";
const SPEECH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
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
  fileInput: document.getElementById("fileInput"),
  bookTitle: document.getElementById("bookTitle"),
  bookMeta: document.getElementById("bookMeta"),
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
restoreCachedBook();

function bindEvents() {
  els.fileInput.addEventListener("change", handleFile);
  els.prevChapter.addEventListener("click", () => goToChapter(state.currentIndex - 1));
  els.nextChapter.addEventListener("click", () => goToChapter(state.currentIndex + 1));
  els.bottomPrevChapter.addEventListener("click", () => goToChapter(state.currentIndex - 1));
  els.bottomNextChapter.addEventListener("click", () => goToChapter(state.currentIndex + 1));
  els.chapterSelect.addEventListener("change", () => goToChapter(Number(els.chapterSelect.value)));
  els.globalSearch.addEventListener("input", renderChapterControls);
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
  setSpeechMode("paused", "Paused while tab is hidden");
}

async function toggleSpeech() {
  if (els.speechPlay.disabled) return;

  if (speechState.mode === "speaking") {
    speechState.audio.pause();
    setSpeechMode("paused", "Paused");
    return;
  }

  if (speechState.mode === "paused") {
    await speechState.audio.play();
    setSpeechMode("speaking", speechProgressLabel("Playing"));
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
    setSpeechMode("speaking", speechProgressLabel("Playing"));
    prefetchNextSpeechChunk(session);
  } catch (error) {
    if (error.name !== "AbortError" && session === speechState.session) {
      stopSpeech(error.message || "Unable to generate audio");
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
  setSpeechMode("idle", "Playback complete");
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
  setSpeechMode("idle", statusMessage || (hasSpeakableOutput() ? "Ready" : "No output available"));
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
    mode === "generating" ? "Generating" : mode === "speaking" ? "Pause" : mode === "paused" ? "Resume" : "Listen";
  els.speechPlay.setAttribute(
    "aria-label",
    mode === "speaking" ? "Pause audio" : mode === "paused" ? "Resume audio" : "Listen to output"
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
      ? "Ready · Vietnamese AI voice"
      : renderedOutput
        ? "Output is not Vietnamese"
        : "No output available";
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
  return String(
    state.translations[state.currentIndex] || localStorage.getItem(translationKey()) || ""
  ).trim();
}

function speechProgressLabel(action) {
  return `${action} ${speechState.index + 1} / ${speechState.chunks.length}`;
}

function splitSpeechText(text, maxLength = 900) {
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

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setBusy("Loading collection...");

  try {
    const bookId = makeBookId(file);
    const existingCache = await readCachedBook(bookId);
    const arrayBuffer = await file.arrayBuffer();
    const book = await parseEpub(arrayBuffer, file.name);
    state.bookId = bookId;
    state.fileName = file.name;
    state.title = book.title || file.name.replace(/\.epub$/i, "");
    state.chapters = book.chapters;
    state.translations = existingCache?.translations || {};

    if (!state.chapters.length) {
      throw new Error("No readable documents found.");
    }

    els.bookTitle.textContent = "Document Workspace";
    els.bookMeta.textContent = `${state.chapters.length} documents · Saved locally for 7 days`;
    renderChapterControls();

    const savedIndex = Number(existingCache?.currentIndex ?? localStorage.getItem(currentChapterKey()) ?? "0");
    goToChapter(Number.isInteger(savedIndex) ? savedIndex : 0);
    await saveCurrentBookCache();
  } catch (error) {
    resetReader(`Unable to load collection: ${error.message}`);
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
      title: navTitles.get(stripFragment(item.href)) || guessChapterTitle(html) || displayChapterTitle(chapters.length),
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
  const query = els.globalSearch.value.trim().toLowerCase();
  let visibleCount = 0;

  state.chapters.forEach((chapter, index) => {
    const title = displayChapterTitle(index);
    const searchTarget = `${title} ${chapter.title}`.toLowerCase();
    if (query && !searchTarget.includes(query)) return;

    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = title;
    els.chapterSelect.appendChild(option);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "document-item";
    button.dataset.index = String(index);
    button.classList.toggle("active", index === state.currentIndex);
    button.innerHTML = `<span class="document-icon" aria-hidden="true"></span><span>${title}</span><small>${estimateDocumentSize(
      chapter.text
    )}</small>`;
    button.addEventListener("click", () => goToChapter(index));
    els.chapterList.appendChild(button);
    visibleCount += 1;
  });

  els.documentCount.textContent = String(state.chapters.length);
  els.chapterSelect.disabled = false;
  if (state.chapters.length && !els.chapterSelect.querySelector(`[value="${state.currentIndex}"]`)) {
    els.chapterSelect.value = String(state.currentIndex);
  }
  if (!visibleCount) {
    els.chapterList.innerHTML = `<div class="empty-list">No matching documents</div>`;
  }
}

function goToChapter(index) {
  if (!state.chapters.length) return;
  stopSpeech();
  state.currentIndex = Math.min(Math.max(index, 0), state.chapters.length - 1);
  localStorage.setItem(currentChapterKey(), String(state.currentIndex));

  const chapter = state.chapters[state.currentIndex];
  els.sourceText.textContent = chapter.text;
  const documentLabel = displayChapterTitle(state.currentIndex);
  const chapterLabel = `${documentLabel} · ${state.currentIndex + 1} / ${state.chapters.length}`;
  const progress = Math.ceil(((state.currentIndex + 1) / state.chapters.length) * 100);
  els.documentTitle.textContent = documentLabel;
  els.paperTitle.textContent = documentLabel;
  els.progressLabel.textContent = `${progress}%`;
  els.progressBar.style.width = `${progress}%`;
  els.documentStatus.textContent = "Open";
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

  Array.from(els.chapterList.children).forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.index) === state.currentIndex);
  });

  saveCurrentBookCache();
  loadCachedTranslation();
}

function loadCachedTranslation() {
  let cached = state.translations[state.currentIndex] || localStorage.getItem(translationKey());
  const chapter = state.chapters[state.currentIndex];
  if (cached && chapter && !isUsableTranslation(chapter.text, cached)) {
    delete state.translations[state.currentIndex];
    localStorage.removeItem(translationKey());
    saveCurrentBookCache();
    cached = "";
  }

  if (cached) {
    state.translations[state.currentIndex] = cached;
    els.translationText.textContent = cached;
    els.translationText.classList.remove("empty", "status-error", "is-loading");
    els.outputStatus.textContent = "Cached";
    els.translateButton.hidden = true;
    els.retranslateButton.hidden = false;
  } else {
    els.translationText.textContent = "No output available.";
    els.translationText.classList.add("empty");
    els.translationText.classList.remove("status-error", "is-loading");
    els.outputStatus.textContent = "Pending";
    els.translateButton.hidden = false;
    els.retranslateButton.hidden = true;
  }
  updateSpeechAvailability();
}

async function translateCurrentChapter(force) {
  const chapter = state.chapters[state.currentIndex];
  if (!chapter) return;

  if (!force) {
    const cached = state.translations[state.currentIndex] || localStorage.getItem(translationKey());
    if (cached) {
      loadCachedTranslation();
      return;
    }
  }

  stopSpeech();
  setTranslationStatus("Processing document...");
  els.outputStatus.textContent = "Running";
  els.translateButton.disabled = true;
  els.retranslateButton.disabled = true;

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chapter.text })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to process this document.");
    if (!isUsableTranslation(chapter.text, data.translation)) {
      throw new Error("Gemini vẫn trả lại nội dung tiếng Trung. Kết quả này chưa được lưu; hãy thử dịch lại.");
    }

    state.translations[state.currentIndex] = data.translation;
    try {
      localStorage.setItem(translationKey(), data.translation);
    } catch (error) {
      console.warn("LocalStorage quota reached; IndexedDB cache still keeps this translation.", error);
    }
    await saveCurrentBookCache();
    els.translationText.textContent = data.translation;
    els.translationText.classList.remove("empty", "status-error", "is-loading");
    updateSpeechAvailability();
    els.outputStatus.textContent = "Complete";
    els.translateButton.hidden = true;
    els.retranslateButton.hidden = false;
    if (data.elapsedMs) {
      const modelNote = Array.isArray(data.modelsUsed) && data.modelsUsed.length ? ` · ${data.modelsUsed.join(", ")}` : "";
      els.bookMeta.textContent = `${state.chapters.length} documents · ${data.chunkCount || 1} tasks in ${formatSeconds(
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
  if (isError) els.outputStatus.textContent = "Error";
  updateSpeechAvailability();
}

function setBusy(message) {
  stopSpeech();
  els.sourceText.textContent = message;
  els.translationText.textContent = "No output available.";
  els.translationText.classList.add("empty");
  els.translationText.classList.remove("is-loading", "status-error");
  els.outputStatus.textContent = "Loading";
  updateSpeechAvailability();
}

function resetReader(message) {
  stopSpeech();
  state.bookId = "";
  state.fileName = "";
  state.title = "";
  state.chapters = [];
  state.currentIndex = 0;
  state.translations = {};
  els.bookTitle.textContent = "Document Workspace";
  els.bookMeta.textContent = message;
  els.sourceText.textContent = message;
  els.chapterCounter.textContent = "No collection";
  els.bottomChapterCounter.textContent = "No collection";
  els.documentTitle.textContent = "No document selected";
  els.paperTitle.textContent = "Output Preview";
  els.documentStatus.textContent = "Idle";
  els.outputStatus.textContent = "Pending";
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

async function restoreCachedBook() {
  try {
    await deleteExpiredCachedBooks();
    const cachedBook = await readMostRecentCachedBook();
    if (!cachedBook) return;

    applyCachedBook(cachedBook);
    renderChapterControls();
    goToChapter(cachedBook.currentIndex || 0);
    els.bookMeta.textContent = `Restored locally · ${state.chapters.length} documents · Expires ${formatDate(
      cachedBook.expiresAt
    )}`;
  } catch (error) {
    console.warn("Unable to restore local EPUB cache.", error);
  }
}

function applyCachedBook(cachedBook) {
  state.bookId = cachedBook.id;
  state.fileName = cachedBook.fileName || "";
  state.title = cachedBook.title || cachedBook.fileName || "Cached EPUB";
  state.chapters = Array.isArray(cachedBook.chapters) ? cachedBook.chapters : [];
  state.currentIndex = Number(cachedBook.currentIndex) || 0;
  state.translations = cachedBook.translations || {};
  els.bookTitle.textContent = "Document Workspace";
}

async function saveCurrentBookCache() {
  if (!state.bookId || !state.chapters.length) return;

  const now = Date.now();
  const cachedBook = {
    id: state.bookId,
    fileName: state.fileName,
    title: state.title,
    chapters: state.chapters,
    currentIndex: state.currentIndex,
    translations: state.translations,
    createdAt: now,
    lastOpenedAt: now,
    expiresAt: now + CACHE_TTL_MS
  };

  try {
    await putCachedBook(cachedBook);
  } catch (error) {
    console.warn("Unable to save EPUB cache on this device.", error);
    els.bookMeta.textContent = `${state.chapters.length} documents · Local cache unavailable`;
  }
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withCacheStore(mode, callback) {
  const db = await openCacheDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CACHE_STORE, mode);
    const store = transaction.objectStore(CACHE_STORE);
    let callbackResult;

    transaction.oncomplete = () => {
      db.close();
      resolve(callbackResult);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    callbackResult = callback(store);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putCachedBook(cachedBook) {
  await withCacheStore("readwrite", (store) => {
    store.put(cachedBook);
  });
}

async function readCachedBook(bookId) {
  const cachedBook = await withCacheStore("readonly", (store) => requestToPromise(store.get(bookId)));
  if (!cachedBook || cachedBook.expiresAt <= Date.now()) return null;
  return cachedBook;
}

async function readMostRecentCachedBook() {
  const books = await withCacheStore("readonly", (store) => requestToPromise(store.getAll()));
  const now = Date.now();
  return books
    .filter((book) => book.expiresAt > now && Array.isArray(book.chapters) && book.chapters.length)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];
}

async function deleteExpiredCachedBooks() {
  const books = await withCacheStore("readwrite", (store) => requestToPromise(store.getAll()));
  const now = Date.now();
  await Promise.all(
    books
      .filter((book) => book.expiresAt <= now)
      .map((book) =>
        withCacheStore("readwrite", (store) => {
          store.delete(book.id);
        })
      )
  );
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(timestamp));
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

function displayChapterTitle(index) {
  return `Document ${String(index + 1).padStart(2, "0")}`;
}

function estimateDocumentSize(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 1000) return `${Math.round(words / 100) / 10}k words`;
  return `${words} words`;
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
