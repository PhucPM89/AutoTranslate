"use strict";

/**
 * Lightweight convert compatibility layer.
 * Full neural translation is handled by HachimiMT and Gemini QA.
 */

const CONVERT_VERSION = 1;

function isHan(char) {
  if (!char) return false;
  return /\p{Script=Han}/u.test(char);
}

function getConvertFunction(env = process.env) {
  if (env.CONVERT_ENABLED === "false") return null;
  return null;
}

const fs = require("fs");
const path = require("path");

let cachedHanviet = null;

function loadBase() {
  if (cachedHanviet) return { hanvietChars: cachedHanviet, phraseDict: {} };
  const hvMap = {};
  const filePath = path.join(process.cwd(), "data", "convert", "hanviet-chars.txt");
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx !== -1) {
        const ch = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (ch) hvMap[ch] = { hv: val };
      }
    }
  }
  cachedHanviet = hvMap;
  return { hanvietChars: cachedHanviet, phraseDict: {} };
}

function buildConvertEngineFromDisk() {
  return null;
}

module.exports = {
  CONVERT_VERSION,
  isHan,
  getConvertFunction,
  loadBase,
  buildConvertEngineFromDisk
};
