"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    }
  }
}
loadEnvFile(path.join(__dirname, "..", ".env.local"));
loadEnvFile(path.join(__dirname, "..", ".env"));

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");

async function runSystemHealthCheck() {
  console.log("================================================================");
  console.log("           TRANSLATION PLATFORM SYSTEM HEALTH CHECK             ");
  console.log("================================================================");

  const storage = createStorage();
  const supabase = createSupabase();

  const books = [
    { id: "fanqie-6569423930556156942", name: "Lục Chỉ Quỷ Y", expectedChapters: 995 },
    { id: "fanqie-7027679289931729920", name: "Sinh Tồn Kinh Hoàng Trong Thế Giới Ác Mộng", expectedChapters: 1956 },
    { id: "fanqie-7379865527998483480", name: "Ban Ngày Bán Quần Áo, Ban Đêm Khâu Thi Thể", expectedChapters: 1321 }
  ];

  let allHealthy = true;

  // 1. Check Cloudflare R2 Storage & Catalog
  console.log("\n[1] Checking Cloudflare R2 Storage & Catalog Snapshot...");
  try {
    const { LAYOUT } = require("../server/storage");
    const catalogKey = LAYOUT.catalogSnapshot();
    const catalogRaw = await storage.get(catalogKey);
    if (catalogRaw) {
      const catalog = JSON.parse(catalogRaw.toString("utf8"));
      const catBooks = catalog.books || [];
      console.log(`  -> ${catalogKey}: OK (${catBooks.length} books in catalog)`);
      for (const b of books) {
        const found = catBooks.find(item => item.id === b.id);
        if (found) {
          console.log(`     * ${b.name}: ${found.translatedChapters}/${found.chapterCount} chapters [${found.status}]`);
        } else {
          console.warn(`     ! ${b.name}: NOT FOUND in catalog snapshot`);
          allHealthy = false;
        }
      }
    } else {
      console.error(`  -> ${catalogKey}: NOT FOUND on R2`);
      allHealthy = false;
    }
  } catch (err) {
    console.error("  -> R2 catalog check error:", err.message);
    allHealthy = false;
  }

  // 2. Check Supabase Database
  console.log("\n[2] Checking Supabase Database Records...");
  try {
    if (supabase) {
      const ids = books.map(b => `"${b.id}"`).join(",");
      const rows = await supabase.request("books", {
        query: `?select=id,title,total_chapters,translated_chapters,status&id=in.(${ids})`
      });
      for (const b of books) {
        const row = rows?.find(r => r.id === b.id);
        if (row) {
          console.log(`  -> DB [${row.title}]: ${row.translated_chapters}/${row.total_chapters} ch [${row.status}]`);
        } else {
          console.warn(`  ! DB [${b.name}]: Record missing`);
          allHealthy = false;
        }
      }
    } else {
      console.warn("  ! Supabase client not initialized (check env vars)");
    }
  } catch (err) {
    console.error("  -> Supabase check error:", err.message);
    allHealthy = false;
  }

  // 3. Check R2 Chapter Integrity Samples
  console.log("\n[3] Checking R2 Chapter Index & Boundary Integrity...");
  for (const b of books) {
    try {
      const rootRaw = await storage.get(`books/${b.id}/index.json`);
      const r1Raw = await storage.get(`books/${b.id}/r1/index.json`);

      const rootOk = !!rootRaw;
      const r1Ok = !!r1Raw;

      // Sample first, middle, last chapter
      const ch1 = await storage.get(`books/${b.id}/r1/ch/1.json`);
      const chMid = await storage.get(`books/${b.id}/r1/ch/${Math.floor(b.expectedChapters / 2)}.json`);
      const chEnd = await storage.get(`books/${b.id}/r1/ch/${b.expectedChapters}.json`);

      const chaptersOk = !!ch1 && !!chMid && !!chEnd;
      if (rootOk && r1Ok && chaptersOk) {
        console.log(`  -> [${b.name}]: OK (r1/index, root/index, Ch 1, Ch ${Math.floor(b.expectedChapters / 2)}, Ch ${b.expectedChapters} verified)`);
      } else {
        console.warn(`  ! [${b.name}]: Storage anomaly (root: ${rootOk}, r1: ${r1Ok}, chapters: ${chaptersOk})`);
        allHealthy = false;
      }
    } catch (err) {
      console.error(`  ! [${b.name}] error:`, err.message);
      allHealthy = false;
    }
  }

  console.log("\n================================================================");
  if (allHealthy) {
    console.log("              ALL SYSTEMS OPERATIONAL & HEALTHY                 ");
  } else {
    console.log("             WARNING: SOME ANOMALIES DETECTED                   ");
  }
  console.log("================================================================\n");

  return allHealthy;
}

if (require.main === module) {
  runSystemHealthCheck().catch(console.error);
}

module.exports = { runSystemHealthCheck };
