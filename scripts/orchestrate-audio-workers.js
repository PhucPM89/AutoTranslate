"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadEnv(path.resolve(".env.local"));
loadEnv(path.resolve(".env"));

const { createStorage } = require("../server/storage");
const { nextAudioJob, listAudioJobs } = require("../server/audio/job-queue");

const KERNEL_SLUG = "phucpm2003/f5-tts-vietnamese-expressive-worker";
const KERNEL_DIR = path.resolve(__dirname, "../kaggle-kernel");

function getKaggleStatus() {
  const res = spawnSync("kaggle", ["kernels", "status", KERNEL_SLUG], { encoding: "utf8" });
  if (res.status !== 0) {
    return { ok: false, error: (res.stderr || res.stdout || "").trim() };
  }
  const text = (res.stdout || "").trim();
  const match = text.match(/status\s+"([^"]+)"/i);
  const status = match ? match[1] : text;
  return { ok: true, status };
}

function pushKaggleKernel() {
  console.log(`[ORCHESTRATOR] Đang chuẩn bị gói mã nguồn Kaggle GPU Worker (${KERNEL_SLUG})...`);
  const buildDir = path.resolve(__dirname, "../scratch/kaggle-deploy");
  fs.mkdirSync(buildDir, { recursive: true });

  const metadataPath = path.join(KERNEL_DIR, "kernel-metadata.json");
  const workerSrcPath = path.join(KERNEL_DIR, "kaggle_audio_worker.py");

  fs.copyFileSync(metadataPath, path.join(buildDir, "kernel-metadata.json"));

  let code = fs.readFileSync(workerSrcPath, "utf8");
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || "";
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "";
  const storageRoot = process.env.GOOGLE_DRIVE_STORAGE_FOLDER_ID || "1-TvHLKA7z_hyt90BdJpRBsjmCQGW3z8P";
  const audioRoot = process.env.GOOGLE_DRIVE_AUDIO_FOLDER_ID || "1R5zhmL3XQS22Z4Ia1HD5s1m-NW_OOGaw";

  code = code.replace(
    'DRIVE_CLIENT_ID = os.environ.get("GOOGLE_DRIVE_CLIENT_ID", "")',
    `DRIVE_CLIENT_ID = os.environ.get("GOOGLE_DRIVE_CLIENT_ID", ${JSON.stringify(clientId)})`
  );
  code = code.replace(
    'DRIVE_CLIENT_SECRET = os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET", "")',
    `DRIVE_CLIENT_SECRET = os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET", ${JSON.stringify(clientSecret)})`
  );
  code = code.replace(
    'DRIVE_REFRESH_TOKEN = os.environ.get("GOOGLE_DRIVE_REFRESH_TOKEN", "")',
    `DRIVE_REFRESH_TOKEN = os.environ.get("GOOGLE_DRIVE_REFRESH_TOKEN", ${JSON.stringify(refreshToken)})`
  );

  fs.writeFileSync(path.join(buildDir, "kaggle_audio_worker.py"), code, "utf8");

  console.log(`[ORCHESTRATOR] Gửi gói mã nguồn lên máy chủ Kaggle...`);
  const res = spawnSync("kaggle", ["kernels", "push", "-p", buildDir], { encoding: "utf8" });
  try {
    fs.rmSync(buildDir, { recursive: true, force: true });
  } catch (_) {}

  if (res.status === 0 && (res.stdout || "").includes("successfully pushed")) {
    return { ok: true, message: (res.stdout || "").trim() };
  }
  return { ok: false, error: (res.stderr || res.stdout || "").trim() };
}

async function orchestrate() {
  const storage = createStorage();
  console.log(`[ORCHESTRATOR] Kiểm tra hàng đợi audio (Driver: ${storage.driver})...`);

  const job = await nextAudioJob(storage);
  if (!job) {
    console.log("[ORCHESTRATOR] Không có audio job nào đang chờ. Kết thúc.");
    return { action: "idle" };
  }

  console.log(`[ORCHESTRATOR] Phát hiện Job cần xử lý: ${job.bookTitle} (${job.completedChapters}/${job.totalChapters} chương).`);

  // 1. Kiểm tra trạng thái Kaggle GPU
  const kaggleStatus = getKaggleStatus();
  console.log(`[ORCHESTRATOR] Trạng thái Kaggle Kernel hiện tại: ${kaggleStatus.ok ? kaggleStatus.status : kaggleStatus.error}`);

  if (kaggleStatus.ok) {
    const isRunning = kaggleStatus.status.includes("RUNNING") || kaggleStatus.status.includes("QUEUED");
    if (isRunning) {
      // Kiểm tra xem job có đang được cập nhật không
      const now = Date.now();
      const lastUpdated = job.updatedAt ? new Date(job.updatedAt).getTime() : 0;
      const isFresh = (now - lastUpdated) < 10 * 60 * 1000; // trong vòng 10 phút

      if (isFresh && job.status === "running") {
        console.log(">>> [KAGGLE ACTIVE] Kaggle GPU Worker đang xử lý với tốc độ cao. Tiếp tục giữ chế độ giám sát. <<<");
        return { action: "kaggle_running" };
      }
      console.log("[ORCHESTRATOR] Kaggle đang báo RUNNING nhưng job trên Drive > 10 phút chưa cập nhật. Cần kích hoạt failover.");
    }

    // Nếu không running hoặc stale, thử push để bật lại Kaggle GPU
    const pushResult = pushKaggleKernel();
    if (pushResult.ok) {
      console.log(">>> [KAGGLE TRIGGERED] Đã kích hoạt thành công Kaggle GPU Worker! Máy chủ Kaggle đang xử lý ngầm. <<<");
      return { action: "kaggle_triggered" };
    } else {
      console.warn(`[KAGGLE POLICY/QUOTA LIMIT] Lệnh push Kaggle không thành công: ${pushResult.error}`);
    }
  } else {
    console.warn(`[KAGGLE UNAVAILABLE] Không thể truy vấn Kaggle API: ${kaggleStatus.error}`);
  }

  // 2. Chuyển giao tự động sang GitHub Actions Worker để đảm bảo 24/7 không gián đoạn
  console.log("==================================================================================");
  console.log(">>> [FAILOVER TO GITHUB ACTIONS] Tự động chuyển giao sang GitHub Actions Worker <<<");
  console.log(">>> Hệ thống tiếp tục tạo audio liên tục 24/7 ngay cả khi Kaggle chạm giới hạn <<<");
  console.log("==================================================================================");

  const { runOnce } = require("./audio-worker");
  await runOnce(storage);
  return { action: "github_actions_executed" };
}

if (require.main === module) {
  orchestrate().catch((err) => {
    console.error("[ORCHESTRATOR ERROR]", err);
    process.exit(1);
  });
}

module.exports = { orchestrate, getKaggleStatus, pushKaggleKernel };
