"use strict";

// On-demand Edge-TTS player. Audio is cached in the reader's browser, not R2.
const TTS_ENDPOINT = "/api/reader/tts";
const TTS_CACHE = "tram-chu-tts-v1";
const TTS_VOICE = Object.freeze({ name: "Microsoft Hoài My (Edge-TTS)", voiceURI: "vi-VN-HoaiMyNeural", lang: "vi-VN" });
const TTS_MAX_CONSECUTIVE_ERRORS = 3;

class TTSEngine {
  constructor() {
    this.synth = null;
    this.voices = [TTS_VOICE];
    this.selectedVoice = TTS_VOICE;
    this.speed = 1;
    this.paragraphs = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.isLoading = false;
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
    this.onTimerTick = null;
    this.onFinished = null;
    this.onVoicesLoaded = null;
    this.onError = null;
    this.mediaMetadata = { title: "Trạm Chữ", artist: "Đọc truyện", album: "Trạm Chữ", coverUrl: "" };
    setTimeout(() => this.onVoicesLoaded?.(this.voices, this.selectedVoice), 0);
  }

  updateMediaSession(metadata = {}) {
    this.mediaMetadata = { ...this.mediaMetadata, ...metadata };
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      const { title, artist, album, coverUrl } = this.mediaMetadata;
      const artwork = coverUrl ? [{ src: coverUrl, sizes: "512x512" }] : [];
      if (typeof MediaMetadata !== "undefined") navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork });
      navigator.mediaSession.setActionHandler("play", () => this.resume());
      navigator.mediaSession.setActionHandler("pause", () => this.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.previous());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
      navigator.mediaSession.setActionHandler("seekbackward", () => this.previous());
      navigator.mediaSession.setActionHandler("seekforward", () => this.next());
      navigator.mediaSession.setActionHandler("stop", () => this.stop());
    } catch (error) { console.warn("Unable to setup MediaSession:", error); }
  }

  setMediaPlaybackState(state = "none") {
    try { if (typeof navigator !== "undefined" && "mediaSession" in navigator) navigator.mediaSession.playbackState = state; } catch {}
  }

  isSupported() { return typeof fetch === "function" && typeof Audio !== "undefined"; }
  initVoices() {}
  isVietnameseVoice(voice) { return voice?.lang === "vi-VN"; }
  isChineseVoice() { return false; }
  getVietnameseVoices() { return [...this.voices]; }
  getAvailableVoices() { return [...this.voices]; }
  setVoice() { this.selectedVoice = TTS_VOICE; }

  setSpeed(speed) {
    this.speed = Math.max(0.5, Math.min(2.5, Number(speed) || 1));
    if (this.audio) this.audio.playbackRate = this.speed;
    this.notifyState();
  }

  loadText(text) {
    this.stop();
    this.paragraphs = String(text || "").split(/\n+/).map((part) => part.trim()).filter(Boolean).flatMap((part) => splitLongParagraph(part));
    this.currentIndex = 0;
  }

  play(startIndex = 0) {
    if (!this.isSupported() || !this.paragraphs.length) return false;
    this.currentIndex = Math.min(Math.max(0, startIndex), this.paragraphs.length - 1);
    this.isPlaying = true;
    this.isPaused = false;
    this._consecutiveErrors = 0;
    this.setMediaPlaybackState("playing");
    this.notifyState();
    void this.speakParagraph(this.currentIndex);
    return true;
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
    if (this.audio?.src) void this.audio.play().catch((error) => this.handleError(error));
    else void this.speakParagraph(this.currentIndex);
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
      this.audio.removeAttribute("src");
      this.audio.load?.();
    }
    this.audio = null;
    if (this.audioUrl && typeof URL !== "undefined") URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = "";
  }

  previous() { if (this.paragraphs.length) void this.speakParagraph(Math.max(0, this.currentIndex - 1), true); }
  next() {
    if (!this.paragraphs.length) return;
    const target = this.currentIndex + 1;
    if (target < this.paragraphs.length) void this.speakParagraph(target, true);
    else this.handleChapterFinished();
  }

  async speakParagraph(index) {
    if (!this.isSupported() || !this.isPlaying) return;
    if (index >= this.paragraphs.length) return this.handleChapterFinished();
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

  async cacheKey(text) {
    const source = `v1|${TTS_VOICE.voiceURI}|rate=-4%|${text}`;
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16);
  }

  async getAudioBlob(text) {
    const key = await this.cacheKey(text);
    if (this._memoryCache.has(key)) return this._memoryCache.get(key);
    if (this._pending.has(key)) return this._pending.get(key);
    const pending = (async () => {
      const origin = typeof location !== "undefined" ? location.origin : "https://tram-chu.local";
      const cacheUrl = `${origin}/__tts_cache__/${key}.mp3`;
      const cache = typeof caches !== "undefined" ? await caches.open(TTS_CACHE).catch(() => null) : null;
      const cached = cache ? await cache.match(cacheUrl) : null;
      if (cached) return cached.blob();
      const blob = await this.fetchAudioBlobWithRetry(text);
      if (!blob.size) throw new Error("Edge-TTS trả về audio rỗng.");
      if (cache) await cache.put(cacheUrl, new Response(blob, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "max-age=31536000" } })).catch(() => {});
      this._memoryCache.set(key, blob);
      return blob;
    })();
    this._pending.set(key, pending);
    try { return await pending; } finally { this._pending.delete(key); }
  }

  async fetchAudioBlobWithRetry(text, attempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try { return await this.fetchAudioBlob(text); }
      catch (error) {
        lastError = error;
        if (attempt < attempts) await delay(250 * attempt);
      }
    }
    throw lastError || new Error("Không tạo được giọng đọc.");
  }

  async fetchAudioBlob(text) {
    const response = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      let message = "Không tạo được giọng đọc. Vui lòng thử lại.";
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
    return response.blob();
  }

  async removeAudioCache(text) {
    try {
      const key = await this.cacheKey(text);
      this._memoryCache.delete(key);
      if (typeof caches === "undefined") return;
      const cache = await caches.open(TTS_CACHE).catch(() => null);
      const origin = typeof location !== "undefined" ? location.origin : "https://tram-chu.local";
      if (cache) await cache.delete(`${origin}/__tts_cache__/${key}.mp3`).catch(() => {});
    } catch {}
  }

  handleParagraphError(error, index) {
    console.warn("Edge-TTS paragraph error:", error);
    this._consecutiveErrors += 1;
    this.isLoading = false;
    this.releaseAudio();
    if (this.isPlaying && this._consecutiveErrors < TTS_MAX_CONSECUTIVE_ERRORS && index + 1 < this.paragraphs.length) {
      this.onError?.("Một đoạn bị lỗi tạo giọng, đang chuyển sang đoạn kế tiếp...");
      this.notifyState();
      void this.speakParagraph(index + 1);
      return;
    }
    this.handleError(error);
  }

  handleError(error) {
    console.warn("Edge-TTS error:", error);
    this.isLoading = false;
    this.isPlaying = false;
    this.isPaused = false;
    this.setMediaPlaybackState("none");
    this.releaseAudio();
    this.notifyState();
    this.onParagraphChange?.(-1);
    this.onError?.(error instanceof Error ? error.message : "Không tạo được giọng đọc.");
  }

  handleChapterFinished() {
    if (this.stopAtChapterEnd) { this.stop(); this.setSleepTimer(0); return; }
    if (this.onFinished) this.onFinished(); else this.stop();
  }

  setSleepTimer(minutes) {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerMinutes = minutes;
    this.stopAtChapterEnd = false;
    if (minutes === -1) { this.stopAtChapterEnd = true; this.timerRemainingSeconds = 0; this.onTimerTick?.("Hết chương"); return; }
    if (minutes <= 0) { this.timerRemainingSeconds = 0; this.onTimerTick?.(""); return; }
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
      isPlaying: this.isPlaying, isPaused: this.isPaused, isLoading: this.isLoading,
      currentIndex: this.currentIndex, totalParagraphs: this.paragraphs.length, speed: this.speed,
      hasTimer: this.timerRemainingSeconds > 0 || this.stopAtChapterEnd,
      timerLabel: this.stopAtChapterEnd ? "Hết chương" : (this.timerRemainingSeconds > 0 ? `${Math.ceil(this.timerRemainingSeconds / 60)}p` : "")
    });
  }
}

function splitLongParagraph(text, maxLength = 2800) {
  if (text.length <= maxLength) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength + 1);
    const candidates = [window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("; "), window.lastIndexOf(", "), window.lastIndexOf(" ")];
    const splitAt = Math.max(...candidates);
    const end = splitAt >= Math.floor(maxLength * 0.55) ? splitAt + 1 : maxLength;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function createTTS() { return new TTSEngine(); }

export { createTTS, TTSEngine, TTS_CACHE, TTS_VOICE, splitLongParagraph };
