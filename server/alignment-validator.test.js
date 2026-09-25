"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

// Some development checkouts carry the larger regression corpus separately.
// Keep npm test portable when that optional corpus is not present in the repo.
const regressionSuite = path.join(__dirname, "..", "test", "alignment-regression.test.js");
if (fs.existsSync(regressionSuite)) {
  require(regressionSuite);
} else {
  test.skip("alignment regression corpus is not installed", () => {});
}
