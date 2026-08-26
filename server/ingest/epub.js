"use strict";

const JSZip = require("jszip");

// Server-side EPUB reader. The browser version in client/app.js uses DOMParser;
// Node has none, so this mirrors the regex approach already used by
// scripts/crawler-worker.js for the OPF package rather than adding a DOM
// dependency to every serverless bundle.

const NBSP = " ";

async function readEpub(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  const container = await textOf(zip, "META-INF/container.xml");
  if (!container) throw new Error("EPUB thiếu META-INF/container.xml.");
  const opfPath = (container.match(/full-path=["']([^"']+)["']/i) || [])[1];
  if (!opfPath || !zip.file(opfPath)) throw new Error("EPUB không có package document.");

  const opf = await textOf(zip, opfPath);
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest = parseManifest(opf, opfDir);
  const spine = parseSpine(opf, manifest);
  const navTitles = await readNavTitles(zip, opf, manifest);

  return {
    metadata: {
      title: xmlText(opf, "title"),
      author: xmlText(opf, "creator"),
      description: xmlText(opf, "description"),
      language: xmlText(opf, "language")
    },
    cover: await readCover(zip, opf, manifest),
    spine,
    navTitles,
    zip
  };
}

// Chapters are yielded one at a time so a 4,000-chapter book never has to sit in
// memory all at once during ingest.
async function* extractChapters(epub) {
  let chapterNumber = 0;
  for (const item of epub.spine) {
    const file = epub.zip.file(item.href);
    if (!file) continue;
    const html = await file.async("text");
    const content = extractReadableText(html);
    if (!content) continue;
    chapterNumber += 1;
    yield {
      chapterNumber,
      title: epub.navTitles.get(stripFragment(item.href)) || guessTitle(html) || `Chương ${chapterNumber}`,
      content,
      characters: content.length,
      href: item.href
    };
  }
}

async function countChapters(epub) {
  let total = 0;
  for await (const chapter of extractChapters(epub)) {
    if (chapter) total += 1;
  }
  return total;
}

function parseManifest(opf, opfDir) {
  const manifest = new Map();
  for (const match of opf.matchAll(/<item\b([^>]*)>/gi)) {
    const attrs = match[1];
    const id = attribute(attrs, "id");
    const href = decodeXml(attribute(attrs, "href"));
    if (!id || !href) continue;
    manifest.set(id, {
      href: normalizePath(opfDir + href),
      mediaType: attribute(attrs, "media-type"),
      properties: attribute(attrs, "properties")
    });
  }
  return manifest;
}

function parseSpine(opf, manifest) {
  const spineBlock = (opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i) || [])[1] || "";
  return [...spineBlock.matchAll(/<itemref\b([^>]*)>/gi)]
    .map((match) => manifest.get(attribute(match[1], "idref")))
    .filter((item) => item && isDocument(item));
}

function isDocument(item) {
  return /html/i.test(item.mediaType || "") || /\.(x?html|htm)$/i.test(item.href);
}

async function readNavTitles(zip, opf, manifest) {
  const titles = new Map();

  const nav = [...manifest.values()].find((item) => (item.properties || "").includes("nav"));
  if (nav && zip.file(nav.href)) {
    const navHtml = await zip.file(nav.href).async("text");
    for (const match of navHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = normalizeSpace(stripTags(match[2]));
      if (label) titles.set(resolveRelative(nav.href, match[1]), label);
    }
  }

  const tocId = attribute((opf.match(/<spine\b([^>]*)>/i) || [])[1] || "", "toc");
  const ncx = (tocId && manifest.get(tocId)) || [...manifest.values()].find((item) => item.href.endsWith(".ncx"));
  if (ncx && zip.file(ncx.href)) {
    const ncxXml = await zip.file(ncx.href).async("text");
    for (const match of ncxXml.matchAll(/<navPoint\b[\s\S]*?<\/navPoint>/gi)) {
      const block = match[0];
      const src = (block.match(/<content\b[^>]*src=["']([^"']+)["']/i) || [])[1];
      const label = normalizeSpace(stripTags((block.match(/<text>([\s\S]*?)<\/text>/i) || [])[1] || ""));
      if (src && label) titles.set(resolveRelative(ncx.href, src), label);
    }
  }

  return titles;
}

async function readCover(zip, opf, manifest) {
  const coverId = (opf.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i) || [])[1];
  const item =
    (coverId && manifest.get(coverId)) ||
    [...manifest.values()].find((entry) => /(?:^|\s)cover-image(?:\s|$)/.test(entry.properties || ""));
  if (!item || !zip.file(item.href)) return null;
  return {
    data: await zip.file(item.href).async("nodebuffer"),
    contentType: imageType(item.mediaType, item.href),
    href: item.href
  };
}

// Keeps paragraph structure (translation prompts and the reader both rely on the
// blank-line separator) while dropping every tag and script/style block.
function extractReadableText(html) {
  const source = String(html);
  const body = (source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i) || [null, source])[1];
  const cleaned = body
    .replace(/<(script|style|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|blockquote|li|h[1-6])\s*>/gi, "\n\n");
  return normalizeParagraphs(stripTags(cleaned));
}

function guessTitle(html) {
  const match = String(html).match(/<(h[1-3]|title)\b[^>]*>([\s\S]*?)<\/\1>/i);
  return match ? normalizeSpace(stripTags(match[2])) : "";
}

function normalizeParagraphs(text) {
  const paragraphs = decodeXml(text)
    .split(/\n{2,}/)
    .map((paragraph) => normalizeSpace(paragraph))
    .filter(Boolean)
    .filter((paragraph, index, list) => paragraph !== list[index - 1]);
  return paragraphs.join("\n\n");
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function normalizeSpace(value) {
  return String(value || "")
    .normalize("NFC")
    .split(NBSP)
    .join(" ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function xmlText(xml, localName) {
  const pattern = new RegExp(`<(?:\\w+:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${localName}>`, "i");
  const match = String(xml).match(pattern);
  return match ? normalizeSpace(stripTags(match[1])) : "";
}

function attribute(attrs, name) {
  const match = String(attrs || "").match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return match ? match[1] : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => safeCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => safeCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function normalizePath(path) {
  const parts = [];
  for (const part of String(path || "").replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(safeDecode(part));
  }
  return parts.join("/");
}

function safeDecode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

function resolveRelative(baseFile, relative) {
  const base = baseFile.includes("/") ? baseFile.slice(0, baseFile.lastIndexOf("/") + 1) : "";
  return normalizePath(base + stripFragment(relative));
}

function stripFragment(path) {
  return normalizePath(String(path).split("#")[0]);
}

function imageType(mediaType, href) {
  if (["image/jpeg", "image/png", "image/webp"].includes(mediaType)) return mediaType;
  if (/\.png$/i.test(href)) return "image/png";
  if (/\.webp$/i.test(href)) return "image/webp";
  return "image/jpeg";
}

async function textOf(zip, path) {
  const file = zip.file(path);
  return file ? file.async("text") : "";
}

module.exports = { readEpub, extractChapters, countChapters, extractReadableText, normalizeParagraphs };
