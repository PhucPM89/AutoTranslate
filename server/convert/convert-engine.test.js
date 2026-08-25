"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { createConvertEngine, matchPhrase, buildTrie } = require("./convert-engine");
const { loadPhraseDict, loadHanvietChars, parseTxt } = require("./load-dictionaries");

const HV = {
  中: { hv: "trung" }, 国: { hv: "quốc" }, 人: { hv: "nhân" },
  修: { hv: "tu" }, 仙: { hv: "tiên" }, 之: { hv: "chi" }, 路: { hv: "lộ" },
  叶: { hv: "diệp" }, 辰: { hv: "thần" }
};

// Raw-mechanics engine: no punctuation/caps, so spacing and lookup are isolated.
function raw(opts) {
  return createConvertEngine({ normalizePunctuation: false, capitalizeSentences: false, ...opts });
}

test("longest phrase match wins over single-char fallback", () => {
  const e = raw({ phraseDict: { 修仙: "TU-TIEN" }, hanvietChars: HV });
  assert.strictEqual(e.convert("修仙之路"), "TU-TIEN chi lộ");
});

test("syllables are space-separated, unknown Han passes through", () => {
  const e = raw({ hanvietChars: HV });
  assert.strictEqual(e.convert("中国人"), "trung quốc nhân");
  assert.strictEqual(e.convert("中龘国"), "trung 龘 quốc");
});

test("numbers and latin read as their own spaced word", () => {
  const e = raw({ hanvietChars: HV });
  assert.strictEqual(e.convert("中国123"), "trung quốc 123");
});

test("paragraph structure and blank lines are preserved", () => {
  const e = raw({ hanvietChars: HV });
  assert.strictEqual(e.convert("中国\n\n人"), "trung quốc\n\nnhân");
});

test("empty and non-string input is safe", () => {
  const e = raw({ hanvietChars: HV });
  assert.strictEqual(e.convert(""), "");
  assert.strictEqual(e.convert(null), "");
  assert.strictEqual(e.convert(undefined), "");
});

test("Chinese punctuation is normalised with Vietnamese spacing", () => {
  const e = createConvertEngine({ hanvietChars: HV, capitalizeSentences: false });
  // comma hugs left + space right; full stop likewise
  assert.strictEqual(e.convert("中国，人。"), "trung quốc, nhân.");
});

test("opening and closing quotes hug the correct side", () => {
  const e = createConvertEngine({ hanvietChars: HV, capitalizeSentences: false });
  assert.strictEqual(e.convert("人「中国」"), "nhân “trung quốc”");
});

test("sentence starts are capitalised, including after a full stop", () => {
  const e = createConvertEngine({ hanvietChars: HV });
  assert.strictEqual(e.convert("中国。人"), "Trung quốc. Nhân");
});

test("names read phonetically, not by meaning, and capitalise at sentence start", () => {
  const e = createConvertEngine({ hanvietChars: HV });
  assert.strictEqual(e.convert("叶辰"), "Diệp thần");
});

test("trie matchPhrase returns the longest terminal", () => {
  const trie = buildTrie({ 天: "X", 天玄: "Y", 天玄宗: "Z" });
  const m = matchPhrase(trie, Array.from("天玄宗门"), 0);
  assert.deepStrictEqual(m, { vi: "Z", length: 3 });
});

test("trie returns null when the first char does not start any phrase", () => {
  const trie = buildTrie({ 修仙: "tu tiên" });
  assert.strictEqual(matchPhrase(trie, Array.from("你好"), 0), null);
});

test("parseTxt ignores comments, blanks, empty values and strips BOM", () => {
  const dict = parseTxt("﻿修仙=tu tiên\n# comment\n\n空=\n天玄宗=Thiên Huyền Tông\n");
  assert.deepStrictEqual(dict, { 修仙: "tu tiên", 天玄宗: "Thiên Huyền Tông" });
});

test("loaders read txt, gz and json and apply override precedence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "convert-"));
  const base = path.join(dir, "base.txt");
  const gz = path.join(dir, "more.txt.gz");
  const override = path.join(dir, "override.json");
  fs.writeFileSync(base, "修仙=tu tien base\n天玄宗=Thien Huyen Tong\n");
  fs.writeFileSync(gz, zlib.gzipSync(Buffer.from("出没=qua lại\n", "utf8")));
  fs.writeFileSync(override, JSON.stringify({ 修仙: "tu tiên override" }));
  const dict = loadPhraseDict([base, gz, override]);
  assert.strictEqual(dict["修仙"], "tu tiên override"); // later file wins
  assert.strictEqual(dict["天玄宗"], "Thien Huyen Tong");
  assert.strictEqual(dict["出没"], "qua lại"); // gz decoded
  fs.rmSync(dir, { recursive: true, force: true });
});

test("single-char loader tags source and later files override", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "convert-"));
  const a = path.join(dir, "a.txt");
  const b = path.join(dir, "b.txt");
  fs.writeFileSync(a, "们=món\n"); // a wrong reading
  fs.writeFileSync(b, "们=môn\n"); // corrected later
  const chars = loadHanvietChars([a, b]);
  assert.strictEqual(chars["们"].hv, "môn");
  assert.strictEqual(chars["们"].source, "curated");
  fs.rmSync(dir, { recursive: true, force: true });
});
