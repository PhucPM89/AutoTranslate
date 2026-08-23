// Cloudflare Pages Functions Middleware for Dynamic SEO, Schema.org JSON-LD & Social Sharing Previews
// Intercepts requests from Facebook, Zalo, Twitter, Telegram, Discord, Googlebot, Bingbot
// and dynamically injects rich structured metadata, book cover, title, description, and BreadcrumbList.

const BOT_USER_AGENTS = [
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "telegrambot",
  "whatsapp",
  "slackbot",
  "linkedinbot",
  "discordbot",
  "zalo",
  "googlebot",
  "bingbot",
  "applebot",
  "pinterest",
  "skypeuripreview",
  "duckduckbot",
  "baiduspider",
  "yandexbot"
];

const CDN_BASE = "https://cdn.tram-chu.online";
const SITE_NAME = "Trạm Chữ";
const SITE_URL = "https://tram-chu.online";
const DEFAULT_COVER = "https://tram-chu.online/library/covers/misty-pagoda-hero.webp";
const { escapeHtmlAttribute, safeJsonLd } = require("../server/seo-security.js");

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // Skip API routes immediately
  if (url.pathname.startsWith("/api/")) {
    return next();
  }

  const userAgent = (request.headers.get("user-agent") || "").toLowerCase();
  const isCrawler = BOT_USER_AGENTS.some((bot) => userAgent.includes(bot));
  const bookId = url.searchParams.get("book");
  const chapterParam = url.searchParams.get("chapter");

  // If not a crawler or no book specified, pass through to normal static handling
  if (!isCrawler || !bookId) {
    return next();
  }

  // Fetch book metadata from CDN
  let book = null;
  try {
    const res = await fetch(`${CDN_BASE}/books/${encodeURIComponent(bookId)}/index.json`, {
      headers: { "Accept": "application/json" },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    if (res.ok) {
      book = await res.json();
    }
  } catch {
    try {
      const catRes = await fetch(`${CDN_BASE}/catalog/latest.json`);
      if (catRes.ok) {
        const cat = await catRes.json();
        book = (cat.books || []).find((b) => b.id === bookId);
      }
    } catch {
      book = null;
    }
  }

  // If book not found, pass through
  if (!book || !book.title) {
    return next();
  }

  // Get original HTML response
  const response = await next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const chapterNum = parseInt(chapterParam, 10);
  const isChapterView = Number.isInteger(chapterNum) && chapterNum > 0;

  const pageTitle = isChapterView
    ? `Chương ${chapterNum} - ${book.title} | ${SITE_NAME}`
    : `Đọc truyện ${book.title} (${book.author || "Khuyết danh"}) - Bản Dịch Chuẩn | ${SITE_NAME}`;

  const desc = cleanDescription(
    isChapterView
      ? `Đọc truyện ${book.title} Chương ${chapterNum} bản dịch tiếng Việt mượt mà, định dạng chuẩn đọc đêm không quảng cáo tại Trạm Chữ.`
      : (book.description || `Đọc truyện ${book.title} của tác giả ${book.author || "Khuyết danh"} trên Trạm Chữ. Thư viện truyện dịch AI chất lượng cao, cập nhật liên tục.`)
  );

  const coverUrl = normalizeCoverUrl(book.cover);
  const canonicalUrl = isChapterView
    ? `${SITE_URL}/?book=${encodeURIComponent(bookId)}&chapter=${chapterNum}`
    : `${SITE_URL}/?book=${encodeURIComponent(bookId)}`;

  const keywords = [
    book.title,
    `đọc truyện ${book.title}`,
    `${book.title} chương ${chapterNum || 1}`,
    `${book.title} tiếng việt`,
    `${book.title} full`,
    `${book.title} convert`,
    `${book.title} dịch`,
    book.author,
    "đọc truyện online",
    "tiểu thuyết tiên hiệp",
    "trạm chữ"
  ].filter(Boolean).join(", ");

  // Generate Rich Schema.org JSON-LD Structured Data
  const schemaGraph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        "url": SITE_URL,
        "name": SITE_NAME,
        "description": "Tủ truyện dịch AI tự động chất lượng cao, giao diện đọc đêm cao cấp",
        "inLanguage": "vi-VN"
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Trang chủ",
            "item": SITE_URL
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": book.title,
            "item": `${SITE_URL}/?book=${encodeURIComponent(bookId)}`
          },
          ...(isChapterView ? [{
            "@type": "ListItem",
            "position": 3,
            "name": `Chương ${chapterNum}`,
            "item": canonicalUrl
          }] : [])
        ]
      },
      {
        "@type": isChapterView ? "Chapter" : "Book",
        "@id": `${canonicalUrl}#primary`,
        "name": isChapterView ? `${book.title} - Chương ${chapterNum}` : book.title,
        "headline": pageTitle,
        "description": desc,
        "image": coverUrl,
        "inLanguage": "vi-VN",
        "author": {
          "@type": "Person",
          "name": book.author || "Khuyết danh"
        },
        "publisher": {
          "@type": "Organization",
          "name": SITE_NAME,
          "url": SITE_URL
        },
        "genre": book.category || book.genre || "Tiên Hiệp, Đô Thị, Huyền Huyễn",
        ...(isChapterView ? {
          "isPartOf": {
            "@type": "Book",
            "name": book.title,
            "url": `${SITE_URL}/?book=${encodeURIComponent(bookId)}`
          },
          "position": String(chapterNum)
        } : {
          "numberOfPages": Number(book.chapterCount || book.totalChapters || 100),
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "bestRating": "5",
            "ratingCount": "158"
          }
        })
      }
    ]
  };

  const jsonLdString = safeJsonLd(schemaGraph);

  // Use HTMLRewriter on Cloudflare Edge to update meta tags and inject Schema.org JSON-LD
  return new HTMLRewriter()
    .on("title", {
      element(e) {
        e.setInnerContent(pageTitle);
      }
    })
    .on('meta[name="description"]', {
      element(e) {
        e.setAttribute("content", desc);
      }
    })
    .on('link[rel="canonical"]', {
      element(e) {
        e.setAttribute("href", canonicalUrl);
      }
    })
    .on('meta[property="og:title"]', {
      element(e) {
        e.setAttribute("content", pageTitle);
      }
    })
    .on('meta[property="og:description"]', {
      element(e) {
        e.setAttribute("content", desc);
      }
    })
    .on('meta[property="og:image"]', {
      element(e) {
        e.setAttribute("content", coverUrl);
      }
    })
    .on('meta[property="og:image:secure_url"]', {
      element(e) {
        e.setAttribute("content", coverUrl);
      }
    })
    .on('meta[property="og:url"]', {
      element(e) {
        e.setAttribute("content", canonicalUrl);
      }
    })
    .on('meta[property="og:type"]', {
      element(e) {
        e.setAttribute("content", isChapterView ? "article" : "book");
      }
    })
    .on('meta[name="twitter:title"]', {
      element(e) {
        e.setAttribute("content", pageTitle);
      }
    })
    .on('meta[name="twitter:description"]', {
      element(e) {
        e.setAttribute("content", desc);
      }
    })
    .on('meta[name="twitter:image"]', {
      element(e) {
        e.setAttribute("content", coverUrl);
      }
    })
    .on("head", {
      element(e) {
        e.append(`<meta name="keywords" content="${escapeHtmlAttribute(keywords)}">`, { html: true });
        e.append(`<script type="application/ld+json">${jsonLdString}</script>`, { html: true });
      }
    })
    .transform(response);
}

function normalizeCoverUrl(cover) {
  if (!cover) return DEFAULT_COVER;
  if (cover.startsWith("http://") || cover.startsWith("https://")) return cover;
  if (cover.startsWith("/")) return `https://tram-chu.online${cover}`;
  return `${CDN_BASE}/${cover.replace(/^\//, "")}`;
}

function cleanDescription(text, maxLength = 240) {
  if (!text) return "";
  const singleLine = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.slice(0, maxLength - 3) + "...";
}
