"use strict";

const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "..", "client", "style.css"), "utf8");
const lines = css.split("\n");

console.log("Searching for media queries around book-view in client/style.css:");
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("@media") || line.includes("book-view-body") || line.includes("book-view-hero")) {
    if (i > 1650 && i < 2100) {
      console.log(`Line ${i + 1}: ${line.trim()}`);
    }
  }
}
