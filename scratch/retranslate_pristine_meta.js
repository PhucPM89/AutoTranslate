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

delete require.cache[require.resolve("../server/gemini")];
const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { translateMetadata } = require("../server/gemini");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

// Target the recently added books that need pristine titles
const TARGET_BOOK_IDS = [
  "fanqie-7201113723660930063", // 开局S级怪谈，但给我C级天赋？
  "fanqie-7474582323657182232", // 道友，你在和谁说话？
  "fanqie-7560509095371885593", // 合欢宗第一炉鼎！
  "fanqie-6995119379645991944", // 我把惊悚世界玩成养成游戏！
  "fanqie-7450181849587911704", // 独守破庙六年，不知自己在修仙
  "fanqie-7489692771863776281", // 宿舍求生，我家成了美女窝
  "fanqie-7540122908304100414", // 百岁仙尊
  "fanqie-7471788218946423832", // 求生？你一个监管者求什么生？
  "fanqie-7263344278955363385", // 长生万年，多亿点熟人怎么了？
  "fanqie-7506458079534271550", // 剑起白玉京
  "fanqie-7357975803398720537", // 欺神演出！
  "fanqie-7377931562463005720", // 开局长生，苟在下界吃土飞升
  "fanqie-7488955435421010968", // 序列公路：不要掉队！
  "fanqie-7253908182769077252", // 灵异复苏，永夜降临
  "fanqie-7077546460056652803", // 踏天境
  "fanqie-7364671902251502616", // 凡人修仙之符祖
  "fanqie-7445188900496083992", // 仙界闭关小能手
  "fanqie-7256784068786785336", // 诡舍
  "fanqie-7143038691944959011", // 十日终焉
  "fanqie-7077516958534470656", // 凡骨
  "fanqie-7083672225286458406"  // 虚空塔
];

async function main() {
  const storage = createStorage();
  const db = createSupabase(process.env);
  const keys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);

  console.log(`Re-translating metadata with pristine webnovel conventions for ${TARGET_BOOK_IDS.length} books...`);

  for (let i = 0; i < TARGET_BOOK_IDS.length; i++) {
    const bookId = TARGET_BOOK_IDS[i];
    
    // Fetch original raw data from R2 books/<bookId>/r1/ch/1.original.json or index.json
    let rawIndex = await storage.get(`books/${bookId}/index.json`);
    let indexObj = rawIndex ? JSON.parse(rawIndex.toString()) : null;

    // Check if we can find raw Chinese title from crawler storage or job
    const crawlerMetaRaw = await storage.get(`crawler/books/${bookId}.json`);
    let sourceTitle = indexObj?.title || bookId;
    let sourceAuthor = indexObj?.author || "";
    let sourceDesc = indexObj?.description || "";

    if (crawlerMetaRaw) {
      try {
        const cdata = JSON.parse(crawlerMetaRaw.toString());
        sourceTitle = cdata.title || sourceTitle;
        sourceAuthor = cdata.author || sourceAuthor;
        sourceDesc = cdata.description || sourceDesc;
      } catch {}
    }

    console.log(`\n[${i + 1}/${TARGET_BOOK_IDS.length}] Processing: ${bookId}...`);
    console.log(`  Source Title: ${sourceTitle} | Author: ${sourceAuthor}`);

    try {
      const translated = await translateMetadata({
        title: sourceTitle,
        author: sourceAuthor,
        description: sourceDesc
      }, keys);

      console.log(`  ➔ PRESTINE TITLE: ${translated.title}`);
      console.log(`  ➔ PRESTINE AUTHOR: ${translated.author}`);

      // Update R2 index.json
      if (indexObj) {
        indexObj.title = translated.title;
        indexObj.author = translated.author;
        indexObj.description = translated.description;
        await storage.put(`books/${bookId}/index.json`, Buffer.from(JSON.stringify(indexObj, null, 2)), "application/json");
      }

      // Update Supabase
      if (db) {
        try {
          await db.upsertBook({
            id: bookId,
            title: translated.title,
            author: translated.author,
            description: translated.description,
            cover_url: indexObj?.cover,
            status: indexObj?.status || "Đang cập nhật",
            total_chapters: indexObj?.totalChapters || 0,
            translated_chapters: indexObj?.translatedChapters || 0,
            revision: indexObj?.revision || 1
          });
        } catch (dbErr) {
          console.warn(`  (Supabase err: ${dbErr.message})`);
        }
      }

      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`  [ERR] ${bookId}:`, err.message);
    }
  }

  console.log("\nRe-publishing catalog snapshot to R2...");
  await publishCatalogSnapshot({ storage, env: process.env, log: console.log });
  console.log("All pristine translations updated!");
}

main().catch(console.error);
