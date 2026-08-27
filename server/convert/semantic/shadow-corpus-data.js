"use strict";

/**
 * Real-World Shadow Evaluation Corpus (Phase R3-0)
 * 
 * Comprehensive 12-Genre Typological Corpus:
 * 1. NARRATIVE_EXPOSITION    — World history, sect origins, realm hierarchy
 * 2. DIALOGUE                — Master/disciple, court address, peer banter
 * 3. INNER_THOUGHT           — Explicit cognition, covert schemes, suspicion
 * 4. COMBAT                  — Sword intent, martial arts, domain clashes
 * 5. CULTIVATION             — Alchemy, breakthrough, tribulation, heart demon
 * 6. ROMANCE                 — Maiden beauty, classical attire, reserved affection
 * 7. HORROR                  — Supernatural horror, necropolis, eldritch dread
 * 8. POLITICS_COURT          — Palace intrigue, high treason, imperial edicts
 * 9. HUMOR_BANTER            — Colloquial sarcasm, lively retorts
 * 10. DESCRIPTION            — Tea ceremony, zither music, landscapes
 * 11. MIXED_MULTI_DOMAIN     — Blended combat + musical, beauty + horror, title + conspiracy
 * 12. RECOLLECTION_FLASHBACK — Experiential past, memories of ancient eras
 */

