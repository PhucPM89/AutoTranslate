"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const ARTIFACT_DIR = "C:\\Users\\minhp\\.gemini\\antigravity-ide\\brain\\08bfde82-51e0-4b3b-b4f6-4b73434c880c";

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

async function main() {
  // 1. Start local server
  const server = http.createServer(async (req, res) => {
    let reqPath = req.url.split("?")[0];
    if (reqPath === "/") reqPath = "/index.html";

    if (reqPath === "/catalog/latest.json" || reqPath === "/library.json") {
      try {
        const cdnRes = await fetch("https://cdn.tram-chu.online/catalog/latest.json");
        const json = await cdnRes.text();
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        return res.end(json);
      } catch (err) {
        // Fallback
      }
    }

    const filePath = path.join(PUBLIC_DIR, reqPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(3333, resolve));
  console.log("Server listening on http://localhost:3333");

  const browser = await chromium.launch({ headless: true, channel: "chrome" });

  // 2. Desktop Screenshot
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3333", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const homeScreenshot = path.join(ARTIFACT_DIR, "preview_desktop_home.png");
  await page.screenshot({ path: homeScreenshot, fullPage: false });
  console.log("Saved:", homeScreenshot);

  // 3. Catalog Section Screenshot
  const catalogEl = await page.$("#catalog");
  if (catalogEl) {
    await catalogEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const catalogScreenshot = path.join(ARTIFACT_DIR, "preview_desktop_catalog.png");
    await page.screenshot({ path: catalogScreenshot });
    console.log("Saved:", catalogScreenshot);
  }

  // 3b. Book Detail Screenshot
  await page.waitForSelector("#catalogGrid .book-card", { timeout: 6000 }).catch(() => {});
  const firstBook = await page.$("#catalogGrid .book-card");
  if (firstBook) {
    await firstBook.click();
    await page.waitForTimeout(800);
    const detailScreenshot = path.join(ARTIFACT_DIR, "preview_book_detail.png");
    await page.screenshot({ path: detailScreenshot, fullPage: false });
    console.log("Saved:", detailScreenshot);

    // 3c. Reader View Screenshot
    const readBtn = await page.$("#bookViewRead");
    if (readBtn) {
      await readBtn.click();
      await page.waitForTimeout(2000);
      const readerScreenshot = path.join(ARTIFACT_DIR, "preview_reader_view.png");
      await page.screenshot({ path: readerScreenshot, fullPage: false });
      console.log("Saved:", readerScreenshot);
    }
  }

  // 4. Mobile Screenshot
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobilePage.goto("http://localhost:3333", { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1000);
  const mobileScreenshot = path.join(ARTIFACT_DIR, "preview_mobile.png");
  await mobilePage.screenshot({ path: mobileScreenshot, fullPage: false });
  console.log("Saved:", mobileScreenshot);

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error("Screenshot error:", err);
  process.exit(1);
});
