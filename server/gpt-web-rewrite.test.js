"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { getBookTranslationProfile, buildRewritePrompt, buildSelfAuditPrompt, parseFullTranslation, validateProfileTerms } = require("./gpt-web-rewrite");

test("uses a genre profile and locked terms for the survival-horror book", () => {
  const profile = getBookTranslationProfile("fanqie-7027679289931729920");
  assert.match(profile.genre, /kinh dị sinh tồn/);
  const prompt = buildRewritePrompt({ bookId: "fanqie-7027679289931729920", source: "物品栏" });
  assert.match(prompt, /物品栏 = Túi đồ/);
  assert.match(prompt, /洞悉 = Nhìn Thấu/);
  assert.match(prompt, /蝎蝠 = Dơi Bọ Cạp/);
  assert.match(prompt, /Không tham khảo hay vá bản dịch API/);
});

test("self audit receives both complete source and GPT translation", () => {
  const prompt = buildSelfAuditPrompt({ bookId: "x", source: "他没有死。", translatedContent: "Hắn đã chết.", translatedTitle: "Tên" });
  assert.match(prompt, /他没有死。/);
  assert.match(prompt, /Hắn đã chết\./);
  assert.match(prompt, /đối chiếu từng câu/);
});

test("parses a complete tagged translation", () => {
  assert.deepEqual(parseFullTranslation("<TITLE>\nChương 1\n</TITLE>\n<CONTENT>\n<P id=\"1\">Đoạn một.</P>\n<P id=\"2\">Đoạn hai.</P>\n</CONTENT>", [1, 2]), {
    title: "Chương 1",
    content: "Đoạn một.\n\nĐoạn hai.",
    terms: []
  });
  assert.throws(() => parseFullTranslation("Chỉ có nội dung"), /TITLE\/CONTENT/);
  assert.throws(() => parseFullTranslation("<TITLE>T</TITLE><CONTENT><P id=\"1\">A</P><P id=\"3\">C</P></CONTENT>", [1, 2, 3]), /Sai cấu trúc đoạn/);
});

test("enforces canonical terms and blocks aliases", () => {
  const profile = getBookTranslationProfile("fanqie-7027679289931729920");
  assert.equal(validateProfileTerms("洞悉发现蝎蝠", "Nhìn Thấu phát hiện Dơi Bọ Cạp", profile), true);
  assert.throws(() => validateProfileTerms("洞悉发现蝎蝠", "Động Sát phát hiện Thiệp Phách", profile), /Nhìn Thấu|biến thể cấm/);
  assert.throws(() => validateProfileTerms("洞悉再次使用洞悉", "Nhìn Thấu lại được sử dụng", profile), /xuất hiện 2 lần/);
});