const SHADOW_EVALUATION_CORPUS = Object.freeze([
  // =========================================================================
  // 1. NARRATIVE_EXPOSITION
  // =========================================================================
  {
    id: "CORPUS_EXP_01",
    category: "NARRATIVE_EXPOSITION",
    sourceZh: "青云宗立宗三千年，底蕴深厚，统御八百里山川。",
    domain: "XIANXIA",
    expectedAtoms: [
      { type: "SUBJECT", text: "青云宗" },
      { type: "QUANTITY", value: "三千年" },
      { type: "ATTRIBUTE", text: "底蕴深厚" },
      { type: "QUANTITY", value: "八百里" }
    ],
    goldAnnotation: {
      entities: ["Thanh Vân Tông"],
      pov: "THIRD_PERSON_OMNISCIENT",
      emotion: "SOLEMN",
      acceptableRealizationRange: "Thanh Vân Tông lập tông ba ngàn năm, nội hàm thâm sâu, thống ngự tám trăm dặm núi non."
    }
  },
  {
    id: "CORPUS_EXP_02",
    category: "NARRATIVE_EXPOSITION",
    sourceZh: "宗门覆灭，昔日辉煌化为乌有，众人悲痛欲绝。",
    domain: "DRAMATIC_CLIMAX",
    expectedAtoms: [
      { type: "EVENT", text: "宗门覆灭" },
      { type: "AFFECT", text: "悲痛欲绝" }
    ],
    goldAnnotation: {
      entities: ["Tông môn"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "SORROW",
      acceptableRealizationRange: "Tông môn hoàn toàn bị hủy diệt, vinh quang ngày xưa tan thành mây khói, mọi người đau đớn đến cực điểm."
    }
  },

  // =========================================================================
  // 2. DIALOGUE
  // =========================================================================
  {
    id: "CORPUS_DLG_01",
    category: "DIALOGUE",
    sourceZh: "师尊看着弟子，沉声道：“此去凶险，切记不可鲁莽。”",
    domain: "TITLE_HIERARCHY",
    expectedAtoms: [
      { type: "SPEAKER", text: "师尊" },
      { type: "LISTENER", text: "弟子" },
      { type: "NEGATION", text: "不可" }
    ],
    goldAnnotation: {
      entities: ["Sư tôn", "Đệ tử"],
      pov: "OBJECTIVE",
      emotion: "SOLEMN",
      acceptableRealizationRange: "Sư tôn nhìn đệ tử, trầm giọng nói: \"Chuyến đi này hung hiểm, hãy nhớ kỹ không được lỗ mãng.\""
    }
  },
  {
    id: "CORPUS_DLG_02",
    category: "DIALOGUE",
    sourceZh: "掌门师兄笑道：“师弟何必如此客气，请入内叙旧。”",
    domain: "TITLE_HIERARCHY",
    expectedAtoms: [
      { type: "SPEAKER", text: "掌门师兄" },
      { type: "LISTENER", text: "师弟" },
      { type: "ACTION", text: "叙旧" }
    ],
    goldAnnotation: {
      entities: ["Chưởng môn sư huynh", "Sư đệ"],
      pov: "OBJECTIVE",
      emotion: "AMUSEMENT",
      acceptableRealizationRange: "Chưởng môn sư huynh mỉm cười nói: \"Sư đệ cần gì phải khách khí như vậy, xin mời vào trong hàn huyên.\""
    }
  },

  // =========================================================================
  // 3. INNER_THOUGHT
  // =========================================================================
  {
    id: "CORPUS_THOUGHT_01",
    category: "INNER_THOUGHT",
    sourceZh: "他表面不动声色，心中暗道：“此人绝非寻常修士，定有后手。”",
    domain: "MONOLOGUE_PSYCHOLOGY",
    expectedAtoms: [
      { type: "COGNITION", kind: "EXPLICIT_THOUGHT" },
      { type: "NEGATION", text: "绝非" }
    ],
    goldAnnotation: {
      entities: ["Hắn", "Kẻ này"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "SUSPICION",
      acceptableRealizationRange: "Hắn bên ngoài không hề biến sắc, trong lòng thầm nghĩ: \"Người này tuyệt đối không phải tu sĩ tầm thường, nhất định còn nước cờ sau.\""
    }
  },

  // =========================================================================
  // 4. COMBAT
  // =========================================================================
  {
    id: "CORPUS_CMB_01",
    category: "COMBAT",
    sourceZh: "他拔出长剑，剑气纵横，一剑斩出！",
    domain: "SWORD_DAO",
    expectedAtoms: [
      { type: "SUBJECT", text: "他" },
      { type: "ACTION", text: "拔出长剑" },
      { type: "ACTION", text: "一剑斩出" }
    ],
    goldAnnotation: {
      entities: ["Hắn", "Trường kiếm"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "RESOLUTE",
      acceptableRealizationRange: "Hắn rút trường kiếm ra, kiếm khí tung hoành, một kiếm chém ra!"
    }
  },

  // =========================================================================
  // 5. CULTIVATION
  // =========================================================================
  {
    id: "CORPUS_CUL_01",
    category: "CULTIVATION",
    sourceZh: "丹炉之中，清香四溢，九转灵丹已然大成。",
    domain: "ALCHEMY",
    expectedAtoms: [
      { type: "OBJECT", text: "丹炉" },
      { type: "TEMPORAL", text: "已然" },
      { type: "OBJECT", text: "九转灵丹" }
    ],
    goldAnnotation: {
      entities: ["Đan lô", "Cửu chuyển linh đan"],
      pov: "THIRD_PERSON_OMNISCIENT",
      emotion: "JOY",
      acceptableRealizationRange: "Bên trong đan lô, thanh hương bốn phía ngào ngạt, cửu chuyển linh đan đã sớm đại thành."
    }
  },

  // =========================================================================
  // 6. ROMANCE & BEAUTY
  // =========================================================================
  {
    id: "CORPUS_ROM_01",
    category: "ROMANCE",
    sourceZh: "少女白衣胜雪，青丝如绢，眼若秋水。",
    domain: "COURTLY_BEAUTY",
    expectedAtoms: [
      { type: "SUBJECT", text: "少女" },
      { type: "ATTRIBUTE", text: "白衣胜雪" },
      { type: "ATTRIBUTE", text: "眼若秋水" }
    ],
    goldAnnotation: {
      entities: ["Thiếu nữ"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "TRANQUIL",
      acceptableRealizationRange: "Thiếu nữ một thân bạch y thắng tuyết, tóc đen như gấm lụa, đôi mắt trong veo tựa làn nước mùa thu."
    }
  },

  // =========================================================================
  // 7. HORROR
  // =========================================================================
  {
    id: "CORPUS_HOR_01",
    category: "HORROR",
    sourceZh: "古墓之内阴风阵阵，尸横遍野，鬼气森然。",
    domain: "SUPERNATURAL_HORROR",
    expectedAtoms: [
      { type: "LOCATION", text: "古墓" },
      { type: "ATMOSPHERE", text: "阴风" },
      { type: "ATMOSPHERE", text: "鬼气森然" }
    ],
    goldAnnotation: {
      entities: ["Cổ mộ"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "FEAR",
      acceptableRealizationRange: "Bên trong cổ mộ âm phong từng trận rít gào, quỷ khí sâm nhiên lạnh thấu xương."
    }
  },

  // =========================================================================
  // 8. POLITICS_COURT
  // =========================================================================
  {
    id: "CORPUS_POL_01",
    category: "POLITICS_COURT",
    sourceZh: "朝堂之上，暗流涌动，王爷早已谋划好夺嫡之策。",
    domain: "POLITICAL_INTRIGUE",
    expectedAtoms: [
      { type: "LOCATION", text: "朝堂" },
      { type: "EVENT", text: "暗流涌动" },
      { type: "SUBJECT", text: "王爷" },
      { type: "TEMPORAL", text: "早已谋划" }
    ],
    goldAnnotation: {
      entities: ["Triều đình", "Vương gia"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "SOLEMN",
      acceptableRealizationRange: "Trên triều đình, sóng ngầm cuộn trào nơi thâm cung nội viện, Vương gia sớm đã bày sẵn kế sách đoạt đích."
    }
  },

  // =========================================================================
  // 9. HUMOR_BANTER
  // =========================================================================
  {
    id: "CORPUS_BNT_01",
    category: "HUMOR_BANTER",
    sourceZh: "他冷哼道：“你可真厉害，连这种馊主意都想得出来。”",
    domain: "BANTER",
    expectedAtoms: [
      { type: "DIALOGUE_ACT", text: "BANTER" },
      { type: "SPEECH_VERB", text: "冷哼道" }
    ],
    goldAnnotation: {
      entities: ["Hắn", "Ngươi"],
      pov: "OBJECTIVE",
      emotion: "CONTEMPT",
      acceptableRealizationRange: "Hắn cười lạnh: \"Ngươi quả thật lợi hại, ngay cả cái chủ ý thối nát này cũng nghĩ ra được.\""
    }
  },

  // =========================================================================
  // 10. DESCRIPTION
  // =========================================================================
  {
    id: "CORPUS_DSC_01",
    category: "DESCRIPTION",
    sourceZh: "老僧轻啜一口灵茶，琴音袅袅，心如止水。",
    domain: "ZEN_TEA",
    expectedAtoms: [
      { type: "SUBJECT", text: "老僧" },
      { type: "ACTION", text: "轻啜" },
      { type: "ATTRIBUTE", text: "心如止水" }
    ],
    goldAnnotation: {
      entities: ["Lão tăng", "Linh trà"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "TRANQUIL",
      acceptableRealizationRange: "Lão tăng uống một ngụm linh trà, tiếng đàn du dương quanh quẩn, tâm tịnh như mặt nước phẳng lặng."
    }
  },

  // =========================================================================
  // 11. MIXED_MULTI_DOMAIN
  // =========================================================================
  {
    id: "CORPUS_MIX_01",
    category: "MIXED_MULTI_DOMAIN",
    sourceZh: "琴音破空之中，太上长老拔剑斩出，白衣胜雪，杀意滔天！",
    domain: "COMBAT",
    expectedAtoms: [
      { type: "ATMOSPHERE", text: "琴音" },
      { type: "SUBJECT", text: "太上长老" },
      { type: "ACTION", text: "拔剑斩出" },
      { type: "ATTRIBUTE", text: "白衣胜雪" },
      { type: "AFFECT", text: "杀意滔天" }
    ],
    goldAnnotation: {
      entities: ["Thái Thượng Trưởng lão"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "RESOLUTE",
      acceptableRealizationRange: "Giữa tiếng đàn xé gió, Thái Thượng Trưởng lão tuốt kiếm chém ra, một thân bạch y thắng tuyết, sát ý ngút trời cuồng bạo!"
    }
  },

  // =========================================================================
  // 12. RECOLLECTION_FLASHBACK
  // =========================================================================
  {
    id: "CORPUS_REC_01",
    category: "RECOLLECTION_FLASHBACK",
    sourceZh: "他回想起当年往事，叹道：“他没有死，他已经离开了。”",
    domain: "MONOLOGUE_PSYCHOLOGY",
    expectedAtoms: [
      { type: "COGNITION", text: "回想" },
      { type: "NEGATION", text: "没有死" },
      { type: "TEMPORAL", text: "已经" }
    ],
    goldAnnotation: {
      entities: ["Hắn"],
      pov: "FIRST_PERSON_OR_LIMITED",
      emotion: "MELANCHOLY",
      acceptableRealizationRange: "Hắn nhớ lại chuyện cũ năm xưa, thở dài: \"Hắn không chết, hắn đã rời đi rồi.\""
    }
  }
]);

module.exports = {
  SHADOW_EVALUATION_CORPUS
};
