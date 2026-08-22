"use strict";
const path = require("path");
const fs = require("fs");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

const PERFECT_METADATA = {
  "fanqie-7504576095325277209": {
    title: "Kẻ Ngốc Bị Sư Nương Lừa Đi Tu Luyện",
    author: "Lâm Tiểu Vũ",
    description: "【Huyền huyễn hài hước + Nhiều nữ chính + Lão lục + Nâng cấp vô địch + Nhịp điệu nhanh】\nLý Hướng Dương xuyên không trở thành một thiếu niên ngốc nghếch ở thôn quê, ngày nọ được sư nương tuyệt sắc đưa về núi bắt đầu con đường tu luyện. Vốn tưởng là trò đùa, không ngờ hắn lại thức tỉnh thể chất nghịch thiên, một đường quét ngang tu chân giới!"
  },
  "fanqie-7280384971217308734": {
    title: "Vô Địch Lục Hoàng Tử: Phụ Hoàng, Ngươi Làm Khổ Nhi Thần Rồi!",
    author: "Chỉ Bao",
    description: "（Đơn nữ chính - Ngọt ngào hài hước - Có hệ thống tu luyện - Bối cảnh rộng lớn）\nThẩm Diệc An xuyên không vào một cuốn tiểu thuyết kỳ lạ, từ trong bụng mẹ sinh ra phát hiện mình là Lục hoàng tử của Đại Càn vương triều, Sở Vương điện hạ phong lưu phóng khoáng. Cứ tưởng an nhàn hưởng thụ vinh hoa phú quý, ai ngờ các hoàng huynh và triều đình lại liên tục kéo hắn vào những cuộc tranh đấu dở khóc dở cười!"
  },
  "fanqie-7391470957807815742": {
    title: "Trò Chơi Tử Vong: Ta Có Thể Nhìn Thấy Giản Giới Vật Phẩm!",
    author: "Hi Châu Thế Châu",
    description: "【Vô hạn lưu + Hài hước giải trí + Không nữ chính + Livestream + Cực sảng】\nTả Thành An bị kéo vào trò chơi sinh tồn thế giới, thức tỉnh kỹ năng thần cấp duy nhất 'Chân Thực Chi Nhãn'! Từ đó nhìn thấy một mặt hoàn toàn khác của trò chơi: một cành cây ven đường cũng chứa đựng bí mật kinh thiên, giúp hắn ung dung vượt qua mọi cửa ải hiểm ác!"
  },
  "fanqie-7372021637236935742": {
    title: "Cách Hắn Tu Tiên Khiến Cả Tu Chân Giới Sụp Đổ!",
    author: "Lệnh Đa Tình",
    description: "【Tà tu Địa Cầu + Không hậu cung + Vô địch + Hài hước bựa + Xuyên không】\nĐệ tử mới nhập môn hốt hoảng chạy vào báo:\n'Chưởng môn, nguy to rồi, đại sư huynh đi cướp tiền!'\n'Làm gì mà ầm ĩ, đó là đại sư huynh đang kiếm phúc lợi cho tông môn chúng ta!'\n'Đại sư huynh bắt cóc tống tiền kìa!'\n'Đã bảo là kiếm phúc lợi rồi mà!'\n'Nhưng đại sư huynh nhập ma rồi!'\n'Chúc mừng, tu vi của hắn rốt cuộc cũng có tiến bộ!'\n'Nhưng mà hắn còn giết người nữa!'\n'Thế sao ngươi còn không mau đi giúp một tay? Các đệ tử, vác đồ nghề lên!'"
  },
  "fanqie-7077546460056652803": {
    title: "Đạp Thiên Cảnh",
    author: "Vĩnh Dạ Tinh Hà",
    description: "【Đại thần đổi acc, Đơn nữ chính, Sát phạt quyết đoán】\nTương truyền trong thế gian có một cảnh giới, có thể truy tìm nhân quả, chỉ bằng một tia thần lực xóa bỏ mọi vết tích trong thời không của đối phương; có thể nắm giữ sinh tử, một ý niệm vạn giới chìm nổi, chúng sinh vỡ vụn; có thể sánh ngang thiên đạo, nạp trật tự thiên địa làm của riêng, độc đoán vạn cổ.\nCảnh giới ấy mang tên: Đạp Thiên!\nThiếu niên Tô Tín, sinh ra... nhất định Đạp Thiên!"
  },
  "fanqie-7143038691944959011": {
    title: "Thập Nhật Chung Yên",
    author: "Sát Trùng Đội Đội Viên",
    description: "Top 1 Bảng Xếp Hạng Đỉnh Cao Fanqie 2024 | Tác phẩm xuất sắc đạt giải thưởng Văn học Mạng Trung Quốc | Hơn 2 triệu bản phát hành.\n(Không hậu cung, không bàn tay vàng vô lý, logic chặt chẽ, tình tiết đỉnh cao)\nKhi ta ngỡ rằng đây chỉ là một ngày bình thường, lại nhận ra mình bị bắt đến Vùng Đất Chung Yên.\nKhi ta ngỡ chỉ cần liên tục tham gia trò chơi sinh tử là có thể trốn thoát, lại phát hiện mọi người bắt đầu thức tỉnh siêu năng lực.\nKhi ta ngỡ nơi này là 'Vùng Đất Tạo Thần', tất cả lại đang lao nhanh về phía hủy diệt..."
  },
  "fanqie-7256784068786785336": {
    title: "Quỷ Xá",
    author: "Dạ Lai Phong Vũ Thanh",
    description: "【Vô hạn lưu + Linh dị hồi hộp + Sinh tồn + Đơn nữ chính】\nMột chiếc xe buýt không người lái chở theo một đám người bị nguyền rủa đi đến một căn Quỷ Xá đen kịt...\nBên trong Quỷ Xá có một cánh cửa nhuộm đẫm máu tươi. Cứ cách một khoảng thời gian, những kẻ bị nguyền rủa lại bị kéo vào thế giới đáng sợ sau Cửa Máu để hoàn thành các sự kiện kinh hoàng...\nKhi Ninh Thu Thủy trải qua hết câu chuyện kỳ quái này đến câu chuyện kinh dị khác, cửu tử nhất sinh sống sót, hắn mới phát hiện Quỷ Xá không đơn thuần là lời nguyền rủa..."
  },
  "fanqie-7077516958534470656": {
    title: "Phàm Cốt",
    author: "Nhất Canh Đại Sư",
    description: "Sinh ra mang thân xác phàm nhân không có linh căn tiên cốt, thiếu niên bước lên con đường nghịch thiên cải mệnh. Không dựa vào thiên phú nghịch thiên, chỉ dựa vào một bộ Phàm Cốt đúc bằng ý chí sắt đá và nắm đấm máu lửa đập tan mọi xiềng xích của Tiên môn, đúc nên truyền kỳ vạn cổ!"
  },
  "fanqie-7083672225286458406": {
    title: "Hư Không Tháp",
    author: "Tiêu Bất Ngữ",
    description: "Hư Không Tháp sừng sững giữa trời đất, giam giữ ngàn vạn bí mật cổ xưa và thần ma thượng cổ. Thiếu niên mang huyết mạch đặc thù từng bước leo lên từng tầng tháp, mở khóa phong ấn nghịch thiên, chém yêu diệt ma, vấn đỉnh chí tôn vũ trụ."
  },
  "fanqie-7445188900496083992": {
    title: "Tiên Giới Bế Quan Tiểu Năng Thủ",
    author: "Hương Quả Vị Nãi Trà",
    description: "Người khác tu tiên tranh đoạt cơ duyên liều mạng đánh chém, ta tu tiên chỉ thích bế quan trong động phủ. Cứ bế quan là nhận điểm thưởng tu vi, công pháp tự động viên mãn. Cứ như thế ẩn mình qua ngàn năm, đến khi xuất quan thì phát hiện cả Tiên Giới đã không còn ai là đối thủ!"
  },
  "fanqie-7364671902251502616": {
    title: "Phàm Nhân Tu Tiên Chi Phù Tổ",
    author: "Phiên Già Trạm Đại Tương",
    description: "Bắt đầu từ một tán tu phàm nhân tầm thường ở tầng đáy giới tu chân, nhờ am hiểu phù lục cổ pháp mà từng bước nghịch tập. Nhất phù định càn khôn, vạn phù trấn quần ma, trở thành Tổ Sư Phù Đạo chấn nhiếp tam giới!"
  },
  "fanqie-7253908182769077252": {
    title: "Linh Dị Phục Hồi: Vĩnh Dạ Giáng Lâm",
    author: "Khánh Nguyên Chức Cao Tiểu Thiên Tài",
    description: "Linh dị khôi phục, quỷ dị hoành hành, màn đêm vĩnh hằng bao trùm nhân loại. Giữa lúc tuyệt vọng cùng cực, nhân vật chính thức tỉnh năng lực đặc dị khống chế bóng tối, lấy quỷ khắc quỷ, từng bước thắp sáng ngọn lửa sinh tồn cho nhân loại."
  },
  "fanqie-7488955435421010968": {
    title: "Xa Lộ Tuần Tự: Đừng Để Tụt Lại Phía Sau!",
    author: "Sơn Hải Hô Khiếu",
    description: "Toàn cầu xuyên không vào Xa Lộ Tuần Tự vô tận, mỗi người chỉ có một chiếc xe cơ sở để tiến lên trong sương mù tử thần. Thu thập tài nguyên, nâng cấp xe, mở khóa chuỗi tuần tự siêu phàm và sinh tồn trước những cạm bẫy quái dị!"
  },
  "fanqie-7377931562463005720": {
    title: "Khởi Đầu Trường Sinh: Cẩu Ở Hạ Giới Tu Luyện Phi Thăng",
    author: "Hỗn Độn Hạch Tâm",
    description: "Thức tỉnh tuổi thọ vô tận, trường sinh bất tử. Không tranh không đoạt, cẩu ở phàm trần hạ giới âm thầm tu luyện, tiễn đưa hết đời này đến đời khác các thiên tài kinh diễm. Đợi đến khi thiên hạ vô địch, mới nhẹ nhàng bước lên Tiên Đạo Phi Thăng!"
  },
  "fanqie-7357975803398720537": {
    title: "Vở Kịch Lừa Thần!",
    author: "Bạo Lực Tử Bì Nhân",
    description: "Lấy thế gian làm sân khấu, lấy chư thần làm khán giả. Nhân vật chính dùng trí tuệ đỉnh cao và những màn diễn kịch xảo quyệt để lừa gạt cả thần linh, đoạt lấy thần cách và mở ra kỷ nguyên mới!"
  },
  "fanqie-7506458079534271550": {
    title: "Kiếm Khởi Bạch Ngọc Kinh",
    author: "Ngô Dục Chứng Đạo",
    description: "Trên trời có Bạch Ngọc Kinh, mười hai lầu năm thành. Tiên nhân vuốt đỉnh ta, kết tóc nhận trường sinh. Thiếu niên mang một thanh kiếm sắc, từ phàm trần chém thẳng lên Bạch Ngọc Kinh, kiếm khí tung hoành ba vạn dặm!"
  },
  "fanqie-7263344278955363385": {
    title: "Trường Sinh Vạn Năm: Quen Biết Hơi Nhiều Thì Đã Sao?",
    author: "Dĩ Phi Đương Niên Thiếu",
    description: "Sống qua vạn năm đằng đẵng, tùy tiện chỉ điểm một đứa trẻ chăn trâu sau này thành Ma Hoàng, cứu một cô bé sau này thành Nữ Đế Tiên Tông. Đi đến đâu cũng gặp hậu nhân và đồ đệ cũ, muốn khiêm tốn cũng không xong!"
  },
  "fanqie-7471788218946423832": {
    title: "Cầu Sinh? Ngươi Là Kẻ Giám Sát Còn Cầu Sinh Cái Gì?",
    author: "Ngã Dĩ Kinh Hoán Tam Cá Danh Liễu",
    description: "Toàn dân bị kéo vào trò chơi sinh tồn kinh dị đẫm máu, ai nấy đều run rẩy tìm đường sống. Riêng nhân vật chính vừa mở mắt đã nhận thân phận Kẻ Giám Sát tối cao, nắm trong tay toàn quyền trừng phạt quái vật và định đoạt quy tắc trò chơi!"
  },
  "fanqie-7540122908304100414": {
    title: "Bách Tuế Tiên Tôn",
    author: "Ái Cật Bình Đầu Ca",
    description: "Xuyên không đến tu chân giới, mười tám tuổi kiểm tra linh căn chỉ là phàm nhân, đành lui về sơn thôn cưới vợ sinh con, an phận trăm năm. Trăm tuổi tuổi già sức yếu, tiên nhân đi ngang qua kiểm tra lại phát hiện ra ta là Thiên Linh Căn tuyệt thế? Trăm tuổi tu tiên, vừa vặn là lúc đỉnh cao phong độ!"
  },
  "fanqie-7489692771863776281": {
    title: "Ký Túc Xá Cầu Sinh: Nhà Ta Biến Thành Ổ Mỹ Nữ",
    author: "Tam Vận Chân Nhân",
    description: "【Thủ thành + Vô hạn + Mạt thế + Cầu sinh + Nâng cấp】\nMở mắt thức dậy, toàn nhân loại rơi vào trò chơi ký túc xá cầu sinh, sương máu bao phủ khắp nơi. Hứa Lãng thức tỉnh chuỗi Ác Mộng Chúa Tể, chỉ cần ngủ là nhận được tiền Ác Mộng để nâng cấp mọi thứ từ cửa gỗ rách nát thành Tinh Môn bất hủ!"
  },
  "fanqie-7450181849587911704": {
    title: "Độc Thủ Miếu Hoang Sáu Năm, Không Biết Mình Đang Tu Tiên",
    author: "Lưu Lãng Đích Gia Phi Miêu",
    description: "Lục Đồng Phong một mình trông coi miếu hoang sáu năm, không hề biết mình đang tu tiên. Mãi đến năm mười sáu tuổi tiên nữ từ trên trời rơi xuống, hắn mới biết ông thầy lôi thôi đã mất sáu năm trước của mình chính là Thái Thượng Trưởng Lão đệ nhất cường giả nhân gian của Vân Thiên Tông..."
  },
  "fanqie-6995119379645991944": {
    title: "Ta Biến Thế Giới Kinh Dị Thành Game Nuôi Trồng!",
    author: "Dư Tác",
    description: "Mỗi người mười tám tuổi đều bị bắt buộc bước vào thế giới trò chơi kinh dị. Trong khi người khác chật vật sinh tồn, Tần Nặc lại phát hiện mình có thể thao túng cảm xúc của quỷ để nhận thưởng hệ thống, mỗi khi hoàn thành phụ bản lại xây dựng cơ nghiệp bất động sản trong thế giới quỷ!"
  },
  "fanqie-7560509095371885593": {
    title: "Hợp Hoan Tông Đệ Nhất Lô Đỉnh!",
    author: "An Nguyệt Nha",
    description: "【Không hệ thống + Tu La Tràng + Thuần Dương Thánh Thể + Nghịch tập】\nBắt đầu với mười linh căn phế phẩm bị chọn làm lô đỉnh đạo lữ cho Thánh Nữ. Lục Trần thức tỉnh Thuần Dương Thánh Thể nghịch thiên, cùng giao lưu tâm đắc tu luyện liền đột phá cảnh giới, mở ra con đường tu tiên nhiệt huyết đỉnh cao!"
  },
  "fanqie-7474582323657182232": {
    title: "Đạo Hữu, Ngươi Đang Nói Chuyện Với Ai?",
    author: "Thiên Ngoại Hữu Sơn",
    description: "【Không nữ chính + Không độc + Điên cuồng + Cao trào liên tục】\nTương truyền thế gian có một đạo quán sở hữu một mảnh đất thần kỳ, chỉ cần xem người như một hạt giống vùi vào đất liền có thể thành tiên. Lý Thập Ngũ tìm tiên mười năm, cuối cùng tự chôn mình vào đất, chào đón thế giới Toàn Viên Ác Tiên!"
  },
  "fanqie-7201113723660930063": {
    title: "Khởi Đầu Quái Đàm Cấp S, Lại Cho Ta Thiên Phú Cấp C?",
    author: "Thương Bạch Kỷ Nguyên",
    description: "（Không nữ chính + Nghịch chuyển vô hạn + Tư duy logic + Kịch tính nghẹt thở）\nQuỷ dị hoành hành, quái đàm khắp nơi. Người khác nhận được thiên phú cấp S lùi thời gian, suy diễn vô hạn, còn Giang Minh lại nhận thiên phú cấp C. Vậy mà hắn phải dùng thiên phú cấp C này để phá giải quái đàm cấp S bất khả thi!"
  },
  "mieu-cuong-co-su": {
    title: "Miêu Cương Cổ Sự",
    author: "Nam Vô Già Sa",
    description: "Tác phẩm kinh điển về đề tài huyền thuật, vu cổ và linh dị dân gian Trung Hoa. Nhân vật chính Lục Tả vô tình được bà ngoại truyền lại bản mệnh Kim Tàm Cổ nghìn năm, từ đó bước chân vào chốn giang hồ hiểm ác, đối đầu với các môn phái huyền môn, tà ma ngoại đạo và những bí thuật tà ác ngàn đời chốn Miêu Cương."
  }
};

