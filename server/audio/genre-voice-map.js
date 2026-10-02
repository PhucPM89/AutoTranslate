"use strict";

/**
 * BẢNG CẤU HÌNH GIỌNG ĐỌC AI TOÀN HỆ THỐNG TRẠM CHỮ
 * 
 * Toàn bộ các thể loại truyện trên hệ thống đều sử dụng duy nhất chất giọng 
 * Nguyễn Ngọc Ngạn (thông qua mô hình VieNeu-TTS Voice Cloning).
 * Tất cả các giọng đọc khác đã được loại bỏ.
 */

const NGUYEN_NGOC_NGAN_VOICE = Object.freeze({
  genreName: "Toàn bộ thể loại",
  voiceName: "Nguyễn Ngọc Ngạn",
  engine: "nguyen-ngoc-ngan-ai",
  genreKey: "nguyen-ngoc-ngan",
  rate: "+0%",
  pitch: "+0Hz",
  description: "Giọng đọc trầm ấm, truyền cảm, lôi cuốn theo phong cách MC Nguyễn Ngọc Ngạn."
});

const GENRE_VOICE_CONFIG = {
  "linh-di": {
    ...NGUYEN_NGOC_NGAN_VOICE,
    genreName: "Linh dị / Kinh dị"
  },
  "tien-hiep": {
    ...NGUYEN_NGOC_NGAN_VOICE,
    genreName: "Tiên hiệp / Kiếm hiệp"
  },
  "mat-the": {
    ...NGUYEN_NGOC_NGAN_VOICE,
    genreName: "Mạt thế / Sinh tồn"
  },
  "trinh-tham": {
    ...NGUYEN_NGOC_NGAN_VOICE,
    genreName: "Trinh thám / Ly kỳ"
  },
  "do-thi": {
    ...NGUYEN_NGOC_NGAN_VOICE,
    genreName: "Đô thị / Ngôn tình"
  }
};

function resolveGenreVoice(genreStr = "", titleStr = "") {
  // Bỏ qua phân nhánh thể loại cũ, luôn trả về cấu hình giọng Nguyễn Ngọc Ngạn
  const key = String(genreStr || "").toLowerCase();
  if (GENRE_VOICE_CONFIG[key]) {
    return GENRE_VOICE_CONFIG[key];
  }
  return NGUYEN_NGOC_NGAN_VOICE;
}

module.exports = {
  NGUYEN_NGOC_NGAN_VOICE,
  GENRE_VOICE_CONFIG,
  resolveGenreVoice
};
