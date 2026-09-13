"use strict";

// Trạm Chữ High-Performance TTS Engine
// Supports:
// 1. Full-chapter neural audio (Edge-TTS stitched CBR MP3, Cloudflare R2 + browser Cache API cached)
// 2. Continuous time-ratio paragraph tracking and interactive seeking
// 3. Zero-failure fallback to browser native SpeechSynthesis (offline device voices)
const TTS_ENDPOINT = "/api/reader/tts";
const TTS_CACHE = "tram-chu-tts-v1";
const TTS_VOICE = Object.freeze({
  name: "Microsoft Hoài My (Edge-TTS)",
  voiceURI: "vi-VN-HoaiMyNeural",
  lang: "vi-VN"
});
const TTS_MAX_CONSECUTIVE_ERRORS = 3;

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
    this.mode = "edge"; // "edge" or "speechSynthesis"
    this.isFullChapter = false;

    this.bookId = "";
    this.chapterNumber = 0;
    this.chapterTitle = "";

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

    this.initSpeechSynthesis();
    setTimeout(() => this.onVoicesLoaded?.(this.getAvailableVoices(), this.selectedVoice), 0);
  }

  initSpeechSynthesis() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
      const loadNativeVoices = () => {
        try {
          const all = this.synth?.getVoices?.() || [];
          this.nativeVoices = all.filter(
            (v) => v.lang && (v.lang.startsWith("vi") || v.lang === "vi-VN" || v.lang.toLowerCase().includes("vietnam"))
          );
        } catch {}
      };
      loadNativeVoices();
      if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
        window.speechSynthesis.onvoiceschanged = loadNativeVoices;
      }
    }
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
    return (
      (typeof fetch === "function" && typeof Audio !== "undefined") ||
      (typeof window !== "undefined" && "speechSynthesis" in window)
    );
  }

  initVoices() {}
  isVietnameseVoice(voice) { return voice?.lang === "vi-VN" || voice?.lang?.startsWith("vi"); }
  isChineseVoice() { return false; }
  getVietnameseVoices() { return this.getAvailableVoices(); }
  getAvailableVoices() {
    // Keep TTS_VOICE as primary. If native Vietnamese voices exist, expose them too.
    if (this.nativeVoices.length > 0) {
      return [TTS_VOICE, ...this.nativeVoices];
    }
    return [...this.voices];
  }

  setVoice(voiceURI) {
    if (!voiceURI || voiceURI === TTS_VOICE.voiceURI) {
      this.selectedVoice = TTS_VOICE;
      this.mode = "edge";
      return;
    }
    const found = this.nativeVoices.find((v) => (v.voiceURI || v.name) === voiceURI);
    if (found) {
      this.selectedVoice = found;
      this.mode = "speechSynthesis";
    } else {
      this.selectedVoice = TTS_VOICE;
      this.mode = "edge";
    }
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
    this.isFullChapter = Boolean(options.fullChapter || this.bookId);
    this.mode = options.mode || "edge";

    this.paragraphs = String(text || "")
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => splitLongParagraph(part));
    this.calculateOffsets();
    this.currentIndex = 0;
  }

  loadChapter({ bookId = "", chapterNumber = 0, text = "", title = "" } = {}) {
    this.loadText(text, { bookId, chapterNumber, title, fullChapter: true });
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
    this.currentIndex = Math.min(Math.max(0, startIndex), this.paragraphs.length - 1);
    this.isPlaying = true;
    this.isPaused = false;
    this._consecutiveErrors = 0;
    this.setMediaPlaybackState("playing");
    this.notifyState();

    if (this.mode === "speechSynthesis") {
      this.playSpeechSynthesis(this.currentIndex);
      return true;
    }

    if (this.isFullChapter && this.paragraphs.length > 0) {
      void this.playFullChapter(this.currentIndex);
    } else {
      void this.speakParagraph(this.currentIndex);
    }
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
      const fullText = this.paragraphs.join("\n\n");
      const blob = await this.getAudioBlob(fullText, {
        bookId: this.bookId,
        chapterNumber: this.chapterNumber,
        fullChapter: true
      });

      if (session !== this._session || !this.isPlaying) return;
      this.isLoading = false;
      this.audioUrl = URL.createObjectURL(blob);
      this._consecutiveErrors = 0;

      const audio = new Audio(this.audioUrl);
      this.audio = audio;
      audio.preload = "auto";
      audio.playbackRate = this.speed;

      const target = this.pendingStartIndex ?? startIndex;

      audio.onloadedmetadata = () => {
        if (session !== this._session) return;
        if (target > 0) {
          const startTime = this.getParagraphStartTime(target);
          if (startTime > 0 && startTime < audio.duration) {
            audio.currentTime = startTime;
          }
        }
        this.notifyState();
      };

      audio.ontimeupdate = () => {
        if (session !== this._session || !this.isPlaying) return;
        const newIndex = this.getParagraphIndexFromTime(audio.currentTime);
        if (newIndex !== this.currentIndex) {
          this.currentIndex = newIndex;
          this.onParagraphChange?.(newIndex);
        }
        this.onTimeUpdate?.({
          currentTime: audio.currentTime,
          duration: audio.duration || 0,
          progressPercent: audio.duration ? (audio.currentTime / audio.duration) * 100 : 0,
          currentIndex: this.currentIndex,
          totalParagraphs: this.paragraphs.length
        });
      };

      audio.onended = () => {
        if (session !== this._session || !this.isPlaying || this.isPaused) return;
        this.handleChapterFinished();
      };

      audio.onerror = () => {
        if (session !== this._session) return;
        console.warn("Full chapter audio playback error.");
        this.handleError(new Error("Lỗi phát audio cả chương."));
      };

      this.notifyState();
      if (!this.isPaused) await audio.play();
    } catch (error) {
      if (session === this._session) {
        console.warn("Full chapter synthesis failed:", error);
        this.handleError(error);
      }
    }
  }

  fallbackToSpeechSynthesis(userNotice) {
    this.releaseAudio();
    if (this.synth) {
      this.mode = "speechSynthesis";
      if (userNotice) this.onError?.(userNotice);
      this.playSpeechSynthesis(this.currentIndex);
    } else {
      this.handleError(new Error(userNotice || "Không thể phát âm thanh."));
    }
  }

  playSpeechSynthesis(index = 0) {
    if (!this.synth || typeof SpeechSynthesisUtterance === "undefined") {
      this.handleError(new Error("Thiết bị không hỗ trợ đọc offline"));
      return;
    }
    this.mode = "speechSynthesis";
    this.currentIndex = Math.min(Math.max(0, index), this.paragraphs.length - 1);
    this.releaseAudio();

    try { this.synth.cancel(); } catch {}

    const text = this.paragraphs[this.currentIndex];
    if (!text) {
      if (this.currentIndex + 1 < this.paragraphs.length) {
        return this.playSpeechSynthesis(this.currentIndex + 1);
      }
      return this.handleChapterFinished();
    }

    const session = ++this._session;
    this.isLoading = false;
    this.isPlaying = true;
    this.isPaused = false;
    this.onParagraphChange?.(this.currentIndex);
    this.notifyState();

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.speed;
      const viVoice =
        this.nativeVoices.find((v) => (v.voiceURI || v.name) === this.selectedVoice?.voiceURI) ||
        this.nativeVoices[0] ||
        this.synth.getVoices?.().find((v) => v.lang?.startsWith("vi"));
      if (viVoice) utterance.voice = viVoice;

      utterance.onstart = () => {
        if (session !== this._session) return;
        this.isLoading = false;
        this.isPlaying = true;
        this.isPaused = false;
        this.notifyState();
      };

      utterance.onend = () => {
        if (session !== this._session || !this.isPlaying || this.isPaused) return;
        this._utterances.delete(utterance);
        if (this.currentIndex + 1 < this.paragraphs.length) {
          this.playSpeechSynthesis(this.currentIndex + 1);
        } else {
          this.handleChapterFinished();
        }
      };

      utterance.onerror = (err) => {
        if (session !== this._session) return;
        this._utterances.delete(utterance);
        console.warn("SpeechSynthesis utterance error:", err);
        // Advance to next paragraph so speech NEVER halts completely
        if (this.currentIndex + 1 < this.paragraphs.length) {
          this.playSpeechSynthesis(this.currentIndex + 1);
        } else {
          this.handleChapterFinished();
        }
      };

      this.currentUtterance = utterance;
      this._utterances.add(utterance);
      this.synth.speak(utterance);
    } catch (err) {
      console.warn("Unable to speak utterance:", err);
      if (this.currentIndex + 1 < this.paragraphs.length) {
        this.playSpeechSynthesis(this.currentIndex + 1);
      } else {
        this.handleError(err);
      }
    }
  }

  pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    if (this.mode === "speechSynthesis") {
      try { if (this.synth?.speaking) this.synth.pause(); } catch {}
    } else {
      this.audio?.pause();
    }
    this.setMediaPlaybackState("paused");
    this.notifyState();
  }

  resume() {
    if (!this.isPlaying || !this.isPaused) return;
    this.isPaused = false;
    this.setMediaPlaybackState("playing");
    this.notifyState();

    if (this.mode === "speechSynthesis") {
      try {
        if (this.synth?.paused) this.synth.resume();
        else this.playSpeechSynthesis(this.currentIndex);
      } catch {
        this.playSpeechSynthesis(this.currentIndex);
      }
    } else {
      if (this.audio?.src) {
        void this.audio.play().catch((error) => this.fallbackToSpeechSynthesis(error.message));
      } else if (this.isFullChapter) {
        void this.playFullChapter(this.currentIndex);
      } else {
        void this.speakParagraph(this.currentIndex);
      }
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
    if (this.synth) {
      try { this.synth.cancel(); } catch {}
    }
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
    if (this.audioUrl && typeof URL !== "undefined") URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = "";
  }

  seekToParagraph(index) {
    const target = Math.max(0, Math.min(index, this.paragraphs.length - 1));
    this.currentIndex = target;
    this.onParagraphChange?.(target);

    if (this.mode === "speechSynthesis") {
      this.playSpeechSynthesis(target);
      return;
    }

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
    const key =
      options.fullChapter && options.bookId && options.chapterNumber
        ? `chapter|${options.bookId}|${options.chapterNumber}`
        : await this.cacheKey(text, options);

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
    const payload = {
      text,
      bookId: options.bookId || this.bookId || "",
      chapterNumber: options.chapterNumber || this.chapterNumber || 0,
      fullChapter: Boolean(options.fullChapter || this.isFullChapter)
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

  async removeAudioCache(text, options = {}) {
    try {
      const key = await this.cacheKey(text, options);
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

    if (this._consecutiveErrors >= TTS_MAX_CONSECUTIVE_ERRORS) {
      console.warn("Edge-TTS exceeded consecutive errors. Falling back to SpeechSynthesis.");
      return this.fallbackToSpeechSynthesis("Đã chuyển sang giọng đọc thiết bị để tiếp tục đọc không gián đoạn.");
    }

    if (this.isPlaying && index + 1 < this.paragraphs.length) {
      this.onError?.("Một đoạn bị lỗi tạo giọng, đang chuyển sang đoạn kế tiếp...");
      this.notifyState();
      void this.speakParagraph(index + 1);
      return;
    }
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
    this.onError?.(error instanceof Error ? error.message : "Không tạo được giọng đọc.");
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

export { createTTS, TTSEngine, TTS_CACHE, TTS_VOICE, splitLongParagraph };
