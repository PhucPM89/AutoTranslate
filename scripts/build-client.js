"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const CLIENT_DIR = path.join(ROOT, "client");
const PUBLIC_DIR = path.join(ROOT, "public");
const VENDOR_DIR = path.join(PUBLIC_DIR, "vendor");

fs.mkdirSync(VENDOR_DIR, { recursive: true });

const jszipUrl = copyVendor(
  path.join(ROOT, "node_modules", "jszip", "dist", "jszip.min.js"),
  path.join(VENDOR_DIR, "jszip.min.js"),
  "/vendor/jszip.min.js"
);

// The admin bundle carries the Vercel Blob client (~110 KB) and is only useful
// to the site owner, so it ships as a module that app.js imports on demand.
const adminUrl = bundle({
  entry: path.join(CLIENT_DIR, "admin-upload.js"),
  outfile: path.join(PUBLIC_DIR, "admin-upload.js"),
  publicPath: "/admin-upload.js",
  format: "esm"
});

const appUrl = bundle({
  entry: path.join(CLIENT_DIR, "app.js"),
  outfile: path.join(PUBLIC_DIR, "app.js"),
  publicPath: "/app.js",
  format: "iife",
  define: {
    __ASSET_JSZIP__: JSON.stringify(jszipUrl),
    __ASSET_ADMIN__: JSON.stringify(adminUrl)
  }
});

const styleUrl = minifyCss({
  entry: path.join(CLIENT_DIR, "style.css"),
  outfile: path.join(PUBLIC_DIR, "style.css"),
  publicPath: "/style.css"
});

writeHtml({ appUrl, styleUrl });

function bundle({ entry, outfile, publicPath, format, define }) {
  esbuild.buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    minify: true,
    sourcemap: false,
    legalComments: "none",
    platform: "browser",
    target: ["es2020"],
    format,
    define
  });
  return report(publicPath, outfile, entry);
}

function minifyCss({ entry, outfile, publicPath }) {
  esbuild.buildSync({
    entryPoints: [entry],
    outfile,
    minify: true,
    legalComments: "none",
    loader: { ".css": "css" },
    target: ["chrome100", "firefox100", "safari15", "edge100"]
  });
  return report(publicPath, outfile, entry);
}

function copyVendor(source, target, publicPath) {
  fs.copyFileSync(source, target);
  return report(publicPath, target);
}

// Hashed query strings let every static asset ship with a one-year immutable
// cache header while still updating the moment its content changes.
function report(publicPath, outfile, sourceFile) {
  const bytes = fs.readFileSync(outfile);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const sourceSize = sourceFile ? fs.statSync(sourceFile).size : bytes.length;
  console.log(
    `${publicPath} ${formatKb(sourceSize)} -> ${formatKb(bytes.length)}`
  );
  return `${publicPath}?v=${hash}`;
}

function writeHtml({ appUrl, styleUrl }) {
  const template = fs.readFileSync(path.join(CLIENT_DIR, "index.html"), "utf8");
  const html = template
    .replaceAll("%APP_JS%", appUrl)
    .replaceAll("%STYLE_CSS%", styleUrl);

  const unresolved = html.match(/%[A-Z_]+%/g);
  if (unresolved) throw new Error(`index.html còn placeholder chưa thay: ${unresolved.join(", ")}`);

  fs.writeFileSync(path.join(PUBLIC_DIR, "index.html"), html);
  console.log(`/index.html ${formatKb(Buffer.byteLength(html))}`);
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
