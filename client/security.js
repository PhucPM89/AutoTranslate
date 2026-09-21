"use strict";

// Trạm Chữ — Comprehensive Anti-Scraping & Content Protection Module.
//
// 1. Disables text selection, right-click, and copy/cut/drag across reading surfaces.
// 2. Blocks inspection hotkeys: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U, Ctrl+S, Ctrl+P.
// 3. Traps DevTools via dynamic anti-debug loop and renders a bold copyright warning banner in console.
// 4. Injects invisible zero-width fingerprint watermark into chapter text for proof of origin.

const SOURCE_BRAND = "Trạm Chữ (https://tram-chu.online)";
const ZERO_WIDTH_FINGERPRINT = "\u200B\u200C\u200D\u200B"; // Invisible fingerprint

const MSG_COPY_BLOCKED = "⚠️ Nội dung bản dịch được bảo hộ bản quyền bởi Trạm Chữ. Nghiêm cấm sao chép trái phép!";
const MSG_DEVTOOLS_BLOCKED = "⚠️ Chức năng kiểm tra mã nguồn (DevTools) bị vô hiệu hóa trên website.";
const MSG_CONTEXT_BLOCKED = "⚠️ Chuột phải bị vô hiệu hóa để bảo vệ bản quyền bản dịch.";

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
 * Formats copied text with source attribution watermark (fallback safeguard).
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
 * Checks whether an element is an editable form field (input, textarea, or contentEditable).
 */
function isEditableElement(el) {
  if (!el || typeof el !== "object") return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || Boolean(el.isContentEditable);
}

/**
 * Evaluates whether a keydown event represents a restricted shortcut:
 * - F12
 * - DevTools inspect: Ctrl+Shift+I, Cmd+Option+I, Ctrl+Shift+J, Cmd+Option+J, Ctrl+Shift+C, Cmd+Option+C
 * - View source: Ctrl+U, Cmd+U
 * - Save page: Ctrl+S, Cmd+S
 * - Print page: Ctrl+P, Cmd+P
 * - Copy / Select All outside editable inputs: Ctrl+C, Cmd+C, Ctrl+A, Cmd+A
 *
 * Returns { restricted: boolean, type: 'devtools' | 'copy' | 'general' }
 */
function checkRestrictedShortcut(event) {
  if (!event) return { restricted: false };

  const key = String(event.key || "").toLowerCase();
  const keyCode = event.keyCode || event.which || 0;
  const isCtrlOrCmd = Boolean(event.ctrlKey || event.metaKey);
  const isShift = Boolean(event.shiftKey);
  const inEditable = isEditableElement(event.target);

  // F12 key (DevTools)
  if (key === "f12" || keyCode === 123) {
    return { restricted: true, type: "devtools" };
  }

  // Ctrl+Shift+I / J / C (DevTools)
  if (isCtrlOrCmd && isShift) {
    if (key === "i" || keyCode === 73 || key === "j" || keyCode === 74 || key === "c" || keyCode === 67) {
      return { restricted: true, type: "devtools" };
    }
  }

  // Ctrl+U (View Source)
  if (isCtrlOrCmd && (key === "u" || keyCode === 85)) {
    return { restricted: true, type: "devtools" };
  }

  // Ctrl+S (Save HTML page)
  if (isCtrlOrCmd && (key === "s" || keyCode === 83)) {
    return { restricted: true, type: "general" };
  }

  // Ctrl+P (Print to PDF)
  if (isCtrlOrCmd && (key === "p" || keyCode === 80)) {
    return { restricted: true, type: "general" };
  }

  // Ctrl+C (Copy) or Ctrl+A (Select All) outside form inputs
  if (!inEditable && isCtrlOrCmd) {
    if (key === "c" || keyCode === 67 || key === "a" || keyCode === 65) {
      return { restricted: true, type: "copy" };
    }
  }

  return { restricted: false };
}

/**
 * Displays prominent security and copyright warnings in the developer console.
 */
