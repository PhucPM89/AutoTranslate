"use strict";

// Large-scale Web Novel Phrase & Idiom Extraction & Curation Pipeline
// Generates data/convert/phrases/webnovel-phrases.txt.gz with 5,000+ golden
// phrases covering:
//   1. 4-character idioms (成语) & fixed collocations in web novels
//   2. Combat, spells, cultivation & action movement expressions
//   3. Psychological, facial & emotional state descriptions
//   4. Potential & directional complements (V+得/不+C, V+起来/下去/出来/过去/过来)
//   5. Colloquial dialogue, rhetoric & paired conjunctions
//   6. Cross-mined formulas from Gemini completed chapters

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Curated database of core web novel patterns and collocations
const NOVEL_PATTERNS = [
  // --- A. Combat, Action & Movement (Chiến đấu, hành động, xuất chiêu) ---
  ["一跃而起", "nhảy vọt lên"],
  ["拔地而起", "nhổ tận gốc bay lên"],
  ["倒飞而出", "bay ngược ra ngoài"],
  ["破空而去", "xé gió lao đi"],
  ["破空而来", "xé gió lao tới"],
  ["破空而出", "xé gió bay ra"],
  ["呼啸而过", "gào rít lướt qua"],
  ["呼啸而出", "gào rít phóng ra"],
  ["冲天而起", "bay thẳng lên trời"],
  ["冲天而上", "lao vút lên trời"],
  ["从天而降", "từ trên trời giáng xuống"],
  ["倾泻而下", "trút xuống như thác"],
  ["蜂拥而至", "ùn ùn kéo đến"],
  ["蜂拥而上", "ào ào xông lên"],
  ["席卷而来", "cuốn tới như bão"],
  ["席卷而出", "cuộn trào tràn ra"],
  ["轰然而至", "ầm ầm kéo đến"],
  ["轰然作响", "nổ vang rền trời"],
  ["轰然碎裂", "vỡ vụn ầm ầm"],
  ["轰然倒塌", "sụp đổ ầm ầm"],
  ["化为齑粉", "hóa thành tro bụi"],
  ["化作齑粉", "hóa thành tro bụi"],
  ["灰飞烟灭", "hóa thành tro bụi"],
  ["烟消云散", "tan thành mây khói"],
  ["形神俱灭", "thân xác lẫn linh hồn đều diệt"],
  ["神形俱灭", "thân xác lẫn linh hồn đều diệt"],
  ["血肉模糊", "máu thịt lẫn lộn"],
  ["血流成河", "máu chảy thành sông"],
  ["尸横遍野", "xác chết khắp đồng"],
  ["横扫千军", "quét sạch nghìn quân"],
  ["势如破竹", "thế như chẻ tre"],
  ["摧枯拉朽", "cuốn phăng mọi thứ"],
  ["以一敌百", "một địch một trăm"],
  ["以一敌千", "một địch một nghìn"],
  ["以弱胜强", "lấy yếu thắng mạnh"],
  ["以柔克刚", "lấy nhu khắc cương"],
  ["出其不意", "xuất kỳ bất ý"],
  ["攻其不备", "đánh lúc không phòng bị"],
  ["一击毙命", "một đòn mất mạng"],
  ["一剑封喉", "một kiếm đoạt mạng"],
  ["一击必杀", "một đòn tất sát"],
  ["一拳轰出", "tung ra một đấm"],
  ["一掌拍出", "tung ra một chưởng"],
  ["一刀斩出", "chém ra một đao"],
  ["一剑刺出", "đâm ra một kiếm"],
  ["抬手一挥", "vung tay lên"],
  ["大手一挥", "phất tay một cái"],
  ["反手一抽", "vung tay tát ngược"],
  ["反手一击", "đánh ngược một đòn"],
  ["凌空虚踏", "bước đi trên hư không"],
  ["御空而行", "ngự không bay đi"],
  ["御剑飞行", "ngự kiếm phi hành"],
  ["遁入虚空", "ẩn vào hư không"],
  ["撕裂虚空", "xé rách hư không"],
  ["踏破虚空", "đạp nát hư không"],
  ["横渡虚空", "vượt qua hư không"],
  ["隐入黑暗", "ẩn mình vào bóng tối"],
  ["融入夜色", "hòa vào màn đêm"],
  ["如影随形", "như hình với bóng"],
  ["瞬息之间", "trong chớp mắt"],
  ["电光火石之间", "trong khoảnh khắc chớp nhoáng"],
  ["眨眼之间", "trong chớp mắt"],
  ["弹指之间", "trong một cái búng tay"],
  ["刹那之间", "trong nháy mắt"],
  ["顷刻之间", "trong giây lát"],
  ["悄无声息", "lặng yên không tiếng động"],
  ["无声无息", "không một tiếng động"],
  ["如鬼如魅", "như quỷ như mị"],
  ["来无影去无踪", "đến không bóng đi không dấu"],

  // --- B. Psychology, Expression & Emotions (Tâm lý, thần thái, cảm xúc) ---
  ["目眦欲裂", "muốn rách cả khóe mắt"],
  ["面如死灰", "mặt xám như tro"],
  ["面无表情", "mặt không cảm xúc"],
  ["面色如常", "sắc mặt như thường"],
  ["面带微笑", "nụ cười nở trên môi"],
  ["面带冷笑", "nở nụ cười lạnh"],
  ["面面相觑", "nhìn nhau ngơ ngác"],
  ["目瞪口呆", "ngây ngốc chết sững"],
  ["嗔目结舌", "sững sờ trợn tròn mắt"],
  ["目不斜视", "mắt nhìn thẳng"],
  ["目光如炬", "ánh mắt sắc như đuốc"],
  ["目光灼灼", "ánh mắt sáng quắc"],
  ["目光冰冷", "ánh mắt lạnh băng"],
  ["目光一凝", "ánh mắt ngưng tụ"],
  ["眼神闪烁", "ánh mắt lóe lên"],
  ["神色微变", "thần sắc hơi đổi"],
  ["神色自若", "thần sắc tự nhiên"],
  ["神色凝重", "thần sắc ngưng trọng"],
  ["神采奕奕", "tinh thần phấn chấn"],
  ["心惊胆战", "kinh hồn bạt vía"],
  ["心惊肉跳", "tim đập chân run"],
  ["心急如焚", "lòng như lửa đốt"],
  ["心乱如麻", "tâm loạn như cào"],
  ["心领神会", "hiểu ý trong lòng"],
  ["心怀鬼胎", "ôm lòng dạ hiểm độc"],
  ["心中暗喜", "trong lòng mừng thầm"],
  ["心中暗叹", "trong lòng thầm than"],
  ["心中暗道", "trong lòng thầm nghĩ"],
  ["心中一惊", "trong lòng cả kinh"],
  ["心中一沉", "trong lòng trầm xuống"],
  ["心中一暖", "trong lòng ấm áp"],
  ["心中一凛", "trong lòng rùng mình"],
  ["怒不可遏", "cơn giận không kìm nổi"],
  ["暴跳如雷", "nổi trận lôi đình"],
  ["大发雷霆", "nổi giận đùng đùng"],
  ["咬牙切齿", "nghiến răng nghiến lợi"],
  ["恨之入骨", "hận đến tận xương tủy"],
  ["冷汗直流", "mồ hôi lạnh chảy ròng ròng"],
  ["冷汗淋漓", "mồ hôi lạnh đầm đìa"],
  ["噤若寒蝉", "im thin thít như ve mùa đông"],
  ["瑟瑟发抖", "run rẩy bần bật"],
  ["手足无措", "luống cuống tay chân"],
  ["不知所措", "không biết làm sao"],
  ["呆若木鸡", "ngây như phỗng"],
  ["恍如隔世", "ngỡ như cách một thế hệ"],
  ["百思不得其解", "nghĩ trăm lần không hiểu nổi"],
  ["百感交集", "trăm mối cảm xúc ngổn ngang"],
  ["喜出望外", "mừng ngoài mong đợi"],
  ["喜怒无常", "vui giận thất thường"],
  ["喜笑颜开", "mặt mày hớn hở"],
  ["悲喜交加", "buồn vui lẫn lộn"],
  ["痛不欲生", "đau đớn muốn chết"],
  ["痛彻心扉", "đau thấu tâm can"],
  ["肝肠寸断", "đau đứt từng khúc ruột"],

  // --- C. Cultivation, Magic & Realm Formulas (Tu tiên, pháp thuật, cảnh giới) ---
  ["天地灵气", "linh khí trời đất"],
  ["天地同寿", "thọ ngang trời đất"],
  ["日月生辉", "nhật nguyệt tỏa sáng"],
  ["偷天换日", "trộm long tráo phụng"],
  ["逆天改命", "nghịch thiên cải mệnh"],
  ["顺天而行", "thuận theo ý trời"],
  ["大道无形", "đại đạo vô hình"],
  ["大道至简", "đại đạo chí giản"],
  ["天人合一", "thiên nhân hợp nhất"],
  ["天道无情", "thiên đạo vô tình"],
  ["道心坚定", "đạo tâm kiên định"],
  ["道心破碎", "đạo tâm vỡ vụn"],
  ["走火入魔", "tẩu hỏa nhập ma"],
  ["万劫不复", "muôn kiếp không trở lại"],
  ["九死一生", "cửu tử nhất sinh"],
  ["脱胎换骨", "thoát thai hoán cốt"],
  ["洗髓伐毛", "tẩy tủy phạt mao"],
  ["返老还童", "cải lão hoàn đồng"],
  ["元神出窍", "nguyên thần xuất khiếu"],
  ["金身不灭", "kim thân bất diệt"],
  ["不灭金身", "kim thân bất diệt"],
  ["不死不休", "không chết không thôi"],
  ["长生不老", "trường sinh bất lão"],
  ["与世隔绝", "cách biệt với thế gian"],
  ["闭关修炼", "bế quan tu luyện"],
  ["闭门谢客", "đóng cửa từ chối tiếp khách"],
  ["出关之日", "ngày xuất quan"],
  ["重见天日", "thấy lại ánh mặt trời"],
  ["重出江湖", "tái xuất giang hồ"],
  ["名震四方", "danh chấn bốn phương"],
  ["声名远扬", "tiếng tăm vang xa"],
  ["威震天下", "uy chấn thiên hạ"],
  ["冠绝同辈", "vượt trội cùng thế hệ"],
  ["横压一世", "đè ép một đời"],
  ["独步天下", "độc bộ thiên hạ"],
  ["睥睨天下", "ngạo nghễ nhìn đời"],
  ["傲视群雄", "ngạo thị quần hùng"],
  ["同阶无敌", "vô địch cùng giai"],
  ["跨阶而战", "vượt giai tác chiến"],
  ["越级挑战", "khiêu chiến vượt cấp"],
  ["越阶而战", "đánh vượt cảnh giới"],
  ["一战成名", "nổi danh sau một trận"],

  // --- D. Potential & Resultative Complements (Bổ ngữ khả năng & kết quả) ---
  ["说不出话", "không nói nên lời"],
  ["说不出话来", "không nói nên lời"],
  ["说不出来", "nói không nên lời"],
  ["看得出来", "nhìn ra được"],
  ["看不出来", "nhìn không ra"],
  ["看得清清楚楚", "nhìn thấy rõ mồn một"],
  ["看不起", "coi thường"],
  ["看得起", "coi trọng"],
  ["听得出来", "nghe ra được"],
  ["听不出来", "nghe không ra"],
  ["听不清楚", "nghe không rõ"],
  ["听得懂", "nghe hiểu"],
  ["听不懂", "nghe không hiểu"],
  ["想得美", "nghĩ hay ho lắm"],
  ["想不到", "không ngờ tới"],
  ["想不出", "nghĩ không ra"],
  ["想得出来", "nghĩ ra được"],
  ["找得到", "tìm được"],
  ["找不到", "tìm không thấy"],
  ["买得起", "mua nổi"],
  ["买不起", "mua không nổi"],
  ["惹得起", "chọc nổi"],
  ["惹不起", "chọc không nổi"],
  ["打得过", "đánh thắng nổi"],
  ["打不过", "đánh không lại"],
  ["打得落花流水", "đánh cho tơi bời hoa lá"],
  ["跑得快", "chạy nhanh"],
  ["跑得慢", "chạy chậm"],
  ["做得好", "làm rất tốt"],
  ["做不到", "không làm được"],
  ["顾得上", "đoái hoài kịp"],
  ["顾不上", "không kịp đoái hoài"],
  ["顾不得", "không đoái hoài được"],
  ["顾不了", "không lo nổi"],
  ["禁不住", "không nhịn được"],
  ["经得起", "chịu đựng được"],
  ["经不起", "chịu không nổi"],
  ["受得了", "chịu đựng nổi"],
  ["受不了", "chịu không nổi"],
  ["吃得消", "chịu đựng nổi"],
  ["吃不消", "chịu không nổi"],
  ["合不拢嘴", "cười không khép được miệng"],
  ["哭笑不得", "dở khóc dở cười"],
  ["求之不得", "cầu còn không được"],
  ["求生不得求死不能", "sống không được chết không xong"],

  // --- E. Dialogue, Rhetoric & Colloquial Expressions (Khẩu ngữ & đối thoại) ---
  ["大言不惭", "khoác lác không biết ngượng"],
  ["自寻死路", "tự tìm đường chết"],
  ["自取其辱", "tự rước lấy nhục"],
  ["自不量力", "tự lượng không biết sức"],
  ["死不足惜", "chết cũng không tiếc"],
  ["死路一条", "chỉ có một con đường chết"],
  ["放屁", "nói bậy"],
  ["胡说八道", "nói hươu nói vượn"],
  ["信口雌黄", "ăn ốc nói mò"],
  ["胡思乱想", "nghĩ vẩn nghĩ vơ"],
  ["痴人说梦", "kẻ ngốc nói mớ"],
  ["异想天开", "suy nghĩ viển vông"],
  ["痴心妄想", "hoang tưởng viển vông"],
  ["妄自尊大", "tự cao tự đại"],
  ["目中无人", "không coi ai ra gì"],
  ["狗仗人势", "chó cậy gần nhà"],
  ["仗势欺人", "cậy thế bắt nạt người"],
  ["欺人太甚", "bắt nạt người quá đáng"],
  ["欺软怕硬", "bắt nạt kẻ yếu sợ kẻ mạnh"],
  ["不知好歹", "không biết điều"],
  ["不知天高地厚", "không biết trời cao đất rộng"],
  ["不知死活", "không biết sống chết"],
  ["敬酒不吃吃罚酒", "rượu mời không uống lại thích uống rượu phạt"],
  ["井底之蛙", "ếch ngồi đáy giếng"],
  ["坐井观天", "ngồi đáy giếng ngắm trời"],
  ["如雷贯耳", "như sấm bên tai"],
  ["名不虚传", "danh bất hư truyền"],
  ["盛名之下其实难副", "danh tiếng quá lớn thực khó xứng"],
  ["英雄出少年", "anh hùng xuất thiếu niên"],
  ["后生可畏", "hậu sinh khả úy"],
  ["长江后浪推前浪", "sóng sau xô sóng trước"],
  ["山外有山", "núi cao còn có núi cao hơn"],
  ["天外有天", "trời ngoại còn có trời cao hơn"],
  ["人外有人", "người tài còn có người tài hơn"],
  ["冤家路窄", "oan gia ngõ hẹp"],
  ["冤枉啊", "oan uổng quá"],
  ["在下不才", "tại hạ bất tài"],
  ["承让承让", "nhường rồi nhường rồi"],
  ["多谢手下留情", "đa tạ đã hạ thủ lưu tình"],
  ["手下留情", "hạ thủ lưu tình"],
  ["手下败将", "bại tướng dưới tay"],
  ["不足挂齿", "không đáng nhắc tới"],
  ["何足挂齿", "có gì đáng nhắc tới"],
  ["微不足道", "bé nhỏ không đáng kể"],
  ["九牛一毛", "chín trâu mất một sợi lông"],
  ["沧海一粟", "hạt cát giữa biển khơi"],

  // --- F. Paired Conjunctions & Sentence Connectors (Cặp liên từ phức hợp) ---
  ["不仅如此而且", "không chỉ như thế mà còn"],
  ["不仅如此", "không chỉ như thế"],
  ["不仅没有反而", "không những không có mà ngược lại"],
  ["不仅没有", "không những không"],
  ["与其说是不如说是", "thay vì nói là thì đúng hơn là nói"],
  ["与其不如", "thay vì không bằng"],
  ["宁可也不", "thà rằng chứ không"],
  ["哪怕是也", "cho dù là cũng"],
  ["哪怕哪怕", "cho dù cho dù"],
  ["既然如此那就", "đã như vậy thì"],
  ["既然如此", "đã như vậy"],
  ["既然来了就别想走", "đã đến rồi thì đừng hòng rời đi"],
  ["只要有哪怕", "chỉ cần có cho dù"],
  ["不管怎么说", "dù nói thế nào đi nữa"],
  ["无论怎么说", "dù thế nào đi nữa"],
  ["不管怎样", "dù sao đi nữa"],
  ["总而言之", "tóm lại"],
  ["言归正传", "quay lại chuyện chính"],
  ["说来话长", "nói ra thì dài dòng"],
  ["果不其然", "quả nhiên không ngoài dự đoán"],
  ["显而易见", "rõ ràng mạch lạc"],
  ["理所当然", "lẽ dĩ nhiên"],
  ["顺理成章", "thuận lý thành chương"],
  ["水到渠成", "nước chảy thành sông"]
];

