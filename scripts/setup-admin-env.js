"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createPasswordHash } = require("../server/admin-auth");

const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error("Set ADMIN_PASSWORD before running this script.");

const envPath = path.join(__dirname, "..", ".env");
const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const next = setValue(setValue(current, "LIBRARY_UPLOAD_PASSWORD_HASH", createPasswordHash(password)), "LIBRARY_SESSION_SECRET", crypto.randomBytes(48).toString("base64url"));
fs.writeFileSync(envPath, next, { encoding: "utf8", mode: 0o600 });

function setValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}${content.trim() ? "\n" : ""}${line}\n`;
}
