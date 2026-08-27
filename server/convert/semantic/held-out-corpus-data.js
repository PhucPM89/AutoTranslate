"use strict";

/**
 * Held-Out & Tripartite Evaluation Corpus (Phase R3-2)
 * 
 * Strict Data Separation:
 * - DEVELOPMENT : 14 passages used for initial calibration in R3-1.
 * - HELD_OUT    : 18 completely disjoint, unseen real webnovel passages spanning
 *                 all 12 genres, pro-drop, polysemy, and multi-entity dialogue.
 * - FINAL_GOLD  : 10 multi-paragraph chapter sequences for cross-chapter continuity.
 */

const DATASET_SPLITS = Object.freeze({
  DEVELOPMENT: "DEVELOPMENT",
  HELD_OUT: "HELD_OUT",
  FINAL_GOLD: "FINAL_GOLD"
});

const HELD_OUT_CORPUS_SAMPLES = Object.freeze([
  // =========================================================================
  // 1. NARRATIVE_EXPOSITION (Held-Out)
  // =========================================================================
  {
    id: "HELD_EXP_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "XIANXIA",
    textRole: "EXPOSITION",
    isHardCase: false,
    isMultiDomain: false,
    sourceZh: "太玄圣地传承五万年，历经九次天渊浩劫而不倒，名震中州。",
    context: {
      chapterId: "ch_held_01",
      entities: [{ id: "ent_tx", nameZh: "太玄圣地", nameVi: "Thái Huyền Thánh Địa", type: "SECT" }]
    },
    expectedAtoms: [
      { type: "SUBJECT", text: "太玄圣地" },
      { type: "QUANTITY", value: "五万年" },
      { type: "QUANTITY", value: "九次" }
    ],
    goldAnnotation: {
      entities: ["Thái Huyền Thánh Địa"],
      pov: "THIRD_PERSON_OMNISCIENT",
      emotion: "SOLEMN",
      acceptableRealizationRange: "Thái Huyền Thánh Địa truyền thừa năm vạn năm, trải qua chín lần thiên uyên hạo kiếp mà không sụp đổ, danh chấn Trung Châu."
    }
  },
  {
    id: "HELD_EXP_02",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "HISTORICAL",
    textRole: "EXPOSITION",
    isHardCase: true,
    isMultiDomain: false,
    sourceZh: "关山万里，烽火连天，北境三十六城尽皆陷落，未留一兵一卒。",
    context: {
      chapterId: "ch_held_02",
      entities: [{ id: "ent_bj", nameZh: "北境", nameVi: "Bắc Cảnh", type: "LOCATION" }]
    },
    expectedAtoms: [
      { type: "QUANTITY", value: "万里" },
      { type: "QUANTITY", value: "三十六城" },
      { type: "NEGATION", text: "未留" }
    ],
    goldAnnotation: {
      entities: ["Bắc Cảnh"],
      pov: "THIRD_PERSON_OMNISCIENT",
      emotion: "TRAGIC",
      acceptableRealizationRange: "Quan sơn vạn dặm, khói lửa ngút trời, ba mươi sáu thành phương bắc đều rơi vào tay giặc, chẳng còn lưu lại một binh một tốt."
    }
  },

  // =========================================================================
  // 2. DIALOGUE (Held-Out)
  // =========================================================================
  {
    id: "HELD_DLG_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "TITLE_HIERARCHY",
    textRole: "DIALOGUE",
    isHardCase: true,
    isMultiDomain: false,
    sourceZh: "太上长老冷哼一声，拂袖道：「掌门师弟，你休要执迷不悟，速速交出掌教圣印！」",
    context: {
      chapterId: "ch_held_03",
      entities: [
        { id: "ent_elder", nameZh: "太上长老", nameVi: "Thái Thượng Trưởng lão", type: "TITLE" },
        { id: "ent_leader", nameZh: "掌门师弟", nameVi: "Chưởng môn sư đệ", type: "TITLE" }
      ]
    },
    expectedAtoms: [
      { type: "SPEAKER", text: "太上长老" },
      { type: "LISTENER", text: "掌门师弟" },
      { type: "NEGATION", text: "休要" }
    ],
    goldAnnotation: {
      entities: ["Thái Thượng Trưởng lão", "Chưởng môn sư đệ"],
      pov: "OBJECTIVE",
      emotion: "WRATH",
      acceptableRealizationRange: "Thái Thượng Trưởng lão cười lạnh một tiếng, phất tay áo nói: \"Chưởng môn sư đệ, đệ chớ có mê muội nữa, mau mau giao ra Chưởng giáo Thánh ấn!\""
    }
  },
  {
    id: "HELD_DLG_02",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "BANTER",
    textRole: "DIALOGUE",
    isHardCase: true,
    isMultiDomain: false,
    sourceZh: "少年眨了眨眼，戏谑道：「师姐莫非心虚了？方才不知是谁吓得直往我怀里钻。」",
    context: {
      chapterId: "ch_held_04",
      entities: [
        { id: "ent_boy", nameZh: "少年", nameVi: "thiếu niên", type: "PERSON" },
        { id: "ent_sister", nameZh: "师姐", nameVi: "Sư tỷ", type: "TITLE" }
      ]
    },
    expectedAtoms: [
      { type: "SPEAKER", text: "少年" },
      { type: "LISTENER", text: "师姐" },
      { type: "DIALOGUE_ACT", text: "BANTER" }
    ],
    goldAnnotation: {
      entities: ["Thiếu niên", "Sư tỷ"],
      pov: "OBJECTIVE",
      emotion: "AMUSEMENT",
      acceptableRealizationRange: "Thiếu niên chớp chớp mắt, trêu chọc nói: \"Sư tỷ chẳng lẽ chột dạ rồi sao? Vừa rồi không biết là ai sợ tới mức cứ chui thẳng vào lòng ta.\""
    }
  },

  // =========================================================================
  // 3. INNER_THOUGHT (Held-Out)
  // =========================================================================
  {
    id: "HELD_THOUGHT_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "MONOLOGUE_PSYCHOLOGY",
    textRole: "INNER_THOUGHT",
    isHardCase: true,
    isMultiDomain: false,
    sourceZh: "他低垂着头，心中冷笑：“老狐狸，任你机关算尽，也料不到我早已将丹方调换。”",
    context: {
      chapterId: "ch_held_05",
      entities: [{ id: "ent_hero", nameZh: "他", nameVi: "Hắn", type: "PERSON" }]
    },
    expectedAtoms: [
      { type: "COGNITION", kind: "EXPLICIT_THOUGHT" },
      { type: "TEMPORAL", text: "早已" },
      { type: "NEGATION", text: "料不到" }
    ],
    goldAnnotation: {
      entities: ["Hắn"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "CONTEMPT",
      acceptableRealizationRange: "Hắn cúi thấp đầu, trong lòng cười lạnh: \"Lão hồ ly, mặc cho ngươi tính toán trăm bề, cũng không ngờ ta sớm đã đánh tráo đan phương.\""
    }
  },

  // =========================================================================
  // 4. COMBAT (Held-Out)
  // =========================================================================
  {
    id: "HELD_CMB_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "SWORD_DAO",
    textRole: "ACTION",
    isHardCase: false,
    isMultiDomain: false,
    sourceZh: "剑鸣动九霄，他身随剑走，一道森然剑芒瞬间贯穿了巨蟒的七寸！",
    context: {
      chapterId: "ch_held_06",
      entities: [{ id: "ent_hero", nameZh: "他", nameVi: "Hắn", type: "PERSON" }]
    },
    expectedAtoms: [
      { type: "ACTION", text: "剑随剑走" },
      { type: "ACTION", text: "贯穿" }
    ],
    goldAnnotation: {
      entities: ["Hắn", "Cự xà"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "RESOLUTE",
      acceptableRealizationRange: "Tiếng kiếm reo vang chín tầng trời, hắn thân theo kiếm chuyển, một đạo kiếm mang sắc lạnh nháy mắt xuyên thủng chỗ hiểm bảy tấc của cự xà!"
    }
  },

  // =========================================================================
  // 5. CULTIVATION (Held-Out)
  // =========================================================================
  {
    id: "HELD_CUL_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "ALCHEMY",
    textRole: "ACTION",
    isHardCase: false,
    isMultiDomain: false,
    sourceZh: "药鼎轰鸣，九缕紫气冲天而起，绝品凝气丹终于炼制成功。",
    context: {
      chapterId: "ch_held_07",
      entities: [{ id: "ent_pot", nameZh: "药鼎", nameVi: "Dược đỉnh", type: "OBJECT" }]
    },
    expectedAtoms: [
      { type: "OBJECT", text: "药鼎" },
      { type: "QUANTITY", value: "九缕" },
      { type: "TEMPORAL", text: "终于" }
    ],
    goldAnnotation: {
      entities: ["Dược đỉnh", "Ngưng Khí Đan"],
      pov: "THIRD_PERSON_OMNISCIENT",
      emotion: "JOY",
      acceptableRealizationRange: "Dược đỉnh ầm ầm vang dội, chín luồng tử khí bay vút lên trời, tuyệt phẩm Ngưng Khí Đan rốt cuộc đã luyện chế thành công."
    }
  },

  // =========================================================================
  // 6. ROMANCE & BEAUTY (Held-Out)
  // =========================================================================
  {
    id: "HELD_ROM_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "COURTLY_BEAUTY",
    textRole: "DESCRIPTION",
    isHardCase: false,
    isMultiDomain: false,
    sourceZh: "佳人依窗而立，云鬓斜簪，微风吹拂罗裳，清丽不可方物。",
    context: {
      chapterId: "ch_held_08",
      entities: [{ id: "ent_beauty", nameZh: "佳人", nameVi: "Giai nhân", type: "PERSON" }]
    },
    expectedAtoms: [
      { type: "SUBJECT", text: "佳人" },
      { type: "ATTRIBUTE", text: "清丽" }
    ],
    goldAnnotation: {
      entities: ["Giai nhân"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "TRANQUIL",
      acceptableRealizationRange: "Giai nhân tựa bên cửa sổ đứng lặng, mái tóc mây cài nghiêng trâm ngọc, gió nhẹ khẽ lay vạt áo lụa, thanh lệ tuyệt trần không gì sánh nổi."
    }
  },

  // =========================================================================
  // 7. HORROR (Held-Out)
  // =========================================================================
  {
    id: "HELD_HOR_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "SUPERNATURAL_HORROR",
    textRole: "DESCRIPTION",
    isHardCase: true,
    isMultiDomain: false,
    sourceZh: "荒冢寂寂，血月当空，无数惨白枯手自泥土中缓缓伸出，令人毛骨悚然。",
    context: {
      chapterId: "ch_held_09",
      entities: [{ id: "ent_grave", nameZh: "荒冢", nameVi: "hoang trủng", type: "LOCATION" }]
    },
    expectedAtoms: [
      { type: "LOCATION", text: "荒冢" },
      { type: "QUANTITY", value: "无数" },
      { type: "AFFECT", text: "毛骨悚然" }
    ],
    goldAnnotation: {
      entities: ["Hoang trủng"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "FEAR",
      acceptableRealizationRange: "Mộ hoang tĩnh lặng, huyết nguyệt treo trên không trung, vô số bàn tay khô khốc trắng bệch từ trong đất bùn chậm rãi vươn ra, khiến người ta rùng mình ớn lạnh."
    }
  },

  // =========================================================================
  // 8. POLITICS_COURT (Held-Out)
  // =========================================================================
  {
    id: "HELD_POL_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "POLITICAL_INTRIGUE",
    textRole: "DIALOGUE",
    isHardCase: true,
    isMultiDomain: false,
    sourceZh: "太师眼神阴鸷，低语道：「殿下，今夜便是逼宫的最佳时机，切不可优柔寡断。」",
    context: {
      chapterId: "ch_held_10",
      entities: [
        { id: "ent_grandmaster", nameZh: "太师", nameVi: "Thái sư", type: "TITLE" },
        { id: "ent_prince", nameZh: "殿下", nameVi: "Điện hạ", type: "TITLE" }
      ]
    },
    expectedAtoms: [
      { type: "SPEAKER", text: "太师" },
      { type: "LISTENER", text: "殿下" },
      { type: "NEGATION", text: "切不可" }
    ],
    goldAnnotation: {
      entities: ["Thái sư", "Điện hạ"],
      pov: "OBJECTIVE",
      emotion: "SINISTER",
      acceptableRealizationRange: "Ánh mắt Thái sư âm trầm hiểm độc, khẽ nói: \"Điện hạ, đêm nay chính là thời cơ tốt nhất để bức cung, tuyệt đối không được do dự thiếu quyết đoán.\""
    }
  },

  // =========================================================================
  // 9. DESCRIPTION & ZEN TEA (Held-Out)
  // =========================================================================
  {
    id: "HELD_DSC_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "ZEN_TEA",
    textRole: "DESCRIPTION",
    isHardCase: false,
    isMultiDomain: false,
    sourceZh: "幽泉古刹，茶香幽幽，老僧端坐蒲团之上，默念金刚般若经。",
    context: {
      chapterId: "ch_held_11",
      entities: [{ id: "ent_monk", nameZh: "老僧", nameVi: "lão tăng", type: "PERSON" }]
    },
    expectedAtoms: [
      { type: "SUBJECT", text: "老僧" },
      { type: "ACTION", text: "默念" }
    ],
    goldAnnotation: {
      entities: ["Lão tăng", "Kim Cương Kinh"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "TRANQUIL",
      acceptableRealizationRange: "Cổ tự nơi suối vắng, hương trà thoang thoảng phảng phất, lão tăng ngồi ngay ngắn trên bồ đoàn, thầm tụng kinh Kim Cương Bát Nhã."
    }
  },

  // =========================================================================
  // 10. MULTI-DOMAIN BLENDED (Held-Out)
  // =========================================================================
  {
    id: "HELD_MIX_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "COMBAT",
    textRole: "ACTION",
    isHardCase: true,
    isMultiDomain: true,
    sourceZh: "琴音戛然而止，白衣女鬼发狂般扑来，老道士拂尘一甩，九字真言化作金色锁链轰然镇压！",
    context: {
      chapterId: "ch_held_12",
      entities: [
        { id: "ent_ghost", nameZh: "白衣女鬼", nameVi: "bạch y nữ quỷ", type: "CREATURE" },
        { id: "ent_taoist", nameZh: "老道士", nameVi: "lão đạo sĩ", type: "PERSON" }
      ]
    },
    expectedAtoms: [
      { type: "ATMOSPHERE", text: "琴音" },
      { type: "SUBJECT", text: "白衣女鬼" },
      { type: "SUBJECT", text: "老道士" },
      { type: "ACTION", text: "镇压" }
    ],
    goldAnnotation: {
      entities: ["Bạch y nữ quỷ", "Lão đạo sĩ"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "RESOLUTE",
      acceptableRealizationRange: "Tiếng đàn đột ngột dừng bặt, bạch y nữ quỷ như phát cuồng lao tới, lão đạo sĩ vung mạnh phất trần, Cửu Tự Chân Ngôn hóa thành xiềng xích hoàng kim ầm ầm trấn áp xuống!"
    }
  },

  // =========================================================================
  // 11. RECOLLECTION FLASHBACK (Held-Out)
  // =========================================================================
  {
    id: "HELD_REC_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "MONOLOGUE_PSYCHOLOGY",
    textRole: "RECOLLECTION",
    isHardCase: true,
    isMultiDomain: false,
    sourceZh: "他恍惚想起百年前的初见，轻叹道：「你从来没有变过，是我执念太深。」",
    context: {
      chapterId: "ch_held_13",
      entities: [{ id: "ent_hero", nameZh: "他", nameVi: "Hắn", type: "PERSON" }]
    },
    expectedAtoms: [
      { type: "COGNITION", text: "恍惚想起" },
      { type: "TEMPORAL", value: "百年前" },
      { type: "NEGATION", text: "从来没有" }
    ],
    goldAnnotation: {
      entities: ["Hắn"],
      pov: "FIRST_PERSON_OR_LIMITED",
      emotion: "MELANCHOLY",
      acceptableRealizationRange: "Hắn mơ màng nhớ lại lần đầu gặp gỡ trăm năm trước, khẽ thở dài: \"Nàng trước giờ chưa từng thay đổi, là ta chấp niệm quá sâu.\""
    }
  },

  // =========================================================================
  // 12. HUMOR BANTER (Held-Out)
  // =========================================================================
  {
    id: "HELD_BNT_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "BANTER",
    textRole: "DIALOGUE",
    isHardCase: false,
    isMultiDomain: false,
    sourceZh: "胖道士擦了擦额头冷汗，干笑道：「无量天尊，道爷我不过是路过，各位何必舞刀弄枪？」",
    context: {
      chapterId: "ch_held_14",
      entities: [{ id: "ent_fat_taoist", nameZh: "胖道士", nameVi: "mập đạo sĩ", type: "PERSON" }]
    },
    expectedAtoms: [
      { type: "SPEAKER", text: "胖道士" },
      { type: "DIALOGUE_ACT", text: "BANTER" }
    ],
    goldAnnotation: {
      entities: ["Mập đạo sĩ"],
      pov: "OBJECTIVE",
      emotion: "AMUSEMENT",
      acceptableRealizationRange: "Mập đạo sĩ lau mồ hôi lạnh trên trán, cười gượng nói: \"Vô Lượng Thiên Tôn, đạo gia ta chẳng qua chỉ là đi ngang qua thôi, các vị cần gì phải múa đao múa kiếm?\""
    }
  },

  // =========================================================================
  // 13. PRO-DROP HARD ACTION (Held-Out)
  // =========================================================================
  {
    id: "HELD_ACT_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "COMBAT",
    textRole: "ACTION",
    isHardCase: true,
    isMultiDomain: false,
    sourceZh: "侧身避过刀芒，反手拔剑，一记凌厉的横扫将敌酋斩落马下！",
    context: {
      chapterId: "ch_held_15",
      entities: []
    },
    expectedAtoms: [
      { type: "ACTION", text: "侧身避过" },
      { type: "ACTION", text: "反手拔剑" },
      { type: "ACTION", text: "斩落马下" }
    ],
    goldAnnotation: {
      entities: ["Địch tướng"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "RESOLUTE",
      acceptableRealizationRange: "Nghiêng người né tránh đao mang, trở tay rút kiếm, một đường quét ngang sắc bén chém rớt tên đầu sỏ của địch xuống ngựa!"
    }
  },

  // =========================================================================
  // 14. IMPERIAL EDICT FORMALITY (Held-Out)
  // =========================================================================
  {
    id: "HELD_IMP_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "IMPERIAL_EDICT",
    textRole: "EXPOSITION",
    isHardCase: false,
    isMultiDomain: false,
    sourceZh: "奉天承运皇帝，诏曰：镇国大将军忠勇可嘉，特赐九锡，封定海王。",
    context: {
      chapterId: "ch_held_16",
      entities: [
        { id: "ent_general", nameZh: "镇国大将军", nameVi: "Trấn Quốc Đại tướng quân", type: "TITLE" },
        { id: "ent_king", nameZh: "定海王", nameVi: "Định Hải Vương", type: "TITLE" }
      ]
    },
    expectedAtoms: [
      { type: "TITLE", text: "镇国大将军" },
      { type: "TITLE", text: "定海王" }
    ],
    goldAnnotation: {
      entities: ["Trấn Quốc Đại tướng quân", "Định Hải Vương"],
      pov: "OBJECTIVE",
      emotion: "SOLEMN",
      acceptableRealizationRange: "Phụng thiên thừa vận Hoàng đế, chiếu viết: Trấn Quốc Đại tướng quân trung dũng đáng khen, đặc biệt ban thưởng cửu tích, phong làm Định Hải Vương."
    }
  },

  // =========================================================================
  // 15. CULTIVATION TRIBULATION (Held-Out)
  // =========================================================================
  {
    id: "HELD_TRI_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "TRIBULATION",
    textRole: "ACTION",
    isHardCase: true,
    isMultiDomain: false,
    sourceZh: "九重雷劫轰然劈下，他肉身破碎，神魂却于毁灭之中浴火重生！",
    context: {
      chapterId: "ch_held_17",
      entities: [{ id: "ent_hero", nameZh: "他", nameVi: "Hắn", type: "PERSON" }]
    },
    expectedAtoms: [
      { type: "QUANTITY", value: "九重" },
      { type: "EVENT", text: "雷劫" },
      { type: "ADVERSATIVE", text: "却" }
    ],
    goldAnnotation: {
      entities: ["Hắn"],
      pov: "THIRD_PERSON_LIMITED",
      emotion: "AWE",
      acceptableRealizationRange: "Chín tầng lôi kiếp ầm ầm giáng xuống, thân thể hắn vỡ vụn, thế nhưng thần hồn lại tắm mình trong ngọn lửa hủy diệt mà hồi sinh rực rỡ!"
    }
  },

  // =========================================================================
  // 16. URBAN SLANG DIALOGUE (Held-Out)
  // =========================================================================
  {
    id: "HELD_URB_01",
    split: DATASET_SPLITS.HELD_OUT,
    genre: "URBAN_SLANG",
    textRole: "DIALOGUE",
    isHardCase: false,
    isMultiDomain: false,
    sourceZh: "张伟拍着胸脯保证道：「哥们，这事包在我身上，绝对稳妥！」",
    context: {
      chapterId: "ch_held_18",
      entities: [{ id: "ent_zw", nameZh: "张伟", nameVi: "Trương Vĩ", type: "PERSON" }]
    },
    expectedAtoms: [
      { type: "SPEAKER", text: "张伟" },
      { type: "DIALOGUE_ACT", text: "INFORMAL_ASSURANCE" }
    ],
    goldAnnotation: {
      entities: ["Trương Vĩ"],
      pov: "OBJECTIVE",
      emotion: "AMUSEMENT",
      acceptableRealizationRange: "Trương Vĩ vỗ ngực cam đoan: \"Anh em, chuyện này cứ để tôi lo, tuyệt đối ổn thỏa!\""
    }
  }
]);

module.exports = {
  DATASET_SPLITS,
  HELD_OUT_CORPUS_SAMPLES
};
