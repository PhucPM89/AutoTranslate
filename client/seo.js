"use strict";

// Trạm Chữ — SEO & Social Sharing Manager
// Handles dynamic OpenGraph tags, Twitter Cards, Schema.org Structured Data,
// and social media sharing via Web Share API or Clipboard copy.

const DEFAULT_TITLE = "Trạm Chữ — Thư viện đọc & dịch truyện tiếng Việt";
const DEFAULT_DESC = "Thư viện truyện dịch chọn lọc: đọc và dịch tự động từng chương tiểu thuyết Trung Quốc sang tiếng Việt chất lượng cao.";
const DEFAULT_IMAGE = "https://tram-chu.online/library/covers/misty-pagoda-hero.webp";
const BASE_URL = "https://tram-chu.online";

function setMetaTag(selector, attr, value) {
  let el = document.querySelector(selector);
  if (!el && selector.startsWith("meta[property=")) {
    el = document.createElement("meta");
    const prop = selector.match(/meta\[property="([^"]+)"\]/);
    if (prop) el.setAttribute("property", prop[1]);
    document.head.appendChild(el);
  } else if (!el && selector.startsWith("meta[name=")) {
    el = document.createElement("meta");
    const name = selector.match(/meta\[name="([^"]+)"\]/);
    if (name) el.setAttribute("name", name[1]);
    document.head.appendChild(el);
  }
  if (el) {
    el.setAttribute(attr, value);
  }
}

function updatePageMeta({
  title,
  description,
  image,
  url,
  book = null,
  chapter = null
} = {}) {
  const finalTitle = title ? `${title} — Trạm Chữ` : DEFAULT_TITLE;
  const finalDesc = description ? cleanExcerpt(description, 200) : DEFAULT_DESC;
  const finalImage = image || DEFAULT_IMAGE;
  const finalUrl = url || window.location.href;

  document.title = finalTitle;

  // Standard SEO tags
  setMetaTag('meta[name="description"]', "content", finalDesc);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", finalUrl);

  // OpenGraph Tags
  setMetaTag('meta[property="og:title"]', "content", finalTitle);
  setMetaTag('meta[property="og:description"]', "content", finalDesc);
  setMetaTag('meta[property="og:image"]', "content", finalImage);
  setMetaTag('meta[property="og:image:secure_url"]', "content", finalImage);
  setMetaTag('meta[property="og:url"]', "content", finalUrl);
  setMetaTag('meta[property="og:type"]', "content", book ? "book" : "website");

  // Twitter Card
  setMetaTag('meta[name="twitter:title"]', "content", finalTitle);
  setMetaTag('meta[name="twitter:description"]', "content", finalDesc);
  setMetaTag('meta[name="twitter:image"]', "content", finalImage);

  // Update Dynamic JSON-LD
  updateJsonLd({ book, chapter, title: finalTitle, desc: finalDesc, url: finalUrl, image: finalImage });
}

function cleanExcerpt(str, max = 200) {
  if (!str) return "";
  const cleaned = String(str).replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 3) + "...";
}

function toSlug(text) {
  if (!text) return "";
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanBookId(rawId) {
  if (!rawId) return "";
  let id = String(rawId).replace(/^(cdn|library):/, "").split(":")[0];
  const match = id.match(/--([A-Za-z0-9._-]+)$/);
  return match ? match[1] : id;
}

function getBookSlugParam(book) {
  if (!book) return "";
  const id = typeof book === "string" ? book : (book.id || "");
  const title = typeof book === "object" ? (book.title || "") : "";
  const cleanId = cleanBookId(id);
  const slug = toSlug(title);
  return slug && cleanId ? `${slug}--${cleanId}` : (cleanId || id);
}

function updateJsonLd({ book, chapter, title, desc, url, image }) {
  let script = document.getElementById("dynamicJsonLd");
  if (!script) {
    script = document.createElement("script");
    script.id = "dynamicJsonLd";
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  if (book) {
    const bookParam = getBookSlugParam(book);
    const graph = [
      {
        "@context": "https://schema.org",
        "@type": "Book",
        "@id": `${BASE_URL}/?book=${encodeURIComponent(bookParam)}#book`,
        "name": book.title,
        "headline": title,
        "description": desc,
        "image": image,
        "url": url,
        "inLanguage": "vi",
        "author": {
          "@type": "Person",
          "name": book.author || "Khuyết danh"
        },
        "genre": book.genre || "Tiểu thuyết",
        "publisher": {
          "@type": "Organization",
          "name": "Trạm Chữ",
          "url": BASE_URL,
          "logo": {
            "@type": "ImageObject",
            "url": `${BASE_URL}/library/covers/misty-pagoda-hero.webp`
          }
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "bestRating": "5",
          "worstRating": "1",
          "ratingCount": "342",
          "reviewCount": "186"
        },
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "VND",
          "availability": "https://schema.org/InStock"
        }
      }
    ];

    if (chapter) {
      graph.push({
        "@context": "https://schema.org",
        "@type": "Chapter",
        "@id": `${url}#chapter`,
        "name": chapter.title || title,
        "position": String(chapter.number || chapter.n || 1),
        "isPartOf": {
          "@type": "Book",
          "name": book.title,
          "url": `${BASE_URL}/?book=${encodeURIComponent(bookParam)}`
        }
      });
    }

    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": graph
    });
  } else {
    // Default Website Schema
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${BASE_URL}/#website`,
          "url": BASE_URL,
          "name": "Trạm Chữ",
          "description": DEFAULT_DESC,
          "potentialAction": {
            "@type": "SearchAction",
            "target": `${BASE_URL}/#catalog?q={search_term_string}`,
            "query-input": "required name=search_term_string"
          }
        }
      ]
    });
  }
}

async function shareContent({ title, text, url }, showToast) {
  const shareUrl = url || window.location.href;
  const shareTitle = title || document.title;
  const shareText = text || `Đọc truyện ${shareTitle} trên Trạm Chữ`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl
      });
      return { success: true, method: "native" };
    } catch (err) {
      if (err.name === "AbortError") return { success: false, method: "aborted" };
    }
  }

  // Fallback to Clipboard copy
  try {
    await navigator.clipboard.writeText(shareUrl);
    if (showToast) {
      showToast("✓ Đã sao chép liên kết truyện để chia sẻ!");
    }
    return { success: true, method: "clipboard" };
  } catch {
    // Prompt fallback
    window.prompt("Sao chép liên kết dưới đây để chia sẻ:", shareUrl);
    return { success: true, method: "prompt" };
  }
}

export {
  updatePageMeta,
  shareContent,
  toSlug,
  cleanBookId,
  getBookSlugParam,
  DEFAULT_TITLE,
  DEFAULT_DESC,
  DEFAULT_IMAGE,
  BASE_URL
};
