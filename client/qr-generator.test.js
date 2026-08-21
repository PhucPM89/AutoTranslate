"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { drawQRCodeToCanvas } = require("./qr-generator.js");

test("qr-generator: exports drawQRCodeToCanvas function", () => {
  assert.equal(typeof drawQRCodeToCanvas, "function");
});
