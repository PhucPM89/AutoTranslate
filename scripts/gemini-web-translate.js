"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { translateText } = require("../server/gemini");
const { closeGeminiWeb } = require("../server/gemini-web");

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

async function main() {
  const file = flag("--file");
  const outFile = flag("--out");
  const bookTitle = flag("--book-title", "");
  const inlineText = flag("--text", "");
  const text = file ? fs.readFileSync(path.resolve(file), "utf8") : inlineText;

  if (!text.trim()) {
    throw new Error("Thiếu nội dung. Dùng --text \"...\" hoặc --file path/to/chapter.txt");
  }

  const result = await translateText(text, null, {
    provider: "gemini-web",
    bookTitle
  });

  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(path.resolve(outFile), result.translation, "utf8");
  } else {
    process.stdout.write(`${result.translation}\n`);
  }
}

main()
  .catch((error) => {
    console.error(`GEMINI WEB TRANSLATE FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => closeGeminiWeb());
