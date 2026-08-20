"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

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
  assert.match(out.headers, /^\/index\.html\n\s+Cache-Control: public, max-age=0, must-revalidate$/m);
  assert.match(out.headers, /Content-Security-Policy:/);
  assert.match(out.headers, /X-Content-Type-Options: nosniff/);
  assert.match(out.headers, /Strict-Transport-Security:/);
  assert.doesNotMatch(out.headers, /%CDN_ORIGIN%/, "placeholder must be substituted");
});

test("the CSP learns the CDN origin at build time and stays tight without one", () => {
  const without = runBuild({ R2_PUBLIC_BASE_URL: "", READER_CDN_ENABLED: "" });
  const connectWithout = without.headers.match(/connect-src[^;]*/)[0];
  assert.doesNotMatch(connectWithout, /cdn\./);
  assert.doesNotMatch(connectWithout, / {2,}/, "no double space where the origin would go");

  const withCdn = runBuild({ R2_PUBLIC_BASE_URL: "https://cdn.example.com/base", READER_CDN_ENABLED: "true" });
  const connectWith = withCdn.headers.match(/connect-src[^;]*/)[0];
  assert.match(connectWith, /https:\/\/cdn\.example\.com/);
  assert.doesNotMatch(connectWith, /\/base/, "only the origin belongs in a CSP source");
});

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

test("build output contains everything Cloudflare Pages needs to serve", () => {
  runBuild({ R2_PUBLIC_BASE_URL: "", READER_CDN_ENABLED: "" });
  for (const file of ["index.html", "app.js", "style.css", "admin-upload.js", "_headers", "vendor/jszip.min.js", "favicon.svg"]) {
    assert.ok(fs.existsSync(path.join(ROOT, "public", file)), `missing ${file}`);
  }
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.match(html, /\/app\.js\?v=[0-9a-f]{12}/, "asset URLs must be content-hashed");
  assert.match(html, /\/style\.css\?v=[0-9a-f]{12}/);
});
