"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWebReviewPrompt, applyWebReview, containsEvidence, repairUnescapedJsonQuotes } = require("./web-translation-review");
const { getConfig, translateWithGptWeb } = require("./gemini-web");

test("review prompt contains complete source and API draft", () => {
  const prompt = buildWebReviewPrompt({ sourceTitle: "原标题", source: "他没有死。", draftTitle: "Tên", draft: "Hắn đã chết." });
  assert.match(prompt, /他没有死。/);
  assert.match(prompt, /Hắn đã chết\./);
  assert.match(prompt, /before.*đúng một lần/i);
});

test("applies an evidenced exact patch", () => {
  const result = applyWebReview({
    source: "他没有死。", draft: "Hắn đã chết.", draftTitle: "Tên", sourceTitle: "原标题",
    response: { decision: "patch", correctedTitle: "", issues: [{ sourceQuote: "没有死", before: "đã chết", after: "không chết", reason: "Sai phủ định" }] }
  });
  assert.equal(result.content, "Hắn không chết.");
});

test("rejects patches without source evidence or unique target", () => {
  assert.throws(() => applyWebReview({ source: "甲", draft: "lỗi lỗi", response: { decision: "patch", issues: [{ sourceQuote: "乙", before: "lỗi", after: "đúng" }] } }), /bằng chứng/);
  assert.throws(() => applyWebReview({ source: "甲", draft: "lỗi lỗi", response: { decision: "patch", issues: [{ sourceQuote: "甲", before: "lỗi", after: "đúng" }] } }), /2 lần/);
});

test("accepts copied Chinese evidence with harmless whitespace and punctuation differences", () => {
  assert.equal(containsEvidence("他说：“我没有死！”", " 我没有死。 "), true);
  assert.equal(containsEvidence("他说我没有死", "我已经死了"), false);
});

test("rejects a patch that replaces Vietnamese with Chinese source text", () => {
  assert.throws(() => applyWebReview({
    source: "少女点点头。",
    draft: "Cô gái gật đầu.",
    response: { decision: "patch", issues: [{ sourceQuote: "少女点点头。", before: "Cô gái gật đầu.", after: "少女点点头。", reason: "Sai định dạng" }] }
  }), /tăng chữ Hán|chép nguyên tác/);
});

test("allows a repair that reduces untranslated Chinese text", () => {
  const result = applyWebReview({
    source: "少女点点头。",
    draft: "少女点点头。",
    response: { decision: "patch", issues: [{ sourceQuote: "少女点点头。", before: "少女点点头。", after: "Cô gái gật đầu.", reason: "Sót tiếng Trung" }] }
  });
  assert.equal(result.content, "Cô gái gật đầu.");
});

test("keeps valid patches when another patch in the same response is invalid", () => {
  const result = applyWebReview({
    source: "他没有死。少女点点头。",
    draft: "Hắn đã chết. Cô gái gật đầu.",
    response: { decision: "patch", issues: [
      { sourceQuote: "没有死", before: "đã chết", after: "không chết", reason: "Sai phủ định" },
      { sourceQuote: "少女点点头。", before: "Cô gái gật đầu.", after: "少女点点头。", reason: "Patch hỏng" }
    ] }
  });
  assert.equal(result.content, "Hắn không chết. Cô gái gật đầu.");
  assert.equal(result.issues.length, 1);
  assert.equal(result.rejectedIssues.length, 1);
});

test("prompt forbids copying Chinese into the replacement", () => {
  const prompt = buildWebReviewPrompt({ source: "少女点点头。", draft: "Cô gái gật đầu.", lockedTerms: [{ source: "物品栏", target: "Túi đồ" }] });
  assert.match(prompt, /tuyệt đối không chép nguyên tác tiếng Trung vào after/i);
  assert.match(prompt, /BẢN DỊCH HIỆN TẠI/);
  assert.match(prompt, /ai làm gì với ai/i);
  assert.match(prompt, /không tự đặt cách dịch mới/i);
  assert.match(prompt, /tối đa 8 bản vá/i);
  assert.match(prompt, /\\u0022/);
  assert.match(prompt, /物品栏 = Túi đồ/);
  assert.match(prompt, /Cấm phiên âm Hán-Việt máy móc/i);
});

test("rejects a patch that violates a locked term", () => {
  assert.throws(() => applyWebReview({
    source: "物品栏扩展石，不错。",
    draft: "Vật Phẩm Lan Mở Rộng Thạch, không tệ.",
    lockedTerms: [{ source: "物品栏扩展石", target: "Đá Mở Rộng Túi Đồ" }],
    response: { decision: "patch", issues: [{ sourceQuote: "物品栏扩展石", before: "Vật Phẩm Lan Mở Rộng Thạch", after: "Vật Phẩm Lan Mở Rộng Thạch", reason: "thuật ngữ" }] }
  }), /không thay đổi|thuật ngữ khóa/);
  assert.equal(applyWebReview({
    source: "物品栏扩展石，不错。",
    draft: "Vật Phẩm Lan Mở Rộng Thạch, không tệ.",
    lockedTerms: [{ source: "物品栏扩展石", target: "Đá Mở Rộng Túi Đồ" }],
    response: { decision: "patch", issues: [{ sourceQuote: "物品栏扩展石", before: "Vật Phẩm Lan Mở Rộng Thạch", after: "Đá Mở Rộng Túi Đồ", reason: "thuật ngữ" }] }
  }).content, "Đá Mở Rộng Túi Đồ, không tệ.");
});

