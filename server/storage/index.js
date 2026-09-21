"use strict";

const { LAYOUT, cacheControlFor, contentTypeFor } = require("./keys");

// One storage interface, two drivers:
//   r2    - used whenever R2 credentials are present (production)
//   local - a directory on disk, so the whole ingest pipeline can be built,
//           run and tested before any cloud credential exists
//
function hasDriveCredentials(env = process.env) {
  return Boolean(
    env.GOOGLE_DRIVE_CLIENT_ID && env.GOOGLE_DRIVE_CLIENT_SECRET && env.GOOGLE_DRIVE_REFRESH_TOKEN
  );
}

// One storage interface, three drivers:
//   drive - Google Drive storage (with Cloudflare Edge Cache)
//   r2    - Cloudflare R2 (when configured and active)
//   local - a directory on disk, for local testing
function createStorage(env = process.env) {
  if (env.STORAGE_DRIVER === "drive" || (hasDriveCredentials(env) && !hasR2Credentials(env))) {
    return require("./drive-storage-driver").createDriveStorage(env);
  }
  if (hasR2Credentials(env)) return require("./r2-driver").createR2Storage(env);
  return require("./local-driver").createLocalStorage(env);
}

// EPUB archives must not sit in the public bucket: r2.dev and a custom domain both
// expose a whole bucket, which would make every source EPUB a public multi-megabyte
// download.
function createArchiveStorage(env = process.env) {
  if (env.STORAGE_DRIVER === "drive" || (hasDriveCredentials(env) && !hasR2Credentials(env))) {
    return require("./drive-storage-driver").createDriveStorage(env);
  }
  if (!hasR2Credentials(env) || !env.R2_ARCHIVE_BUCKET) return null;
  return require("./r2-driver").createR2Storage({ ...env, R2_BUCKET: env.R2_ARCHIVE_BUCKET, R2_PUBLIC_BASE_URL: "" });
}

function hasR2Credentials(env = process.env) {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET && env.STORAGE_DRIVER !== "drive"
  );
}

function describeStorage(env = process.env) {
  if (env.STORAGE_DRIVER === "drive" || (hasDriveCredentials(env) && !hasR2Credentials(env))) {
    return { driver: "drive", folderId: env.GOOGLE_DRIVE_STORAGE_FOLDER_ID || "1gr-dgFiM8At8vF2subbxyXzDRqrOajZr", publicBase: env.R2_PUBLIC_BASE_URL || "(same-origin)" };
  }
  return hasR2Credentials(env)
    ? { driver: "r2", bucket: env.R2_BUCKET, publicBase: env.R2_PUBLIC_BASE_URL || "(chưa cấu hình)" }
    : { driver: "local", root: env.LOCAL_STORAGE_DIR || ".storage", publicBase: env.LOCAL_PUBLIC_BASE_URL || "/local-cdn" };
}

module.exports = { createStorage, createArchiveStorage, hasR2Credentials, hasDriveCredentials, describeStorage, LAYOUT, cacheControlFor, contentTypeFor };

