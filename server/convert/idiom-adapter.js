"use strict";

/**
 * Golden Idiom & Metaphor Adapter.
 * Translates Chinese 4-character idioms and literary metaphors into
 * expressive, highly naturalized Vietnamese literary equivalents.
 */

const LITERARY_IDIOMS = {
  "落井下石": "giậu đổ bìm leo",
  "釜底抽薪": "rút củi đáy nồi",
  "班门弄斧": "múa rìu qua mắt thợ",
  "暗度陈仓": "bí mật qua mặt",
  "狗仗人势": "cậy thế bắt nạt",
  "画蛇添足": "vẽ rắn thêm chân",
  "声东击西": "dương đông kích tây",
  "纸上谈兵": "bàn việc trên giấy",
  "狐假虎威": "mượn oai hùm",
  "掩耳盗铃": "bịt tai trộm chuông",
  "对牛弹琴": "đàn gảy tai trâu",
  "杀鸡儆猴": "giết gà dọa khỉ",
  "坐井观天": "ếch ngồi đáy giếng",
  "如虎添翼": "như hổ thêm cánh",
  "借刀杀人": "mượn đao giết người",
  "趁火打劫": "thừa nước đục thả câu",
  "顺手牵羊": "tiện tay dắt dê",
  "打草惊蛇": "đánh rắn động cỏ",
  "金蝉脱壳": "kim thiền thoát xác",
  "瞒天过海": "giấu trời qua biển",
  "欲擒故纵": "muốn bắt lại thả",
  "以逸待劳": "dưỡng sức chờ địch",
  "瓮中捉鳖": "bắt ba ba trong chum",
  "螳螂捕蝉": "bọ ngựa bắt ve",
  "黄雀在后": "chim sẻ rình sau",
  "目中无人": "mắt không coi ai ra gì",
  "心狠手辣": "tâm địa độc ác",
  "深不可测": "thâm sâu khó dò",
  "千钧一发": "nghìn cân treo sợi tóc",
  "九死一生": "chín phần chết một phần sống",
  "风卷残云": "như gió cuốn mây tan",
  "翻江倒海": "lật sông cuộn biển",
  "翻天覆地": "kinh thiên động địa",
  "惊涛骇浪": "sóng to gió lớn",
  "雷霆万钧": "sét đánh ngàn cân",
  "血流成河": "máu chảy thành sông",
  "尸横遍野": "thây chất đầy đồng",
  "魂飞魄散": "hồn bay phách tán",
  "心惊胆战": "kinh hồn bạt vía",
  "怒发冲冠": "tức giận đến dựng tóc gáy",
  "咬牙切齿": "nghiến răng nghiến lợi",
  "目瞪口呆": "há hốc mồm kinh ngạc",
  "瞠目结舌": "nghẹn họng trố mắt",
  "若无其事": "như không có chuyện gì",
  "神不知鬼不觉": "thần không biết quỷ không hay",
  "一不做二不休": "đã làm thì làm cho trót",
  "井水不犯河水": "nước sông không phạm nước giếng",
  "识时务者为俊杰": "kẻ thức thời mới là trang tuấn kiệt",
  "留得青山在不怕没柴烧": "còn rừng xanh lo gì không có củi đốt",
  "宁为玉碎不为瓦全": "thà làm ngọc vỡ còn hơn ngói lành",
  "不知天高地厚": "chẳng biết trời cao đất rộng",
  "狗急跳墙": "chó cùng rứt dậu",
  "瓮中之鳖": "ba ba trong chum",
  "插翅难逃": "mọc cánh cũng khó thoát",
  "水落石出": "chân tướng phơi bày",
  "风吹草动": "động tĩnh nhỏ nhất",
  "如坐针毡": "như ngồi trên đống lửa",
  "度日如年": "một ngày dài như cả năm",
  "自寻死路": "tự tìm đường chết",
  "死无葬身之地": "chết không có đất chôn",
  "灰飞烟灭": "tan thành tro bụi",
  "万劫不复": "muôn kiếp không trở lại được"
};

/**
 * Replaces Chinese idioms with Vietnamese literary counterparts.
 * @param {string} text
 * @returns {string}
 */
function adaptLiteraryIdioms(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const [zh, vi] of Object.entries(LITERARY_IDIOMS)) {
    if (result.includes(zh)) {
      result = result.split(zh).join(vi);
    }
  }
  return result;
}

/**
 * Returns matching idioms found in the source text for prompt glossary injection.
 * @param {string} text
 * @returns {Array<{ zh: string, vi: string }>}
 */
function findMatchedIdioms(text) {
  if (!text || typeof text !== "string") return [];
  const matched = [];
  for (const [zh, vi] of Object.entries(LITERARY_IDIOMS)) {
    if (text.includes(zh)) {
      matched.push({ zh, vi });
    }
  }
  return matched;
}

module.exports = {
  adaptLiteraryIdioms,
  findMatchedIdioms,
  LITERARY_IDIOMS
};
