"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ZERO_WIDTH_FINGERPRINT,
  applyInvisibleWatermark,
  formatCopyWithAttribution
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
