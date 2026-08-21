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

function updateJsonLd({ book, chapter, title, desc, url, image }) {
  let script = document.getElementById("dynamicJsonLd");
  if (!script) {
    script = document.createElement("script");
    script.id = "dynamicJsonLd";
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  if (book) {
    const data = {
      "@context": "https://schema.org",
      "@type": "Book",
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
        "url": BASE_URL
      }
    };
    script.textContent = JSON.stringify(data);
  } else {
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Trạm Chữ",
      "url": BASE_URL,
      "description": DEFAULT_DESC
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
  DEFAULT_TITLE,
  DEFAULT_DESC,
  DEFAULT_IMAGE,
  BASE_URL
};
