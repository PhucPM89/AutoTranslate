"use strict";

// Trạm Chữ — Security & Anti-Scraping Protection Module.
//
// 1. Injects invisible zero-width fingerprint watermark into chapter text
//    to identify content stolen by leech bots.
// 2. Attaches attribution watermark when copying text to clipboard.
// 3. Prevents bulk dragging or hotkey abuse while preserving standard reader usability.

const SOURCE_BRAND = "Trạm Chữ (https://tram-chu.online)";
const ZERO_WIDTH_FINGERPRINT = "\u200B\u200C\u200D\u200B"; // Invisible fingerprint

/**
 * Injects invisible zero-width fingerprint markers every few paragraphs.
 * Readers cannot see it, but scrapers will copy it into their database.
 */
function applyInvisibleWatermark(text) {
  if (!text || typeof text !== "string") return "";
  const paragraphs = text.split("\n\n");
  if (paragraphs.length <= 2) return text + ZERO_WIDTH_FINGERPRINT;

  return paragraphs
    .map((p, idx) => {
      if (idx % 3 === 1 && p.length > 30) {
        return p + ZERO_WIDTH_FINGERPRINT;
      }
      return p;
    })
    .join("\n\n");
}

/**
 * Formats copied text with source attribution watermark.
 */
function formatCopyWithAttribution(selectedText) {
  const clean = String(selectedText || "").trim();
  if (!clean) return "";
  if (clean.length < 50) return clean;

  return (
    clean +
    `\n\n--------------------------------\n` +
    `📖 Nguồn: ${SOURCE_BRAND}\n` +
    `Mọi hành vi sao chép tự động đều bị theo dõi bản quyền.`
  );
}

/**
 * Initializes client-side copy attribution and anti-scraping safeguards.
 */
function initSecurityGuards(containerEl = document) {
  if (typeof window === "undefined" || !containerEl) return;

  // Intercept standard copy event to attach attribution
  document.addEventListener("copy", (event) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString();
    if (text.length >= 60) {
      const withWatermark = formatCopyWithAttribution(text);
      if (event.clipboardData) {
        event.clipboardData.setData("text/plain", withWatermark);
        event.preventDefault();
      }
    }
  });

  // Prevent accidental drag-drop text ripping
  document.addEventListener("dragstart", (event) => {
    if (event.target.closest?.(".document-text") || event.target.closest?.(".book-view-cover")) {
      event.preventDefault();
    }
  });
}

module.exports = {
  ZERO_WIDTH_FINGERPRINT,
  applyInvisibleWatermark,
  formatCopyWithAttribution,
  initSecurityGuards
};
