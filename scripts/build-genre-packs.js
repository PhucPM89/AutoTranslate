"use strict";

// Generator for Genre-Specific Dictionary Packs
// Creates 6 specialized dictionary packs in data/convert/genres/:
//   1. genre-xianxia.txt.gz  (Tiên Hiệp, Huyền Huyễn, Tu Chân, Cổ Võ)
//   2. genre-modern.txt.gz   (Đô Thị, Tổng Tài, Y Thuật, Thương Trường, Trọng Sinh)
//   3. genre-romance.txt.gz  (Cung Đấu, Trạch Đấu, Cổ Đại Ngôn Tình, Nữ Cường, Điền Văn)
//   4. genre-system.txt.gz   (Võng Du, Hệ Thống, Vô Hạn Lưu, Xuyên Nhanh)
//   5. genre-scifi.txt.gz    (Khoa Huyễn, Cơ Giáp, Mạt Thế, Tinh Tế, Cyberpunk)
//   6. genre-horror.txt.gz   (Kinh Dị, Huyền Nghi, Trinh Thám, Linh Dị)

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const GENRES = {
  xianxia: [
    // Realms & Cultivation
    ["炼气期", "Luyện Khí kỳ"],
    ["筑基期", "Trúc Cơ kỳ"],
    ["金丹期", "Kim Đan kỳ"],
    ["元婴期", "Nguyên Anh kỳ"],
    ["化神期", "Hóa Thần kỳ"],
    ["炼虚期", "Luyện Hư kỳ"],
    ["合体期", "Hợp Thể kỳ"],
    ["大乘期", "Đại Thừa kỳ"],
    ["渡劫期", "Độ Kiếp kỳ"],
    ["半步至尊", "nửa bước Chí Tôn"],
    ["至尊境", "Chí Tôn cảnh"],
    ["准帝", "Chuẩn Đế"],
    ["大帝", "Đại Đế"],
    ["真仙", "Chân Tiên"],
    ["金仙", "Kim Tiên"],
    ["仙王", "Tiên Vương"],
    ["仙帝", "Tiên Đế"],
    ["道祖", "Đạo Tổ"],
    // Terminology
    ["本尊", "bổn tôn"],
    ["老夫", "lão phu"],
    ["晚辈", "vãn bối"],
    ["前辈", "tiền bối"],
    ["道友", "đạo hữu"],
    ["师尊", "sư tôn"],
    ["孽徒", "nghịch đồ"],
    ["护山大阵", "hộ sơn đại trận"],
    ["空间戒指", "nhẫn trữ vật"],
    ["储物袋", "túi trữ vật"],
    ["洗髓丹", "Tẩy Tủy đan"],
    ["筑基丹", "Trúc Cơ đan"],
    ["破境丹", "Phá Cảnh đan"],
    ["九转金丹", "Cửu Chuyển Kim Đan"],
    ["天材地宝", "thiên tài địa bảo"],
    ["天劫", "thiên kiếp"],
    ["心魔", "tâm ma"],
    ["洞府", "động phủ"],
    ["掌教", "chưởng giáo"],
    ["太上长老", "Thái Thượng trưởng lão"],
    ["关门弟子", "đệ tử chân truyền"],
    ["内门弟子", "đệ tử nội môn"],
    ["外门弟子", "đệ tử ngoại môn"],
    ["杂役弟子", "đệ tử tạp dịch"]
  ],

  modern: [
    // Corporate & Society
    ["总裁", "Tổng tài"],
    ["董事长", "Chủ tịch Hội đồng quản trị"],
    ["总经理", "Tổng giám đốc"],
    ["副总", "Phó tổng"],
    ["特助", "trợ lý đặc biệt"],
    ["秘书", "thư ký"],
    ["集团", "tập đoàn"],
    ["分公司", "công ty con"],
    ["董事会", "Hội đồng quản trị"],
    ["股票上市", "niêm yết cổ phiếu"],
    ["融资", "gọi vốn"],
    ["投资人", "nhà đầu tư"],
    ["首富", "người giàu nhất"],
    ["豪门", "hào môn"],
    ["世家", "thế gia"],
    ["财阀", "tài phiệt"],
    ["富二代", "phú nhị đại"],
    ["纨绔子弟", "công tử bột"],
    // Medical & Urban Professions
    ["主治医师", "bác sĩ chủ trị"],
    ["急诊科", "khoa cấp cứu"],
    ["重症监护室", "phòng chăm sóc đặc biệt"],
    ["院长", "Viện trưởng"],
    ["外科手术", "phẫu thuật ngoại khoa"],
    ["银针", "kim châm cứu"],
    ["神医", "thần y"],
    ["医圣", "Y Thánh"],
    ["私家侦探", "thám tử tư"],
    ["特种兵", "lính đặc chủng"],
    ["兵王", "Binh Vương"],
    ["保镖", "vệ sĩ"],
    // Urban Slang & Expressions
    ["潜规则", "quy tắc ngầm"],
    ["买单", "thanh toán"],
    ["刷卡", "quẹt thẻ"],
    ["黑卡", "thẻ đen"],
    ["自拍", "chụp ảnh tự sướng"],
    ["朋友圈", "vòng bạn bè"],
    ["发微信", "nhắn tin WeChat"],
    ["吃醋", "ghen tuông"],
    ["打脸", "vả mặt"],
    ["装逼", "giả vờ ngầu"]
  ],

  romance: [
    // Imperial & Court Titles
    ["皇帝", "Hoàng đế"],
    ["陛下", "Bệ hạ"],
    ["太后", "Thái hậu"],
    ["太上皇", "Thái Thượng hoàng"],
    ["皇后", "Hoàng hậu"],
    ["贵妃", "Quý phi"],
    ["本宫", "bổn cung"],
    ["臣妾", "thần thiếp"],
    ["哀家", "ai gia"],
    ["朕", "trẫm"],
    ["微臣", "vi thần"],
    ["王爷", "Vương gia"],
    ["王妃", "Vương phi"],
    ["侧妃", "Trắc phi"],
    ["郡主", "Quận chúa"],
    ["公主", "Công chúa"],
    ["驸马", "Phò mã"],
    ["世子", "Thế tử"],
    ["公公", "công công"],
    ["嬷嬷", "ma ma"],
    ["奴婢", "nô tỳ"],
    ["奴才", "nô tài"],
    ["掌嘴", "vả miệng"],
    ["赐死", "ban chết"],
    ["打入冷宫", "đày vào lãnh cung"],
    // Family & Residence Hierarchy
    ["嫡女", "đích nữ"],
    ["庶女", "thứ nữ"],
    ["嫡子", "đích tử"],
    ["庶子", "thứ tử"],
    ["大夫人", "Đại phu nhân"],
    ["主母", "chủ mẫu"],
    ["姨娘", "di nương"],
    ["通房", "nha hoàn thông phòng"],
    ["贴身丫鬟", "nha hoàn thân cận"],
    ["侯府", "Hầu phủ"],
    ["国公府", "Quốc Công phủ"],
    ["相府", "Tướng phủ"],
    ["尚书府", "Thượng Thư phủ"],
    ["退婚", "từ hôn"],
    ["联姻", "liên hôn"],
    ["明媒正娶", "cưới hỏi đàng hoàng"],
    ["抬为平妻", "nâng lên làm bình thê"],
    ["休妻", "bỏ vợ"],
    ["和离", "hòa ly"]
  ],

  system: [
    // System Prompts & Mechanics
    ["叮！", "Đinh!"],
    ["【系统提示】", "【Nhắc nhở của Hệ Thống】"],
    ["【任务完成】", "【Hoàn thành Nhiệm vụ】"],
    ["【任务失败】", "【Nhiệm vụ Thất bại】"],
    ["【隐藏任务】", "【Nhiệm vụ Ẩn】"],
    ["【属性面板】", "【Bảng Thuộc tính】"],
    ["【个人信息】", "【Thông tin Cá nhân】"],
    ["【新手大礼包】", "【Gói quà Tân thủ】"],
    ["【恭喜宿主】", "【Chúc mừng Ký chủ】"],
    ["宿主", "ký chủ"],
    ["绑定系统", "trói định hệ thống"],
    ["签到成功", "điểm danh thành công"],
    ["暴击", "đòn chí mạng"],
    ["暴击率", "tỷ lệ chí mạng"],
    ["十倍暴击", "bạo kích gấp mười"],
    ["百倍返还", "hoàn trả gấp trăm lần"],
    ["神级选择", "lựa chọn Thần cấp"],
    ["抽奖", "rút thưởng"],
    // RPG & Game Stats
    ["生命值", "Điểm sinh mệnh (HP)"],
    ["魔法值", "Điểm ma pháp (MP)"],
    ["力量", "Sức mạnh"],
    ["敏捷", "Nhanh nhẹn"],
    ["智力", "Trí lực"],
    ["体质", "Thể chất"],
    ["耐力", "Sức bền"],
    ["经验值", "Điểm kinh nghiệm (EXP)"],
    ["升级", "thăng cấp"],
    ["技能点", "điểm kỹ năng"],
    ["副本", "phó bản"],
    ["刷怪", "cày quái"],
    ["掉落", "rơi ra"],
    ["首杀", "First Blood (giết đầu tiên)"],
    ["终极Boss", "Trùm cuối"],
    ["公会", "bang hội"],
    ["NPC", "NPC"]
  ],

  scifi: [
    // Space & Fleets
    ["星舰", "chiến hạm không gian"],
    ["母舰", "tàu mẹ"],
    ["巡洋舰", "tuần dương hạm"],
    ["歼击机", "chiến đấu cơ"],
    ["跃迁", "nhảy vọt không gian (warp)"],
    ["曲率引擎", "động cơ bẻ cong không gian"],
    ["虫洞", "lỗ sâu không gian"],
    ["空间跳跃", "bước nhảy không gian"],
    ["光年", "năm ánh sáng"],
    ["星系", "hệ sao"],
    ["恒星系", "hệ định tinh"],
    ["星区", "khu vực sao"],
    ["黑洞", "hố đen"],
    ["中子星", "sao neutron"],
    ["白矮星", "sao lùn trắng"],
    // Technology & Cyberpunk
    ["光脑", "quang não"],
    ["人工智能", "trí tuệ nhân tạo (AI)"],
    ["主脑", "máy chủ trung tâm"],
    ["机甲", "cơ giáp"],
    ["神经连接", "kết nối thần kinh"],
    ["全息投影", "chiếu hình 3D toàn ký"],
    ["义体改造", "cải tạo cơ thể máy"],
    ["脑机接口", "giao diện não - máy"],
    ["纳米机器人", "robot nano"],
    ["基因药剂", "thuốc kích hoạt gen"],
    ["基因锁", "khóa gen"],
    ["基因突变", "đột biến gen"],
    ["能量护盾", "khiên năng lượng"],
    ["电磁轨道炮", "pháo ray điện từ"],
    ["粒子光束", "chùm hạt năng lượng"],
    ["反物质", "phản vật chất"],
    ["戴森球", "quả cầu Dyson"],
    ["星际联邦", "Liên bang Tinh tế"],
    ["帝国舰队", "Hạm đội Đế quốc"]
  ],

  horror: [
    // Paranormal & Investigation
    ["厉鬼", "lệ quỷ"],
    ["怨魂", "oán hồn"],
    ["阴阳眼", "mắt âm dương"],
    ["鬼门关", "quỷ môn quan"],
    ["黄泉路", "đường hoàng tuyền"],
    ["地府", "địa phủ"],
    ["阴差", "âm sai"],
    ["黑白无常", "Hắc Bạch Vô Thường"],
    ["判官", "Phán Quan"],
    ["阎王", "Diêm Vương"],
    ["降头术", "thuật ngải"],
    ["蛊毒", "độc cổ"],
    ["赶尸", "đuổi xác"],
    ["尸变", "xác chết biến đổi (cương thi)"],
    ["僵尸", "cương thi"],
    ["血光之灾", "tai họa đổ máu"],
    ["风水大师", "đại sư phong thủy"],
    ["罗盘", "la bàn phong thủy"],
    ["桃木剑", "kiếm gỗ đào"],
    ["朱砂", "chu sa"],
    ["黄符", "bùa vàng"],
    ["法事", "làm phép"],
    // Crime & Investigation
    ["停尸房", "nhà xác"],
    ["法医", "pháp y"],
    ["尸检报告", "báo cáo khám nghiệm tử thi"],
    ["死因", "nguyên nhân tử vong"],
    ["凶手", "hung thủ"],
    ["案发现场", "hiện trường vụ án"],
    ["第一现场", "hiện trường thứ nhất"],
    ["密室杀人", "án mạng phòng kín"],
    ["不在场证明", "chứng cứ ngoại phạm"],
    ["连环杀手", "kẻ sát nhân hàng loạt"],
    ["诡异", "quỷ dị"],
    ["阴森", "u ám rùng rợn"],
    ["毛骨悚然", "rợn tóc gáy"],
    ["不寒而栗", "lạnh sống lưng"]
  ]
};

function buildGenrePacks() {
  const outDir = path.join("data", "convert", "genres");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("Bắt đầu khởi tạo các gói từ điển chuyên sâu theo 6 thể loại lớn:\n");

  for (const [genreKey, entries] of Object.entries(GENRES)) {
    const lines = [];
    for (const [zh, vi] of entries) {
      if (zh && vi) lines.push(`${zh.trim()}=${vi.trim()}`);
    }
    const outFile = path.join(outDir, `genre-${genreKey}.txt.gz`);
    fs.writeFileSync(outFile, zlib.gzipSync(Buffer.from(lines.join("\n"), "utf8"), { level: 9 }));
    console.log(`✓ [${genreKey.toUpperCase()}] Đã xuất bản: ${outFile} (${lines.length} thuật ngữ chuyên sâu)`);
  }

  console.log("\n======================================================");
  console.log("HOÀN TẤT ĐÓNG GÓI 6 PROFILE THỂ LOẠI CHUYÊN BIỆT!");
  console.log("======================================================\n");
}

buildGenrePacks();
