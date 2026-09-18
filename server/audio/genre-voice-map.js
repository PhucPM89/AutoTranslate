"use strict";

/**
 * BẢNG ÁNH XẠ GIỌNG ĐỌC AI THEO THỂ LOẠI TRUYỆN TRÊN TRẠM CHỮ
 * 
 * Tối ưu hóa ngữ điệu, cao độ và tốc độ phù hợp cho từng bối cảnh câu chuyện:
 * - Linh dị / Kinh dị / Trinh thám ma mị: Giọng chú Nguyễn Ngọc Ngạn / Hưng Thịnh (trầm, rùng rợn, ngắt nghỉ sâu)
 * - Kiếm hiệp / Tiên hiệp / Huyền huyễn: Giọng Thành Đạt / Tuấn Ngọc (dõng dạc, hào sảng, uy lực)
 * - Mạt thế / Sinh tồn / Khoa huyễn: Giọng Mạnh Dũng / Phát Tài (khẩn trương, kịch tính, sinh tử)
 * - Đô thị / Ngôn tình / Đời thường: Giọng Mai Linh / Diễm Trinh (truyền cảm, ấm áp, sâu lắng)
 */

const GENRE_VOICE_CONFIG = {
  "linh-di": {
    genreName: "Linh dị / Kinh dị",
    voiceName: "Nguyễn Ngọc Ngạn (Kể chuyện ma, rùng rợn, ngắt nghỉ)",
    edgeVoice: "vi-VN-NamMinhNeural",
    rate: "-6%",
    pitch: "-2Hz",
    description: "Giọng nam trầm ấm, tiết tấu chậm rãi, khoảng lặng dài tạo cảm giác rùng rợn nghẹt thở."
  },
  "tien-hiep": {
    genreName: "Tiên hiệp / Kiếm hiệp",
    voiceName: "Thành Đạt / Tuấn Ngọc (Hào sảng, khí phách phim chưởng)",
    edgeVoice: "vi-VN-NamMinhNeural",
    rate: "+2%",
    pitch: "+1Hz",
    description: "Dõng dạc, uy lực, hào khí chưởng phong và tranh đấu sinh tử."
  },
  "mat-the": {
    genreName: "Mạt thế / Sinh tồn",
    voiceName: "Mạnh Dũng (Khẩn trương, kịch tính, đấu tranh sinh tồn)",
    edgeVoice: "vi-VN-NamMinhNeural",
    rate: "+0%",
    pitch: "-1Hz",
    description: "Dồn dập, căng thẳng, thể hiện bối cảnh thế giới đổ nát và hiểm nguy rình rập."
  },
  "trinh-tham": {
    genreName: "Trinh thám / Ly kỳ",
    voiceName: "Hưng Thịnh (Trầm tĩnh, bí ẩn, phá án suy luận)",
    edgeVoice: "vi-VN-NamMinhNeural",
    rate: "-3%",
    pitch: "-1Hz",
    description: "Điềm đạm, bí ẩn, nhấn nhá suy luận sắc sảo từng tình tiết vụ án."
  },
  "do-thi": {
    genreName: "Đô thị / Ngôn tình",
    voiceName: "Mai Linh / Diễm Trinh (Truyền cảm, dịu dàng, tự nhiên)",
    edgeVoice: "vi-VN-HoaiMyNeural",
    rate: "-4%",
    pitch: "+0Hz",
    description: "Giọng nữ chuẩn phát thanh viên, ngọt ngào, tâm lý xã hội sâu lắng."
  }
};

function resolveGenreVoice(genreStr = "", titleStr = "") {
  const text = `${genreStr} ${titleStr}`.toLowerCase();
  
  if (/quỷ|ma|thi thể|kinh dị|linh dị|mộ|cấm kỵ|âm phủ|hoàng hôn|luật lệnh/.test(text)) {
    return GENRE_VOICE_CONFIG["linh-di"];
  }
  if (/tiên hiệp|tu tiên|kiếm hiệp|trường sinh|huyền huyễn/.test(text)) {
    return GENRE_VOICE_CONFIG["tien-hiep"];
  }
  if (/mạt thế|tận thế|sinh tồn|cầu sinh|tam thể/.test(text)) {
    return GENRE_VOICE_CONFIG["mat-the"];
  }
  if (/trinh thám|tử vong|lừa thần|nguyện vọng|sát thủ/.test(text)) {
    return GENRE_VOICE_CONFIG["trinh-tham"];
  }
  
  return GENRE_VOICE_CONFIG["do-thi"];
}

module.exports = {
  GENRE_VOICE_CONFIG,
  resolveGenreVoice
};
