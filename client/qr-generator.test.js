"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createQRCodeMatrix } = require("./qr-generator.js");

test("qr-generator: creates non-empty matrix for URL", () => {
  const url = "https://tram-chu.online/?book=fanqie-6883748331202284558&ch=10";
  const { size, matrix } = createQRCodeMatrix(url);

  assert.ok(size >= 25, "Matrix size should be >= 25");
  assert.equal(matrix.length, size, "Matrix row count should match size");
  assert.equal(matrix[0].length, size, "Matrix col count should match size");

  // Check finders at 0,0
  assert.equal(matrix[0][0], 1, "Finder pattern top-left should be dark");
  assert.equal(matrix[0][6], 1, "Finder pattern corner should be dark");
  assert.equal(matrix[6][0], 1, "Finder pattern corner should be dark");
});
