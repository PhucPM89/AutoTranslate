"use strict";

const { loadBase } = require("./convert/index");

let hanvietMap = null;
function getHanvietMap() {
  if (!hanvietMap) {
    try {
      const { hanvietChars } = loadBase();
      hanvietMap = hanvietChars || {};
    } catch {
      hanvietMap = {};
    }
  }
  return hanvietMap;
}

function buildDirectPrompt(text, context = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Empty translation source");
  const previousContext = String(context.previousContext || "").trim().slice(-2500);
  const contextBlock = previousContext
    ? `\n\nNgữ cảnh bản dịch chương trước chỉ để giữ nhất quán tên gọi, ngôi kể và xưng hô; không được đưa nội dung này vào kết quả:\n${previousContext}\n\n=== CHƯƠNG CẦN DỊCH ===`
    : "";
  return [
    "Bạn là dịch giả văn học Trung - Việt chuyên nghiệp.",
    "Dịch toàn bộ nguyên tác sang văn xuôi tiếng Việt tự nhiên, chính xác và dễ đọc.",
    "Yêu cầu bắt buộc:",
    "- Bảo toàn đầy đủ sự kiện, chủ thể, tân ngữ, phủ định, số lượng, quan hệ nhân quả và sắc thái; không thêm, bớt, suy diễn hay sửa logic của tác giả.",
    "- Dựa vào ngữ cảnh để chọn đúng nghĩa của từ, thành ngữ và đại từ; giữ nhất quán tên riêng, giới tính, ngôi kể và cách xưng hô.",
    "- Viết theo cú pháp tiếng Việt tự nhiên, không bám trật tự từ tiếng Trung và không giữ các cụm Hán-Việt khó hiểu khi có cách diễn đạt tiếng Việt rõ nghĩa.",
    "- Giữ ranh giới đoạn và lời thoại tương ứng với nguyên tác. Không tóm tắt, không giải thích, không dùng Markdown hay tiêu đề dẫn nhập.",
    "- Nếu câu gốc mơ hồ, giữ cách dịch trung thành nhất với chữ gốc; không tự hợp lý hóa bằng cách thêm thông tin ngoài nguyên tác.",
    "- Không để lại chữ Hán trong kết quả, trừ khi đó là ký hiệu bắt buộc không thể chuyển ngữ.",
    "Trước khi trả lời, tự đối chiếu lần cuối để chắc chắn không thiếu câu và không đảo nghĩa.",
    "Chỉ trả về toàn văn bản dịch tiếng Việt.",
    contextBlock,
    "\n<NGUYEN_TAC_TIENG_TRUNG>",
    text,
    "</NGUYEN_TAC_TIENG_TRUNG>"
  ].filter(Boolean).join("\n");
}

function getDirectAnswer(result) {
  const text = result.rawText ?? result.text;
  if (typeof text !== "string" || !text.trim()) throw new Error("AI returned an empty translation");
  return cleanDirectAnswer(text);
}

function cleanDirectAnswer(value) {
  let text = String(value || "").replace(/\r\n?/g, "\n").trim();

  // Remove transport/UI wrappers only at the response boundary.
  text = text
    .replace(/^\s*(?:Gemini said|Here is the translation|Dưới đây là bản dịch|Bản dịch tiếng Việt)\s*:?\s*/iu, "")
    .replace(/^\s*```(?:text|markdown|plaintext)?\s*\n?/iu, "")
    .replace(/\n?\s*```\s*$/u, "")
    .replace(/^\s*(?:text|markdown|plaintext)\s*\n(?=\S)/iu, "")
    .replace(/\s*[（\(][\p{Script=Han}\s]+[）\)]/gu, "")
    .trim();

  // Chuyển đổi các chữ Hán đơn lẻ vô tình còn sót sang âm Hán-Việt chuẩn
  const hanChars = getHanvietMap();
  text = text.replace(/\p{Script=Han}/gu, (ch) => {
    const hv = hanChars[ch]?.hv;
    return hv ? ` ${hv} ` : ch;
  });

  // Dọn dẹp khoảng trắng dư thừa nhưng bảo toàn xuống dòng
  text = text.replace(/[^\S\r\n]{2,}/g, " ").trim();

  if (!text) throw new Error("AI returned an empty translation");
  return text;
}

module.exports = { buildDirectPrompt, getDirectAnswer, cleanDirectAnswer };
