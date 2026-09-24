"use strict";

const crypto = require("crypto");
const { LAYOUT } = require("../storage/keys");
const { createStorage } = require("../storage");

const JOB_STATUS = {
  PENDING: "pending",
  FETCHING_CONTENT: "fetching_content",
  GENERATING_SCRIPT: "generating_script",
  WAITING_APPROVAL: "waiting_approval",
  GENERATING_MEDIA: "generating_media",
  RENDERING: "rendering",
  READY: "ready",
  UPLOADING: "uploading",
  COMPLETED: "completed",
  ERROR: "error",
  CANCELED: "canceled"
};

const DEFAULT_MAX_VIDEOS_PER_DAY = 10;

/**
 * Generate deduplication hash for video configuration
 */
function computeDedupKey({ bookId, startChapter, endChapter, mode, tone, voice, aspectRatio = "9:16" }) {
  const raw = `${bookId}:${startChapter}-${endChapter}:${mode || "teaser"}:${tone || "suspense"}:${voice || "female"}:${aspectRatio}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Check and update daily video render budget
 */
async function checkAndUpdateDailyBudget(storage, { increment = false, maxPerDay = DEFAULT_MAX_VIDEOS_PER_DAY } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const budgetKey = LAYOUT.videoReviewBudget();

  let budgetData = { date: today, count: 0, maxPerDay };
  try {
    const raw = await storage.get(budgetKey);
    if (raw) {
      const parsed = JSON.parse(raw.toString("utf8"));
      if (parsed.date === today) {
        budgetData = parsed;
      }
    }
  } catch (_) {}

  if (budgetData.count >= budgetData.maxPerDay && increment) {
    return { allowed: false, count: budgetData.count, maxPerDay: budgetData.maxPerDay, remaining: 0 };
  }

  if (increment) {
    budgetData.count += 1;
    await storage.put(budgetKey, Buffer.from(JSON.stringify(budgetData, null, 2)), {
      contentType: "application/json; charset=utf-8"
    });
  }

  return {
    allowed: budgetData.count < budgetData.maxPerDay,
    count: budgetData.count,
    maxPerDay: budgetData.maxPerDay,
    remaining: Math.max(0, budgetData.maxPerDay - budgetData.count)
  };
}

/**
 * Load video review job index
 */
async function getJobIndex(storage) {
  const indexKey = LAYOUT.videoReviewIndex();
  try {
    const raw = await storage.get(indexKey);
    if (raw) {
      const parsed = JSON.parse(raw.toString("utf8"));
      if (Array.isArray(parsed.jobs)) return parsed.jobs;
    }
  } catch (_) {}
  return [];
}

/**
 * Save job summary into index
 */
async function saveJobIndex(storage, jobSummary) {
  const indexKey = LAYOUT.videoReviewIndex();
  let list = await getJobIndex(storage);

  const idx = list.findIndex(j => j.id === jobSummary.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...jobSummary, updatedAt: new Date().toISOString() };
  } else {
    list.unshift({ ...jobSummary, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  // Keep top 50 recent jobs
  list = list.slice(0, 50);

  await storage.put(indexKey, Buffer.from(JSON.stringify({ jobs: list, updatedAt: new Date().toISOString() }, null, 2)), {
    contentType: "application/json; charset=utf-8"
  });
  return list;
}

/**
 * Create a new video review job
 */
async function createJob(params, { storage = createStorage() } = {}) {
  const {
    bookId,
    startChapter = 1,
    endChapter = 5,
    mode = "teaser",
    tone = "suspense",
    voice = "female",
    aspectRatio = "9:16",
    autoApprove = true,
    enableAiVisuals = true,
    autoUploadYouTube = false
  } = params;

  if (!bookId) {
    throw new Error("Thiếu bookId cho yêu cầu tạo video");
  }

  // Check daily budget limit
  const budget = await checkAndUpdateDailyBudget(storage, { increment: false });
  if (!budget.allowed) {
    throw new Error(`Đã vượt giới hạn tạo video trong ngày (${budget.count}/${budget.maxPerDay}). Hãy thử lại vào ngày mai.`);
  }

  const dedupKey = computeDedupKey({ bookId, startChapter, endChapter, mode, tone, voice, aspectRatio });

  // Check for duplicate active or completed job
  const existingList = await getJobIndex(storage);
  const duplicate = existingList.find(j => j.dedupKey === dedupKey && j.status !== JOB_STATUS.ERROR && j.status !== JOB_STATUS.CANCELED);
  if (duplicate) {
    console.log(`[JobQueue] Duplicate job found (${duplicate.id}), returning existing.`);
    const existingRaw = await storage.get(LAYOUT.videoReviewJob(duplicate.id));
    if (existingRaw) {
      return JSON.parse(existingRaw.toString("utf8"));
    }
  }

  const timestamp = Date.now();
  const id = `vr_${timestamp}_${dedupKey.slice(0, 8)}`;
  const now = new Date().toISOString();

  const job = {
    id,
    dedupKey,
    bookId,
    chapterRange: {
      start: Number(startChapter),
      end: Number(endChapter)
    },
    options: {
      mode,
      tone,
      voice,
      aspectRatio,
      autoApprove: Boolean(autoApprove),
      enableAiVisuals: Boolean(enableAiVisuals),
      autoUploadYouTube: Boolean(autoUploadYouTube)
    },

    status: JOB_STATUS.PENDING,
    progress: 0,
    stageMessage: "Đang chờ worker xử lý...",
    checkpoints: {
      contentFetched: false,
      scriptGenerated: false,
      ttsGenerated: false,
      visualsGenerated: false,
      rendered: false,
      uploaded: false
    },
    script: null,
    assets: {
      videoKey: null,
      subtitlesKey: null,
      videoUrl: null,
      subtitlesUrl: null,
      duration: 0
    },
    youtube: {
      videoId: null,
      videoUrl: null,
      privacyStatus: "private",
      uploadedAt: null
    },
    error: null,
    createdAt: now,
    updatedAt: now
  };

  // Persist job details
  await storage.put(LAYOUT.videoReviewJob(id), Buffer.from(JSON.stringify(job, null, 2)), {
    contentType: "application/json; charset=utf-8"
  });

  // Update index
  await saveJobIndex(storage, {
    id: job.id,
    bookId: job.bookId,
    chapterRange: job.chapterRange,
    status: job.status,
    progress: job.progress,
    stageMessage: job.stageMessage,
    dedupKey: job.dedupKey,
    videoUrl: null
  });

  return job;
}

/**
 * Get job by ID
 */
async function getJob(jobId, { storage = createStorage() } = {}) {
  const raw = await storage.get(LAYOUT.videoReviewJob(jobId));
  if (!raw) return null;
  return JSON.parse(raw.toString("utf8"));
}

/**
 * Update job state & checkpoints
 */
async function updateJob(jobId, updates, { storage = createStorage() } = {}) {
  const current = await getJob(jobId, { storage });
  if (!current) {
    throw new Error(`Không tìm thấy job ${jobId}`);
  }

  const updated = {
    ...current,
    ...updates,
    checkpoints: {
      ...current.checkpoints,
      ...(updates.checkpoints || {})
    },
    assets: {
      ...current.assets,
      ...(updates.assets || {})
    },
    youtube: {
      ...current.youtube,
      ...(updates.youtube || {})
    },
    updatedAt: new Date().toISOString()
  };

  await storage.put(LAYOUT.videoReviewJob(jobId), Buffer.from(JSON.stringify(updated, null, 2)), {
    contentType: "application/json; charset=utf-8"
  });

  await saveJobIndex(storage, {
    id: updated.id,
    bookId: updated.bookId,
    chapterRange: updated.chapterRange,
    status: updated.status,
    progress: updated.progress,
    stageMessage: updated.stageMessage,
    dedupKey: updated.dedupKey,
    videoUrl: updated.assets?.videoUrl || null
  });

  return updated;
}

/**
 * Update editable script in a job (e.g. before rendering or while waiting approval)
 */
async function updateJobScript(jobId, newScript, { storage = createStorage() } = {}) {
  const job = await getJob(jobId, { storage });
  if (!job) throw new Error(`Không tìm thấy job ${jobId}`);

  return updateJob(jobId, {
    script: newScript,
    checkpoints: {
      ...job.checkpoints,
      scriptGenerated: true,
      // If script changed, invalidate subsequent media
      ttsGenerated: false,
      rendered: false
    },
    stageMessage: "Kịch bản đã được chỉnh sửa thủ công",
    status: job.options.autoApprove ? JOB_STATUS.PENDING : JOB_STATUS.WAITING_APPROVAL
  }, { storage });
}

module.exports = {
  JOB_STATUS,
  computeDedupKey,
  checkAndUpdateDailyBudget,
  getJobIndex,
  createJob,
  getJob,
  updateJob,
  updateJobScript
};
