"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}
loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const { createStorage } = require("../server/storage");
const { generateReviewScript, SCRIPT_MODES, TONES } = require("../server/video/script-generator");
const { synthesizeScript, VOICES } = require("../server/video/tts");
const { generateScriptVisuals } = require("../server/video/visuals");
const { renderReviewVideo } = require("../server/video/renderer");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    bookId: "fanqie-7027679289931729920", // Ác Mộng Cầu Sinh
    startChapter: 1,
    endChapter: 5,
    mode: SCRIPT_MODES.TEASER,
    tone: TONES.SUSPENSE,
    voice: "female",
    enableAiVisuals: true,
    output: "public/samples/review-ac-mong-cau-sinh.mp4",
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--book" && args[i + 1]) options.bookId = args[++i];
    else if (arg === "--chapters" && args[i + 1]) {
      const parts = args[++i].split("-").map(Number);
      options.startChapter = parts[0] || 1;
      options.endChapter = parts[1] || options.startChapter;
    }
    else if (arg === "--mode" && args[i + 1]) options.mode = args[++i];
    else if (arg === "--tone" && args[i + 1]) options.tone = args[++i];
    else if (arg === "--voice" && args[i + 1]) options.voice = args[++i];
    else if (arg === "--no-ai-visuals") options.enableAiVisuals = false;
    else if (arg === "--output" && args[i + 1]) options.output = args[++i];
    else if (arg === "--dry-run") options.dryRun = true;
  }
  return options;
}

