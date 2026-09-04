"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ZERO_WIDTH_FINGERPRINT,
  MSG_COPY_BLOCKED,
  MSG_DEVTOOLS_BLOCKED,
  MSG_CONTEXT_BLOCKED,
  applyInvisibleWatermark,
  formatCopyWithAttribution,
  isEditableElement,
  checkRestrictedShortcut,
  initSecurityGuards
} = require("./security.js");

test("applyInvisibleWatermark injects zero-width fingerprint seamlessly", () => {
  const sample = "Đoạn văn thứ nhất.\n\nĐoạn văn thứ hai dài hơn một chút để chèn dấu bản quyền.\n\nĐoạn văn thứ ba.";
  const marked = applyInvisibleWatermark(sample);

  assert.ok(marked.includes(ZERO_WIDTH_FINGERPRINT), "Should contain invisible fingerprint");
  // Readers see same character length visually (zero-width characters are invisible)
  assert.equal(marked.replace(/[\u200B\u200C\u200D]/g, ""), sample);
});

test("formatCopyWithAttribution leaves short text clean and appends watermark for long text", () => {
  assert.equal(formatCopyWithAttribution("Ngắn"), "Ngắn");

  const longText = "Đây là một đoạn văn tương đối dài được người đọc hoặc công cụ sao chép tự động quét từ website Trạm Chữ.";
  const formatted = formatCopyWithAttribution(longText);

  assert.ok(formatted.startsWith(longText));
  assert.ok(formatted.includes("Nguồn: Trạm Chữ"));
  assert.ok(formatted.includes("https://tram-chu.online"));
});

test("isEditableElement correctly identifies form inputs vs reader text", () => {
  assert.equal(isEditableElement(null), false);
  assert.equal(isEditableElement({ tagName: "DIV" }), false);
  assert.equal(isEditableElement({ tagName: "P" }), false);
  assert.equal(isEditableElement({ tagName: "INPUT" }), true);
  assert.equal(isEditableElement({ tagName: "TEXTAREA" }), true);
  assert.equal(isEditableElement({ tagName: "DIV", isContentEditable: true }), true);
});

test("checkRestrictedShortcut flags inspection and devtools hotkeys", () => {
  // F12
  assert.deepEqual(checkRestrictedShortcut({ key: "F12" }), { restricted: true, type: "devtools" });
  assert.deepEqual(checkRestrictedShortcut({ keyCode: 123 }), { restricted: true, type: "devtools" });

  // Ctrl+Shift+I / J / C
  assert.deepEqual(
    checkRestrictedShortcut({ ctrlKey: true, shiftKey: true, key: "I" }),
    { restricted: true, type: "devtools" }
  );
  assert.deepEqual(
    checkRestrictedShortcut({ metaKey: true, shiftKey: true, key: "j" }),
    { restricted: true, type: "devtools" }
  );
  assert.deepEqual(
    checkRestrictedShortcut({ ctrlKey: true, shiftKey: true, key: "C" }),
    { restricted: true, type: "devtools" }
  );

  // Ctrl+U (View Source)
  assert.deepEqual(
    checkRestrictedShortcut({ ctrlKey: true, key: "u" }),
    { restricted: true, type: "devtools" }
  );

  // Ctrl+S & Ctrl+P
  assert.deepEqual(
    checkRestrictedShortcut({ ctrlKey: true, key: "s" }),
    { restricted: true, type: "general" }
  );
  assert.deepEqual(
    checkRestrictedShortcut({ metaKey: true, key: "p" }),
    { restricted: true, type: "general" }
  );

  // Normal reader reading keys (space, arrows, j, k) should NOT be restricted
  assert.equal(checkRestrictedShortcut({ key: "ArrowDown" }).restricted, false);
  assert.equal(checkRestrictedShortcut({ key: "j" }).restricted, false);
  assert.equal(checkRestrictedShortcut({ key: "Enter" }).restricted, false);
});

test("checkRestrictedShortcut protects text copying outside inputs but permits it inside inputs", () => {
  const paragraphEl = { tagName: "P" };
  const inputEl = { tagName: "INPUT" };

  // Copying outside form fields is intercepted
  assert.deepEqual(
    checkRestrictedShortcut({ ctrlKey: true, key: "c", target: paragraphEl }),
    { restricted: true, type: "copy" }
  );
  assert.deepEqual(
    checkRestrictedShortcut({ metaKey: true, key: "a", target: paragraphEl }),
    { restricted: true, type: "copy" }
  );

  // Copying inside legitimate input fields is allowed
  assert.equal(
    checkRestrictedShortcut({ ctrlKey: true, key: "c", target: inputEl }).restricted,
    false
  );
  assert.equal(
    checkRestrictedShortcut({ ctrlKey: true, key: "a", target: inputEl }).restricted,
    false
  );
});

test("initSecurityGuards attaches event listeners and dispatches notifications on violation", () => {
  const listeners = {};
  const mockContainer = {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    }
  };

  const notices = [];
  initSecurityGuards(mockContainer, {
    enableAntiDebug: false,
    onNotice: (msg) => notices.push(msg)
  });

  // Verify keydown on F12 triggers devtools notification and prevents default
  assert.ok(typeof listeners.keydown === "function");
  let prevented = false;
  listeners.keydown({
    key: "F12",
    preventDefault: () => { prevented = true; },
    stopPropagation: () => {}
  });
  assert.equal(prevented, true);
  assert.equal(notices.includes(MSG_DEVTOOLS_BLOCKED), true);

  // Verify right-click context menu prevention
  assert.ok(typeof listeners.contextmenu === "function");
  let ctxPrevented = false;
  listeners.contextmenu({
    target: { tagName: "DIV" },
    preventDefault: () => { ctxPrevented = true; }
  });
  assert.equal(ctxPrevented, true);
  assert.equal(notices.includes(MSG_CONTEXT_BLOCKED), true);

  // Verify copy event prevention
  assert.ok(typeof listeners.copy === "function");
  let copyPrevented = false;
  let clearedData = false;
  listeners.copy({
    target: { tagName: "DIV" },
    preventDefault: () => { copyPrevented = true; },
    clipboardData: {
      setData: (type, val) => {
        if (type === "text/plain" && val === "") clearedData = true;
      }
    }
  });
  assert.equal(copyPrevented, true);
  assert.equal(clearedData, true);
  assert.equal(notices.includes(MSG_COPY_BLOCKED), true);
});

