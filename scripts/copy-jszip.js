const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "node_modules", "jszip", "dist", "jszip.min.js");
const targetDir = path.join(__dirname, "..", "public", "vendor");
const target = path.join(targetDir, "jszip.min.js");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log("Copied JSZip browser bundle.");