function renderConsoleBanner() {
  if (typeof console === "undefined" || !console.log) return;

  const titleStyle =
    "color: #ef4444; font-size: 24px; font-weight: 900; text-shadow: 1px 1px 4px rgba(0,0,0,0.6); font-family: system-ui, -apple-system, sans-serif;";
  const subStyle =
    "color: #f59e0b; font-size: 14px; font-weight: bold; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6;";
  const descStyle =
    "color: #94a3b8; font-size: 12px; font-family: system-ui, -apple-system, sans-serif; line-height: 1.5;";

  console.log("%c⚠️ CẢNH BÁO AN NINH & BẢN QUYỀN TRẠM CHỮ", titleStyle);
  console.log(
    "%cKhu vực dành riêng cho nhà phát triển hệ thống (https://tram-chu.online).\n" +
      "Nghiêm cấm mọi hành vi trích xuất nội dung bản dịch, bóc tách API hoặc sao chép tự động!",
    subStyle
  );
  console.log(
    "%cMọi yêu cầu bất thường đều được ghi nhận qua Cloudflare WAF & Bot Defense để bảo vệ hệ thống.",
    descStyle
  );
}

/**
 * Activates an anti-debugging loop that repeatedly halts DevTools when open.
 */
function initAntiDebug() {
  if (typeof window === "undefined") return;
  if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "test") return;

  try {
    renderConsoleBanner();
  } catch {}

  // Periodic debugger check
  const debugInterval = setInterval(() => {
    try {
      const startTime = Date.now();
      // Using constructor avoids static bundler stripping
      (function () {}.constructor("debugger")());
      if (Date.now() - startTime > 100) {
        renderConsoleBanner();
      }
    } catch {}
  }, 1200);

  if (typeof window !== "undefined") {
    window.__antiDebugTimer = debugInterval;
  }
}

/**
 * Initializes client-side anti-copy, shortcut restriction, and DevTools safeguards.
 */
