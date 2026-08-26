"use strict";

// Trạm Chữ — Web Speech API Text-to-Speech (TTS) Engine
// 100% Client-side speech synthesis with sentence highlighting,
// auto-advance, voice selection, and sleep timer.

class TTSEngine {
  constructor() {
    this.synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
    this.voices = [];
    this.selectedVoice = null;
    this.speed = 1.0;
    this.paragraphs = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentUtterance = null;

    // Sleep timer state
    this.timerMinutes = 0;
    this.timerRemainingSeconds = 0;
    this.timerInterval = null;
    this.stopAtChapterEnd = false;

    // Callbacks
    this.onParagraphChange = null;
    this.onStateChange = null;
    this.onTimerTick = null;
    this.onFinished = null;
    this.onVoicesLoaded = null;

    this.mediaMetadata = { title: "Trạm Chữ", artist: "Đọc truyện", album: "Trạm Chữ", coverUrl: "" };
    this._utterances = new Set();
    this.initVoices();
  }

  updateMediaSession(metadata = {}) {
    this.mediaMetadata = { ...this.mediaMetadata, ...metadata };
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    try {
      const { title = "Trạm Chữ", artist = "Đọc truyện", album = "Trạm Chữ", coverUrl = "" } = this.mediaMetadata;
      const artwork = coverUrl ? [{ src: coverUrl, sizes: "512x512", type: "image/webp" }] : [];

      if (typeof MediaMetadata !== "undefined") {
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist,
          album,
          artwork
        });
      }

