"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { wrapText, THEMES, renderQuoteCard } = require("./quote-card.js");

test("wrapText splits words into multiple lines according to measureText width", () => {
  const fakeCtx = {
    measureText: (str) => ({ width: str.length * 10 })
  };

  const text = "Một người tu tiên cần phải có tâm kiên định.";
  // maxWidth = 150 -> max 15 chars per line
  const lines = wrapText(fakeCtx, text, 150);
  assert.ok(lines.length > 1, "Should split into multiple lines");
  assert.ok(lines.join(" ").includes("kiên định"), "Preserves all words");
});

test("wrapText handles empty or short text cleanly", () => {
  const fakeCtx = {
    measureText: (str) => ({ width: str.length * 10 })
  };
  assert.deepEqual(wrapText(fakeCtx, "", 200), []);
  assert.deepEqual(wrapText(fakeCtx, "Ngắn gọn", 200), ["Ngắn gọn"]);
});

test("THEMES has nebula, ink, and gold presets", () => {
  assert.ok(THEMES.nebula);
  assert.ok(THEMES.ink);
  assert.ok(THEMES.gold);
  assert.equal(THEMES.nebula.name, "Tử Kim Huyễn Cảnh");
  assert.equal(THEMES.ink.name, "Mặc Trúc Giang Hồ");
  assert.equal(THEMES.gold.name, "Hoàng Kim Bá Khí");
});

test("renderQuoteCard handles null canvas gracefully", async () => {
  const res = await renderQuoteCard({ canvas: null });
  assert.equal(res, null);
});
