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

    this.initVoices();
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
        this.selectedVoice = viVoices[0];
      } else {
        // Do not assign non-Vietnamese voice; leave null so utterance.lang = "vi-VN" works
        this.selectedVoice = null;
      }
    };

    load();
    if (typeof this.synth.onvoiceschanged !== "undefined") {
      this.synth.onvoiceschanged = load;
    }
  }

  isVietnameseVoice(v) {
    if (!v) return false;
    const lang = (v.lang || "").toLowerCase().replace("_", "-");
    const name = (v.name || "").toLowerCase();
    return lang.startsWith("vi") || name.includes("vietnam") || name.includes("tiếng việt") || name.includes("tieng viet");
  }

  getVietnameseVoices() {
    if (!this.voices.length && this.synth) this.voices = this.synth.getVoices() || [];
    return this.voices.filter((v) => this.isVietnameseVoice(v));
  }

  setVoice(voiceURI) {
    const v = this.voices.find((item) => item.voiceURI === voiceURI);
    if (v) this.selectedVoice = v;
  }

  setSpeed(speed) {
    this.speed = Math.max(0.5, Math.min(2.5, Number(speed) || 1.0));
    if (this.isPlaying && !this.isPaused) {
      // Re-speak current paragraph with new speed
      this.speakParagraph(this.currentIndex);
    }
  }

  loadText(text) {
    this.stop();
    if (!text) {
      this.paragraphs = [];
      return;
    }
    // Clean text and split by paragraphs / sentence blocks
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
    this.notifyState();
    this.speakParagraph(this.currentIndex);
    return true;
  }

  pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    if (this.synth) this.synth.pause();
    this.notifyState();
  }

  resume() {
    if (!this.isPlaying || !this.isPaused) return;
    this.isPaused = false;
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
    if (this.synth) {
      this.synth.cancel();
    }
    this.currentUtterance = null;
    this.notifyState();
    if (this.onParagraphChange) this.onParagraphChange(-1);
  }

  previous() {
    if (!this.paragraphs.length) return;
    const target = Math.max(0, this.currentIndex - 1);
    this.speakParagraph(target);
  }

  next() {
    if (!this.paragraphs.length) return;
    const target = this.currentIndex + 1;
    if (target < this.paragraphs.length) {
      this.speakParagraph(target);
    } else {
      this.handleChapterFinished();
    }
  }

  speakParagraph(index) {
    if (!this.isSupported() || !this.isPlaying) return;
    if (index >= this.paragraphs.length) {
      this.handleChapterFinished();
      return;
    }

    if (this.synth) this.synth.cancel();

    this.currentIndex = index;
    if (this.onParagraphChange) this.onParagraphChange(index);

    const textToSpeak = this.paragraphs[index];
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // Strictly enforce Vietnamese
    utterance.lang = "vi-VN";

    if (this.selectedVoice && this.isVietnameseVoice(this.selectedVoice)) {
      utterance.voice = this.selectedVoice;
      utterance.lang = this.selectedVoice.lang || "vi-VN";
    } else {
      const viVoices = this.getVietnameseVoices();
      if (viVoices.length > 0) {
        this.selectedVoice = viVoices[0];
        utterance.voice = viVoices[0];
        utterance.lang = viVoices[0].lang || "vi-VN";
      } else {
        utterance.voice = null;
      }
    }

    utterance.rate = this.speed;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      if (!this.isPlaying || this.isPaused) return;
      if (this.currentIndex + 1 < this.paragraphs.length) {
        this.speakParagraph(this.currentIndex + 1);
      } else {
        this.handleChapterFinished();
      }
    };

    utterance.onerror = (event) => {
      if (event.error === "canceled" || event.error === "interrupted") return;
      console.warn("TTS utterance error:", event.error);
      if (this.isPlaying && !this.isPaused) {
        // Try skipping to next paragraph on error
        setTimeout(() => this.speakParagraph(this.currentIndex + 1), 200);
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
      // Stop at chapter end
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
