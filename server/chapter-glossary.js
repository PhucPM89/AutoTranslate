"use strict";

const HAN_RE = /[\p{Script=Han}]/u;
const TERM_SUFFIXES = ["团", "眼", "枪", "石", "币", "袋", "环", "兽", "鸟", "藤", "草", "树", "果", "丹", "阵", "术", "法", "诀", "剑", "刀", "甲", "盾", "弓", "城", "国", "宗", "门", "阁", "殿", "阶", "级"];
const COMMON = new Set(["一个", "这个", "那个", "他们", "自己", "什么", "没有", "可以", "不是", "已经", "如果", "因为", "所以", "但是", "不过", "随后", "如今", "现在"]);

function normalizeRegistry(raw = {}) {
  const entries = raw.entries && typeof raw.entries === "object" ? raw.entries : {};
  return { schema: 1, version: Number(raw.version || 1), entries };
}

function createSeedRegistry(terms = []) {
  const registry = normalizeRegistry();
  for (const [source, target] of terms) {
    registry.entries[source] = { source, target, status: "approved", confidence: 1, seenCount: 0, aliases: [], origin: "curated" };
  }
  return registry;
}

function applyCuratedTerms(registry, terms = []) {
  const next = normalizeRegistry(JSON.parse(JSON.stringify(registry || {})));
  for (const entry of Object.values(next.entries)) {
    if (entry.status === "approved" && entry.origin !== "curated") entry.status = "stable";
  }
  for (const [source, target] of terms) {
    const previous = next.entries[source] || {};
    next.entries[source] = { ...previous, source, target, status: "approved", confidence: 1, aliases: previous.aliases || [], origin: "curated" };
  }
  return next;
}

function selectTermsForChapter(source, registry, limit = 120) {
  return Object.values(normalizeRegistry(registry).entries)
    .filter((term) => term.status === "approved" && term.origin === "curated" && source.includes(term.source))
    .sort((a, b) => b.source.length - a.source.length || b.seenCount - a.seenCount)
    .slice(0, limit);
}

function selectPendingTermsForChapter(source, registry, limit = 30) {
  return Object.values(normalizeRegistry(registry).entries)
    .filter((term) => ["pending", "stable"].includes(term.status) && source.includes(term.source))
    .sort((a, b) => b.source.length - a.source.length || b.seenCount - a.seenCount)
    .slice(0, limit);
}

function extractTermCandidates(source, registry, limit = 30) {
  const known = normalizeRegistry(registry).entries;
  const frequency = new Map();
  const patterns = [
    /[\p{Script=Han}]{2,10}(?=[：:（(])/gu,
    /[《“「『【]?([\p{Script=Han}]{2,8})(?=[”」』】》])/gu,
    /[\p{Script=Han}]{2,8}/gu
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const raw = String(match[1] || match[0]).replace(/[《“「『【】》”」』]/gu, "");
      for (let length = Math.min(8, raw.length); length >= 2; length -= 1) {
        const term = raw.slice(-length);
        if (known[term] || COMMON.has(term) || !TERM_SUFFIXES.some((suffix) => term.endsWith(suffix))) continue;
        frequency.set(term, (frequency.get(term) || 0) + 1);
        break;
      }
    }
  }
  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([sourceTerm, count]) => ({ source: sourceTerm, count }));
}

function buildTermPlanPrompt({ genre, source, approvedTerms = [], candidates = [] }) {
  return [
    "Bạn là biên tập viên thuật ngữ tiểu thuyết Trung-Việt. Chỉ xử lý danh sách ứng viên có bằng chứng trong chương.",
    `Thể loại: ${genre}.`,
    "Với tên riêng giữ âm Hán-Việt ổn định; vật phẩm/kỹ năng/danh từ ghép dùng tiếng Việt dễ hiểu theo ngữ cảnh. Không tạo thuật ngữ nếu ứng viên chỉ là mảnh câu thông thường. Thuật ngữ đã duyệt là bất biến.",
    approvedTerms.length ? `ĐÃ DUYỆT:\n${approvedTerms.map((term) => `${term.source} = ${term.target}`).join("\n")}` : "",
    `ỨNG VIÊN:\n${candidates.map((term) => `${term.source}${term.target ? ` (lần trước đề xuất: ${term.target})` : ""}`).join("\n")}`,
    "Chỉ trả từng dòng theo mẫu <TERM><ZH>chữ gốc</ZH><VI>cách dịch</VI></TERM>. Có thể bỏ qua ứng viên không phải thuật ngữ. Không giải thích.",
    `NGUYÊN TÁC CHƯƠNG:\n${source}`
  ].filter(Boolean).join("\n\n");
}

function parseTermPlan(text, source, candidates, limit = 30) {
  const allowed = new Set(candidates.map((item) => item.source));
  const terms = [];
  const regex = /<TERM>\s*<ZH>([\s\S]*?)<\/ZH>\s*<VI>([\s\S]*?)<\/VI>\s*<\/TERM>/giu;
  for (const match of String(text || "").matchAll(regex)) {
    const zh = match[1].trim();
    const vi = match[2].trim();
    if (!allowed.has(zh) || !source.includes(zh) || !vi || HAN_RE.test(vi) || vi.length > 100) continue;
    terms.push({ source: zh, target: vi, status: "pending", confidence: 0.7 });
    if (terms.length >= limit) break;
  }
  return terms;
}

function mergeConfirmedTerms(registry, plannedTerms, chapterNumber, translation) {
  const next = normalizeRegistry(JSON.parse(JSON.stringify(registry || {})));
  for (const term of plannedTerms) {
    if (!translation.includes(term.target)) continue;
    const existing = next.entries[term.source];
    if (existing?.status === "approved") {
      existing.seenCount = Number(existing.seenCount || 0) + 1;
      existing.lastSeenChapter = chapterNumber;
      continue;
    }
    const confirmations = existing?.target === term.target ? Number(existing.confirmations || 0) + 1 : 1;
    next.entries[term.source] = {
      source: term.source,
      target: term.target,
      status: confirmations >= 3 ? "stable" : "pending",
      confidence: confirmations >= 3 ? 0.9 : 0.7,
      confirmations,
      seenCount: Number(existing?.seenCount || 0) + 1,
      firstSeenChapter: existing?.firstSeenChapter || chapterNumber,
      lastSeenChapter: chapterNumber,
      aliases: existing?.aliases || [],
      origin: "gpt-web-term-plan"
    };
  }
  next.version += 1;
  return next;
}

module.exports = { normalizeRegistry, createSeedRegistry, applyCuratedTerms, selectTermsForChapter, selectPendingTermsForChapter, extractTermCandidates, buildTermPlanPrompt, parseTermPlan, mergeConfirmedTerms };
