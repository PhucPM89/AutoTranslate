"use strict";

const fs = require("fs");
const path = require("path");

const appCode = fs.readFileSync(path.join(__dirname, "..", "client", "app.js"), "utf8");
const lines = appCode.split("\n");

console.log("Searching for showLibrary calls in client/app.js:");
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("showLibrary(")) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
}
