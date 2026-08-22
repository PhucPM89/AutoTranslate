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

const PRISTINE_METADATA = {
  "fanqie-7201113723660930063": {
    title: "Khởi Đầu Quái Đàm Cấp S, Lại Cho Ta Thiên Phú Cấp C?",
    author: "Thương Bạch Kỷ Nguyên"
  },
  "fanqie-7474582323657182232": {
    title: "Đạo Hữu, Ngươi Đang Nói Chuyện Với Ai?",
    author: "Thiên Ngoại Hữu Sơn"
  },
  "fanqie-7560509095371885593": {
    title: "Hợp Hoan Tông Đệ Nhất Lô Đỉnh!",
    author: "An Nguyệt Nha"
  },
  "fanqie-6995119379645991944": {
    title: "Ta Biến Thế Giới Kinh Dị Thành Game Nuôi Trồng!",
    author: "Dư Tác"
  },
  "fanqie-7450181849587911704": {
    title: "Độc Thủ Miếu Hoang Sáu Năm, Không Biết Mình Đang Tu Tiên",
    author: "Lưu Lãng Đích Gia Phi Miêu"
  },
  "fanqie-7489692771863776281": {
    title: "Ký Túc Xá Cầu Sinh: Nhà Ta Biến Thành Ổ Mỹ Nữ",
    author: "Tam Vận Chân Nhân"
  },
  "fanqie-7540122908304100414": {
    title: "Bách Tuế Tiên Tôn",
    author: "Ái Cật Bình Đầu Ca"
  },
  "fanqie-7471788218946423832": {
    title: "Cầu Sinh? Ngươi Là Kẻ Giám Sát Còn Cầu Sinh Cái Gì?",
    author: "Ngã Dĩ Kinh Hoán Tam Cá Danh Liễu"
  },
  "fanqie-7263344278955363385": {
    title: "Trường Sinh Vạn Năm: Quen Biết Hơi Nhiều Thì Đã Sao?",
    author: "Dĩ Phi Đương Niên Thiếu"
  },
  "fanqie-7506458079534271550": {
    title: "Kiếm Khởi Bạch Ngọc Kinh",
    author: "Ngô Dục Chứng Đạo"
  },
  "fanqie-7357975803398720537": {
    title: "Vở Kịch Lừa Thần!",
    author: "Bạo Lực Tử Bì Nhân"
  },
  "fanqie-7377931562463005720": {
    title: "Khởi Đầu Trường Sinh: Cẩu Ở Hạ Giới Tu Luyện Phi Thăng",
    author: "Hỗn Độn Hạch Tâm"
  },
  "fanqie-7488955435421010968": {
    title: "Xa Lộ Tuần Tự: Đừng Để Tụt Lại Phía Sau!",
    author: "Sơn Hải Hô Khiếu"
  },
  "fanqie-7253908182769077252": {
    title: "Linh Dị Phục Hồi: Vĩnh Dạ Giáng Lâm",
    author: "Khánh Nguyên Chức Cao Tiểu Thiên Tài"
  },
  "fanqie-7077546460056652803": {
    title: "Đạp Thiên Cảnh",
    author: "Vĩnh Dạ Tinh Hà"
  },
  "fanqie-7364671902251502616": {
    title: "Phàm Nhân Tu Tiên Chi Phù Tổ",
    author: "Phiên Già Trạm Đại Tương"
  },
  "fanqie-7445188900496083992": {
    title: "Tiên Giới Bế Quan Tiểu Năng Thủ",
    author: "Hương Quả Vị Nãi Trà"
  },
  "fanqie-7256784068786785336": {
    title: "Quỷ Xá",
    author: "Dạ Lai Phong Vũ Thanh"
  },
  "fanqie-7143038691944959011": {
    title: "Thập Nhật Chung Yên",
    author: "Sát Trùng Đội Đội Viên"
  },
  "fanqie-7077516958534470656": {
    title: "Phàm Cốt",
    author: "Nhất Canh Đại Sư"
  },
  "fanqie-7083672225286458406": {
    title: "Hư Không Tháp",
    author: "Tiêu Bất Ngữ"
  }
};

async function main() {
  const storage = createStorage();
  const db = createSupabase(process.env);

  console.log("Applying pristine curated titles & authors to R2 and Supabase...");

  for (const [bookId, meta] of Object.entries(PRISTINE_METADATA)) {
    console.log(`- Updating [${bookId}]: ${meta.title} | ${meta.author}`);

    // 1. Update R2 index.json
    const rawIndex = await storage.get(`books/${bookId}/index.json`);
    let indexObj = rawIndex ? JSON.parse(rawIndex.toString()) : null;
    if (indexObj) {
      indexObj.title = meta.title;
      indexObj.author = meta.author;
      await storage.put(`books/${bookId}/index.json`, Buffer.from(JSON.stringify(indexObj, null, 2)), "application/json");
    }

    // 2. Update Supabase
    if (db) {
      try {
        await db.upsertBook({
          id: bookId,
          title: meta.title,
          author: meta.author,
          cover_url: indexObj?.cover,
          status: indexObj?.status || "Đang cập nhật",
          total_chapters: indexObj?.totalChapters || 0,
          translated_chapters: indexObj?.translatedChapters || 0,
          revision: indexObj?.revision || 1
        });
      } catch (e) {
        console.warn(`  Supabase update note for ${bookId}:`, e.message);
      }
    }
  }

  console.log("Re-publishing catalog snapshot to R2...");
  await publishCatalogSnapshot({ storage, env: process.env, log: console.log });
  console.log("SUCCESS! All pristine titles published.");
}

main().catch(console.error);
