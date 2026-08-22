"use strict";

async function fetchFanqieMeta(bookId) {
  const cleanId = bookId.replace("fanqie-", "");
  const urls = [
    `https://fanqienovel.com/api/reader/full?bookId=${cleanId}`,
    `https://novel.snssdk.com/api/novel/book/directory/list/v1/?book_id=${cleanId}`,
    `https://fanqienovel.com/page/${cleanId}`
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
        const descMatch = text.match(/<div class="page-abstract-content"[^>]*>([\s\S]*?)<\/div>/i) || text.match(/<div class="abstract-content"[^>]*>([\s\S]*?)<\/div>/i) || text.match(/<p class="abstract"[^>]*>([\s\S]*?)<\/p>/i);
        if (descMatch) {
          return { description: descMatch[1].replace(/<[^>]+>/g, "").trim(), source: "fanqie_html" };
        }
      } else {
        const data = JSON.parse(text);
        const desc = data?.data?.abstract || data?.data?.book_info?.abstract || data?.data?.book_info?.description;
        if (desc) return { description: desc, source: "fanqie_api" };
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

async function main() {
  const testIds = [
    "fanqie-7077546460056652803", // 踏天境
    "fanqie-7143038691944959011", // 十日终焉
    "fanqie-7256784068786785336"  // 诡舍
  ];

  for (const id of testIds) {
    const meta = await fetchFanqieMeta(id);
    console.log(`[${id}]:`, meta);
  }
}

main().catch(console.error);