test("GPT Web uses a separate ChatGPT profile and selectors", () => {
  const config = getConfig({ site: "gpt" });
  assert.equal(config.url, "https://chatgpt.com/");
  assert.equal(config.headless, false);
  assert.equal(config.background, true);
  assert.match(config.userDataDir, /gpt-web-profiles/);
  assert.match(config.inputSelector, /prompt-textarea/);
  assert.match(config.responseSelector, /data-message-author-role/);
});

test("GPT Web mock reports the GPT provider", async () => {
  const previous = process.env.GPT_WEB_MOCK_RESPONSE;
  process.env.GPT_WEB_MOCK_RESPONSE = '{"decision":"pass","correctedTitle":"","titleSourceQuote":"","issues":[]}';
  try {
    const result = await translateWithGptWeb("review this", { direct: true });
    assert.equal(result.provider, "gpt-web");
    assert.equal(result.model, "gpt-web-mock");
  } finally {
    if (previous === undefined) delete process.env.GPT_WEB_MOCK_RESPONSE;
    else process.env.GPT_WEB_MOCK_RESPONSE = previous;
  }
});

test("repairs dialogue quotes copied into JSON strings by ChatGPT Web", () => {
  const malformed = '{"decision":"patch","issues":[{"sourceQuote":"他说："走吧。"","before":""Đi thôi."","after":""Đi nào.""}]}';
  const parsed = JSON.parse(repairUnescapedJsonQuotes(malformed));
  assert.equal(parsed.issues[0].sourceQuote, '他说："走吧。"');
  assert.equal(parsed.issues[0].before, '"Đi thôi."');
  assert.equal(parsed.issues[0].after, '"Đi nào."');
});

test("repairs an unescaped quoted term followed by prose and a comma", () => {
  const malformed = '{"decision":"patch","issues":[{"before":"đạt hiệu ứng"Chân Thị Chi Nhãn", trong đồng tử có thay đổi","after":"đạt hiệu ứng \\u0022Chân Thị Chi Nhãn\\u0022, trong đồng tử có thay đổi"}]}';
  const parsed = JSON.parse(repairUnescapedJsonQuotes(malformed));
  assert.equal(parsed.issues[0].before, 'đạt hiệu ứng"Chân Thị Chi Nhãn", trong đồng tử có thay đổi');
});

test("rejects a patch that drops dialogue quotation marks", () => {
  assert.throws(() => applyWebReview({
    source: "“你去哪？”",
    draft: '"Ngươi đi đâu?"',
    response: { decision: "patch", issues: [{ sourceQuote: "“你去哪？”", before: '"Ngươi đi đâu?"', after: "Ngươi đi đâu?", reason: "sửa câu" }] }
  }), /dấu mở lời thoại/);
  assert.equal(applyWebReview({
    source: "“你去哪？”",
    draft: '"Ngươi đi đâu?"',
    response: { decision: "patch", issues: [{ sourceQuote: "“你去哪？”", before: '"Ngươi đi đâu?"', after: '"Ngươi định đi đâu?"', reason: "thiếu ý" }] }
  }).content, '"Ngươi định đi đâu?"');
});

test("rejects a patch that removes a scene-break marker", () => {
  assert.throws(() => applyWebReview({
    source: "他还没拿出来呢！......下一幕",
    draft: "Hắn vẫn chưa lấy ra!......\n\nCảnh sau",
    response: { decision: "patch", issues: [{ sourceQuote: "他还没拿出来呢！", before: "Hắn vẫn chưa lấy ra!......", after: "Hắn vẫn chưa lấy ra!", reason: "dấu câu" }] }
  }), /dấu ngắt cảnh/);
});

test("rejects reversing an accepted patch", () => {
  const result = applyWebReview({
    source: "这黑了心的蛆",
    draft: "Con giòi lòng dạ đen tối",
    patchHistory: [{ sourceQuote: "黑了心的蛆", before: "con giòi đen lòng", after: "con giòi lòng dạ đen tối" }],
    response: { decision: "patch", issues: [{ sourceQuote: "黑了心的蛆", before: "Con giòi lòng dạ đen tối", after: "con giòi đen lòng", reason: "văn phong" }] }
  });
  assert.equal(result.decision, "pass");
  assert.match(result.rejectedIssues[0].reason, /vùng đã có bản vá/);
});

test("rejects a second stylistic rewrite of an already patched sentence", () => {
  const result = applyWebReview({
    source: "他晃了晃手，像地星上的装饰。",
    draft: "Hắn vẫy tay, giống đồ trang sức trên Trái Đất.",
    patchHistory: [{ sourceQuote: "他晃了晃手，像地星上的装饰。", before: "Hắn vẫy tay, giống đồ trang sức trên Địa Tinh.", after: "Hắn vẫy tay, giống đồ trang sức trên Trái Đất." }],
    response: { decision: "patch", issues: [{ sourceQuote: "他晃了晃手，像地星上的装饰。", before: "Hắn vẫy tay, giống đồ trang sức trên Trái Đất.", after: "Hắn lắc tay, giống đồ trang sức trên Trái Đất.", reason: "văn phong" }] }
  });
  assert.equal(result.decision, "pass");
  assert.equal(result.content, "Hắn vẫy tay, giống đồ trang sức trên Trái Đất.");
  assert.match(result.rejectedIssues[0].reason, /vùng đã có bản vá/);
});