function initSecurityGuards(containerEl = (typeof document !== "undefined" ? document : null), options = {}) {
  if (!containerEl) return;

  const notify = (message) => {
    if (typeof options.onNotice === "function") {
      options.onNotice(message);
    } else if (typeof window !== "undefined" && typeof window.showToast === "function") {
      window.showToast(message, 2500);
    } else if (typeof document !== "undefined") {
      let toast = document.getElementById("appToast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "appToast";
        toast.className = "app-toast";
        document.body?.appendChild(toast);
      }
      if (toast) {
        toast.textContent = message;
        toast.classList.add("visible");
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
          toast.classList.remove("visible");
        }, 2500);
      }
    }
  };

  // 1. Smart copy protection: allows short quote with watermark, blocks bulk copying
  containerEl.addEventListener("copy", (event) => {
    if (isEditableElement(event.target)) return;

    let selectedText = "";
    if (typeof window !== "undefined" && typeof window.getSelection === "function") {
      selectedText = String(window.getSelection()?.toString() || "").trim();
    }

    // Case 1: Bulk copying (> 250 chars) -> Block completely!
    if (selectedText.length > 250) {
      event.preventDefault();
      if (event.clipboardData) {
        event.clipboardData.setData("text/plain", "");
      }
      if (typeof window !== "undefined" && typeof window.getSelection === "function") {
        window.getSelection()?.removeAllRanges();
      }
      notify("⚠️ Nhằm bảo vệ bản quyền, Trạm Chữ không hỗ trợ sao chép đoạn văn dài. Vui lòng dùng tính năng 'Tạo Ảnh Trích Dẫn 9:16' hoặc 'Báo Lỗi'!");
      return;
    }

    // Case 2: Short quote (1 - 250 chars) -> Allow with Trạm Chữ source attribution watermark
    if (selectedText.length > 0) {
      event.preventDefault();
      const withWatermark = formatCopyWithAttribution(selectedText);
      if (event.clipboardData) {
        event.clipboardData.setData("text/plain", withWatermark);
      }
      notify("✓ Đã sao chép trích dẫn kèm nguồn Trạm Chữ.");
      return;
    }

    // Fallback: block empty or non-editable copy
    event.preventDefault();
    if (event.clipboardData) {
      event.clipboardData.setData("text/plain", "");
    }
    notify(MSG_COPY_BLOCKED);
  });

  // 2. Completely disable cut event on non-editable text
  containerEl.addEventListener("cut", (event) => {
    if (isEditableElement(event.target)) return;
    event.preventDefault();
    notify(MSG_COPY_BLOCKED);
  });

  // 3. Disable right-click context menu outside editable inputs
  containerEl.addEventListener("contextmenu", (event) => {
    if (isEditableElement(event.target)) return;
    event.preventDefault();
    notify(MSG_CONTEXT_BLOCKED);
  });

  // 4. Disable drag-drop text ripping
  containerEl.addEventListener("dragstart", (event) => {
    if (isEditableElement(event.target)) return;
    event.preventDefault();
  });

  // 5. Disable text selection start on UI chrome & controls (allow reading text for quote card & report)
  containerEl.addEventListener("selectstart", (event) => {
    if (isEditableElement(event.target)) return;
    // Allow selection on reader text: .document-text, #chapterView, .tts-paragraph-highlight
    if (
      event.target.closest?.(".document-text") ||
      event.target.closest?.("#chapterView") ||
      event.target.closest?.(".tts-paragraph-highlight")
    ) {
      return;
    }
    if (
      event.target.closest?.(".reader-container") ||
      event.target.closest?.(".book-view-desc") ||
      event.target.closest?.(".studio-document-text") ||
      event.target.closest?.(".reader-topbar") ||
      event.target.closest?.(".reader-bottom-nav")
    ) {
      event.preventDefault();
    }
  });

  // 6. Block restricted hotkeys (F12, DevTools, Ctrl+U, Ctrl+S, Ctrl+P, Ctrl+A outside inputs)
  containerEl.addEventListener("keydown", (event) => {
    const check = checkRestrictedShortcut(event);
    if (!check.restricted) return;

    if (check.type === "devtools") {
      event.preventDefault();
      event.stopPropagation();
      notify(MSG_DEVTOOLS_BLOCKED);
      renderConsoleBanner();
      return;
    }

    const key = String(event.key || "").toLowerCase();
    const keyCode = event.keyCode || event.which || 0;
    const isSelectAll = key === "a" || keyCode === 65;
    const isCopy = key === "c" || keyCode === 67;

    if (isSelectAll) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof window !== "undefined" && typeof window.getSelection === "function") {
        window.getSelection()?.removeAllRanges();
      }
      notify("⚠️ Không thể chọn toàn bộ văn bản để bảo vệ bản quyền.");
      return;
    }

    if (isCopy) {
      let selectedText = "";
      if (typeof window !== "undefined" && typeof window.getSelection === "function") {
        selectedText = String(window.getSelection()?.toString() || "").trim();
      }

      // If text is too long (> 250 characters), block it!
      if (selectedText.length > 250) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof window !== "undefined" && typeof window.getSelection === "function") {
          window.getSelection()?.removeAllRanges();
        }
        notify("⚠️ Nhằm bảo vệ bản quyền, Trạm Chữ không hỗ trợ sao chép đoạn văn dài. Vui lòng dùng tính năng 'Tạo Ảnh Trích Dẫn 9:16' hoặc 'Báo Lỗi'!");
        return;
      }

      // If text is <= 250 characters and non-empty, do NOT preventDefault on keydown, allow copy event to run and attach watermark!
      if (selectedText.length > 0) {
        return;
      }

      // If no text selected at all, block it
      event.preventDefault();
      event.stopPropagation();
      notify(MSG_COPY_BLOCKED);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    notify(MSG_COPY_BLOCKED);
  });

  // 7. Activate DevTools traps and console branding
  if (options.enableAntiDebug !== false) {
    initAntiDebug();
  }
}

module.exports = {
  SOURCE_BRAND,
  ZERO_WIDTH_FINGERPRINT,
  MSG_COPY_BLOCKED,
  MSG_DEVTOOLS_BLOCKED,
  MSG_CONTEXT_BLOCKED,
  applyInvisibleWatermark,
  formatCopyWithAttribution,
  isEditableElement,
  checkRestrictedShortcut,
  renderConsoleBanner,
  initAntiDebug,
  initSecurityGuards
};