      navigator.mediaSession.setActionHandler("play", () => this.resume());
      navigator.mediaSession.setActionHandler("pause", () => this.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.previous());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
      navigator.mediaSession.setActionHandler("seekbackward", () => this.previous());
      navigator.mediaSession.setActionHandler("seekforward", () => this.next());
      navigator.mediaSession.setActionHandler("stop", () => this.stop());
    } catch (e) {
      console.warn("Unable to setup MediaSession:", e);
    }
  }

  setMediaPlaybackState(state = "none") {
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.playbackState = state;
      } catch {}
    }
  }

  isSupported() {
    return Boolean(this.synth && typeof SpeechSynthesisUtterance !== "undefined");
  }

  initVoices() {
    if (!this.synth) return;
    const load = () => {
      this.voices = this.synth.getVoices() || [];
      const viVoices = this.getVietnameseVoices();
      if (viVoices.length > 0) {
        // Prefer natural / online / Google / Microsoft Vietnamese voices
        const preferredVi = viVoices.find(
          (v) => v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("HoaiMy") || v.name.includes("NamMinh") || v.name.includes("An") || v.name.includes("Linh")
        ) || viVoices[0];
        this.selectedVoice = preferredVi;
      } else {
        // If no Vietnamese voice is available, pick first non-Chinese voice (e.g. English) as fallback
        const nonChinese = this.voices.filter((v) => !this.isChineseVoice(v));
        this.selectedVoice = nonChinese.length > 0 ? nonChinese[0] : null;
      }
      if (this.onVoicesLoaded) {
        this.onVoicesLoaded(this.voices, this.selectedVoice);
      }
    };

    load();
    if (typeof this.synth.onvoiceschanged !== "undefined") {
      this.synth.onvoiceschanged = load;
    }
    // Chromium / iOS WebKit populate voices asynchronously
    setTimeout(load, 400);
    setTimeout(load, 1200);
    setTimeout(load, 3000);
  }

  isVietnameseVoice(v) {
    if (!v) return false;
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = (v.name || "").toLowerCase();
    return (
      lang.startsWith("vi") ||
      name.includes("vietnam") ||
      name.includes("tiếng việt") ||
      name.includes("tieng viet") ||
      name.includes("hoaimy") ||
      name.includes("hoài my") ||
      name.includes("namminh") ||
      name.includes("nam minh") ||
      name.includes("linh") ||
      name.includes("mai") ||
      (name.includes("an") && (lang.startsWith("vi") || !lang || name.includes("viet")))
    );
  }

  isChineseVoice(v) {
    if (!v) return false;
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = (v.name || "").toLowerCase();
    return (
      lang.startsWith("zh") ||
      lang.startsWith("cmn") ||
      lang.startsWith("yue") ||
      name.includes("chinese") ||
      name.includes("huihui") ||
      name.includes("yahei") ||
      name.includes("hanhan") ||
      name.includes("kangkang") ||
      name.includes("taiwan") ||
      name.includes("mandarin") ||
      name.includes("cantonese") ||
      name.includes("xiaoxiao") ||
      name.includes("yunxi") ||
      name.includes("yunjian") ||
      name.includes("普通话") ||
      name.includes("粤语") ||
      name.includes("國語")
    );
  }

  getVietnameseVoices() {
    if (!this.voices.length && this.synth) this.voices = this.synth.getVoices() || [];
    return this.voices.filter((v) => this.isVietnameseVoice(v));
  }

  getAvailableVoices() {
    if (!this.voices.length && this.synth) this.voices = this.synth.getVoices() || [];
    const vi = this.voices.filter((v) => this.isVietnameseVoice(v));
    // Strictly return Vietnamese voices only to prevent foreign language pronunciation issues
    if (vi.length > 0) return vi;
    return [];
  }

  setVoice(voiceURI) {
    if (!this.voices.length && this.synth) this.voices = this.synth.getVoices() || [];
    const v = this.voices.find((item) => item.voiceURI === voiceURI || item.name === voiceURI);
    if (v) {
      this.selectedVoice = v;
      if (this.isPlaying && !this.isPaused) {
        this.speakParagraph(this.currentIndex);
      }
    }
  }

  setSpeed(speed) {
    this.speed = Math.max(0.5, Math.min(2.5, Number(speed) || 1.0));
    if (this.isPlaying && !this.isPaused) {
      this.speakParagraph(this.currentIndex);
    }
  }

  loadText(text) {
    this.stop();
    if (!text) {
      this.paragraphs = [];
      return;
    }
    this.paragraphs = String(text)
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    this.currentIndex = 0;
  }

  play(startIndex = 0) {
    if (!this.isSupported() || !this.paragraphs.length) return false;
    this.currentIndex = Math.min(Math.max(0, startIndex), this.paragraphs.length - 1);
    this.isPlaying = true;
    this.isPaused = false;
    this.setMediaPlaybackState("playing");
    this.notifyState();
    this.speakParagraph(this.currentIndex);
    return true;
  }

  pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    this.setMediaPlaybackState("paused");
    if (this.synth) this.synth.pause();
    this.notifyState();
  }

  resume() {
    if (!this.isPlaying || !this.isPaused) return;
    this.isPaused = false;
    this.setMediaPlaybackState("playing");
    if (this.synth && this.synth.paused) {
      this.synth.resume();
    } else {
      this.speakParagraph(this.currentIndex);
    }
    this.notifyState();
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.setMediaPlaybackState("none");
    if (this.synth) {
      this.synth.cancel();
    }
    this.currentUtterance = null;
    this._utterances.clear();
    if (typeof window !== "undefined") {
      window._safariActiveUtterance = null;
    }
    this.notifyState();
    if (this.onParagraphChange) this.onParagraphChange(-1);
  }

  previous() {
    if (!this.paragraphs.length) return;
    if (this.synth) this.synth.cancel();
    const target = Math.max(0, this.currentIndex - 1);
    this.speakParagraph(target, true);
  }

  next() {
    if (!this.paragraphs.length) return;
    if (this.synth) this.synth.cancel();
    const target = this.currentIndex + 1;
    if (target < this.paragraphs.length) {
      this.speakParagraph(target, true);
    } else {
      this.handleChapterFinished();
    }
  }

  speakParagraph(index, isUserAction = false) {
    if (!this.isSupported() || !this.isPlaying) return;
    if (index >= this.paragraphs.length) {
      this.handleChapterFinished();
      return;
    }

    if (isUserAction && this.synth) {
      this.synth.cancel();
    }

    this.currentIndex = index;
    if (this.onParagraphChange) this.onParagraphChange(index);

    const textToSpeak = this.paragraphs[index];
    if (!textToSpeak) {
      this.speakParagraph(index + 1);
      return;
    }

    if (!this.voices.length && this.synth) {
      this.voices = this.synth.getVoices() || [];
    }

    const viVoices = this.getVietnameseVoices();
    let chosenVoice = this.selectedVoice;

    if (!chosenVoice || this.isChineseVoice(chosenVoice)) {
      if (viVoices.length > 0) {
        chosenVoice = viVoices.find(
          (v) => v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("HoaiMy") || v.name.includes("NamMinh") || v.name.includes("Linh") || v.name.includes("An")
        ) || viVoices[0];
        this.selectedVoice = chosenVoice;
      } else {
        const nonChinese = this.voices.filter((v) => !this.isChineseVoice(v));
        chosenVoice = nonChinese.length > 0 ? nonChinese[0] : null;
        this.selectedVoice = chosenVoice;
      }
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang || (this.isVietnameseVoice(chosenVoice) ? "vi-VN" : "en-US");
    } else {
      utterance.lang = "vi-VN";
    }

    utterance.rate = this.speed;
    utterance.pitch = 1.0;

    // Safari iOS GC Bug Fix: retain reference in persistent Set and global window object
    this._utterances.add(utterance);
    if (typeof window !== "undefined") {
      window._safariActiveUtterance = utterance;
    }

    utterance.onend = () => {
      this._utterances.delete(utterance);
      if (typeof window !== "undefined" && window._safariActiveUtterance === utterance) {
        window._safariActiveUtterance = null;
      }
      if (!this.isPlaying || this.isPaused) return;

      if (this.currentIndex + 1 < this.paragraphs.length) {
        // Asynchronous transition allows Safari WebKit audio pipeline to recycle cleanly
        setTimeout(() => {
          if (this.isPlaying && !this.isPaused) {
            this.speakParagraph(this.currentIndex + 1);
          }
        }, 50);
      } else {
        this.handleChapterFinished();
      }
    };

    utterance.onerror = (event) => {
      this._utterances.delete(utterance);
      if (typeof window !== "undefined" && window._safariActiveUtterance === utterance) {
        window._safariActiveUtterance = null;
      }
      if (event.error === "canceled" || event.error === "interrupted") return;
      console.warn("TTS utterance error:", event.error);
      if (this.isPlaying && !this.isPaused) {
        setTimeout(() => this.speakParagraph(this.currentIndex + 1), 150);
      }
    };

    this.currentUtterance = utterance;
    if (this.synth) this.synth.speak(utterance);
  }

  handleChapterFinished() {
    if (this.stopAtChapterEnd) {
      this.stop();
      this.setSleepTimer(0);
      return;
    }
    if (this.onFinished) {
      this.onFinished();
    } else {
      this.stop();
    }
  }

  setSleepTimer(minutes) {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
    this.timerMinutes = minutes;
    this.stopAtChapterEnd = false;

    if (minutes === -1) {
      this.stopAtChapterEnd = true;
      this.timerRemainingSeconds = 0;
      if (this.onTimerTick) this.onTimerTick("Hết chương");
      return;
    }

    if (minutes <= 0) {
      this.timerRemainingSeconds = 0;
      if (this.onTimerTick) this.onTimerTick("");
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
        if (this.onTimerTick) this.onTimerTick("Đã tắt");
      }
    }, 1000);
  }

  notifyTimer() {
    if (!this.onTimerTick) return;
    const mins = Math.floor(this.timerRemainingSeconds / 60);
    const secs = this.timerRemainingSeconds % 60;
    const str = `${mins}:${String(secs).padStart(2, "0")}`;
    this.onTimerTick(str);
  }

  notifyState() {
    if (this.onStateChange) {
      this.onStateChange({
        isPlaying: this.isPlaying,
        isPaused: this.isPaused,
        currentIndex: this.currentIndex,
        totalParagraphs: this.paragraphs.length,
        speed: this.speed,
        hasTimer: this.timerRemainingSeconds > 0 || this.stopAtChapterEnd,
        timerLabel: this.stopAtChapterEnd ? "Hết chương" : (this.timerRemainingSeconds > 0 ? `${Math.ceil(this.timerRemainingSeconds / 60)}p` : "")
      });
    }
  }
}

function createTTS() {
  return new TTSEngine();
}

export { createTTS, TTSEngine };
