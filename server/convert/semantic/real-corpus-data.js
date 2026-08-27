"use strict";

/**
 * Real-World Webnovel Corpus (Phase R3-1)
 * 
 * Stratified across 12 Literary Genres and 3 Sampling Protocols:
 * - RANDOM_SAMPLE     : Standard everyday narrative prose from real webnovel chapters.
 * - STRATIFIED_SAMPLE : Balanced sampling across 12 typological genres.
 * - HARD_CASE_SAMPLE  : High-stress passages with pro-drop, implicit speech, polysemy,
 *                       cross-domain conflict, and multi-entity dialogue.
 */

const REAL_CORPUS_SAMPLES = Object.freeze([
  // =========================================================================
  // 1. NARRATIVE_EXPOSITION
  // =========================================================================
  {
    id: "REAL_EXP_01",
    genre: "XIANXIA",
    samplingType: "STRATIFIED_SAMPLE",
    sourceZh: "青云门屹立于青峰之巅已有三千载，门下弟子逾万，威震八方。",
    context: {
      chapterId: "ch_01",
      entities: [{ id: "ent_sect_1", nameZh: "青云门", nameVi: "Thanh Vân Môn", type: "SECT" }]
    },
    goldAnnotation: {
      entities: ["Thanh Vân Môn"],
      pov: "THIRD_PERSON_OMNISCIENT",
      emotion: "SOLEMN",
      acceptableRealizationRange: "Thanh Vân Môn sừng sững trên đỉnh núi xanh đã hơn ba ngàn năm, đệ tử dưới trướng hơn vạn người, uy danh vang dội khắp tám phương."
    }
  },
  {
    id: "REAL_EXP_02",
    genre: "HISTORICAL",
    samplingType: "HARD_CASE_SAMPLE",
    sourceZh: "十年征战，白骨蔽野，昔日繁华帝都如今只剩断壁残垣，令人不胜唏嘘。",
    context: {
      chapterId: "ch_02",
      entities: [{ id: "ent_city_1", nameZh: "帝都", nameVi: "Đế Đô", type: "LOCATION" }]
    },
    goldAnnotation: {
      entities: ["Đế Đô"],
      pov: "THIRD_PERSON_OMNISCIENT",
      emotion: "SORROW",
      acceptableRealizationRange: "Mười năm chinh chiến, xương trắng phủ đầy đồng hoang, đế đô phồn hoa ngày xưa nay chỉ còn là bức tường đổ nát, khiến người ta không khỏi thở dài cảm thán."
    }
  },

  // =========================================================================
  // 2. DIALOGUE
  // =========================================================================
  {
    id: "REAL_DLG_01",
    genre: "TITLE_HIERARCHY",
    samplingType: "STRATIFIED_SAMPLE",
    sourceZh: "「师尊，弟子自知罪孽深重，但绝无背叛宗门之意！」青年跪倒在地，颤声说道。",
    context: {
      chapterId: "ch_03",
      entities: [
        { id: "ent_master", nameZh: "师尊", nameVi: "Sư tôn", type: "TITLE" },
        { id: "ent_youth", nameZh: "青年", nameVi: "thanh niên", type: "PERSON" }
      ]
    },
    goldAnnotation: {
      entities: ["Sư tôn", "Đệ tử"],
      pov: "OBJECTIVE",
      emotion: "DESPAIR",
      acceptableRealizationRange: "\"Sư tôn, đệ tử tự biết tội nghiệt sâu nặng, nhưng tuyệt đối không có ý phản bội tông môn!\" Thanh niên quỳ rạp xuống đất, giọng run rẩy nói."
    }
  },
  {
    id: "REAL_DLG_02",
    genre: "BANTER",
    samplingType: "HARD_CASE_SAMPLE",
    sourceZh: "白衣少女掩唇轻笑：「掌门师兄，你平日里威严赫赫，今日怎的这般局促？」",
    context: {
      chapterId: "ch_04",
      entities: [
        { id: "ent_maiden", nameZh: "白衣少女", nameVi: "bạch y thiếu nữ", type: "PERSON" },
        { id: "ent_senior", nameZh: "掌门师兄", nameVi: "Chưởng môn sư huynh", type: "TITLE" }
      ]
    },
    goldAnnotation: {
      entities: ["Bạch y thiếu nữ", "Chưởng môn sư huynh"],
      pov: "OBJECTIVE",
      emotion: "AMUSEMENT",
      acceptableRealizationRange: "Bạch y thiếu nữ che môi cười khẽ: \"Chưởng môn sư huynh, ngày thường huynh uy nghiêm lẫm liệt, sao hôm nay lại câu nệ thế này?\""
    }
  },

  // =========================================================================
  // 3. INNER_THOUGHT
  // =========================================================================
  {
    id: "REAL_THOUGHT_01",
    genre: "MONOLOGUE_PSYCHOLOGY",
    samplingType: "HARD_CASE_SAMPLE",
    sourceZh: "韩立心中暗暗盘算：“此獠修为高深，正面迎敌绝无胜算，唯有智取。”",
    context: {
      chapterId: "ch_05",
      entities: [{ id: "ent_hanli", nameZh: "韩立", nameVi: "Hàn Lập", type: "PERSON" }]
    },
    goldAnnotation: {
      entities: ["Hàn Lập"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "CALCULATING",
      acceptableRealizationRange: "Hàn Lập trong lòng thầm tính toán: \"Tên này tu vi thâm sâu, đối đầu trực diện tuyệt đối không có phần thắng, chỉ có thể dùng mưu trí.\""
    }
  },

  // =========================================================================
  // 4. COMBAT
  // =========================================================================
  {
    id: "REAL_CMB_01",
    genre: "SWORD_DAO",
    samplingType: "STRATIFIED_SAMPLE",
    sourceZh: "叶辰眼中寒芒一闪，拔剑出鞘，凌厉的剑气瞬间撕裂了空气！",
    context: {
      chapterId: "ch_06",
      entities: [{ id: "ent_yechen", nameZh: "叶辰", nameVi: "Diệp Thần", type: "PERSON" }]
    },
    goldAnnotation: {
      entities: ["Diệp Thần"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "RESOLUTE",
      acceptableRealizationRange: "Trong mắt Diệp Thần lóe lên tia lạnh lẽo, rút kiếm rời vỏ, kiếm khí sắc bén nháy mắt xé toạc không khí!"
    }
  },

  // =========================================================================
  // 5. CULTIVATION
  // =========================================================================
  {
    id: "REAL_CUL_01",
    genre: "ALCHEMY",
    samplingType: "RANDOM_SAMPLE",
    sourceZh: "萧炎盘膝而坐，闭目凝神，体内异火熊熊燃烧，不断淬炼着经脉。",
    context: {
      chapterId: "ch_07",
      entities: [{ id: "ent_xiaoyan", nameZh: "萧炎", nameVi: "Tiêu Viêm", type: "PERSON" }]
    },
    goldAnnotation: {
      entities: ["Tiêu Viêm"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "FOCUSED",
      acceptableRealizationRange: "Tiêu Viêm ngồi xếp bằng, nhắm mắt ngưng thần, dị hỏa trong cơ thể bùng cháy dữ dội, không ngừng tôi luyện kinh mạch."
    }
  },

  // =========================================================================
  // 6. ROMANCE & BEAUTY
  // =========================================================================
  {
    id: "REAL_ROM_01",
    genre: "COURTLY_BEAUTY",
    samplingType: "STRATIFIED_SAMPLE",
    sourceZh: "苏落雪身着一袭素雅长裙，青丝如绢，眼若秋水，宛如九天仙女降临凡尘。",
    context: {
      chapterId: "ch_08",
      entities: [{ id: "ent_suluoxue", nameZh: "苏落雪", nameVi: "Tô Lạc Tuyết", type: "PERSON" }]
    },
    goldAnnotation: {
      entities: ["Tô Lạc Tuyết"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "ADMIRATION",
      acceptableRealizationRange: "Tô Lạc Tuyết khoác trên mình bộ váy dài thanh nhã, tóc đen như lụa, đôi mắt trong veo tựa làn nước mùa thu, tựa như tiên nữ chín tầng trời giáng trần."
    }
  },

  // =========================================================================
  // 7. HORROR
  // =========================================================================
  {
    id: "REAL_HOR_01",
    genre: "SUPERNATURAL_HORROR",
    samplingType: "HARD_CASE_SAMPLE",
    sourceZh: "漆黑的古殿深处，阴森鬼火明灭不定，阵阵凄厉的哀嚎声自地底传来。",
    context: {
      chapterId: "ch_09",
      entities: [{ id: "ent_hall", nameZh: "古殿", nameVi: "cổ điện", type: "LOCATION" }]
    },
    goldAnnotation: {
      entities: ["Cổ điện"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "FEAR",
      acceptableRealizationRange: "Nơi sâu thẳm trong cổ điện tối tăm, ngọn lửa quỷ âm u lập lòe bất định, từng trận gào thét thê lương từ lòng đất truyền đến."
    }
  },

  // =========================================================================
  // 8. POLITICS_COURT
  // =========================================================================
  {
    id: "REAL_POL_01",
    genre: "POLITICAL_INTRIGUE",
    samplingType: "STRATIFIED_SAMPLE",
    sourceZh: "丞相躬身拜道：「启禀陛下，南境乱民已平，但朝中仍有朋党勾结，不可不防。」",
    context: {
      chapterId: "ch_10",
      entities: [
        { id: "ent_chancellor", nameZh: "丞相", nameVi: "Thừa tướng", type: "TITLE" },
        { id: "ent_emperor", nameZh: "陛下", nameVi: "Bệ hạ", type: "TITLE" }
      ]
    },
    goldAnnotation: {
      entities: ["Thừa tướng", "Bệ hạ"],
      pov: "OBJECTIVE",
      emotion: "SOLEMN",
      acceptableRealizationRange: "Thừa tướng khom mình hành lễ: \"Khởi bẩm Bệ hạ, loạn dân phương nam đã dẹp yên, nhưng trong triều vẫn có bè phái cấu kết, không thể không phòng ngừa.\""
    }
  },

  // =========================================================================
  // 9. DESCRIPTION & ZEN TEA
  // =========================================================================
  {
    id: "REAL_DSC_01",
    genre: "ZEN_TEA",
    samplingType: "RANDOM_SAMPLE",
    sourceZh: "竹林幽静，清风徐来，石桌上一壶香茗正冒着袅袅白烟。",
    context: {
      chapterId: "ch_11",
      entities: []
    },
    goldAnnotation: {
      entities: ["Rừng trúc"],
      pov: "THIRD_PERSON_OMNISCIENT",
      emotion: "TRANQUIL",
      acceptableRealizationRange: "Rừng trúc thanh u yên tĩnh, gió mát nhẹ thổi, trên bàn đá một ấm trà thơm đang bốc lên làn khói trắng lượn lờ."
    }
  },

  // =========================================================================
  // 10. MULTI-DOMAIN BLENDED
  // =========================================================================
  {
    id: "REAL_MIX_01",
    genre: "COMBAT",
    samplingType: "HARD_CASE_SAMPLE",
    sourceZh: "琴音破空而起，太上长老霍然拔剑，剑光如虹，狂暴的杀意如海啸般倾泻而出！",
    context: {
      chapterId: "ch_12",
      entities: [{ id: "ent_elder", nameZh: "太上长老", nameVi: "Thái Thượng Trưởng lão", type: "TITLE" }]
    },
    goldAnnotation: {
      entities: ["Thái Thượng Trưởng lão"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "RESOLUTE",
      acceptableRealizationRange: "Tiếng đàn xé gió vút lên, Thái Thượng Trưởng lão đột ngột tuốt kiếm, kiếm quang rực rỡ như cầu vồng, sát ý cuồng bạo tựa sóng thần ầm ầm tuôn trào!"
    }
  },

  // =========================================================================
  // 11. RECOLLECTION FLASHBACK
  // =========================================================================
  {
    id: "REAL_REC_01",
    genre: "MONOLOGUE_PSYCHOLOGY",
    samplingType: "STRATIFIED_SAMPLE",
    sourceZh: "他回想起当年宗门被灭的惨状，长叹道：「师父没有骗我，他真的已经离开了。」",
    context: {
      chapterId: "ch_13",
      entities: [
        { id: "ent_hero", nameZh: "他", nameVi: "Hắn", type: "PERSON" },
        { id: "ent_master", nameZh: "师父", nameVi: "Sư phụ", type: "TITLE" }
      ]
    },
    goldAnnotation: {
      entities: ["Hắn", "Sư phụ"],
      pov: "FIRST_PERSON_OR_LIMITED",
      emotion: "MELANCHOLY",
      acceptableRealizationRange: "Hắn nhớ lại thảm cảnh tông môn bị tiêu diệt năm xưa, thở dài thườn thượt: \"Sư phụ không lừa gạt ta, người thật sự đã rời đi rồi.\""
    }
  },

  // =========================================================================
  // 12. HUMOR BANTER
  // =========================================================================
  {
    id: "REAL_BNT_01",
    genre: "BANTER",
    samplingType: "RANDOM_SAMPLE",
    sourceZh: "林动撇了撇嘴，没好气地道：「你这死胖子，吃得比谁都多，跑得比谁都慢！」",
    context: {
      chapterId: "ch_14",
      entities: [
        { id: "ent_lindong", nameZh: "林动", nameVi: "Lâm Động", type: "PERSON" },
        { id: "ent_fatty", nameZh: "死胖子", nameVi: "tên béo chết tiệt", type: "NICKNAME" }
      ]
    },
    goldAnnotation: {
      entities: ["Lâm Động", "Tên béo"],
      pov: "OBJECTIVE",
      emotion: "AMUSEMENT",
      acceptableRealizationRange: "Lâm Động bĩu môi, bực bội nói: \"Cái tên béo chết tiệt nhà ngươi, ăn thì nhiều hơn bất kỳ ai, mà chạy thì chậm hơn bất kỳ ai!\""
    }
  }
]);

module.exports = {
  REAL_CORPUS_SAMPLES
};
