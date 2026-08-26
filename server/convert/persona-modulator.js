"use strict";

/**
 * Character Persona & Voice Modulator.
 * Identifies character archetypes from dialogue tags and context,
 * and generates specific prompt instructions to maintain distinct,
 * vibrant vocal personas for each character type.
 */

const PERSONA_PATTERNS = {
  elder_ancestor: {
    name: "Lão Quái Vật / Tông Sư / Tiền Bối",
    keywords: ["老夫", "本座", "本尊", "老祖", "太上长老", "老朽", "本座面前", "黄口小儿", "无知小儿"],
    toneGuide: "Uy nghiêm, thâm trầm, ngạo thị quần hùng, xưng 'lão phu / bổn tọa', gọi người trẻ là 'tiểu tử / tiểu bối / vô tri tiểu nhi'."
  },
  sword_cultivator: {
    name: "Kiếm Tu / Lãnh Khốc / Sát Thần",
    keywords: ["拔剑", "一剑", "剑客", "冷冷道", "面无表情", "淡漠道", "死！", "接我一剑"],
    toneGuide: "Lời thoại ngắn gọn, sắc lạnh như sương tuyết, dứt khoát, không nói thừa, toát lên sự kiêu hãnh của kiếm giả."
  },
  enchantress: {
    name: "Ma Nữ / Yêu Nữ / Mị Hoặc",
    keywords: ["娇笑", "吃吃一笑", "咯咯", "美眸流转", "奴家", "好哥哥", "小哥哥", "死相", "冤家"],
    toneGuide: "Lả lơi, trêu chọc, ngọt ngào ma mị nhưng đầy nguy hiểm, dùng các thán từ uyển chuyển ('nha~', 'sao~', 'chứ~')."
  },
  arrogant_noble: {
    name: "Thế Gia Tử Đệ / Thánh Tử Ngạo Mạn",
    keywords: ["凭你也配", "不知死活", "给脸不要脸", "本少", "本公子", "蝼蚁", "废物", "自寻死路"],
    toneGuide: "Ngạo mạn, cao cao tại thượng, xem thường đối thủ ('Phế vật như ngươi cũng xứng?', 'Chán sống rồi sao?')."
  }
};

/**
 * Detects matching personas present in the source text.
 * @param {string} text
 * @returns {Array<{ type: string, name: string, toneGuide: string }>}
 */
function detectPersonas(text) {
  if (!text || typeof text !== "string") return [];

  const matched = [];
  for (const [type, data] of Object.entries(PERSONA_PATTERNS)) {
    const hits = data.keywords.filter((kw) => text.includes(kw));
    if (hits.length > 0) {
      matched.push({
        type,
        name: data.name,
        toneGuide: data.toneGuide,
        hitCount: hits.length
      });
    }
  }

  return matched;
}

/**
 * Returns formatted persona guidance for prompt injection.
 * @param {Array<{ name: string, toneGuide: string }>} personas
 * @returns {string}
 */
function formatPersonaPrompt(personas = []) {
  if (!personas || personas.length === 0) return "";

  return [
    "HƯỚNG DẪN GIỌNG ĐIỆU NHÂN VẬT ĐẶC TRƯNG:",
    ...personas.map((p) => `  - [${p.name}]: ${p.toneGuide}`)
  ].join("\n");
}

module.exports = {
  detectPersonas,
  formatPersonaPrompt,
  PERSONA_PATTERNS
};
