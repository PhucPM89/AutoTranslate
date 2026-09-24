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
const { LAYOUT } = require("../server/storage/keys");
const {
  JOB_STATUS,
  getJobIndex,
  getJob,
  updateJob,
  checkAndUpdateDailyBudget
} = require("../server/video/job-queue");
const { generateReviewScript } = require("../server/video/script-generator");
const { synthesizeScript, VOICES } = require("../server/video/tts");
const { generateScriptVisuals } = require("../server/video/visuals");
const { renderReviewVideo } = require("../server/video/renderer");
const { uploadVideoToYouTube } = require("../server/video/youtube");

/**
 * Process a single video review job end-to-end with checkpoint resumption
 */
async function processJob(jobId, { storage = createStorage() } = {}) {
  const job = await getJob(jobId, { storage });
  if (!job) {
    throw new Error(`Không tìm thấy job ${jobId}`);
  }

  const workDir = path.resolve(`server/video/work_${job.id}`);
  fs.mkdirSync(workDir, { recursive: true });

  console.log(`\n========================================`);
  console.log(`[Worker] Bắt đầu xử lý job: ${job.id}`);
  console.log(`- Truyện: ${job.bookId}`);
  console.log(`- Phạm vi chương: ${job.chapterRange.start} - ${job.chapterRange.end}`);
  console.log(`- Trạng thái hiện tại: ${job.status}`);
  console.log(`========================================`);

  try {
    // Stage 1: Content Fetching
    if (!job.checkpoints?.contentFetched) {
      await updateJob(job.id, {
        status: JOB_STATUS.FETCHING_CONTENT,
        progress: 10,
        stageMessage: "Đang tải thông tin sách và các chương dịch..."
      }, { storage });

      const indexRaw = await storage.get(`books/${job.bookId}/index.json`);
      if (!indexRaw) {
        throw new Error(`Không tìm thấy sách ${job.bookId} trong lưu trữ.`);
      }
      const book = JSON.parse(indexRaw.toString("utf8"));
      if (!book.id) book.id = job.bookId;
      fs.writeFileSync(path.join(workDir, "book.json"), JSON.stringify(book, null, 2), "utf8");

      // Cover
      const coverExts = ["jpg", "jpeg", "webp", "png"];
      let coverPath = null;
      for (const ext of coverExts) {
        try {
          const coverRaw = await storage.get(`books/${job.bookId}/cover.${ext}`);
          if (coverRaw) {
            coverPath = path.join(workDir, `cover.${ext}`);
            fs.writeFileSync(coverPath, coverRaw);
            break;
          }
        } catch (_) {}
      }

      // Chapters
      const chapters = [];
      for (let c = job.chapterRange.start; c <= job.chapterRange.end; c++) {
        try {
          const chRaw = await storage.get(`books/${job.bookId}/r1/ch/${c}.json`);
          if (chRaw) {
            chapters.push(JSON.parse(chRaw.toString("utf8")));
          }
        } catch (err) {
          console.warn(`[Worker] Không tải được chương ${c}:`, err.message);
        }
      }
      fs.writeFileSync(path.join(workDir, "chapters.json"), JSON.stringify(chapters, null, 2), "utf8");

      await updateJob(job.id, {
        checkpoints: { contentFetched: true },
        progress: 20,
        stageMessage: `Đã nạp ${chapters.length} chương dịch.`
      }, { storage });
    }

    // Stage 2: Script Generation
    let script = job.script;
    if (!job.checkpoints?.scriptGenerated || !script) {
      await updateJob(job.id, {
        status: JOB_STATUS.GENERATING_SCRIPT,
        progress: 25,
        stageMessage: "Đang sáng tạo kịch bản review với AI..."
      }, { storage });

      const book = JSON.parse(fs.readFileSync(path.join(workDir, "book.json"), "utf8"));
      const chapters = JSON.parse(fs.readFileSync(path.join(workDir, "chapters.json"), "utf8"));

      script = await generateReviewScript(book, chapters, {
        mode: job.options.mode,
        tone: job.options.tone,
        targetDurationSeconds: 120
      });

      fs.writeFileSync(path.join(workDir, "script.json"), JSON.stringify(script, null, 2), "utf8");

      const needsApproval = !job.options.autoApprove;
      await updateJob(job.id, {
        script,
        checkpoints: { scriptGenerated: true },
        progress: needsApproval ? 35 : 40,
        status: needsApproval ? JOB_STATUS.WAITING_APPROVAL : JOB_STATUS.GENERATING_MEDIA,
        stageMessage: needsApproval ? "Kịch bản đã sẵn sàng chờ duyệt." : "Kịch bản đã sẵn sàng, bắt đầu thu âm..."
      }, { storage });

      if (needsApproval) {
        console.log(`[Worker] Job ${job.id} dừng tại bước chờ duyệt kịch bản.`);
        return;
      }
    }

    // Stage 3: Media Generation (TTS & Visuals)
    let ttsResult = null;
    const book = JSON.parse(fs.readFileSync(path.join(workDir, "book.json"), "utf8"));
    const coverPath = fs.existsSync(path.join(workDir, "cover.jpg")) ? path.join(workDir, "cover.jpg") : null;

    if (!job.checkpoints?.ttsGenerated) {
      await updateJob(job.id, {
        status: JOB_STATUS.GENERATING_MEDIA,
        progress: 45,
        stageMessage: "Đang thu âm giọng đọc AI tiếng Việt..."
      }, { storage });

      const voice = job.options.voice === "male" ? VOICES.MALE : VOICES.FEMALE;
      ttsResult = await synthesizeScript(script, {
        workDir,
        voice,
        rate: "+0%"
      });

      fs.writeFileSync(path.join(workDir, "tts_meta.json"), JSON.stringify({
        totalDuration: ttsResult.totalDuration,
        scenes: ttsResult.scenes
      }, null, 2), "utf8");

      await updateJob(job.id, {
        checkpoints: { ttsGenerated: true },
        progress: 60,
        stageMessage: "Thu âm AI và phụ đề hoàn tất."
      }, { storage });
    } else {
      ttsResult = JSON.parse(fs.readFileSync(path.join(workDir, "tts_meta.json"), "utf8"));
      ttsResult.masterAudioPath = path.join(workDir, "narration.mp3");
      ttsResult.masterSrtPath = path.join(workDir, "subtitles.srt");
    }

    // Visuals
    let sceneVisuals = null;
    if (!job.checkpoints?.visualsGenerated) {
      await updateJob(job.id, {
        status: JOB_STATUS.GENERATING_MEDIA,
        progress: 65,
        stageMessage: "Đang tạo hình ảnh phân cảnh (AI artwork & cards)..."
      }, { storage });

      const aspectRatio = job.options?.aspectRatio || "9:16";
      sceneVisuals = await generateScriptVisuals(script, book, {
        workDir,
        coverPath,
        enableAiVisuals: job.options.enableAiVisuals
        enableAiVisuals: job.options?.enableAiVisuals !== false,
        aspectRatio,
        cutsPerScene: 2
      });

      fs.writeFileSync(path.join(workDir, "visuals_meta.json"), JSON.stringify(sceneVisuals, null, 2), "utf8");

      await updateJob(job.id, {
        checkpoints: { visualsGenerated: true },
        progress: 75,
        stageMessage: "Hình ảnh phân cảnh hoàn tất."
      }, { storage });
    } else {
      sceneVisuals = JSON.parse(fs.readFileSync(path.join(workDir, "visuals_meta.json"), "utf8"));
    }

    // Stage 4: FFmpeg Video Rendering
    if (!job.checkpoints?.rendered) {
      await updateJob(job.id, {
        status: JOB_STATUS.RENDERING,
        progress: 78,
        stageMessage: "Đang kết xuất video MP4 với FFmpeg..."
      }, { storage });

      // Link visuals into scenes
      // Link visuals and multi-cut shots into scenes
      const enrichedScenes = ttsResult.scenes.map(sc => {
        const v = sceneVisuals.find(sv => sv.sceneId === sc.id);
        const fallbackImg = v?.imagePath || coverPath;
        return {
          ...sc,
          imagePath: v ? v.imagePath : coverPath
          imagePath: fallbackImg,
          shots: (v?.shots && v.shots.length > 0) ? v.shots : [{ imagePath: fallbackImg, motion: "zoom_in" }]
        };
      });

      const isVertical = (job.options?.aspectRatio || "9:16") === "9:16";
      const width = isVertical ? 1080 : 1920;
      const height = isVertical ? 1920 : 1080;

      const outMp4Path = path.join(workDir, "final_review.mp4");
      const renderRes = await renderReviewVideo({
        scenes: enrichedScenes,
        masterSrtPath: ttsResult.masterSrtPath,
        outputPath: outMp4Path,
        workDir,
        width,
        height,
        burnSubtitles: true,
        onProgress: async (step, pct, msg) => {
          const scaled = 78 + Math.round(pct * 0.17);
          await updateJob(job.id, { progress: scaled, stageMessage: msg }, { storage });
        }
      });

      // Upload rendered MP4 and SRT to storage
      const videoKey = LAYOUT.videoReviewAsset(job.id, "review.mp4");
      const srtKey = LAYOUT.videoReviewAsset(job.id, "subtitles.srt");

      const mp4Buffer = fs.readFileSync(outMp4Path);
      const srtBuffer = fs.readFileSync(ttsResult.masterSrtPath);

      await storage.put(videoKey, mp4Buffer, { contentType: "video/mp4" });
      await storage.put(srtKey, srtBuffer, { contentType: "text/plain; charset=utf-8" });

      const videoUrl = typeof storage.publicUrl === "function" ? storage.publicUrl(videoKey) : `/api/admin/video/assets/${job.id}/review.mp4`;
      const subtitlesUrl = typeof storage.publicUrl === "function" ? storage.publicUrl(srtKey) : `/api/admin/video/assets/${job.id}/subtitles.srt`;

      // Deduct from daily budget
      await checkAndUpdateDailyBudget(storage, { increment: true });

      await updateJob(job.id, {
        status: JOB_STATUS.READY,
        checkpoints: { rendered: true },
        progress: 95,
        stageMessage: "Video review đã render hoàn chỉnh, sẵn sàng phát hành!",
        assets: {
          videoKey,
          subtitlesKey: srtKey,
          videoUrl,
          subtitlesUrl,
          duration: renderRes.duration
        }
      }, { storage });
    }

    // Stage 5: YouTube Upload (if configured)
    if (job.options.autoUploadYouTube && !job.checkpoints?.uploaded) {
      await updateJob(job.id, {
        status: JOB_STATUS.UPLOADING,
        progress: 96,
        stageMessage: "Đang tải video lên YouTube..."
      }, { storage });

      const outMp4Path = path.join(workDir, "final_review.mp4");
      const ytResult = await uploadVideoToYouTube({
        videoPath: outMp4Path,
        title: script.title,
        description: `${script.summary || ""}\n\nĐón đọc bản dịch mượt mà tại Trạm Chữ: https://tram-chu.online`,
        tags: script.tags || ["Trạm Chữ", "Review Truyện"],
        privacyStatus: "private" // Strict safeguard: private by default
      });

      await updateJob(job.id, {
        status: JOB_STATUS.COMPLETED,
        checkpoints: { uploaded: true },
        progress: 100,
        stageMessage: "Đã tải lên YouTube thành công (chế độ Riêng tư)!",
        youtube: {
          videoId: ytResult.videoId,
          videoUrl: `https://www.youtube.com/watch?v=${ytResult.videoId}`,
          privacyStatus: "private",
          uploadedAt: new Date().toISOString()
        }
      }, { storage });
    } else if (job.checkpoints?.rendered) {
      await updateJob(job.id, {
        status: JOB_STATUS.READY,
        progress: 100,
        stageMessage: "Video đã sẵn sàng."
      }, { storage });
    }

    console.log(`[Worker] Job ${job.id} hoàn thành xuất sắc!`);
  } catch (error) {
    console.error(`[Worker] Lỗi xử lý job ${job.id}:`, error);
    await updateJob(job.id, {
      status: JOB_STATUS.ERROR,
      error: error.message,
      stageMessage: `Gặp sự cố: ${error.message}`
    }, { storage });
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }
}

/**
 * Worker polling loop
 */
async function startWorkerLoop({ once = false, pollIntervalMs = 5000 } = {}) {
  const storage = createStorage();
  console.log(`[Video Worker] Khởi chạy worker (once=${once}, interval=${pollIntervalMs}ms)...`);

  let running = true;
  process.on("SIGINT", () => {
    console.log("[Video Worker] Nhận tín hiệu dừng, thoát gracefully...");
    running = false;
  });

  while (running) {
    try {
      const index = await getJobIndex(storage);
      const pendingJob = index.find(j => j.status === JOB_STATUS.PENDING);

      if (pendingJob) {
        console.log(`[Video Worker] Tìm thấy pending job: ${pendingJob.id}`);
        await processJob(pendingJob.id, { storage });
        if (once) break;
      } else {
        if (once) {
          console.log("[Video Worker] Không có job pending nào để xử lý.");
          break;
        }
      }
    } catch (err) {
      console.error("[Video Worker] Lỗi trong worker loop:", err.message);
    }

    if (!once && running) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  startWorkerLoop({ once }).catch(err => {
    console.error("[Video Worker] Fatal:", err);
    process.exit(1);
  });
}

module.exports = {
  processJob,
  startWorkerLoop
};

