"use strict";

const crypto = require("crypto");
const { updateWithRetry } = require("./blob-concurrency");

const CONFIG_PATH = "library/crawler-config.json";
const STATUS_PATH = "library/crawler-status.json";
// Fanqie rank ids are `<scope>_<board>_<category>`. The `_1_` boards list new and
// rising novels, which top out around 200 chapters, so they can never satisfy a
// minChapterCount in the thousands. The `_2_` boards list established novels and
// are the only usable source once a chapter minimum is set.
const CATEGORY_DEFINITIONS = {
  xianxia: { label: "Tiên hiệp", categoryIds: [1140], ranks: ["1_1_1140"], longRanks: ["1_2_1140"] },
  fantasy: { label: "Huyền huyễn", categoryIds: [258, 257], ranks: ["1_1_258", "1_1_257"], longRanks: ["1_2_258", "1_2_257"] },
  horror: { label: "Linh dị / Kinh dị", categoryIds: [751], ranks: ["1_1_751"], longRanks: ["1_2_751"] },
  apocalypse: { label: "Mạt thế", categoryIds: [8], ranks: ["1_1_8"], longRanks: ["1_2_8"] },
  detective: { label: "Trinh thám", categoryIds: [539, 504], ranks: ["1_1_539", "1_1_504"], longRanks: ["1_2_539", "1_2_504"] }
};

// Fanqie's own 字数 filter, verified against real word counts. Selecting a bucket
// server-side is what makes long-novel discovery a single request instead of
// hundreds of per-book probes.
const WORD_COUNT_BUCKETS = [
  { value: -1, label: "Tất cả độ dài", minWords: 0 },
  { value: 0, label: "Dưới 300k chữ", minWords: 0 },
  { value: 1, label: "300k - 500k chữ", minWords: 300000 },
  { value: 2, label: "500k - 1 triệu chữ", minWords: 500000 },
  { value: 3, label: "1 - 2 triệu chữ", minWords: 1000000 },
  { value: 4, label: "Trên 2 triệu chữ", minWords: 2000000 }
];
const CREATION_STATUSES = [
  { value: -1, label: "Tất cả" },
  { value: 0, label: "Đã hoàn thành" },
  { value: 1, label: "Đang ra chương" }
];
const DEFAULT_CONFIG = {
  enabled: false,
  categories: Object.keys(CATEGORY_DEFINITIONS),
  maxNewBooksPerRun: 1,
  wordCountBucket: 4,
  creationStatus: -1,
  updateExisting: true,
  excludedSourceIds: []
};
const DEFAULT_STATUS = {
  state: "idle",
  message: "Crawler chưa chạy.",
  startedAt: "",
  finishedAt: "",
  currentBookId: "",
  resumeAttempts: 0,
  discovered: 0,
  published: 0,
  failed: 0
};

async function readCrawlerConfig() {
  return sanitizeCrawlerConfig(await readBlobJson(CONFIG_PATH, DEFAULT_CONFIG));
}

async function writeCrawlerConfig(value) {
  const config = sanitizeCrawlerConfig(value);
  await writeBlobJson(CONFIG_PATH, config);
  return config;
}

async function updateCrawlerConfig(mutator, maxAttempts = 6) {
  return updateWithRetry({
    maxAttempts,
    read: () => readBlobJsonSnapshot(CONFIG_PATH, DEFAULT_CONFIG),
    mutate: async (value) => sanitizeCrawlerConfig(await mutator(sanitizeCrawlerConfig(value))),
    write: async (config, etag) => {
      await writeBlobJson(CONFIG_PATH, config, { etag, createOnly: !etag });
      return config;
    }
  });
}

async function readCrawlerStatus() {
  return sanitizeCrawlerStatus(await readBlobJson(STATUS_PATH, DEFAULT_STATUS));
}

async function writeCrawlerStatus(value) {
  const status = sanitizeCrawlerStatus(value);
  await writeBlobJson(STATUS_PATH, status);
  return status;
}

function sanitizeCrawlerConfig(value) {
  const categories = Array.isArray(value?.categories)
    ? value.categories.filter((key, index, list) => CATEGORY_DEFINITIONS[key] && list.indexOf(key) === index)
    : DEFAULT_CONFIG.categories;
  return {
    enabled: Boolean(value?.enabled),
    categories: categories.length ? categories : [...DEFAULT_CONFIG.categories],
    maxNewBooksPerRun: clampInteger(value?.maxNewBooksPerRun, 1, 3, DEFAULT_CONFIG.maxNewBooksPerRun),
    // The word-count bucket is the single length control; Fanqie applies it
    // server-side, so a separate chapter minimum is redundant.
    wordCountBucket: allowedChoice(value?.wordCountBucket, WORD_COUNT_BUCKETS, DEFAULT_CONFIG.wordCountBucket),
    creationStatus: allowedChoice(value?.creationStatus, CREATION_STATUSES, DEFAULT_CONFIG.creationStatus),
    updateExisting: value?.updateExisting !== false,
    excludedSourceIds: Array.isArray(value?.excludedSourceIds)
      ? Array.from(new Set(value.excludedSourceIds.map(String).filter((id) => /^\d{10,30}$/.test(id)))).slice(0, 500)
      : []
  };
}

