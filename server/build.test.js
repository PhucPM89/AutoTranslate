"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// These tests run the real build, which means they overwrite public/ with
// whatever env they set. Always rebuild before deploying, or the deploy ships a
// bundle configured for the test's placeholder CDN instead of the real one.
const ROOT = path.join(__dirname, "..");

function runBuild(env = {}) {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-client.js")], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "pipe"
  });
  return {
    headers: fs.readFileSync(path.join(ROOT, "public", "_headers"), "utf8"),
    app: fs.readFileSync(path.join(ROOT, "public", "app.js"), "utf8"),
    admin: fs.readFileSync(path.join(ROOT, "public", "admin-upload.js"), "utf8"),
    html: fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8")
  };
}

// The build is the only place a secret could leak into something the browser
// downloads, so these run the real build and read the real output.
test("build emits a Cloudflare Pages _headers file with the cache policy", () => {
  const out = runBuild({ R2_PUBLIC_BASE_URL: "", READER_CDN_ENABLED: "" });
  assert.match(out.headers, /^\/app\.js\n\s+Cache-Control: public, max-age=31536000, immutable$/m);
  assert.match(out.headers, /^\/vendor\/\*\n\s+Cache-Control: public, max-age=31536000, immutable$/m);
  assert.match(out.headers, /^\/index\.html\n\s+Cache-Control: (?:no-cache, no-store, must-revalidate|public, max-age=0, must-revalidate)$/m);
  assert.match(out.headers, /Content-Security-Policy:/);
  assert.match(out.headers, /X-Content-Type-Options: nosniff/);
  assert.match(out.headers, /Strict-Transport-Security:/);
  assert.doesNotMatch(out.headers, /%CDN_ORIGIN%/, "placeholder must be substituted");
});

test("the CSP learns the CDN origin at build time and stays tight without one", () => {
  const without = runBuild({ R2_PUBLIC_BASE_URL: "", READER_CDN_ENABLED: "" });
  const connectWithout = directive(without.headers, "connect-src");
  assert.doesNotMatch(connectWithout, /cdn\./);
  assert.doesNotMatch(connectWithout, / {2,}/, "no double space where the origin would go");

  const withCdn = runBuild({ R2_PUBLIC_BASE_URL: "https://cdn.example.com/base", READER_CDN_ENABLED: "true" });
  const connectWith = directive(withCdn.headers, "connect-src");
  assert.match(connectWith, /https:\/\/cdn\.example\.com/);
  assert.doesNotMatch(connectWith, /\/base/, "only the origin belongs in a CSP source");
});

test("the admin upload target is allowed to be contacted", () => {
  const out = runBuild({ R2_PUBLIC_BASE_URL: "https://cdn.example.com", READER_CDN_ENABLED: "true" });
  // A presigned PUT goes to the R2 S3 endpoint. Without this source the admin
  // upload is blocked by the page's own CSP.
  assert.match(directive(out.headers, "connect-src"), /https:\/\/\*\.r2\.cloudflarestorage\.com/);
});

// Read a directive out of the real Content-Security-Policy header, not out of the
// first line of the file that happens to mention a directive name - the template
// comments talk about them too.
function directive(headers, name) {
  const header = headers
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("Content-Security-Policy:"));
  assert.ok(header, "khong tim thay header CSP");
  const found = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  assert.ok(found, `khong tim thay directive ${name}`);
  return found;
}

test("the reader bundle carries the CDN base but never a secret", () => {
  const out = runBuild({
    R2_PUBLIC_BASE_URL: "https://cdn.example.com",
    READER_CDN_ENABLED: "true",
    // Deliberately present in the build environment: none may reach the bundle.
    R2_SECRET_ACCESS_KEY: "SECRET-r2-must-not-leak",
    R2_ACCESS_KEY_ID: "SECRET-r2-id-must-not-leak",
    SUPABASE_SERVICE_ROLE_KEY: "SECRET-service-role-must-not-leak",
    GEMINI_API_KEY: "SECRET-gemini-must-not-leak",
    CLOUDFLARE_API_TOKEN: "SECRET-cf-must-not-leak"
  });

  assert.match(out.app, /cdn\.example\.com/, "the public CDN base is browser-safe and expected");
  for (const bundle of [out.app, out.admin, out.html]) {
    for (const secret of [
      "SECRET-r2-must-not-leak",
      "SECRET-r2-id-must-not-leak",
      "SECRET-service-role-must-not-leak",
      "SECRET-gemini-must-not-leak",
      "SECRET-cf-must-not-leak"
    ]) {
      assert.ok(!bundle.includes(secret), `bundle leaked ${secret}`);
    }
    assert.ok(!/sb_secret_/.test(bundle), "no Supabase secret key prefix");
  }
});

test("the reader CDN path is off unless both the flag and a base URL are set", () => {
  const flagOnly = runBuild({ READER_CDN_ENABLED: "true", R2_PUBLIC_BASE_URL: "" });
  assert.match(flagOnly.app, /__READER_CDN_ENABLED__|!1|!0|true|false/, "define is inlined");
  // With no base URL the reader must not attempt a CDN fetch; the guard is
  // `enabled && base`, so an empty base disables it regardless of the flag.
  assert.doesNotMatch(flagOnly.app, /cdn\.example\.com/);

  const both = runBuild({ READER_CDN_ENABLED: "true", R2_PUBLIC_BASE_URL: "https://cdn.example.com" });
  assert.match(both.app, /cdn\.example\.com/);
});

test("reading stays available to guests while account features remain optional", () => {
  const out = runBuild({
    READER_CDN_ENABLED: "true",
    R2_PUBLIC_BASE_URL: "https://cdn.example.com"
  });

  assert.doesNotMatch(out.app, /Yêu cầu đăng nhập để đọc/);
  assert.doesNotMatch(out.app, /Vui lòng đăng nhập tài khoản Google để đọc truyện/);
  assert.match(out.html, /Bạn có thể đọc truyện không cần tài khoản/);
  assert.match(out.html, /Đăng nhập là tùy chọn/);
});

test("build output contains everything Cloudflare Pages needs to serve", () => {
  runBuild({ R2_PUBLIC_BASE_URL: "", READER_CDN_ENABLED: "" });
  for (const file of ["index.html", "app.js", "style.css", "admin-upload.js", "_headers", "vendor/jszip.min.js", "favicon.svg"]) {
    assert.ok(fs.existsSync(path.join(ROOT, "public", file)), `missing ${file}`);
  }
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.match(html, /\/app\.js\?v=[0-9a-f]{12}/, "asset URLs must be content-hashed");
  assert.match(html, /\/style\.css\?v=[0-9a-f]{12}/);
});
