"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SCRIPT_MODES,
  TONES,
  buildSourceContext,
  validateScript,
  generateFallbackScript
} = require("./script-generator");

test("ScriptGenerator: buildSourceContext formats metadata, story bible and chapters", () => {
  const book = {
    title: "Ác Mộng Cầu Sinh",
    author: "Lộ Kiếm Nhất",
    genres: ["Mạt Thế", "Sinh Tồn"],
    description: "Nhân vật chính bước vào thế giới ác mộng."
  };
  const chapters = [
    { chapterNumber: 1, title: "Khởi đầu ác mộng", content: "Nội dung chương 1 rất dài..." }
  ];
  const storyBible = {
    characters: [{ name: "Trần Dịch", role: "Nhân vật chính" }],
    worldTerms: [{ term: "Nhà gỗ", meaning: "Nơi trú ẩn an toàn" }]
  };

  const context = buildSourceContext(book, chapters, storyBible);

  assert.equal(context.bookTitle, "Ác Mộng Cầu Sinh");
  assert.equal(context.author, "Lộ Kiếm Nhất");
  assert.match(context.charList, /Trần Dịch/);
  assert.match(context.termList, /Nhà gỗ/);
  assert.match(context.chapterSnippets, /Khởi đầu ác mộng/);
});

test("ScriptGenerator: validateScript catches missing title, few scenes or short word count", () => {
  const invalid1 = { title: "", scenes: [] };
  const res1 = validateScript(invalid1);
  assert.equal(res1.valid, false);
  assert.ok(res1.issues.some(i => i.includes("tiêu đề") || i.includes("Tiêu đề")));

  const invalid2 = {
    title: "Review Hấp Dẫn",
    scenes: [
      { text: "Quá ngắn" },
      { text: "Cũng ngắn" }
    ]
  };
  const res2 = validateScript(invalid2);
  assert.equal(res2.valid, false);
  assert.ok(res2.issues.some(i => i.includes("tối thiểu 3 phân cảnh")));
});

test("ScriptGenerator: generateFallbackScript produces valid structure with 5 scenes", () => {
  const book = {
    id: "test-book",
    title: "Ác Mộng Cầu Sinh",
    author: "Lộ Kiếm Nhất",
    description: "Tóm tắt truyện sinh tồn."
  };
  const chapters = [
    { chapterNumber: 1, title: "Chương 1" },
    { chapterNumber: 2, title: "Chương 2" }
  ];

  const script = generateFallbackScript(book, chapters, { mode: SCRIPT_MODES.TEASER });

  assert.ok(script.title.includes("Ác Mộng Cầu Sinh"));
  assert.equal(script.scenes.length, 5);
  assert.equal(script.scenes[0].type, "hook");
  assert.equal(script.scenes[1].type, "premise");
  assert.equal(script.scenes[2].type, "conflict");
  assert.equal(script.scenes[3].type, "critique");
  assert.equal(script.scenes[4].type, "outro");

  const validation = validateScript(script, { book });
  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
});

test("ScriptGenerator: Story Bible character preservation check", () => {
  const book = { title: "Ác Mộng Cầu Sinh" };
  const storyBible = {
    characters: [{ name: "Trần Dịch" }]
  };
  const validScript = {
    title: "[Review Truyện] Ác Mộng Cầu Sinh | Trạm Chữ",
    scenes: [
      { text: "Chào mừng các bạn đến với câu chuyện của Trần Dịch trong thế giới ác mộng vô cùng bí ẩn và tàn khốc.", visualPrompt: "art", visualKeyword: "Ác Mộng" },
      { text: "Bối cảnh sinh tồn bắt đầu từ căn nhà gỗ nhỏ nơi ranh giới sống chết mong manh từng giây phút.", visualPrompt: "art", visualKeyword: "Sinh Tồn" },
      { text: "Những hiểm nguy rình rập ngoài bóng tối khiến Trần Dịch phải căng mình chiến đấu từng giờ.", visualPrompt: "art", visualKeyword: "Hiểm Nguy" },
      { text: "Nghệ thuật xây dựng cốt truyện độc đáo lôi cuốn độc giả theo dõi không dứt từ chương đầu.", visualPrompt: "art", visualKeyword: "Đánh Giá" },
      { text: "Đón đọc toàn bộ bản dịch tại Trạm Chữ tram-chu.online để cùng Trần Dịch vượt qua nghịch cảnh.", visualPrompt: "art", visualKeyword: "Trạm Chữ" }
    ]
  };

  const validation = validateScript(validScript, { book, storyBible });
  assert.equal(validation.valid, true);
  assert.equal(validScript._warning, undefined);
});

