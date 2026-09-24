"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  JOB_STATUS,
  computeDedupKey,
  checkAndUpdateDailyBudget,
  createJob,
  getJob,
  updateJob,
  updateJobScript
} = require("./job-queue");

// In-memory mock storage for testing
function createMockStorage() {
  const store = new Map();
  return {
    async put(key, buffer) {
      store.set(key, Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
    },
    async get(key) {
      return store.get(key) || null;
    }
  };
}

test("JobQueue: computeDedupKey is deterministic and sensitive to parameters", () => {
  const k1 = computeDedupKey({ bookId: "b1", startChapter: 1, endChapter: 5, mode: "teaser", tone: "suspense", voice: "female" });
  const k2 = computeDedupKey({ bookId: "b1", startChapter: 1, endChapter: 5, mode: "teaser", tone: "suspense", voice: "female" });
  const k3 = computeDedupKey({ bookId: "b1", startChapter: 1, endChapter: 10, mode: "teaser", tone: "suspense", voice: "female" });

  assert.equal(k1, k2);
  assert.notEqual(k1, k3);
  assert.equal(k1.length, 16);
});

test("JobQueue: checkAndUpdateDailyBudget respects maxPerDay limit", async () => {
  const storage = createMockStorage();

  // Initial check
  const b1 = await checkAndUpdateDailyBudget(storage, { increment: false, maxPerDay: 2 });
  assert.equal(b1.allowed, true);
  assert.equal(b1.count, 0);
  assert.equal(b1.remaining, 2);

  // Increment 1
  const b2 = await checkAndUpdateDailyBudget(storage, { increment: true, maxPerDay: 2 });
  assert.equal(b2.count, 1);
  assert.equal(b2.remaining, 1);

  // Increment 2
  const b3 = await checkAndUpdateDailyBudget(storage, { increment: true, maxPerDay: 2 });
  assert.equal(b3.count, 2);
  assert.equal(b3.remaining, 0);

  // Exceed limit
  const b4 = await checkAndUpdateDailyBudget(storage, { increment: true, maxPerDay: 2 });
  assert.equal(b4.allowed, false);
  assert.equal(b4.remaining, 0);
});

test("JobQueue: createJob, updateJob, and checkpoints workflow", async () => {
  const storage = createMockStorage();

  const job = await createJob({
    bookId: "fanqie-12345",
    startChapter: 1,
    endChapter: 5,
    mode: "teaser"
  }, { storage });

  assert.ok(job.id.startsWith("vr_"));
  assert.equal(job.bookId, "fanqie-12345");
  assert.equal(job.status, JOB_STATUS.PENDING);
  assert.equal(job.checkpoints.contentFetched, false);

  // Update checkpoints
  const updated = await updateJob(job.id, {
    status: JOB_STATUS.FETCHING_CONTENT,
    progress: 20,
    checkpoints: { contentFetched: true }
  }, { storage });

  assert.equal(updated.status, JOB_STATUS.FETCHING_CONTENT);
  assert.equal(updated.progress, 20);
  assert.equal(updated.checkpoints.contentFetched, true);

  // Verify fetch back
  const retrieved = await getJob(job.id, { storage });
  assert.deepEqual(retrieved.id, job.id);
  assert.equal(retrieved.checkpoints.contentFetched, true);
});

test("JobQueue: updateJobScript invalidates media checkpoints for re-render", async () => {
  const storage = createMockStorage();

  const job = await createJob({ bookId: "fanqie-12345" }, { storage });
  await updateJob(job.id, {
    checkpoints: { scriptGenerated: true, ttsGenerated: true, rendered: true }
  }, { storage });

  const modified = await updateJobScript(job.id, { title: "Tiêu đề mới", scenes: [] }, { storage });

  assert.equal(modified.script.title, "Tiêu đề mới");
  assert.equal(modified.checkpoints.scriptGenerated, true);
  assert.equal(modified.checkpoints.ttsGenerated, false); // invalidated
  assert.equal(modified.checkpoints.rendered, false);     // invalidated
});

