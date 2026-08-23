"use strict";

const RANK_EXP_KEY = "epubTranslator.readerExp";
const RANK_SCHOOL_KEY = "epubTranslator.rankSchool";
const RANK_NICKNAME_KEY = "epubTranslator.readerNickname";
const RANK_CHAPTERS_COUNT_KEY = "epubTranslator.chaptersReadCount";
const RANK_READER_ID_KEY = "epubTranslator.readerUid";

const RANK_SCHOOLS = {
  cultivation: {
    id: "cultivation",
    name: "Tu Tiên Cảnh Giới",
    icon: "🔮",
    levels: [
      { minExp: 0, title: "Phàm Nhân", badgeClass: "rank-1" },
      { minExp: 100, title: "Luyện Khí", badgeClass: "rank-2" },
      { minExp: 500, title: "Trúc Cơ", badgeClass: "rank-3" },
      { minExp: 1500, title: "Kim Đan", badgeClass: "rank-4" },
      { minExp: 4000, title: "Nguyên Anh", badgeClass: "rank-5" },
      { minExp: 10000, title: "Hóa Thần", badgeClass: "rank-6" },
      { minExp: 25000, title: "Luyện Hư", badgeClass: "rank-7" },
      { minExp: 60000, title: "Hợp Thể", badgeClass: "rank-7" },
      { minExp: 150000, title: "Đại Thừa", badgeClass: "rank-7" },
      { minExp: 350000, title: "Độ Kiếp Tiên Tôn", badgeClass: "rank-7" }
    ]
  },
  scholarly: {
    id: "scholarly",
    name: "Khoa Bảng Học Thức",
    icon: "📜",
    levels: [
      { minExp: 0, title: "Đồng Sinh", badgeClass: "rank-1" },
      { minExp: 100, title: "Tú Tài", badgeClass: "rank-2" },
      { minExp: 500, title: "Cử Nhân", badgeClass: "rank-3" },
      { minExp: 1500, title: "Cống Sĩ", badgeClass: "rank-4" },
      { minExp: 4000, title: "Tiến Sĩ", badgeClass: "rank-5" },
      { minExp: 10000, title: "Thám Hoa", badgeClass: "rank-6" },
      { minExp: 25000, title: "Bảng Nhãn", badgeClass: "rank-7" },
      { minExp: 60000, title: "Trạng Nguyên", badgeClass: "rank-7" },
      { minExp: 150000, title: "Hàn Lâm Học Sĩ", badgeClass: "rank-7" },
      { minExp: 350000, title: "Văn Thánh", badgeClass: "rank-7" }
    ]
  },
  modern: {
    id: "modern",
    name: "Cày Truyện Hiện Đại",
    icon: "⚡",
    levels: [
      { minExp: 0, title: "Người Qua Đường", badgeClass: "rank-1" },
      { minExp: 100, title: "Độc Giả Tập Sự", badgeClass: "rank-2" },
      { minExp: 500, title: "Mọt Sách Trẻ", badgeClass: "rank-3" },
      { minExp: 1500, title: "Cú Đêm Luyện Chữ", badgeClass: "rank-4" },
      { minExp: 4000, title: "Đọc Xuyên Màn Đêm", badgeClass: "rank-5" },
      { minExp: 10000, title: "Chiến Thần Đọc Truyện", badgeClass: "rank-6" },
      { minExp: 25000, title: "Đại Lão Thư Viện", badgeClass: "rank-7" },
      { minExp: 60000, title: "Trùm Cày Truyện", badgeClass: "rank-7" },
      { minExp: 150000, title: "Huyền Thoại Bất Bại", badgeClass: "rank-7" },
      { minExp: 350000, title: "Thần Thoại Độc Giả", badgeClass: "rank-7" }
    ]
  }
};

function getStoredExp() {
  if (typeof localStorage === "undefined") return 0;
  return Math.max(0, Number(localStorage.getItem(RANK_EXP_KEY)) || 0);
}

function getStoredSchool() {
  if (typeof localStorage === "undefined") return "cultivation";
  const school = localStorage.getItem(RANK_SCHOOL_KEY);
  return RANK_SCHOOLS[school] ? school : "cultivation";
}

function getReaderId() {
  if (typeof localStorage === "undefined") return "anon-" + Date.now();
  let id = localStorage.getItem(RANK_READER_ID_KEY);
  if (!id) {
    id = "dao-huu-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(RANK_READER_ID_KEY, id);
  }
  return id;
}

function getReaderNickname() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(RANK_NICKNAME_KEY) || localStorage.getItem("epubTranslator.commentAuthor") || "";
}

function setReaderNickname(name) {
  const clean = String(name || "").trim().slice(0, 24);
  if (typeof localStorage !== "undefined") {
    if (clean) {
      localStorage.setItem(RANK_NICKNAME_KEY, clean);
      localStorage.setItem("epubTranslator.commentAuthor", clean);
    } else {
      localStorage.removeItem(RANK_NICKNAME_KEY);
      localStorage.removeItem("epubTranslator.commentAuthor");
    }
  }
  invalidateLeaderboardCache();
  return clean;
}

function getStoredChaptersRead() {
  if (typeof localStorage === "undefined") return 0;
  return Math.max(0, Number(localStorage.getItem(RANK_CHAPTERS_COUNT_KEY)) || 0);
}

function incrementChaptersRead() {
  if (typeof localStorage === "undefined") return 1;
  const next = getStoredChaptersRead() + 1;
  localStorage.setItem(RANK_CHAPTERS_COUNT_KEY, String(next));
  return next;
}

