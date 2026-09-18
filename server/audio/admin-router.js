"use strict";

const { createR2BindingStorage } = require("../../worker/r2-storage");
const { listAudioJobs, createAudioJob, getAudioJob, updateAudioJob, getAudioBookStatus } = require("./job-queue");

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });
}

async function handleAdminAudio({ request, env, path, requireAdmin, readJson, storage: customStorage }) {
  await requireAdmin(request, env);
  const storage = customStorage || env.storage || (env.NOVEL_STORAGE && typeof env.NOVEL_STORAGE.get === "function"
    ? createR2BindingStorage(env.NOVEL_STORAGE || env.R2_READER || env.R2_BUCKET)
    : require("../storage").createStorage(env));
  const subPath = path.replace(/^\/api\/admin\/audio\/?/, "");

  const matchStatus = subPath.match(/^books\/([A-Za-z0-9._-]+)\/status$/);
  if (matchStatus && request.method === "GET") {
    const status = await getAudioBookStatus(matchStatus[1], storage);
    return status ? json(status) : json({ error: "Không tìm thấy bộ truyện hoặc dữ liệu audio." }, 404);
  }

  if ((subPath === "" || subPath === "jobs") && request.method === "GET") return json({ jobs: await listAudioJobs(storage) });
  if ((subPath === "" || subPath === "jobs") && request.method === "POST") {
    const body = await readJson(request);
    const raw = await storage.get(`books/${body.bookId}/index.json`);
    if (!raw) return json({ error: "Không tìm thấy bộ truyện." }, 404);
    const book = JSON.parse(raw.toString("utf8"));
    const totalChapters = Number(book.chapterCount || book.totalChapters || book.chapters?.length || 0);
    try {
      const job = await createAudioJob({
        bookId: body.bookId,
        bookTitle: book.title || body.bookTitle,
        genre: book.genre || body.genre || "",
        revision: book.revision || 1,
        totalChapters,
        mode: body.mode || (body.forceAll ? "force_all" : "missing_only"),
        startChapter: body.startChapter ? Number(body.startChapter) : null,
        forceAll: Boolean(body.forceAll)
      }, storage);
      return json(job, 201);
    } catch (err) {
      return json({ error: err.message || "Không thể tạo job audio." }, 400);
    }
  }
  const match = subPath.match(/^jobs\/([A-Za-z0-9._-]+)(?:\/(retry|cancel))?$/);
  if (match && request.method === "GET") {
    const job = await getAudioJob(match[1], storage);
    return job ? json(job) : json({ error: "Không tìm thấy job." }, 404);
  }
  if (match && request.method === "POST" && match[2]) {
    const patch = match[2] === "retry"
      ? { status: "pending", error: null, stageMessage: "Đã yêu cầu thử lại." }
      : { status: "canceled", stageMessage: "Đã hủy bởi quản trị viên." };
    return json(await updateAudioJob(match[1], patch, storage));
  }
  return json({ error: "Đường dẫn Audio không tồn tại." }, 404);
}

module.exports = { handleAdminAudio };
