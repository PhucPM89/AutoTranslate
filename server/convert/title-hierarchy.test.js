"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTitleHierarchy } = require("./title-hierarchy.js");

test("Title Hierarchy: capitalizes and normalizes court and sect honorifics", () => {
  const raw = "thái hậu nói: ai gia đã quyết. hoàng hậu nói: bổn cung không tin. tướng quân quỳ xuống: mạt tướng tuân mệnh. thái thượng trưởng lão cùng bần tăng đứng bên cạnh.";
  const normalized = normalizeTitleHierarchy(raw);

  assert.ok(normalized.includes("Ai gia"));
  assert.ok(normalized.includes("Bổn cung"));
  assert.ok(normalized.includes("Mạt tướng"));
  assert.ok(normalized.includes("Thái Thượng Trưởng lão"));
  assert.ok(normalized.includes("Bần tăng"));
});