function calculateRank(exp, schoolId = "cultivation") {
  const school = RANK_SCHOOLS[schoolId] || RANK_SCHOOLS.cultivation;
  const levels = school.levels;
  
  let currentLevelIdx = 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (exp >= levels[i].minExp) {
      currentLevelIdx = i;
      break;
    }
  }

  const currentLevel = levels[currentLevelIdx];
  const nextLevel = levels[currentLevelIdx + 1] || null;

  let progressPct = 100;
  if (nextLevel) {
    const range = nextLevel.minExp - currentLevel.minExp;
    const earned = exp - currentLevel.minExp;
    progressPct = Math.min(100, Math.max(0, Math.round((earned / range) * 100)));
  }

  return {
    exp,
    school: school.id,
    schoolName: school.name,
    schoolIcon: school.icon,
    levelNumber: currentLevelIdx + 1,
    title: currentLevel.title,
    badgeClass: currentLevel.badgeClass,
    nextTitle: nextLevel ? nextLevel.title : null,
    nextMinExp: nextLevel ? nextLevel.minExp : null,
    progressPct
  };
}

function getReaderProfile() {
  const exp = getStoredExp();
  const school = getStoredSchool();
  return calculateRank(exp, school);
}

function addReaderExp(amount, reason = "") {
  if (typeof localStorage === "undefined") return getReaderProfile();
  const currentExp = getStoredExp();
  const oldProfile = calculateRank(currentExp, getStoredSchool());
  
  const newExp = currentExp + Math.max(0, Number(amount) || 0);
  localStorage.setItem(RANK_EXP_KEY, String(newExp));
  
  const newProfile = calculateRank(newExp, getStoredSchool());
  const leveledUp = newProfile.levelNumber > oldProfile.levelNumber;

  return {
    ...newProfile,
    leveledUp,
    oldTitle: oldProfile.title
  };
}

function setRankSchool(schoolId) {
  if (!RANK_SCHOOLS[schoolId]) return getReaderProfile();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(RANK_SCHOOL_KEY, schoolId);
  }
  invalidateLeaderboardCache();
  return getReaderProfile();
}

function getRankSchools() {
  return Object.values(RANK_SCHOOLS);
}

function formatRankBadge(title, badgeClass = "rank-1") {
  return `<span class="reader-rank-badge ${safeRankBadgeClass(badgeClass)}">[${escapeHtml(title)}]</span>`;
}

function safeRankBadgeClass(value) {
  const candidate = String(value || "");
  return /^rank-(?:[1-9]|10)$/.test(candidate) ? candidate : "rank-1";
}

function safeAvatarUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.href.length <= 1000 ? url.href : "";
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ------------------------------------------------------------- LEADERBOARD
let leaderboardCache = null;
let leaderboardCacheTime = 0;
const LEADERBOARD_CACHE_TTL = 30000; // 30s cache

function invalidateLeaderboardCache() {
  leaderboardCache = null;
  leaderboardCacheTime = 0;
}

async function fetchLeaderboard({ supabaseUrl, supabaseKey, school = "all", limit = 20 } = {}) {
  if (!supabaseUrl || !supabaseKey) return [];
  const now = Date.now();
  const cacheKey = `${school}:${limit}`;
  
  if (leaderboardCache && leaderboardCache[cacheKey] && (now - leaderboardCacheTime < LEADERBOARD_CACHE_TTL)) {
    return leaderboardCache[cacheKey];
  }

  try {
    let query = `${supabaseUrl}/rest/v1/reader_leaderboard?select=id,display_name,school,exp,chapters_read,level_title,badge_class,avatar_url,updated_at&order=exp.desc,updated_at.desc&limit=${limit}`;
    if (school && school !== "all") {
      query += `&school=eq.${encodeURIComponent(school)}`;
    }
    const res = await fetch(query, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    });
    if (!res.ok) return [];
    const rows = (await res.json().catch(() => [])) || [];
    if (!leaderboardCache) leaderboardCache = {};
    leaderboardCache[cacheKey] = rows;
    leaderboardCacheTime = now;
    return rows;
  } catch {
    return [];
  }
}

let lastSyncTime = 0;
async function syncReaderLeaderboard({ supabaseUrl, supabaseKey, accessToken = "", user = null, force = false } = {}) {
  if (!supabaseUrl || !supabaseKey || !accessToken || !user?.id) return false;
  const now = Date.now();
  if (!force && now - lastSyncTime < 10000) return false; // Throttled 10s

  const profile = getReaderProfile();
  const id = user?.id || getReaderId();
  const nickname = getReaderNickname();
  const displayName = nickname || user?.fullName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Ẩn danh đạo hữu";
  const avatarUrl = user?.avatarUrl || user?.user_metadata?.avatar_url || "";
  const chaptersRead = getStoredChaptersRead();

  const payload = {
    id,
    display_name: displayName,
    school: profile.school,
    exp: profile.exp,
    chapters_read: chaptersRead,
    level_title: profile.title,
    badge_class: profile.badgeClass,
    avatar_url: avatarUrl || null,
    updated_at: new Date().toISOString()
  };

  try {
    lastSyncTime = now;
    invalidateLeaderboardCache();
    const res = await fetch(`${supabaseUrl}/rest/v1/reader_leaderboard?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify([payload]),
      keepalive: true
    });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = {
  RANK_SCHOOLS,
  calculateRank,
  getReaderProfile,
  addReaderExp,
  setRankSchool,
  getRankSchools,
  formatRankBadge,
  getReaderId,
  getReaderNickname,
  setReaderNickname,
  getStoredChaptersRead,
  incrementChaptersRead,
  safeRankBadgeClass,
  safeAvatarUrl,
  fetchLeaderboard,
  syncReaderLeaderboard,
  invalidateLeaderboardCache
};
