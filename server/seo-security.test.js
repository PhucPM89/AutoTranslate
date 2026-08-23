"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { escapeHtmlAttribute, safeJsonLd } = require("./seo-security");

test("SEO metadata cannot break out of an HTML attribute", () => {
  const value = escapeHtmlAttribute('novel\" onerror=\"alert(1)<script>');
  assert.equal(value, "novel&amp;quot; onerror=&amp;quot;alert(1)&lt;script&gt;".replace(/&amp;quot;/g, "&quot;"));
  assert.doesNotMatch(value, /<script|\" onerror=/);
});

test("JSON-LD cannot close its script element", () => {
  const value = safeJsonLd({ title: "</script><script>alert(1)</script>" });
  assert.doesNotMatch(value, /<\/script>/i);
  assert.match(value, /\\u003c\/script\\u003e/);
});
