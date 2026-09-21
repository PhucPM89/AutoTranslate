"use strict";

// Trạm Chữ High-Performance TTS Engine
// Supports:
// 1. Full-chapter neural audio (Edge-TTS stitched CBR MP3, Cloudflare R2 + browser Cache API cached)
// 2. Continuous time-ratio paragraph tracking and interactive seeking
// 3. Zero-failure fallback to browser native SpeechSynthesis (offline device voices)
const TTS_ENDPOINT = "/api/reader/tts";
const TTS_CACHE = "tram-chu-tts-v3";
const TTS_VOICE = Object.freeze({
  name: "Microsoft Hoài My (Edge-TTS)",
  voiceURI: "vi-VN-HoaiMyNeural",
  lang: "vi-VN"
});
const TTS_MAX_CONSECUTIVE_ERRORS = 3;
const TTS_CHAPTER_CHUNK_SIZE = 650;

function splitChapterForAudio(text, limit = TTS_CHAPTER_CHUNK_SIZE) {
  const paragraphs = String(text || "").split(/\n+/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs.flatMap((part) => splitLongParagraph(part, limit))) {
    if (current && current.length + paragraph.length + 2 > limit) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

function stripMp3Tags(bytes, keepLeadingId3 = false) {
  let start = 0;
  let end = bytes.length;
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    if (!keepLeadingId3) start = Math.min(10 + size + ((bytes[5] & 0x10) ? 10 : 0), bytes.length);
  }
  if (end - start >= 128 && bytes[end - 128] === 0x54 && bytes[end - 127] === 0x41 && bytes[end - 126] === 0x47) end -= 128;
  return bytes.slice(start, end);
}

async function mergeMp3Blobs(blobs) {
  const parts = [];
  for (let index = 0; index < blobs.length; index += 1) {
    const bytes = new Uint8Array(await blobs[index].arrayBuffer());
    parts.push(stripMp3Tags(bytes, index === 0));
  }
  return new Blob(parts, { type: "audio/mpeg" });
}

class TTSEngine {
  constructor() {
    this.synth = null;
    this.voices = [TTS_VOICE];
    this.nativeVoices = [];
    this.selectedVoice = TTS_VOICE;
    this.speed = 1;
    this.paragraphs = [];
    this.paragraphOffsets = [];
    this.totalChars = 0;
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.isLoading = false;
    this.mode = "drive"; // website strictly uses pre-recorded Google Drive audio
    this.isFullChapter = false;

    this.bookId = "";
    this.chapterNumber = 0;
    this.chapterTitle = "";
    this.prebuiltAudioUrl = "";

    this.currentUtterance = null;
    this.audio = null;
    this.audioUrl = "";
    this._session = 0;
    this._pending = new Map();
    this._memoryCache = new Map();
    this._utterances = new Set();
    this._consecutiveErrors = 0;

    this.timerMinutes = 0;
    this.timerRemainingSeconds = 0;
    this.timerInterval = null;
    this.stopAtChapterEnd = false;

    this.onParagraphChange = null;
    this.onStateChange = null;
    this.onTimeUpdate = null;
    this.onTimerTick = null;
    this.onFinished = null;
    this.onVoicesLoaded = null;
    this.onError = null;

    this.mediaMetadata = {
      title: "Trạm Chữ",
      artist: "Đọc truyện",
      album: "Trạm Chữ",
      coverUrl: ""
    };

    setTimeout(() => this.onVoicesLoaded?.(this.getAvailableVoices(), this.selectedVoice), 0);
  }

  initSpeechSynthesis() {
    // Disabled: System strictly uses audio recorded and saved in Google Drive.
  }

  updateMediaSession(metadata = {}) {
    this.mediaMetadata = { ...this.mediaMetadata, ...metadata };
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      const { title, artist, album, coverUrl } = this.mediaMetadata;
      const artwork = coverUrl ? [{ src: coverUrl, sizes: "512x512" }] : [];
      if (typeof MediaMetadata !== "undefined") {
        navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork });
      }
      navigator.mediaSession.setActionHandler("play", () => this.resume());
      navigator.mediaSession.setActionHandler("pause", () => this.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.previous());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
      navigator.mediaSession.setActionHandler("seekbackward", () => {
        if (this.audio?.duration) this.seekToTime(this.audio.currentTime - 15);
        else this.previous();
      });
      navigator.mediaSession.setActionHandler("seekforward", () => {
        if (this.audio?.duration) this.seekToTime(this.audio.currentTime + 15);
        else this.next();
      });
      navigator.mediaSession.setActionHandler("stop", () => this.stop());
    } catch (error) {
      console.warn("Unable to setup MediaSession:", error);
    }
  }

  setMediaPlaybackState(state = "none") {
    try {
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = state;
      }
    } catch {}
  }

  isSupported() {
    return typeof Audio !== "undefined" || typeof fetch === "function";
  }

  initVoices() {}
  isVietnameseVoice(voice) { return voice?.lang === "vi-VN" || voice?.lang?.startsWith("vi"); }
  isChineseVoice() { return false; }
  getVietnameseVoices() { return this.getAvailableVoices(); }
  getAvailableVoices() {
    return [TTS_VOICE];
  }

  setVoice(voiceURI) {
    this.selectedVoice = TTS_VOICE;
    this.mode = "drive";
  }

  setSpeed(speed) {
    this.speed = Math.max(0.5, Math.min(2.5, Number(speed) || 1));
    if (this.audio) this.audio.playbackRate = this.speed;
    if (this.currentUtterance) this.currentUtterance.rate = this.speed;
    this.notifyState();
  }

  calculateOffsets() {
    this.paragraphOffsets = [];
    let accum = 0;
    for (const p of this.paragraphs) {
      accum += p.length;
      this.paragraphOffsets.push(accum);
    }
    this.totalChars = accum;
  }

  loadText(text, options = {}) {
    this.stop();
    this.bookId = options.bookId || "";
    this.chapterNumber = Number(options.chapterNumber || 0);
    this.chapterTitle = options.title || "";
    this.prebuiltAudioUrl = options.audioUrl || "";
    this.isFullChapter = options.fullChapter !== undefined ? Boolean(options.fullChapter) : true;
    this.mode = options.mode || "drive";

    this.paragraphs = String(text || "")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => splitLongParagraph(part));
    this.calculateOffsets();
    this.currentIndex = 0;
  }

  loadChapter({ bookId = "", chapterNumber = 0, text = "", title = "", audioUrl = "" } = {}) {
    this.loadText(text, { bookId, chapterNumber, title, audioUrl, fullChapter: true });
  }

  getParagraphStartTime(index) {
    if (!this.audio?.duration || !this.totalChars) return 0;
    const startChars = index <= 0 ? 0 : (this.paragraphOffsets[index - 1] || 0);
    return (startChars / this.totalChars) * this.audio.duration;
  }

  getParagraphIndexFromTime(currentTime) {
    if (!this.audio?.duration || !this.totalChars) return 0;
    const targetChars = (currentTime / this.audio.duration) * this.totalChars;
    for (let i = 0; i < this.paragraphOffsets.length; i += 1) {
      if (targetChars <= this.paragraphOffsets[i]) return i;
    }
    return Math.max(0, this.paragraphs.length - 1);
  }

  play(startIndex = 0) {
    if (!this.isSupported() || !this.paragraphs.length) return false;
    if (!this.prebuiltAudioUrl) {
      this.isPlaying = false;
      this.isPaused = false;
      this.onError?.("Chương này chưa có bản thu âm audio từ Google Drive.");
      this.notifyState();
      return false;
    }
    this.currentIndex = Math.min(Math.max(0, startIndex), this.paragraphs.length - 1);
    this.isPlaying = true;
    this.isPaused = false;
    this._consecutiveErrors = 0;
    this.setMediaPlaybackState("playing");
    this.notifyState();

    void this.playFullChapter(this.currentIndex);
    return true;
  }

  async playFullChapter(startIndex = 0) {
    const session = ++this._session;
    this.releaseAudio();
    this.isLoading = true;
    this.isPaused = false;
    this.currentIndex = startIndex;
    this.pendingStartIndex = startIndex;
    this.onParagraphChange?.(startIndex);
    this.notifyState();

    try {
      if (this.prebuiltAudioUrl) {
        if (session !== this._session || !this.isPlaying) return;
        this.isLoading = false;
        this.audioUrl = this.prebuiltAudioUrl;
        return this.playPreparedAudio(session, startIndex);
      }
      this.isLoading = false;
      this.isPlaying = false;
      this.handleError(new Error("Chương này chưa có bản thu âm audio từ Google Drive."));
      return;
    } catch (error) {
      if (session === this._session) {
        this.handleError(error || new Error("Không thể phát bản ghi audio từ Google Drive."));
      }
    }
  }

  async playPreparedAudio(session, startIndex = 0) {
    const audio = new Audio(this.audioUrl);
    this.audio = audio;
    audio.preload = "auto";
    audio.playbackRate = this.speed;
    audio.onloadedmetadata = () => {
      if (session !== this._session) return;
      const startTime = this.getParagraphStartTime(startIndex);
      if (startTime > 0 && startTime < audio.duration) audio.currentTime = startTime;
      this.notifyState();
    };
    audio.ontimeupdate = () => {
      if (session !== this._session || !this.isPlaying) return;
      const index = this.getParagraphIndexFromTime(audio.currentTime);
      if (index !== this.currentIndex) { this.currentIndex = index; this.onParagraphChange?.(index); }
      this.onTimeUpdate?.({ currentTime: audio.currentTime, duration: audio.duration || 0, progressPercent: audio.duration ? audio.currentTime / audio.duration * 100 : 0, currentIndex: index, totalParagraphs: this.paragraphs.length });
    };
    audio.onended = () => { if (session === this._session && this.isPlaying && !this.isPaused) this.handleChapterFinished(); };
    audio.onerror = () => {
      if (session === this._session) {
        this.handleError(new Error("Không thể phát bản ghi audio từ Google Drive. Vui lòng kiểm tra lại đường truyền hoặc link audio."));
      }
    };
    this.notifyState();
    if (!this.isPaused) {
      try {
        await audio.play();
      } catch (err) {
        if (session === this._session) {
          this.handleError(err);
        }
      }
    }
  }

  fallbackToSpeechSynthesis(userNotice) {
    this.releaseAudio();
    this.handleError(new Error(userNotice || "Không thể phát audio từ Google Drive."));
  }

  playSpeechSynthesis(index = 0) {
    this.handleError(new Error("Website chỉ hỗ trợ phát audio thu âm từ Google Drive, không sử dụng giọng đọc máy."));
  }

  pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    this.audio?.pause();
    this.setMediaPlaybackState("paused");
    this.notifyState();
  }

  resume() {
    if (!this.isPlaying || !this.isPaused) return;
    this.isPaused = false;
    this.setMediaPlaybackState("playing");
    this.notifyState();

    if (this.audio?.src) {
      void this.audio.play().catch((error) => this.handleError(error));
    } else {
      void this.playFullChapter(this.currentIndex);
    }
  }

  stop() {
    this._session += 1;
    this.isPlaying = false;
    this.isPaused = false;
    this.isLoading = false;
    this._consecutiveErrors = 0;
    this.setMediaPlaybackState("none");
    this.releaseAudio();
    this.currentUtterance = null;
    this._utterances.clear();
    this.notifyState();
    this.onParagraphChange?.(-1);
  }

  releaseAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.ontimeupdate = null;
      this.audio.onloadedmetadata = null;
      this.audio.removeAttribute("src");
      this.audio.load?.();
    }
    this.audio = null;
    if (this.audioUrl && typeof URL !== "undefined" && this.audioUrl.startsWith("blob:")) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = "";
  }

  seekToParagraph(index) {
    const target = Math.max(0, Math.min(index, this.paragraphs.length - 1));
    this.currentIndex = target;
    this.onParagraphChange?.(target);

    if (this.audio && this.audio.duration) {
      const targetTime = this.getParagraphStartTime(target);
      this.audio.currentTime = targetTime;
      if (this.isPaused) void this.audio.play().catch(() => {});
      this.notifyState();
    } else {
      void this.play(target);
    }
  }

  seekToTime(seconds) {
    if (this.audio && this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
      const targetIndex = this.getParagraphIndexFromTime(this.audio.currentTime);
      if (targetIndex !== this.currentIndex) {
        this.currentIndex = targetIndex;
        this.onParagraphChange?.(targetIndex);
      }
      this.notifyState();
    }
  }

  seekToPercent(percent) {
    if (this.audio && this.audio.duration) {
      const seconds = (Math.max(0, Math.min(percent, 100)) / 100) * this.audio.duration;
      this.seekToTime(seconds);
    }
  }

  previous() {
    if (!this.paragraphs.length) return;
    this.seekToParagraph(Math.max(0, this.currentIndex - 1));
  }

  next() {
    if (!this.paragraphs.length) return;
    const target = this.currentIndex + 1;
    if (target < this.paragraphs.length) this.seekToParagraph(target);
    else this.handleChapterFinished();
  }

  async speakParagraph(index) {
    if (!this.isSupported() || !this.isPlaying) return;
    if (index >= this.paragraphs.length) return this.handleChapterFinished();

    if (this.isFullChapter) {
      if (this.audio && this.audio.duration) {
        return this.seekToParagraph(index);
      }
      this.pendingStartIndex = index;
      if (!this.isLoading && !this.audio) {
        return this.playFullChapter(index);
      }
      return;
    }

    if (this.mode === "speechSynthesis") {
      return this.playSpeechSynthesis(index);
    }

    return this.speakSnippet(index);
  }

  async speakSnippet(index) {
    const text = this.paragraphs[index];
    if (!text) return this.speakParagraph(index + 1);

    const session = ++this._session;
    this.releaseAudio();
    this.currentIndex = index;
    this.isLoading = true;
    this.isPaused = false;
    this.onParagraphChange?.(index);
    this.notifyState();

    try {
      const blob = await this.getAudioBlob(text);
      if (session !== this._session || !this.isPlaying) return;
      this.isLoading = false;
      this.audioUrl = URL.createObjectURL(blob);
      this._consecutiveErrors = 0;

      const audio = new Audio(this.audioUrl);
      this.audio = audio;
      audio.preload = "auto";
      audio.playbackRate = this.speed;

      audio.onended = () => {
        if (session !== this._session || !this.isPlaying || this.isPaused) return;
        if (this.currentIndex + 1 < this.paragraphs.length) void this.speakParagraph(this.currentIndex + 1);
        else this.handleChapterFinished();
      };

      audio.onerror = () => {
        void this.removeAudioCache(text);
        if (session === this._session) this.handleParagraphError(new Error("Không phát được audio Edge-TTS."), index);
      };

      this.notifyState();
      if (!this.isPaused) await audio.play();
    } catch (error) {
      if (session === this._session) this.handleParagraphError(error, index);
    }
  }

  async cacheKey(text, options = {}) {
    const prefix = options.fullChapter ? "v2|full" : "v1";
    const source = `${prefix}|${TTS_VOICE.voiceURI}|rate=-4%|${text}`;
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16);
  }

  async getAudioBlob(text, options = {}) {
    // Include the text digest even for a named chapter. Otherwise an incomplete
    // or obsolete chapter remains cached forever after its translation changes.
    const digest = await this.cacheKey(text, options);
    const key = options.fullChapter && options.bookId && options.chapterNumber
      ? `chapter|${options.bookId}|${options.chapterNumber}|${digest}`
      : digest;

    if (this._memoryCache.has(key)) return this._memoryCache.get(key);
    if (this._pending.has(key)) return this._pending.get(key);

    const pending = (async () => {
      const origin = typeof location !== "undefined" ? location.origin : "https://tram-chu.local";
      const cacheUrl = `${origin}/__tts_cache__/${key}.mp3`;
      const cache = typeof caches !== "undefined" ? await caches.open(TTS_CACHE).catch(() => null) : null;
      const cached = cache ? await cache.match(cacheUrl) : null;
      if (cached) {
        const blob = await cached.blob();
        this._memoryCache.set(key, blob);
        return blob;
      }

      const blob = await this.fetchAudioBlobWithRetry(text, 3, options);
      if (!blob.size) throw new Error("Edge-TTS trả về audio rỗng.");

      if (cache) {
        await cache
          .put(cacheUrl, new Response(blob, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "max-age=31536000" } }))
          .catch(() => {});
      }
      this._memoryCache.set(key, blob);
      return blob;
    })();

    this._pending.set(key, pending);
    try {
      return await pending;
    } finally {
      this._pending.delete(key);
    }
  }

  async fetchAudioBlobWithRetry(text, attempts = 3, options = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.fetchAudioBlob(text, options);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await delay(250 * attempt);
      }
    }
    throw lastError || new Error("Không tạo được giọng đọc.");
  }

  async fetchAudioBlob(text, options = {}) {
    if (options.fullChapter && String(text).length > TTS_CHAPTER_CHUNK_SIZE) {
      return this.fetchFullChapterAudioBlob(text, options);
    }
    const payload = {
      text,
      bookId: options.bookId || this.bookId || "",
      chapterNumber: options.chapterNumber || this.chapterNumber || 0,
      fullChapter: options.fullChapter !== undefined ? Boolean(options.fullChapter) : Boolean(this.isFullChapter)
    };

    const response = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let message = "Không tạo được giọng đọc. Vui lòng thử lại.";
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    return response.blob();
  }

  async fetchFullChapterAudioBlob(text, options = {}) {
    const chunks = splitChapterForAudio(text);
    const blobs = new Array(chunks.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < chunks.length) {
        const index = cursor++;
        blobs[index] = await this.fetchAudioBlobWithRetry(chunks[index], 3, { ...options, fullChapter: false });
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, () => worker()));
    return mergeMp3Blobs(blobs);
  }

  async removeAudioCache(text, options = {}) {
    try {
      const digest = await this.cacheKey(text, options);
      const key = options.fullChapter && options.bookId && options.chapterNumber
        ? `chapter|${options.bookId}|${options.chapterNumber}|${digest}`
        : digest;
      this._memoryCache.delete(key);
      if (typeof caches === "undefined") return;
      const cache = await caches.open(TTS_CACHE).catch(() => null);
      const origin = typeof location !== "undefined" ? location.origin : "https://tram-chu.local";
      if (cache) await cache.delete(`${origin}/__tts_cache__/${key}.mp3`).catch(() => {});
    } catch {}
  }

  handleParagraphError(error, index) {
    console.warn("Audio paragraph error:", error);
    this.handleError(error);
  }

  handleError(error) {
    console.warn("TTS error:", error);
    this.isLoading = false;
    this.isPlaying = false;
    this.isPaused = false;
    this.setMediaPlaybackState("none");
    this.releaseAudio();
    this.notifyState();
    this.onParagraphChange?.(-1);
    this.onError?.(error instanceof Error ? error.message : (error?.message || "Không thể phát audio."));
  }

  handleChapterFinished() {
    if (this.stopAtChapterEnd) {
      this.stop();
      this.setSleepTimer(0);
      return;
    }
    if (this.onFinished) this.onFinished();
    else this.stop();
  }

  setSleepTimer(minutes) {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerMinutes = minutes;
    this.stopAtChapterEnd = false;
    if (minutes === -1) {
      this.stopAtChapterEnd = true;
      this.timerRemainingSeconds = 0;
      this.onTimerTick?.("Hết chương");
      return;
    }
    if (minutes <= 0) {
      this.timerRemainingSeconds = 0;
      this.onTimerTick?.("");
      return;
    }
    this.timerRemainingSeconds = minutes * 60;
    this.notifyTimer();
    this.timerInterval = setInterval(() => {
      this.timerRemainingSeconds -= 1;
      this.notifyTimer();
      if (this.timerRemainingSeconds <= 0) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.stop();
        this.onTimerTick?.("Đã tắt");
      }
    }, 1000);
  }

  notifyTimer() {
    const mins = Math.floor(this.timerRemainingSeconds / 60);
    const secs = this.timerRemainingSeconds % 60;
    this.onTimerTick?.(`${mins}:${String(secs).padStart(2, "0")}`);
  }

  notifyState() {
    this.onStateChange?.({
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      isLoading: this.isLoading,
      currentIndex: this.currentIndex,
      totalParagraphs: this.paragraphs.length,
      speed: this.speed,
      mode: this.mode,
      duration: this.audio?.duration || 0,
      currentTime: this.audio?.currentTime || 0,
      hasTimer: this.timerRemainingSeconds > 0 || this.stopAtChapterEnd,
      timerLabel: this.stopAtChapterEnd
        ? "Hết chương"
        : this.timerRemainingSeconds > 0
        ? `${Math.ceil(this.timerRemainingSeconds / 60)}p`
        : ""
    });
  }
}

function splitLongParagraph(text, maxLength = 2800) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength + 1);
    const candidates = [
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("; "),
      window.lastIndexOf(", "),
      window.lastIndexOf(" ")
    ];
    const splitAt = Math.max(...candidates);
    const end = splitAt >= Math.floor(maxLength * 0.55) ? splitAt + 1 : maxLength;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTTS() {
  return new TTSEngine();
}

export { createTTS, TTSEngine, TTS_CACHE, TTS_VOICE, splitLongParagraph, splitChapterForAudio, mergeMp3Blobs };
