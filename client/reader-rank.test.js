"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RANK_SCHOOLS,
  calculateRank,
  formatRankBadge
} = require("./reader-rank.js");

test("reader-rank: calculateRank returns correct level for cultivation school", () => {
  const rank0 = calculateRank(0, "cultivation");
  assert.equal(rank0.title, "Phàm Nhân");
  assert.equal(rank0.levelNumber, 1);

  const rank100 = calculateRank(100, "cultivation");
  assert.equal(rank100.title, "Luyện Khí");
  assert.equal(rank100.levelNumber, 2);

  const rank800 = calculateRank(800, "cultivation");
  assert.equal(rank800.title, "Kim Đan");
  assert.equal(rank800.levelNumber, 4);

  const rank20000 = calculateRank(20000, "cultivation");
  assert.equal(rank20000.title, "Tiên Tôn");
  assert.equal(rank20000.levelNumber, 7);
});

test("reader-rank: calculateRank supports scholarly and modern schools", () => {
  const scholarlyRank = calculateRank(100, "scholarly");
  assert.equal(scholarlyRank.title, "Tú Tài");

  const modernRank = calculateRank(300, "modern");
  assert.equal(modernRank.title, "Mọt Sách");
});

test("reader-rank: formatRankBadge outputs valid badge span", () => {
  const html = formatRankBadge("Kim Đan", "rank-4");
  assert.ok(html.includes("Kim Đan"));
  assert.ok(html.includes("rank-4"));
});