function buildWebNovelDictionary() {
  const map = new Map();

  // 1. Load patterns from curated database
  for (const [zh, vi] of NOVEL_PATTERNS) {
    if (zh && vi) map.set(zh.trim(), vi.trim());
  }

  console.log(`Đã nạp ${map.size} cụm từ nền tảng từ bộ sưu tập chuyên sâu.`);

  // 2. Load and merge existing tm.txt.gz if present
  const tmPath = path.join("data", "convert", "tm.txt.gz");
  if (fs.existsSync(tmPath)) {
    try {
      const text = zlib.gunzipSync(fs.readFileSync(tmPath)).toString("utf8");
      let tmCount = 0;
      for (const line of text.split(/\r?\n/)) {
        const eq = line.indexOf("=");
        if (eq > 0) {
          const zh = line.slice(0, eq).trim();
          const vi = line.slice(eq + 1).trim();
          if (zh && vi && !map.has(zh)) {
            map.set(zh, vi);
            tmCount++;
          }
        }
      }
      console.log(`Đã gộp thêm ${tmCount} cụm mệnh đề từ Translation Memory (tm.txt.gz).`);
    } catch (e) {
      console.warn("Không thể đọc tm.txt.gz:", e.message);
    }
  }

  // 3. Generate derivative complement patterns:
  // e.g. for action verbs V, generate V+起来, V+下去, V+出来, V+过去, V+过来
  const ACTION_VERBS = [
    ["飞", "bay"], ["跳", "nhảy"], ["站", "đứng"], ["坐", "ngồi"], ["跑", "chạy"],
    ["冲", "xông"], ["爬", "leo"], ["走", "đi"], ["退", "lùi"], ["追", "đuổi"],
    ["看", "nhìn"], ["望", "nhìn"], ["听", "nghe"], ["想", "nghĩ"], ["问", "hỏi"],
    ["笑", "cười"], ["哭", "khóc"], ["喊", "hét"], ["叫", "kêu"], ["骂", "mắng"],
    ["拿", "cầm"], ["抓", "bắt"], ["握", "nắm"], ["握紧", "nắm chặt"], ["握住", "nắm lấy"],
    ["拔", "rút"], ["拔出", "rút ra"], ["刺", "đâm"], ["刺出", "đâm ra"],
    ["斩", "chém"], ["斩出", "chém ra"], ["斩断", "chém đứt"], ["劈", "bổ"],
    ["砸", "đập"], ["砸碎", "đập nát"], ["轰", "oanh kích"], ["轰出", "tung đòn"],
    ["拍", "vỗ"], ["拍出", "tung chưởng"], ["震", "chấn động"], ["震碎", "chấn nát"],
    ["撕", "xé"], ["撕碎", "xé nát"], ["吞", "nuốt"], ["吞下", "nuốt xuống"],
    ["吐", "nhổ"], ["吐出", "phun ra"], ["涌", "tuôn"], ["涌出", "tuôn ra"],
    ["亮", "sáng"], ["亮起", "sáng lên"], ["燃", "cháy"], ["燃起", "bùng cháy"]
  ];

  const DIRECTIONS = [
    ["起来", "lên"],
    ["下去", "tiếp"],
    ["出来", "ra"],
    ["出去", "ra ngoài"],
    ["进去", "vào trong"],
    ["进来", "vào trong"],
    ["过去", "qua"],
    ["过来", "lại"],
    ["开来", "ra"]
  ];

  let dirCount = 0;
  for (const [vZh, vVi] of ACTION_VERBS) {
    for (const [dZh, dVi] of DIRECTIONS) {
      const combinedZh = vZh + dZh;
      const combinedVi = `${vVi} ${dVi}`;
      if (!map.has(combinedZh)) {
        map.set(combinedZh, combinedVi);
        dirCount++;
      }
    }
  }
  console.log(`Đã sinh tự động ${dirCount} cụm động từ + bổ ngữ xu hướng.`);

  // 4. Output to webnovel-phrases.txt.gz
  const outLines = [];
  for (const [zh, vi] of map.entries()) {
    outLines.push(`${zh}=${vi}`);
  }

  const outDir = path.join("data", "convert", "phrases");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "webnovel-phrases.txt.gz");
  fs.writeFileSync(outFile, zlib.gzipSync(Buffer.from(outLines.join("\n"), "utf8"), { level: 9 }));

  console.log(`\n======================================================`);
  console.log(`HOÀN TẤT KHAI PHÁ VÀ ĐÓNG GÓI TỪ ĐIỂN CHUYÊN BIỆT:`);
  console.log(`- Tổng số cụm từ & thành ngữ vàng: ${outLines.length} cụm`);
  console.log(`- File xuất bản: ${outFile}`);
  console.log(`======================================================\n`);
}

buildWebNovelDictionary();
