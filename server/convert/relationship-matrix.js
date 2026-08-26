"use strict";

/**
 * Dynamic Scene Classifier & Relationship Pronoun Matrix.
 * Analyzes text semantics to detect the current narrative scene
 * (Combat, Romance, Master-Disciple, Modern Urban, Court/Family)
 * and generates tailored pronoun constraints for high-fidelity translation.
 */

// Keyword indicators for narrative scenes
const SCENE_INDICATORS = {
  combat: [
    "杀", "死", "战", "剑", "拳", "掌", "轰", "斩", "斩杀", "怒吼", "冷笑", "狂妄", "受死",
    "找死", "狂暴", "灵力", "真元", "魔气", "破空", "爆裂", "碎裂", "重创", "喋血", "自寻死路",
    "给我破", "纳命来", "受死吧", "今日便是你的死期"
  ],
  romance: [
    "美眸", "柔情", "俏脸", "微红", "羞涩", "拥入怀中", "温存", "含情脉脉", "深情", "心跳",
    "娇躯", "轻抚", "吻", "夫君", "娘子", "爱慕", "相思", "倾心", "依偎", "脸颊绯红"
  ],
  master_disciple: [
    "师尊", "师傅", "师父", "徒儿", "弟子", "拜见", "跪拜", "传道", "解惑", "授业", "指点",
    "谨遵", "谨遵师命", "晚辈", "前辈", "老夫", "本座", "恩师", "开山祖师"
  ],
  modern_urban: [
    "手机", "电话", "微信", "电脑", "汽车", "开车", "咖啡", "酒吧", "警察", "公司", "总裁",
    "学校", "大学", "同学", "出租车", "医院", "医生", "警官", "钞票", "人民币", "美元"
  ],
  court_family: [
    "陛下", "微臣", "圣上", "皇上", "皇后", "贵妃", "太子", "王爷", "本王", "爱卿", "父皇",
    "母后", "钦此", "启奏", "谢主隆恩", "家主", "长老", "老太君", "族长"
  ]
};

const PRONOUN_GUIDANCE = {
  combat: {
    dialogueTone: "Đanh thép, dứt khoát, hào hùng, sát khí.",
    pronouns: [
      "Ngươi - Ta (đối đầu, giao chiến)",
      "Tiểu tử / Nghiệt súc / Lão tặc / Lão cẩu (khiêu khích, miệt thị)",
      "Bổn tọa / Bản tôn / Lão phu (kẻ mạnh tự xưng)"
    ]
  },
  romance: {
    dialogueTone: "Dịu dàng, tình cảm, tinh tế, mượt mà.",
    pronouns: [
      "Chàng - Thiếp / Huynh - Muội (tiểu thuyết cổ trang, tiên hiệp)",
      "Anh - Em / Cậu - Tớ (bối cảnh đô thị, hiện đại)",
      "Nàng / Hắn / Y (ngôi kể miêu tả tình cảm)"
    ]
  },
  master_disciple: {
    dialogueTone: "Tôn kính, trang nghiêm, mực thước.",
    pronouns: [
      "Sư tôn / Sư phụ - Đồ nhi / Đệ tử (xưng hô thầy trò)",
      "Tiền bối - Vãn bối (kính cẩn người đi trước)",
      "Vi sư / Lão phu (thầy tự xưng với trò)"
    ]
  },
  modern_urban: {
    dialogueTone: "Tự nhiên, chân thực, hiện đại, đời thường.",
    pronouns: [
      "Cậu - Tôi / Tớ, Anh - Em, Mày - Tao (tùy mức độ thân sơ)",
      "Ông - Tôi, Chú - Cháu, Bác - Cháu (người lớn tuổi)",
      "Tuyệt đối KHÔNG dùng 'ngươi - ta', 'huynh đệ' trong văn cảnh đô thị hiện đại"
    ]
  },
  court_family: {
    dialogueTone: "Uy nghiêm, lễ nghi, cung đình, gia tộc.",
    pronouns: [
      "Bệ hạ - Vi thần / Thần / Trẫm (vua tôi)",
      "Bổn vương / Bản cung - Ái khanh (vương gia, phi tần)",
      "Phụ thân - Hài nhi / Gia chủ - Trưởng lão (gia tộc)"
    ]
  }
};

/**
 * Classifies the dominant scene of a text block.
 * @param {string} text
 * @returns {string} One of 'combat' | 'romance' | 'master_disciple' | 'modern_urban' | 'court_family' | 'neutral'
 */
function classifyScene(text) {
  if (!text || typeof text !== "string") return "neutral";

  const scores = {
    combat: 0,
    romance: 0,
    master_disciple: 0,
    modern_urban: 0,
    court_family: 0
  };

  for (const [scene, keywords] of Object.entries(SCENE_INDICATORS)) {
    for (const kw of keywords) {
      let count = 0;
      let pos = 0;
      while ((pos = text.indexOf(kw, pos)) !== -1) {
        count++;
        pos += kw.length;
      }
      scores[scene] += count;
    }
  }

  let maxScene = "neutral";
  let maxScore = 0;

  for (const [scene, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxScene = scene;
    }
  }

  // Require at least a threshold score to classify beyond neutral
  return maxScore >= 2 ? maxScene : "neutral";
}

/**
 * Returns tailored pronoun and tone instructions for prompt injection.
 * @param {string} scene
 * @returns {string} Formatted prompt instruction section
 */
function getScenePronounInstruction(scene) {
  const guide = PRONOUN_GUIDANCE[scene];
  if (!guide) return "";

  return [
    `HƯỚNG DẪN XƯNG HÔ ĐỘNG CHO PHÂN CẢNH (${scene.toUpperCase()}):`,
    `  - Sắc thái hội thoại: ${guide.dialogueTone}`,
    ...guide.pronouns.map((p) => `  - ${p}`)
  ].join("\n");
}

module.exports = {
  classifyScene,
  getScenePronounInstruction,
  SCENE_INDICATORS,
  PRONOUN_GUIDANCE
};
