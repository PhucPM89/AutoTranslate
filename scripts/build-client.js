"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const esbuild = require("esbuild");

const ROOT = path.join(__dirname, "..");
const CLIENT_DIR = path.join(ROOT, "client");
const PUBLIC_DIR = path.join(ROOT, "public");
const VENDOR_DIR = path.join(PUBLIC_DIR, "vendor");

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

const loadedEnv = { ...loadEnv(path.join(ROOT, ".env")), ...loadEnv(path.join(ROOT, ".env.local")) };
for (const [k, v] of Object.entries(loadedEnv)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

fs.mkdirSync(VENDOR_DIR, { recursive: true });

const jszipUrl = copyVendor(
  path.join(ROOT, "node_modules", "jszip", "dist", "jszip.min.js"),
  path.join(VENDOR_DIR, "jszip.min.js"),
  "/vendor/jszip.min.js"
);

// The admin bundle is only useful to the site owner, so it ships as a separate
const cdnBase = (process.env.R2_PUBLIC_BASE_URL || "https://cdn.tram-chu.online").replace(/\/$/, "");
const readerCdnEnabled = process.env.READER_CDN_ENABLED === "true";
const supabaseUrl = (process.env.SUPABASE_URL || "https://bckwrfucultwxirorglv.supabase.co").replace(/\/$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "sb_publishable_S2l6AfkJg1ehDzY0GmnZxg_7jGI0vCq";

// module that app.js imports on demand rather than sitting in every reader's
// download.
const adminUrl = bundle({
  entry: path.join(CLIENT_DIR, "admin-upload.js"),
  outfile: path.join(PUBLIC_DIR, "admin-upload.js"),
  publicPath: "/admin-upload.js",
  format: "esm",
  define: {
    __CDN_BASE__: JSON.stringify(cdnBase)
  }
});

const appUrl = bundle({
  entry: path.join(CLIENT_DIR, "app.js"),
  outfile: path.join(PUBLIC_DIR, "app.js"),
  publicPath: "/app.js",
  format: "iife",
  define: {
    __ASSET_JSZIP__: JSON.stringify(jszipUrl),
    __ASSET_ADMIN__: JSON.stringify(adminUrl),
    __CDN_BASE__: JSON.stringify(cdnBase),
    __READER_CDN_ENABLED__: JSON.stringify(readerCdnEnabled),
    __SUPABASE_URL__: JSON.stringify(supabaseUrl),
    __SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey)
  }
});

async function main() {
  copyFonts();
  copyPwaFiles();

  const styleUrl = minifyCss({
    entry: path.join(CLIENT_DIR, "style.css"),
    outfile: path.join(PUBLIC_DIR, "style.css"),
    publicPath: "/style.css"
  });

  writeHtml({ appUrl, styleUrl });
  writeHeaders();
  await writeSitemapAndRobots();
  reportReaderMode();
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});

// The CDN reader is a one-line flag with a large effect, and it is inlined into
// the bundle, so nothing about the built files shows which way it went. Printing
// it means a deploy log is enough to tell.
function reportReaderMode() {
  const base = process.env.R2_PUBLIC_BASE_URL || "";
  console.log(
    `reader: chapter từ ${readerCdnEnabled && base ? "CDN" : "EPUB"}` +
      ` (READER_CDN_ENABLED=${process.env.READER_CDN_ENABLED ?? "(không đặt)"})`
  );
}

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

// Self-hosted so the page makes no request to a font host and the CSP needs no
// exception. client/fonts.css declares them; this only moves the files.
function copyFonts() {
  const source = path.join(CLIENT_DIR, "fonts");
  if (!fs.existsSync(source)) return;
  const target = path.join(PUBLIC_DIR, "fonts");
  fs.mkdirSync(target, { recursive: true });
  let bytes = 0;
  const files = fs.readdirSync(source).filter((name) => name.endsWith(".woff2"));
  for (const name of files) {
    fs.copyFileSync(path.join(source, name), path.join(target, name));
    bytes += fs.statSync(path.join(target, name)).size;
  }
  // Only the subsets a page actually uses are downloaded, so the total on disk is
  // not what a reader pays.
  console.log(`/fonts ${files.length} file, ${formatKb(bytes)} trên đĩa`);
}

