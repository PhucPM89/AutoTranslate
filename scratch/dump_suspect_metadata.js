"use strict";
const path = require("path");
const fs = require("fs");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");

function hasHan(s) {
  return /[\u4e00-\u9fa5]/.test(String(s || ""));
}

async function fetchFanqieMeta(bookId) {
  const cleanId = bookId.replace("fanqie-", "");
  const urls = [
    `https://fanqienovel.com/page/${cleanId}`,
    `https://fanqienovel.com/api/reader/full?bookId=${cleanId}`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (url.includes("fanqienovel.com/page/")) {
        const titleMatch = text.match(/<h1 class="info-name"[^>]*>([\s\S]*?)<\/h1>/i) || text.match(/<div class="page-header-title"[^>]*>([\s\S]*?)<\/div>/i);
        const authorMatch = text.match(/<span class="author-name-text"[^>]*>([\s\S]*?)<\/span>/i) || text.match(/<div class="page-header-author"[^>]*>([\s\S]*?)<\/div>/i);
        const descMatch = text.match(/<div class="page-abstract-content"[^>]*>([\s\S]*?)<\/div>/i) || text.match(/<div class="abstract-content"[^>]*>([\s\S]*?)<\/div>/i) || text.match(/<p class="abstract"[^>]*>([\s\S]*?)<\/p>/i);
        
        return {
          title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "",
          author: authorMatch ? authorMatch[1].replace(/<[^>]+>/g, "").trim() : "",
          description: descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : ""
        };
      } else {
        const data = JSON.parse(text);
        const info = data?.data?.book_info || data?.data;
        if (info) {
          return {
            title: info.book_name || info.title || "",
            author: info.author || "",
            description: info.abstract || info.description || ""
          };
        }
      }
    } catch {}
  }
  return null;
}

async function main() {
  const storage = createStorage();
  const rawCatalog = await storage.get("catalog/latest.json");
  const catalog = rawCatalog ? JSON.parse(rawCatalog.toString()) : { books: [] };

  const suspectIds = [];
  for (const b of catalog.books) {
    const title = b.title || "";
    const author = b.author || "";
    const desc = b.description || "";
    if (hasHan(title) || hasHan(author) || hasHan(desc) || !desc || desc.trim().length < 20 || title.startsWith("fanqie-")) {
      suspectIds.push(b.id);
    }
  }

  console.log(`Analyzing ${suspectIds.length} suspect novels...`);

  const list = [];
  for (const id of suspectIds) {
    const fanqie = await fetchFanqieMeta(id);
    const rawIndex = await storage.get(`books/${id}/index.json`);
    const indexObj = rawIndex ? JSON.parse(rawIndex.toString()) : {};
    list.push({
      id,
      chineseTitle: fanqie?.title || indexObj.title,
      chineseAuthor: fanqie?.author || indexObj.author,
      chineseDesc: fanqie?.description || indexObj.description,
      currentTitle: indexObj.title,
      currentAuthor: indexObj.author
    });
  }

  console.log("SUSPECT_LIST_JSON_START");
  console.log(JSON.stringify(list, null, 2));
  console.log("SUSPECT_LIST_JSON_END");
}

main().catch(console.error);
