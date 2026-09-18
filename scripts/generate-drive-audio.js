"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { storeChapterAudio, publicDownloadUrl } = require("../server/audio/drive-storage");

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => execFile(command, args, options, (error, stdout, stderr) => {
    if (error) return reject(Object.assign(error, { stdout, stderr }));
    resolve({ stdout, stderr });
  }));
}

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.resolve(__dirname, "..", name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

function splitText(text, maxChars = 800) {
  const pieces = String(text).split(/\n+/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > maxChars) {
      chunks.push(current);
      current = "";
    }
    if (piece.length > maxChars) {
      const sentences = piece.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [piece];
      for (const sentence of sentences) {
        if (sentence.length > maxChars) {
          if (current) chunks.push(current.trim());
          current = "";
          for (let offset = 0; offset < sentence.length; offset += maxChars) {
            chunks.push(sentence.slice(offset, offset + maxChars).trim());
          }
          continue;
        }
        if (current && current.length + sentence.length + 1 > maxChars) {
          chunks.push(current.trim());
          current = "";
        }
        current += `${current ? " " : ""}${sentence.trim()}`;
      }
    } else current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

async function duration(file) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  return Number(stdout.trim()) || 0;
}

async function generate(text, output, workDir, { onProgress = null, voiceConfig = null } = {}) {
  const chunks = splitText(text);
  const list = [];
  const voice = voiceConfig?.edgeVoice || "vi-VN-HoaiMyNeural";
  const rate = voiceConfig?.rate || "-4%";
  const pitch = voiceConfig?.pitch || "+0Hz";
  for (let i = 0; i < chunks.length; i += 1) {
    const part = path.join(workDir, `part-${String(i + 1).padStart(3, "0")}.mp3`);
    const textFile = path.join(workDir, `part-${String(i + 1).padStart(3, "0")}.txt`);
    fs.writeFileSync(textFile, chunks[i], "utf8");
    if (fs.existsSync(part) && fs.statSync(part).size > 1000) {
      try {
        if (await duration(part) > 0) {
          console.log(`[AUDIO] Dùng lại phần ${i + 1}/${chunks.length} từ cache.`);
          await onProgress?.({ completed: i + 1, total: chunks.length, phase: "synthesis", cached: true });
          list.push(`file '${part.replace(/'/g, "'\\''").replace(/\\/g, "/")}'`);
          continue;
        }
      } catch {}
      fs.rmSync(part, { force: true });
    }
    console.log(`[AUDIO] Tạo phần ${i + 1}/${chunks.length} với giọng [${voiceConfig?.voiceName || voice}]...`);
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await exec("edge-tts", ["--voice", voice, `--rate=${rate}`, `--pitch=${pitch}`, "--file", textFile, "--write-media", part], { timeout: 90000 });
        if (fs.existsSync(part) && fs.statSync(part).size > 0) {
          lastError = null;
          break;
        }
        throw new Error("Edge-TTS trả về file rỗng.");
      } catch (error) {
        lastError = error;
        if (fs.existsSync(part)) fs.rmSync(part, { force: true });
        console.warn(`[AUDIO] Phần ${i + 1}, lần ${attempt}/3 thất bại; sẽ ${attempt < 3 ? "thử lại" : "dừng"}.`);
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
    if (lastError) throw new Error(`Không tạo được phần ${i + 1}/${chunks.length} sau 3 lần: ${lastError.message}`);
    list.push(`file '${part.replace(/'/g, "'\\''").replace(/\\/g, "/")}'`);
    await onProgress?.({ completed: i + 1, total: chunks.length, phase: "synthesis", cached: false });
  }
  const concat = path.join(workDir, "concat.txt");
  fs.writeFileSync(concat, list.join("\n"), "utf8");
  await exec("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concat, "-map_metadata", "-1", "-c", "copy", output], { timeout: 120000 });
  return { chunks: chunks.length, durationSeconds: await duration(output) };
}

async function main() {
  loadEnv();
  const [bookId, chapterArg, inputArg, bookNameArg] = process.argv.slice(2);
  const chapterNumber = Number(chapterArg);
  if (!bookId || !Number.isInteger(chapterNumber) || !inputArg) throw new Error("Usage: node scripts/generate-drive-audio.js <bookId> <chapterNumber> <chapter.txt> [bookName]");
  const input = path.resolve(inputArg);
  const candidate = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "").trim();
  const sourceSha256 = crypto.createHash("sha256").update(candidate).digest("hex");
  const safeBookId = String(bookId).replace(/[^A-Za-z0-9._-]/g, "_");
  const cacheRoot = path.resolve(__dirname, "..", "scratch", "audio-cache");
  const workDir = path.join(cacheRoot, `${safeBookId}-chapter-${chapterNumber}-${sourceSha256.slice(0, 16)}`);
  fs.mkdirSync(workDir, { recursive: true });
  const output = path.join(workDir, `${bookId}-chapter-${String(chapterNumber).padStart(4, "0")}.mp3`);
  const audio = await generate(candidate, output, workDir);
  const inferredBookName = path.basename(path.dirname(input)).split("-").map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(" ");
  const stored = await storeChapterAudio({ bookId, bookName: bookNameArg || inferredBookName, chapterNumber, sourceSha256, durationSeconds: audio.durationSeconds, filePath: output });
  console.log(JSON.stringify({ ok: true, ...audio, sourceSha256, status: stored.status, fileId: stored.file.id, url: publicDownloadUrl(stored.file.id) }, null, 2));
  fs.rmSync(workDir, { recursive: true, force: true });
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { splitText, generate };
