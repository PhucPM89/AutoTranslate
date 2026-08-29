"use strict";

const STORY_BIBLE_VERSION = "story-bible-v1";

function emptyStoryBible(bookId = "") {
  return { schema: 1, version: STORY_BIBLE_VERSION, bookId, characters: [], worldTerms: [], updatedAt: "" };
}

function cleanText(value, max = 240) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeCharacter(value, chapterNumber) {
  const name = cleanText(value?.name, 80);
  if (!name) return null;
  return {
    name,
    aliases: [...new Set((Array.isArray(value.aliases) ? value.aliases : []).map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, 12),
    gender: ["male", "female", "unknown"].includes(value?.gender) ? value.gender : "unknown",
    role: cleanText(value?.role, 120),
    relationships: [...new Set((Array.isArray(value.relationships) ? value.relationships : []).map((item) => cleanText(item, 160)).filter(Boolean))].slice(0, 20),
    notes: cleanText(value?.notes, 300),
    lastSeenChapter: Number(chapterNumber || value?.lastSeenChapter || 0)
  };
}

function mergeStoryBible(current, updates, { bookId = "", chapterNumber = 0, evidenceText = "", now = new Date().toISOString() } = {}) {
  const bible = current && typeof current === "object" ? { ...emptyStoryBible(bookId), ...current } : emptyStoryBible(bookId);
  const byName = new Map((bible.characters || []).map((item) => [String(item.name).toLowerCase(), item]));
  for (const raw of updates?.characters || []) {
    const next = normalizeCharacter(raw, chapterNumber);
    if (!next) continue;
    if (evidenceText && !String(evidenceText).includes(next.name) && !next.aliases.some((alias) => String(evidenceText).includes(alias))) continue;
    const key = next.name.toLowerCase();
    const previous = byName.get(key) || {};
    byName.set(key, {
      ...previous,
      ...next,
      aliases: [...new Set([...(previous.aliases || []), ...next.aliases])].slice(0, 12),
      relationships: [...new Set([...(previous.relationships || []), ...next.relationships])].slice(0, 20),
      gender: next.gender === "unknown" ? previous.gender || "unknown" : next.gender
    });
  }
  const terms = new Map((bible.worldTerms || []).map((item) => [String(item.term).toLowerCase(), item]));
  for (const raw of updates?.worldTerms || []) {
    const term = cleanText(raw?.term, 100);
    const meaning = cleanText(raw?.meaning, 240);
    if (evidenceText && term && !String(evidenceText).includes(term)) continue;
    if (term && meaning) terms.set(term.toLowerCase(), { term, meaning, lastSeenChapter: Number(chapterNumber) });
  }
  return { ...bible, schema: 1, version: STORY_BIBLE_VERSION, bookId: bookId || bible.bookId, characters: [...byName.values()].slice(-500), worldTerms: [...terms.values()].slice(-500), updatedAt: now };
}

function appendStoryContext(current, { chapterNumber, summary, now = new Date().toISOString(), limit = 8 }) {
  const chapters = Array.isArray(current?.chapters) ? current.chapters.filter((item) => Number(item.chapterNumber) !== Number(chapterNumber)) : [];
  const cleanSummary = cleanText(summary, 1200);
  if (cleanSummary) chapters.push({ chapterNumber: Number(chapterNumber), summary: cleanSummary, approvedAt: now });
  return { schema: 1, updatedAt: now, chapters: chapters.sort((a, b) => a.chapterNumber - b.chapterNumber).slice(-limit) };
}

function mergeApprovedTranslationMemory(current, updates, { chapterNumber, source, translation, now = new Date().toISOString() } = {}) {
  const list = Array.isArray(current?.entries) ? [...current.entries] : [];
  const bySource = new Map(list.map((item) => [item.zh, item]));
  for (const raw of updates || []) {
    const zh = cleanText(raw?.zh, 80);
    const vi = cleanText(raw?.vi, 120);
    if (!zh || !vi || zh.length < 2 || !String(source).includes(zh) || !String(translation).includes(vi)) continue;
    bySource.set(zh, { zh, vi, approved: true, chapterNumber: Number(chapterNumber), updatedAt: now });
  }
  return { schema: 1, approvedOnly: true, updatedAt: now, entries: [...bySource.values()].slice(-2000) };
}

module.exports = { STORY_BIBLE_VERSION, emptyStoryBible, mergeStoryBible, appendStoryContext, mergeApprovedTranslationMemory };