function sanitizeCrawlerStatus(value) {
  return {
    state: allowedState(value?.state),
    message: clean(value?.message, 300) || DEFAULT_STATUS.message,
    startedAt: cleanDate(value?.startedAt),
    finishedAt: cleanDate(value?.finishedAt),
    currentBookId: clean(value?.currentBookId, 30).replace(/\D/g, ""),
    // How many runs have already tried to finish `currentBookId`, so a book that
    // can never download cannot block discovery forever.
    resumeAttempts: clampInteger(value?.resumeAttempts, 0, 10, 0),
    discovered: clampInteger(value?.discovered, 0, 1000, 0),
    published: clampInteger(value?.published, 0, 1000, 0),
    failed: clampInteger(value?.failed, 0, 1000, 0)
  };
}

async function isCrawlerRequest(req) {
  const secret = process.env.CRAWLER_SECRET || "";
  const authorization = String(req.headers.authorization || "");
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!provided) return false;
  if (secret) {
    const expectedBuffer = Buffer.from(secret);
    const providedBuffer = Buffer.from(provided);
    if (expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer)) return true;
  }
  return verifyGitHubOidc(provided);
}

let githubKeys = null;
let githubKeysExpiresAt = 0;

async function verifyGitHubOidc(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "RS256" || !header.kid) return false;
    if (payload.iss !== "https://token.actions.githubusercontent.com" || payload.aud !== "https://auto-translate-xi.vercel.app") return false;
    if (payload.exp < now || payload.nbf > now + 30 || String(payload.repository || "").toLowerCase() !== "phucpm89/autotranslate") return false;
    if (payload.ref !== "refs/heads/main" || !String(payload.workflow_ref || "").toLowerCase().includes("/.github/workflows/fanqie-crawler.yml@refs/heads/main")) return false;
    let key = findRsaKey(await getGitHubKeys(), header.kid);
    if (!key) {
      // Unknown kid: refresh once before deciding the token is not genuine.
      key = findRsaKey(await getGitHubKeys({ force: true }), header.kid);
    }
    if (!key) return false;
    return crypto.verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key, format: "jwk" }), Buffer.from(parts[2], "base64url"));
  } catch (error) {
    // Without this line a network failure fetching the JWKS is indistinguishable
    // from a bad token in the logs, which is what made the intermittent 401s hard
    // to place.
    console.error("Crawler OIDC verification failed:", error.message);
    return false;
  }
}

// `force` exists because GitHub rotates its signing keys: a warm serverless
// instance can hold an hour-old key set, and an unknown kid then looks like a
// forged token rather than a stale cache. The minimum interval keeps a stream of
// junk kids from turning into a stream of outbound fetches.
const KEY_REFETCH_MIN_INTERVAL_MS = 60 * 1000;
// Only forced refetches move this. Rate-limiting against the last *forced*
// refetch rather than the last fetch of any kind matters: a rotation can land
// seconds after a normal fetch, and measuring from that fetch would reject the
// new key for a minute - the very failure this is here to prevent. An attacker
// spamming unknown kids still gets at most one extra fetch per minute.
let githubKeysForcedAt = 0;

async function getGitHubKeys({ force = false } = {}) {
  const fresh = githubKeys && Date.now() < githubKeysExpiresAt;
  const mayRefetch = force && Date.now() - githubKeysForcedAt >= KEY_REFETCH_MIN_INTERVAL_MS;
  if (fresh && !mayRefetch) return githubKeys;
  if (force) githubKeysForcedAt = Date.now();

  const response = await fetch("https://token.actions.githubusercontent.com/.well-known/jwks", { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Không tải được GitHub signing keys.");
  githubKeys = (await response.json()).keys || [];
  githubKeysExpiresAt = Date.now() + 60 * 60 * 1000;
  return githubKeys;
}

function findRsaKey(keys, kid) {
  return (keys || []).find((item) => item.kid === kid && item.kty === "RSA");
}

async function readBlobJson(pathname, fallback) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return structuredClone(fallback);
  try {
    return (await readBlobJsonSnapshot(pathname, fallback)).value;
  } catch (error) {
    console.error(`Unable to read ${pathname}:`, error.message);
    return structuredClone(fallback);
  }
}

async function readBlobJsonSnapshot(pathname, fallback) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { value: structuredClone(fallback), etag: "" };
  const { list } = require("@vercel/blob");
  const result = await list({ prefix: pathname, limit: 10 });
  const blob = result.blobs.find((item) => item.pathname === pathname);
  if (!blob) return { value: structuredClone(fallback), etag: "" };
  const response = await fetch(`${blob.url}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${pathname} trả HTTP ${response.status}.`);
  return { value: await response.json(), etag: blob.etag };
}

async function writeBlobJson(pathname, value, { etag, createOnly = false } = {}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Vercel Blob chưa được kết nối.");
  const { put } = require("@vercel/blob");
  await put(pathname, JSON.stringify(value, null, 2), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    ...(etag ? { ifMatch: etag } : { allowOverwrite: !createOnly }),
    cacheControlMaxAge: 30
  });
}

function allowedState(value) {
  return ["idle", "running", "success", "error", "disabled"].includes(value) ? value : "idle";
}

function clean(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanDate(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function allowedChoice(value, choices, fallback) {
  const number = Number.parseInt(value, 10);
  return choices.some((choice) => choice.value === number) ? number : fallback;
}

module.exports = {
  CATEGORY_DEFINITIONS,
  WORD_COUNT_BUCKETS,
  CREATION_STATUSES,
  DEFAULT_CONFIG,
  DEFAULT_STATUS,
  readCrawlerConfig,
  writeCrawlerConfig,
  updateCrawlerConfig,
  readCrawlerStatus,
  writeCrawlerStatus,
  sanitizeCrawlerConfig,
  sanitizeCrawlerStatus,
  isCrawlerRequest
};
