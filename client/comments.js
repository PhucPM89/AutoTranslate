"use strict";

// Inline Paragraph Comments Engine
// High-concurrency 1-query batch fetching per chapter with client-side distribution.

const COOLDOWN_SECONDS = 15;
const LAST_COMMENT_KEY = "epubTranslator.lastCommentTime";

// Memory cache for active chapter comments: Map<chapterIndex, Map<paragraphIndex, Array<Comment>>>
const chapterCommentsCache = new Map();

async function fetchChapterComments({ supabaseUrl, supabaseKey, bookId, chapterIndex }) {
  if (!supabaseUrl || !supabaseKey || !bookId) return new Map();

  const cacheKey = `${bookId}:${chapterIndex}`;
  if (chapterCommentsCache.has(cacheKey)) {
    return chapterCommentsCache.get(cacheKey);
  }

  try {
    const url = `${supabaseUrl}/rest/v1/paragraph_comments?book_id=eq.${encodeURIComponent(
      bookId
    )}&chapter_index=eq.${chapterIndex}&select=id,paragraph_index,author_name,content,created_at,likes_count&order=created_at.asc`;

    const res = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    });

    if (!res.ok) return new Map();
    const comments = (await res.json().catch(() => [])) || [];

    const grouped = new Map();
    for (const c of comments) {
      const pIdx = Number(c.paragraph_index);
      if (!grouped.has(pIdx)) grouped.set(pIdx, []);
      grouped.get(pIdx).push(c);
    }

    chapterCommentsCache.set(cacheKey, grouped);
    return grouped;
  } catch {
    return new Map();
  }
}

async function postComment({ supabaseUrl, supabaseKey, accessToken, bookId, chapterIndex, paragraphIndex, authorName, content }) {
  if (!supabaseUrl || !supabaseKey) throw new Error("Chưa cấu hình cơ sở dữ liệu");
  if (!accessToken) throw new Error("Vui lòng đăng nhập để gửi bình luận");

  // Client rate-limiting
  const now = Date.now();
  const lastTime = Number(localStorage.getItem(LAST_COMMENT_KEY) || 0);
  const remaining = Math.ceil((COOLDOWN_SECONDS * 1000 - (now - lastTime)) / 1000);
  if (remaining > 0) {
    throw new Error(`Vui lòng đợi ${remaining}s trước khi gửi bình luận tiếp theo`);
  }

  const cleanContent = String(content || "").trim();
  if (!cleanContent || cleanContent.length > 280) {
    throw new Error("Nội dung bình luận phải từ 1 đến 280 ký tự");
  }

  const payload = {
    book_id: bookId,
    chapter_index: chapterIndex,
    paragraph_index: paragraphIndex,
    author_name: String(authorName || "Độc giả").trim().slice(0, 30) || "Độc giả",
    content: cleanContent
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/paragraph_comments`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Lỗi gửi bình luận (HTTP ${res.status}): ${errBody || "Thử lại sau"}`);
  }

  const inserted = await res.json();
  localStorage.setItem(LAST_COMMENT_KEY, String(now));

  // Invalidate and update local cache
  const cacheKey = `${bookId}:${chapterIndex}`;
  if (chapterCommentsCache.has(cacheKey)) {
    const grouped = chapterCommentsCache.get(cacheKey);
    if (!grouped.has(paragraphIndex)) grouped.set(paragraphIndex, []);
    if (Array.isArray(inserted) && inserted.length > 0) {
      grouped.get(paragraphIndex).push(inserted[0]);
    }
  }

  return Array.isArray(inserted) ? inserted[0] : payload;
}

function clearCommentsCache() {
  chapterCommentsCache.clear();
}

module.exports = {
  fetchChapterComments,
  postComment,
  submitChapterComment: postComment,
  clearCommentsCache
};
