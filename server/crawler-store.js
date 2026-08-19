"use strict";

const crypto = require("crypto");

const CONFIG_PATH = "library/crawler-config.json";
const STATUS_PATH = "library/crawler-status.json";
const CATEGORY_DEFINITIONS = {
  xianxia: { label: "Tiên hiệp", ranks: ["1_1_1140"] },
  fantasy: { label: "Huyền huyễn", ranks: ["1_1_258", "1_1_257"] },
  horror: { label: "Linh dị / Kinh dị", ranks: ["1_1_751"] },
  apocalypse: { label: "Mạt thế", ranks: ["1_1_8"] },
  detective: { label: "Trinh thám", ranks: ["1_1_539", "1_1_504"] }
};
const DEFAULT_CONFIG = {
  enabled: false,
  categories: Object.keys(CATEGORY_DEFINITIONS),
  maxNewBooksPerRun: 1,
  updateExisting: true
};
const DEFAULT_STATUS = {
  state: "idle",
  message: "Crawler chưa chạy.",
  startedAt: "",
  finishedAt: "",
  currentBookId: "",
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
    updateExisting: value?.updateExisting !== false
  };
}

function sanitizeCrawlerStatus(value) {
  return {
    state: allowedState(value?.state),
    message: clean(value?.message, 300) || DEFAULT_STATUS.message,
    startedAt: cleanDate(value?.startedAt),
    finishedAt: cleanDate(value?.finishedAt),
    currentBookId: clean(value?.currentBookId, 30).replace(/\D/g, ""),
    discovered: clampInteger(value?.discovered, 0, 1000, 0),
    published: clampInteger(value?.published, 0, 1000, 0),
    failed: clampInteger(value?.failed, 0, 1000, 0)
  };
}

function isCrawlerRequest(req) {
  const secret = process.env.CRAWLER_SECRET || "";
  const authorization = String(req.headers.authorization || "");
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!secret || !provided) return false;
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function readBlobJson(pathname, fallback) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return structuredClone(fallback);
  try {
    const { list } = require("@vercel/blob");
    const result = await list({ prefix: pathname, limit: 10 });
    const blob = result.blobs.find((item) => item.pathname === pathname);
    if (!blob) return structuredClone(fallback);
    const response = await fetch(`${blob.url}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return structuredClone(fallback);
    return await response.json();
  } catch (error) {
    console.error(`Unable to read ${pathname}:`, error.message);
    return structuredClone(fallback);
  }
}

async function writeBlobJson(pathname, value) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Vercel Blob chưa được kết nối.");
  const { put } = require("@vercel/blob");
  await put(pathname, JSON.stringify(value, null, 2), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    allowOverwrite: true,
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

module.exports = {
  CATEGORY_DEFINITIONS,
  DEFAULT_CONFIG,
  DEFAULT_STATUS,
  readCrawlerConfig,
  writeCrawlerConfig,
  readCrawlerStatus,
  writeCrawlerStatus,
  sanitizeCrawlerConfig,
  sanitizeCrawlerStatus,
  isCrawlerRequest
};