async function main() {
  const opts = parseArgs();
  console.log("=== BẮT ĐẦU TẠO VIDEO REVIEW TRUYỆN TỰ ĐỘNG ===");
  console.log("Cấu hình:", JSON.stringify(opts, null, 2));

  const storage = createStorage();
  const workDir = path.resolve("server/video/tmp_work_" + Date.now());
  fs.mkdirSync(workDir, { recursive: true });

  try {
    // 1. Tải thông tin sách & các chương
    console.log(`[1/5] Đang tải dữ liệu truyện ${opts.bookId}...`);
    const indexRaw = await storage.get(`books/${opts.bookId}/index.json`);
    if (!indexRaw) {
      throw new Error(`Không tìm thấy sách ${opts.bookId} trong lưu trữ.`);
    }
    const book = JSON.parse(indexRaw.toString("utf8"));
    if (!book.id) book.id = opts.bookId;
    console.log(`- Tác phẩm: ${book.title}`);
    console.log(`- Tác giả: ${book.author}`);

    // Tải ảnh bìa sách nếu có
    let coverPath = null;
    try {
      const coverExts = ["jpg", "jpeg", "webp", "png"];
      for (const ext of coverExts) {
        const coverRaw = await storage.get(`books/${opts.bookId}/cover.${ext}`);
        if (coverRaw) {
          coverPath = path.join(workDir, `cover.${ext}`);
          fs.writeFileSync(coverPath, coverRaw);
          console.log(`- Đã tải ảnh bìa gốc: cover.${ext}`);
          break;
        }
      }
    } catch (coverErr) {
      console.warn("Không thể tải ảnh bìa:", coverErr.message);
    }

    // Tải Story Bible & Story Context
    let storyBible = null;
    let storyContext = null;
    try {
      const bibleRaw = await storage.get(`books/${opts.bookId}/story-bible.json`);
      if (bibleRaw) storyBible = JSON.parse(bibleRaw.toString("utf8"));
    } catch (_) {}
    try {
      const contextRaw = await storage.get(`books/${opts.bookId}/story-context.json`);
      if (contextRaw) storyContext = JSON.parse(contextRaw.toString("utf8"));
    } catch (_) {}

    // Tải danh sách chương dịch
    const chapters = [];
    for (let c = opts.startChapter; c <= opts.endChapter; c++) {
      try {
        const chRaw = await storage.get(`books/${opts.bookId}/r1/ch/${c}.json`);
        if (chRaw) {
          const chData = JSON.parse(chRaw.toString("utf8"));
          chapters.push(chData);
        }
      } catch (err) {
        console.warn(`Không thể tải chương ${c}:`, err.message);
      }
    }
    console.log(`- Đã nạp ${chapters.length} chương dịch tiếng Việt.`);

    // 2. Tạo kịch bản review
    console.log("[2/5] Đang tạo kịch bản review...");
    const scriptStart = Date.now();
    const script = await generateReviewScript(book, chapters, {
      mode: opts.mode,
      tone: opts.tone,
      targetDurationSeconds: 100, // ~1.5 - 2 phút cho review mẫu
      storyBible,
      storyContext
    });
    console.log(`- Kịch bản hoàn tất trong ${((Date.now() - scriptStart) / 1000).toFixed(1)}s`);
    console.log(`- Tiêu đề: ${script.title}`);
    console.log(`- Số phân cảnh: ${script.scenes.length}`);
    fs.writeFileSync(path.join(workDir, "script.json"), JSON.stringify(script, null, 2), "utf8");

    if (opts.dryRun) {
      console.log("[Dry-Run] Kịch bản tạo thành công, dừng quy trình theo yêu cầu.");
      return;
    }

    // 3. Thu âm AI tiếng Việt & xuất phụ đề SRT
    console.log("[3/5] Đang tạo giọng đọc AI (Edge-TTS) & đồng bộ phụ đề...");
    const ttsStart = Date.now();
    const voiceName = opts.voice === "male" ? VOICES.MALE : VOICES.FEMALE;
    const ttsResult = await synthesizeScript(script, {
      workDir,
      voice: voiceName,
      rate: "+0%"
    });
    console.log(`- Thu âm hoàn tất trong ${((Date.now() - ttsStart) / 1000).toFixed(1)}s`);
    console.log(`- Thời lượng lời thoại: ${ttsResult.totalDuration.toFixed(1)}s`);

    // 4. Tạo hình ảnh từng phân cảnh
    console.log("[4/5] Đang tạo hình ảnh phân cảnh (AI Art & Thematic Graphic Cards)...");
    const visualStart = Date.now();
    const sceneVisuals = await generateScriptVisuals(script, book, {
      workDir,
      coverPath,
      enableAiVisuals: opts.enableAiVisuals
    });

    // Ghép visual vào scenes
    const enrichedScenes = ttsResult.scenes.map(sc => {
      const v = sceneVisuals.find(sv => sv.sceneId === sc.id);
      return {
        ...sc,
        imagePath: v ? v.imagePath : coverPath
      };
    });
    console.log(`- Tạo hình ảnh hoàn tất trong ${((Date.now() - visualStart) / 1000).toFixed(1)}s`);

    // 5. Render Video MP4 với Ken Burns, BGM, và Phụ đề
    console.log("[5/5] Đang render video MP4 hoàn chỉnh với FFmpeg...");
    const renderStart = Date.now();
    const outMp4Path = path.resolve(opts.output);
    fs.mkdirSync(path.dirname(outMp4Path), { recursive: true });

    const renderResult = await renderReviewVideo({
      scenes: enrichedScenes,
      masterSrtPath: ttsResult.masterSrtPath,
      outputPath: outMp4Path,
      workDir,
      burnSubtitles: true,
      onProgress: (step, pct, msg) => {
        console.log(`  [Render Progress] ${pct}% - ${msg}`);
      }
    });

    // Copy SRT kèm theo video để xem rời hoặc upload lên YouTube Closed Captions
    const outSrtPath = outMp4Path.replace(/\.mp4$/i, ".srt");
    if (fs.existsSync(ttsResult.masterSrtPath)) {
      fs.copyFileSync(ttsResult.masterSrtPath, outSrtPath);
    }

    const stat = fs.statSync(outMp4Path);
    console.log("\n==========================================");
    console.log("🎉 TẠO VIDEO REVIEW THÀNH CÔNG RỰC RỠ!");
    console.log(`- Video MP4: ${outMp4Path} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`- Subtitles: ${outSrtPath}`);
    console.log(`- Tổng thời lượng: ${renderResult.duration.toFixed(1)}s`);
    console.log(`- Thời gian render: ${((Date.now() - renderStart) / 1000).toFixed(1)}s`);
    console.log("==========================================");

  } finally {
    // Giữ workDir hoặc dọn dẹp (giữ lại 1 thư mục log/scratch nếu cần gỡ lỗi)
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

main().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