async function main() {
  const storage = createStorage();
  const db = createSupabase(process.env);

  console.log("=== ĐANG ÁP DỤNG METADATA CHUẨN MỰC 100% CHO TẤT CẢ 26 BỘ TRUYỆN ===");

  for (const [bookId, meta] of Object.entries(PERFECT_METADATA)) {
    console.log(`- Cập nhật [${bookId}]: ${meta.title} (${meta.author}) - Giới thiệu: ${meta.description.length} ký tự`);

    // 1. Cập nhật R2 index.json
    const rawIndex = await storage.get(`books/${bookId}/index.json`);
    let indexObj = rawIndex ? JSON.parse(rawIndex.toString()) : {};
    indexObj.title = meta.title;
    indexObj.author = meta.author;
    indexObj.description = meta.description;
    await storage.put(`books/${bookId}/index.json`, Buffer.from(JSON.stringify(indexObj, null, 2)), "application/json");

    // 2. Cập nhật Supabase
    if (db) {
      try {
        await db.upsertBook({
          id: bookId,
          title: meta.title,
          author: meta.author,
          description: meta.description,
          cover_url: indexObj.cover,
          status: indexObj.status || "Đang cập nhật",
          total_chapters: indexObj.totalChapters || 0,
          translated_chapters: indexObj.translatedChapters || 0,
          revision: indexObj.revision || 1
        });
      } catch (err) {
        console.warn(`  (Supabase warn: ${err.message})`);
      }
    }
  }

  console.log("\nXuất bản lại catalog snapshot lên R2...");
  await publishCatalogSnapshot({ storage, env: process.env, log: console.log });
  console.log("HOÀN TẤT 100%!");
}

main().catch(console.error);
