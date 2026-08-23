"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RANK_SCHOOLS,
  calculateRank,
  formatRankBadge,
  getReaderNickname,
  setReaderNickname,
  getStoredChaptersRead,
  incrementChaptersRead,
  safeRankBadgeClass,
  safeAvatarUrl,
  fetchLeaderboard,
  syncReaderLeaderboard
} = require("./reader-rank.js");

test("reader-rank: calculateRank returns correct level for cultivation school", () => {
  const rank0 = calculateRank(0, "cultivation");
  assert.equal(rank0.title, "Phàm Nhân");
  assert.equal(rank0.levelNumber, 1);

  const rank100 = calculateRank(100, "cultivation");
  assert.equal(rank100.title, "Luyện Khí");
  assert.equal(rank100.levelNumber, 2);

  const rank800 = calculateRank(800, "cultivation");
  assert.equal(rank800.title, "Trúc Cơ");
  assert.equal(rank800.levelNumber, 3);

  const rank20000 = calculateRank(20000, "cultivation");
  assert.equal(rank20000.title, "Hóa Thần");
  assert.equal(rank20000.levelNumber, 6);

  const rank400000 = calculateRank(400000, "cultivation");
  assert.equal(rank400000.title, "Độ Kiếp Tiên Tôn");
  assert.equal(rank400000.levelNumber, 10);
});

test("reader-rank: calculateRank supports scholarly and modern schools", () => {
  const scholarlyRank = calculateRank(100, "scholarly");
  assert.equal(scholarlyRank.title, "Tú Tài");

  const modernRank = calculateRank(300, "modern");
  assert.equal(modernRank.title, "Độc Giả Tập Sự");
});

test("reader-rank: formatRankBadge outputs valid badge span", () => {
  const html = formatRankBadge("Kim Đan", "rank-4");
  assert.ok(html.includes("Kim Đan"));
  assert.ok(html.includes("rank-4"));
});

test("reader-rank: rejects unsafe badge classes and avatar URLs", () => {
  assert.equal(safeRankBadgeClass('rank-4\" onmouseover="alert(1)'), "rank-1");
  assert.equal(safeAvatarUrl("javascript:alert(1)"), "");
  assert.equal(safeAvatarUrl("https://images.example/avatar.png"), "https://images.example/avatar.png");
  assert.doesNotMatch(formatRankBadge("</span><script>alert(1)</script>", "bad-class"), /<script>/);
});

test("reader-rank: authenticated writes use the user token, not the anon key", async () => {
  let authorization = "";
  let payload = null;
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    payload = JSON.parse(options.body)[0];
    return { ok: true };
  };
  try {
    const ok = await syncReaderLeaderboard({
      supabaseUrl: "https://project.supabase.co",
      supabaseKey: "anon-key",
      accessToken: "reader-jwt",
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        fullName: "Độc Giả Google",
        avatarUrl: "https://images.example/google-avatar.png"
      },
      force: true
    });
    assert.equal(ok, true);
    assert.equal(authorization, "Bearer reader-jwt");
    assert.equal(payload.display_name, "Độc Giả Google");
    assert.equal(payload.avatar_url, "https://images.example/google-avatar.png");
  } finally {
    global.fetch = originalFetch;
  }
});

test("reader-rank: nickname and chapters read storage", () => {
  const cleanName = setReaderNickname("Hàn Lão Ma");
  assert.equal(cleanName, "Hàn Lão Ma");

  const count = incrementChaptersRead();
  assert.ok(count >= 1);
});

test("reader-rank: fetchLeaderboard returns empty array gracefully when missing keys", async () => {
  const list = await fetchLeaderboard({ supabaseUrl: "", supabaseKey: "" });
  assert.deepEqual(list, []);
});
