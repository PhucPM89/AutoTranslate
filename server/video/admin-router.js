"use strict";

const { LAYOUT } = require("../storage/keys");
const { createR2BindingStorage } = require("../../worker/r2-storage");
const {
  JOB_STATUS,
  getJobIndex,
  getJob,
  createJob,
  updateJob,
  updateJobScript,
  checkAndUpdateDailyBudget
} = require("./job-queue");
const { getYouTubeAuthUrl, exchangeYouTubeAuthCode, uploadVideoToYouTube } = require("./youtube");

/**
 * Obtain storage instance for current environment
 */
function getStorage(env) {
  if (env && (env.NOVEL_STORAGE || env.R2_READER || env.R2_BUCKET)) {
    const bucket = env.NOVEL_STORAGE || env.R2_READER || env.R2_BUCKET;
    return createR2BindingStorage(bucket, { publicBase: env.R2_PUBLIC_BASE_URL || "" });
  }
  const { createStorage } = require("../storage");
  return createStorage(env || process.env);
}

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-cache",
      ...headers
    }
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

/**
 * Main dispatcher for /api/admin/video/*
 */
async function handleAdminVideo({ request, env, url, path, requireAdmin, readJson }) {
  // Enforce admin authentication
  await requireAdmin(request, env);

  const storage = getStorage(env);
  const subPath = path.replace(/^\/api\/admin\/video\/?/, "");
  const method = request.method;

  // 1. GET /api/admin/video/budget
  if (subPath === "budget" && method === "GET") {
    const budget = await checkAndUpdateDailyBudget(storage);
    return jsonResponse(budget);
  }

  // 2. /api/admin/video/jobs
  if (subPath === "jobs" || subPath === "") {
    if (method === "GET") {
      const jobs = await getJobIndex(storage);
      const budget = await checkAndUpdateDailyBudget(storage);
      return jsonResponse({ jobs, budget });
    }

    if (method === "POST") {
      const body = await readJson(request);
      try {
        const job = await createJob(body, { storage });
        return jsonResponse(job, 201);
      } catch (err) {
        return errorResponse(err.message, 400);
      }
    }
  }

  // 3. /api/admin/video/jobs/:id/*
  const jobMatch = subPath.match(/^jobs\/([A-Za-z0-9._-]+)(?:\/([a-z-]+))?$/);
  if (jobMatch) {
    const jobId = jobMatch[1];
    const action = jobMatch[2];

    if (!action) {
      if (method === "GET") {
        const job = await getJob(jobId, { storage });
        if (!job) return errorResponse("Không tìm thấy job", 404);
        return jsonResponse(job);
      }
      if (method === "DELETE") {
        const updated = await updateJob(jobId, {
          status: JOB_STATUS.CANCELED,
          stageMessage: "Job đã bị hủy bởi Quản trị viên"
        }, { storage });
        return jsonResponse(updated);
      }
    }

    if (action === "script" && (method === "PUT" || method === "POST")) {
      const body = await readJson(request);
      if (!body?.script) return errorResponse("Thiếu thông tin script để cập nhật", 400);
      const updated = await updateJobScript(jobId, body.script, { storage });
      return jsonResponse(updated);
    }

    if (action === "approve" && method === "POST") {
      const updated = await updateJob(jobId, {
        status: JOB_STATUS.PENDING,
        stageMessage: "Đã duyệt kịch bản, đang chờ render..."
      }, { storage });
      return jsonResponse(updated);
    }

    if (action === "retry" && method === "POST") {
      const updated = await updateJob(jobId, {
        status: JOB_STATUS.PENDING,
        error: null,
        stageMessage: "Đã đưa job trở lại hàng đợi render..."
      }, { storage });
      return jsonResponse(updated);
    }

    if (action === "upload-youtube" && method === "POST") {
      const job = await getJob(jobId, { storage });
      if (!job) return errorResponse("Không tìm thấy job", 404);
      if (!job.checkpoints?.rendered) return errorResponse("Video chưa được render", 400);

      // Trigger YouTube upload
      try {
        await updateJob(jobId, {
          status: JOB_STATUS.UPLOADING,
          stageMessage: "Đang tải video lên YouTube..."
        }, { storage });

        // Note: in local/worker mode, if the file is in storage, we retrieve or run upload
        return jsonResponse({ message: "Yêu cầu upload YouTube đã được ghi nhận." });
      } catch (err) {
        return errorResponse(err.message, 500);
      }
    }
  }

  // 4. YouTube OAuth endpoints
  if (subPath === "youtube-auth" && method === "GET") {
    const isConfigured = Boolean(env.YOUTUBE_CLIENT_ID);
    const hasToken = Boolean(env.YOUTUBE_REFRESH_TOKEN);
    let authUrl = null;
    if (isConfigured) {
      try {
        authUrl = getYouTubeAuthUrl({
          clientId: env.YOUTUBE_CLIENT_ID,
          redirectUri: env.YOUTUBE_REDIRECT_URI
        });
      } catch (_) {}
    }
    return jsonResponse({ isConfigured, hasToken, authUrl });
  }

  if (subPath === "youtube-callback" && method === "POST") {
    const body = await readJson(request);
    const code = String(body?.code || "").trim();
    if (!code) return errorResponse("Thiếu mã authorization code", 400);

    try {
      const tokens = await exchangeYouTubeAuthCode(code, {
        clientId: env.YOUTUBE_CLIENT_ID,
        clientSecret: env.YOUTUBE_CLIENT_SECRET,
        redirectUri: env.YOUTUBE_REDIRECT_URI
      });
      return jsonResponse({
        success: true,
        message: "Xác thực YouTube thành công!",
        refreshToken: tokens.refreshToken ? "Đã nhận refresh token" : "Token hiện tại hợp lệ"
      });
    } catch (err) {
      return errorResponse(err.message, 500);
    }
  }

  // 5. Assets serving: /api/admin/video/assets/:jobId/:filename
  const assetMatch = subPath.match(/^assets\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
  if (assetMatch && (method === "GET" || method === "HEAD")) {
    const [, jobId, filename] = assetMatch;
    const assetKey = LAYOUT.videoReviewAsset(jobId, filename);
    try {
      const data = await storage.get(assetKey);
      if (!data) return errorResponse("Không tìm thấy tệp", 404);

      const contentType = filename.endsWith(".mp4")
        ? "video/mp4"
        : filename.endsWith(".srt")
          ? "text/plain; charset=utf-8"
          : "application/octet-stream";

      return new Response(method === "HEAD" ? null : data, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=3600",
          "Accept-Ranges": "bytes"
        }
      });
    } catch (_) {
      return errorResponse("Không thể tải tệp từ lưu trữ", 404);
    }
  }

  return errorResponse("Đường dẫn API Video không tồn tại", 404);
}

module.exports = { handleAdminVideo };