function copyPwaFiles() {
  const buildId = Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex");
  const pwaFiles = ["manifest.webmanifest", "sw.js"];
  for (const name of pwaFiles) {
    const src = path.join(CLIENT_DIR, name);
    const dest = path.join(PUBLIC_DIR, name);
    if (fs.existsSync(src)) {
      if (name === "sw.js") {
        let content = fs.readFileSync(src, "utf8");
        content = content.replaceAll("%BUILD_ID%", buildId);
        fs.writeFileSync(dest, content);
      } else {
        fs.copyFileSync(src, dest);
      }
      console.log(`/${name} ${formatKb(fs.statSync(dest).size)} (build: ${buildId})`);
    }
  }
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

// Cloudflare Pages reads _headers from the output directory. Generated here so
// the header policy has a single source and the CSP can learn the CDN origin at
// build time instead of being hand-edited.
function writeHeaders() {
  const templatePath = path.join(CLIENT_DIR, "_headers.template");
  if (!fs.existsSync(templatePath)) return;
  const origin = cdnOrigin();
  // Normalised to LF regardless of how git checked the template out. On Windows
  // with autocrlf the template arrives as CRLF, and a deploy artifact must not
  // depend on that.
  const template = fs.readFileSync(templatePath, "utf8").split("\r\n").join("\n");
  // The placeholder is one token in a space-separated CSP source list, and it may
  // be the last one before a ";". Consuming the space in front of it means both
  // positions come out right: with an origin the space is put back, without one
  // the token and its separator disappear together. Matching only the trailing
  // space shipped a literal %CDN_ORIGIN%; re-adding one unconditionally left
  // "origin ;" and "data: ;" behind.
  const body = template.replace(/ ?%CDN_ORIGIN%/g, origin ? ` ${origin}` : "");
  fs.writeFileSync(path.join(PUBLIC_DIR, "_headers"), body);
  const note = origin ? ` (cdn: ${origin})` : " (chưa có CDN origin)";
  console.log(`/_headers ${formatKb(Buffer.byteLength(body))}${note}`);
}

function cdnOrigin() {
  const base = process.env.R2_PUBLIC_BASE_URL || "";
  if (!base) return "";
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
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

async function writeSitemapAndRobots() {
  const siteUrl = "https://tram-chu.online";
  const now = new Date().toISOString().split("T")[0];

  let books = [];
  try {
    const cdnUrl = (process.env.R2_PUBLIC_BASE_URL || "https://cdn.tram-chu.online").replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${cdnUrl}/catalog/latest.json`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.books)) books = data.books;
    }
  } catch {
    // fallback
  }

  if (!books.length) {
    try {
      const libPath = path.join(PUBLIC_DIR, "library.json");
      if (fs.existsSync(libPath)) {
        const parsed = JSON.parse(fs.readFileSync(libPath, "utf8"));
        books = Array.isArray(parsed.books) ? parsed.books : [];
      }
    } catch {
      books = [];
    }
  }

  // Generate sitemap.xml
  let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  sitemapXml += `  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
  sitemapXml += `  <url>\n    <loc>${siteUrl}/#catalog</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;

  let urlCount = 2;
  for (const book of books) {
    if (book.id) {
      const bookDate = book.updatedAt ? String(book.updatedAt).split("T")[0] : now;
      sitemapXml += `  <url>\n    <loc>${siteUrl}/?book=${encodeURIComponent(book.id)}</loc>\n    <lastmod>${bookDate}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
      sitemapXml += `  <url>\n    <loc>${siteUrl}/?book=${encodeURIComponent(book.id)}&amp;ch=1</loc>\n    <lastmod>${bookDate}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
      urlCount += 2;
    }
  }
  sitemapXml += `</urlset>\n`;

  fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemapXml);
  console.log(`/sitemap.xml ${urlCount} URLs, ${formatKb(Buffer.byteLength(sitemapXml))}`);

  // Generate robots.txt
  const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
  fs.writeFileSync(path.join(PUBLIC_DIR, "robots.txt"), robotsTxt);
  console.log(`/robots.txt ${formatKb(Buffer.byteLength(robotsTxt))}`);
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
