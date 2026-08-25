"use strict";

// Read and change the crawler's config. It lives in the private R2 bucket.
//
//   node scripts/crawler-config.js --show
//   node scripts/crawler-config.js --enable
//   node scripts/crawler-config.js --disable
//   node scripts/crawler-config.js --set wordCountBucket=4 --set maxNewBooksPerRun=2
//   node scripts/crawler-config.js --categories fantasy,urban
//
// The admin page writes the same objects through the Worker, so this and the UI
// stay in agreement. Handy for changing config without opening the browser.

const { createCrawlerState } = require("../server/crawler-state");
const { createStorage, createArchiveStorage } = require("../server/storage");
const { CATEGORY_DEFINITIONS, WORD_COUNT_BUCKETS, CREATION_STATUSES } = require("../server/crawler-store");

const args = process.argv.slice(2);

function flagValues(name) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) values.push(args[i + 1]);
  }
  return values;
}

function describe(config) {
  console.log("Cấu hình crawler hiện tại:");
  console.log(`  enabled            : ${config.enabled}`);
  console.log(`  categories         : ${(config.categories || []).join(", ") || "(không có)"}`);
  console.log(`  wordCountBucket    : ${config.wordCountBucket}`);
  console.log(`  creationStatus     : ${config.creationStatus}`);
  console.log(`  maxNewBooksPerRun  : ${config.maxNewBooksPerRun}`);
  console.log(`  maxPendingBooksBacklog: ${config.maxPendingBooksBacklog}`);
  console.log(`  maxLibraryBooks    : ${config.maxLibraryBooks || "(không giới hạn)"}`);
  console.log(`  updateExisting     : ${config.updateExisting}`);
  console.log(`  excludedSourceIds  : ${(config.excludedSourceIds || []).length} id`);
}

async function main() {
  const state = createCrawlerState({
    storage: createArchiveStorage() || createStorage(),
    readerStorage: createStorage()
  });

  if (args.includes("--show") || args.length === 0) {
    describe(await state.readConfig());
    const status = await state.readStatus();
    console.log(`\nTrạng thái lần chạy gần nhất: ${status.state}`);
    if (status.message) console.log(`  ${status.message}`);
    if (args.length === 0) {
      console.log("\nCác lựa chọn:");
      console.log(`  thể loại        : ${Object.keys(CATEGORY_DEFINITIONS).join(", ")}`);
      console.log(`  wordCountBucket : ${WORD_COUNT_BUCKETS.map((bucket) => `${bucket.value}=${bucket.label}`).join(", ")}`);
      console.log(`  creationStatus  : ${CREATION_STATUSES.map((item) => `${item.value}=${item.label}`).join(", ")}`);
    }
    return;
  }

  const patch = {};
  if (args.includes("--enable")) patch.enabled = true;
  if (args.includes("--disable")) patch.enabled = false;

  const categories = flagValues("--categories");
  if (categories.length) {
    patch.categories = categories.join(",").split(",").map((value) => value.trim()).filter(Boolean);
    const unknown = patch.categories.filter((key) => !CATEGORY_DEFINITIONS[key]);
    if (unknown.length) throw new Error(`Thể loại không hợp lệ: ${unknown.join(", ")}`);
  }

  for (const pair of flagValues("--set")) {
    const at = pair.indexOf("=");
    if (at < 0) throw new Error(`--set cần dạng key=value, nhận được "${pair}"`);
    const key = pair.slice(0, at);
    const raw = pair.slice(at + 1);
    // sanitizeCrawlerConfig clamps and rejects afterwards, so this only has to
    // get the type right.
    patch[key] = raw === "true" ? true : raw === "false" ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw;
  }

  if (!Object.keys(patch).length) throw new Error("Không có thay đổi nào. Xem: --show");

  const next = await state.writeConfig(patch);
  console.log("Đã lưu vào R2.\n");
  describe(next);
}

main().catch((error) => {
  console.error(`CRAWLER CONFIG FAILED: ${error.message}`);
  process.exit(1);
});
