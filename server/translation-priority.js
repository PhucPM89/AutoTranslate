"use strict";
const PRIORITY_KEY = "config/translation-priority.json";
async function selectPriorityJobs(bookIds, loadJobs) {
  const ids = [...new Set((Array.isArray(bookIds) ? bookIds : []).filter(id =>
    typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id) && !id.includes("..")))];
  for (const bookId of ids) {
    const jobs = await loadJobs(bookId);
    if (jobs.length) return { bookId, jobs };
  }
  return null;
}
module.exports = { PRIORITY_KEY, selectPriorityJobs };
