// Cloudflare Pages Functions Middleware for Dynamic OpenGraph & Social Sharing Previews
// Intercepts requests from Facebook, Zalo, Twitter, Telegram, Discord, Googlebot
// and dynamically injects book cover, title, and description into HTML responses.

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
  "skypeuripreview"
];

const CDN_BASE = "https://cdn.tram-chu.online";
const SITE_NAME = "Trạm Chữ";
const DEFAULT_COVER = "https://tram-chu.online/library/covers/misty-pagoda-hero.webp";

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const userAgent = (request.headers.get("user-agent") || "").toLowerCase();

  const isCrawler = BOT_USER_AGENTS.some((bot) => userAgent.includes(bot));
  const bookId = url.searchParams.get("book");

  // If not a crawler or no book specified, pass through to normal static handling
  if (!bookId) {
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
    // Fallback: try latest catalog
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

  const title = `${book.title} — ${SITE_NAME}`;
  const desc = cleanDescription(book.description || `Đọc truyện ${book.title} của tác giả ${book.author || "Khuyết danh"} trên Trạm Chữ.`);
  const coverUrl = normalizeCoverUrl(book.cover);
  const shareUrl = `${url.origin}/?book=${encodeURIComponent(bookId)}`;

  // Use HTMLRewriter on Cloudflare Edge to update meta tags with zero latency
  return new HTMLRewriter()
    .on("title", {
      element(e) {
        e.setInnerContent(title);
      }
    })
    .on('meta[name="description"]', {
      element(e) {
        e.setAttribute("content", desc);
      }
    })
    .on('link[rel="canonical"]', {
      element(e) {
        e.setAttribute("href", shareUrl);
      }
    })
    .on('meta[property="og:title"]', {
      element(e) {
        e.setAttribute("content", title);
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
        e.setAttribute("content", shareUrl);
      }
    })
    .on('meta[property="og:type"]', {
      element(e) {
        e.setAttribute("content", "book");
      }
    })
    .on('meta[name="twitter:title"]', {
      element(e) {
        e.setAttribute("content", title);
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
    .transform(response);
}

function normalizeCoverUrl(cover) {
  if (!cover) return DEFAULT_COVER;
  if (cover.startsWith("http://") || cover.startsWith("https://")) return cover;
  if (cover.startsWith("/")) return `https://tram-chu.online${cover}`;
  return `${CDN_BASE}/${cover.replace(/^\//, "")}`;
}

function cleanDescription(text, maxLength = 200) {
  if (!text) return "";
  const singleLine = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.slice(0, maxLength - 3) + "...";
}
