"use strict";

const RANK_EXP_KEY = "epubTranslator.readerExp";
const RANK_SCHOOL_KEY = "epubTranslator.rankSchool";

const RANK_SCHOOLS = {
  cultivation: {
    id: "cultivation",
    name: "Tu Tiên Cảnh Giới",
    icon: "🔮",
    levels: [
      { minExp: 0, title: "Phàm Nhân", badgeClass: "rank-1" },
      { minExp: 50, title: "Luyện Khí", badgeClass: "rank-2" },
      { minExp: 200, title: "Trúc Cơ", badgeClass: "rank-3" },
      { minExp: 600, title: "Kim Đan", badgeClass: "rank-4" },
      { minExp: 1800, title: "Nguyên Anh", badgeClass: "rank-5" },
      { minExp: 5000, title: "Hóa Thần", badgeClass: "rank-6" },
      { minExp: 15000, title: "Tiên Tôn", badgeClass: "rank-7" }
    ]
  },
  scholarly: {
    id: "scholarly",
    name: "Khoa Bảng Học Thức",
    icon: "📜",
    levels: [
      { minExp: 0, title: "Đồng Sinh", badgeClass: "rank-1" },
      { minExp: 50, title: "Tú Tài", badgeClass: "rank-2" },
      { minExp: 200, title: "Cử Nhân", badgeClass: "rank-3" },
      { minExp: 600, title: "Thám Hoa", badgeClass: "rank-4" },
      { minExp: 1800, title: "Bảng Nhãn", badgeClass: "rank-5" },
      { minExp: 5000, title: "Trạng Nguyên", badgeClass: "rank-6" },
      { minExp: 15000, title: "Đại Học Sĩ", badgeClass: "rank-7" }
    ]
  },
  modern: {
    id: "modern",
    name: "Cày Truyện Hiện Đại",
    icon: "⚡",
    levels: [
      { minExp: 0, title: "Người Qua Đường", badgeClass: "rank-1" },
      { minExp: 50, title: "Độc Giả Mới", badgeClass: "rank-2" },
      { minExp: 200, title: "Mọt Sách", badgeClass: "rank-3" },
      { minExp: 600, title: "Đọc Xuyên Đêm", badgeClass: "rank-4" },
      { minExp: 1800, title: "Cao Thủ Cày Truyện", badgeClass: "rank-5" },
      { minExp: 5000, title: "Trùm Đọc Truyện", badgeClass: "rank-6" },
      { minExp: 15000, title: "Thần Thoại Cày Đêm", badgeClass: "rank-7" }
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
  return getReaderProfile();
}

function getRankSchools() {
  return Object.values(RANK_SCHOOLS);
}

function formatRankBadge(title, badgeClass = "rank-1") {
  return `<span class="reader-rank-badge ${badgeClass}">[${title}]</span>`;
}

module.exports = {
  RANK_SCHOOLS,
  calculateRank,
  getReaderProfile,
  addReaderExp,
  setRankSchool,
  getRankSchools,
  formatRankBadge
};
