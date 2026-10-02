"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { chapterCounts, prioritizeBooks } = require("./enqueue-audio-books");

test("chỉ xếp các bộ đã dịch full vào hàng đợi và ưu tiên Ranh Giới Hoàng Hôn trước tiên", () => {
  const books = [
    { id: "partial", title: "Thập Nhật Chung Yên", totalChapters: 1508, translatedChapters: 813 },
    { id: "fanqie-7027679289931729920", title: "Sinh Tồn Kinh Hoàng", totalChapters: 1956, translatedChapters: 1956 },
    { id: "qidian-1036575193", title: "Ranh Giới Hoàng Hôn", totalChapters: 885, translatedChapters: 885 },
    { id: "fanqie-7379865527998483480", title: "Ban Ngày Bán Quần Áo", totalChapters: 1322, translatedChapters: 1322 }
  ];

  // Chỉ lấy sách full, Ranh Giới Hoàng Hôn đứng đầu, theo sau là Sinh Tồn Kinh Hoàng và Ban Ngày Bán Quần Áo
  assert.deepEqual(prioritizeBooks(books).map((book) => book.id), [
    "qidian-1036575193",
    "fanqie-7027679289931729920",
    "fanqie-7379865527998483480"
  ]);
  assert.equal(chapterCounts(books[2]).full, true);
  assert.equal(chapterCounts(books[0]).full, false);
});

test("loại sách chưa dịch full hoặc chưa có chương dịch khỏi hàng đợi", () => {
  const books = [
    { id: "empty", totalChapters: 10, translatedChapters: 0 },
    { id: "partial", totalChapters: 10, translatedChapters: 5 },
    { id: "full", totalChapters: 10, translatedChapters: 10 }
  ];
  assert.deepEqual(prioritizeBooks(books).map((book) => book.id), ["full"]);
});
