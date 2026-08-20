"use strict";

const { LAYOUT, cacheControlFor, contentTypeFor } = require("./keys");

// One storage interface, two drivers:
//   r2    - used whenever R2 credentials are present (production)
//   local - a directory on disk, so the whole ingest pipeline can be built,
//           run and tested before any cloud credential exists
//
// Both drivers implement: put, get, head, list, remove, publicUrl.
function createStorage(env = process.env) {
  if (hasR2Credentials(env)) return require("./r2-driver").createR2Storage(env);
  return require("./local-driver").createLocalStorage(env);
}

// EPUB archives must not sit in the public bucket: r2.dev and a custom domain both
// expose a whole bucket, which would make every source EPUB a public multi-megabyte
// download. They go to a separate bucket that has no public access.
function createArchiveStorage(env = process.env) {
  if (!hasR2Credentials(env) || !env.R2_ARCHIVE_BUCKET) return null;
  return require("./r2-driver").createR2Storage({ ...env, R2_BUCKET: env.R2_ARCHIVE_BUCKET, R2_PUBLIC_BASE_URL: "" });
}

function hasR2Credentials(env = process.env) {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET
  );
}

function describeStorage(env = process.env) {
  return hasR2Credentials(env)
    ? { driver: "r2", bucket: env.R2_BUCKET, publicBase: env.R2_PUBLIC_BASE_URL || "(chưa cấu hình)" }
    : { driver: "local", root: env.LOCAL_STORAGE_DIR || ".storage", publicBase: env.LOCAL_PUBLIC_BASE_URL || "/local-cdn" };
}

module.exports = { createStorage, createArchiveStorage, hasR2Credentials, describeStorage, LAYOUT, cacheControlFor, contentTypeFor };
