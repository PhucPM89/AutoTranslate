"use strict";

async function updateWithRetry({ read, mutate, write, maxAttempts = 6 }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const snapshot = await read();
    const next = await mutate(structuredClone(snapshot.value));
    try {
      return await write(next, snapshot.etag);
    } catch (error) {
      if (!isWriteConflict(error) || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("Không thể cập nhật dữ liệu sau nhiều lần thử.");
}

function isWriteConflict(error) {
  return error?.name === "BlobPreconditionFailedError" || error?.status === 412 || error?.statusCode === 412;
}

module.exports = { updateWithRetry, isWriteConflict };
