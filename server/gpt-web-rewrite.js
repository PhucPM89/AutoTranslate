"use strict";

const BOOK_PROFILES = {
  "fanqie-7027679289931729920": {
    genre: "kinh dị sinh tồn, hệ thống, phiêu lưu tận thế",
    tone: "căng thẳng, rõ ràng, tiết chế; lời thoại tự nhiên; thông báo hệ thống ngắn gọn",
    terms: [
      ["物品栏扩展石", "Đá Mở Rộng Túi Đồ"],
      ["物品栏", "Túi đồ"],
      ["洞悉", "Nhìn Thấu"],
      ["刺豚", "Cá Nóc Gai"],
      ["强盗钓竿", "Cần Câu Ăn Cướp"],
      ["下狠手", "ra tay tàn nhẫn"],
      ["宁死", "thà chết"],
      ["侦察眼", "Mắt Trinh Sát"],
      ["复制眼", "Mắt Sao Chép"],
      ["蝎蝠", "Dơi Bọ Cạp"],
      ["雷光能量枪", "Súng Năng Lượng Lôi Quang"],
      ["鬼雾团", "Đoàn Quỷ Vụ"],
      ["天赋强化石", "Đá Cường Hóa Thiên Phú"],
      ["恶梦币", "Ác Mộng Tệ"]
    ],
    forbiddenTerms: {
      "洞悉": ["Động Xuyết", "Động Tắc", "Động Tích", "Trác Tầm", "Động Túc", "Động Sát", "Thấu Thị"],
      "刺豚": ["Xích Tù"],
      "强盗钓竿": ["Cần Câu Cướp Giật", "Cần Câu Cướp Ngày"],
      "下狠手": ["ra tay thật Ngoan", "ra tay ngoan"],
      "宁死": ["Ninh Tử", "nô lệ Ninh Tử"],
      "蝎蝠": ["Thiệp Phách"],
      "物品栏": ["vật phẩm rương", "khung đồ"],
      "雷光能量枪": ["Sấm Quang Năng Lượng Súng"],
      "鬼雾团": ["Đoàn Sương Mù Ma Quỷ"]
    }
  }
};

function getBookTranslationProfile(bookId) {
  return BOOK_PROFILES[bookId] || {
    genre: "tiểu thuyết mạng Trung Quốc",
    tone: "tiếng Việt tự nhiên, mạch lạc và đúng sắc thái nguyên tác",
    terms: [],
    forbiddenTerms: {}
  };
}

function outputContract() {
  return [
    "Chỉ xuất đúng định dạng văn bản sau, không dùng Markdown và không giải thích:",
    "<TITLE>",
    "Tiêu đề tiếng Việt",
    "</TITLE>",
    "<CONTENT>",
    "<P id=\"1\">Đoạn tiếng Việt tương ứng đoạn 1</P>",
    "<P id=\"2\">Đoạn tiếng Việt tương ứng đoạn 2</P>",
    "</CONTENT>",
    "<TERMS>",
    "<TERM><ZH>thuật ngữ mới thực sự dùng</ZH><VI>cách dịch trong chương</VI></TERM>",
    "</TERMS>"
  ].join("\n");
}

function segmentSource(source) {
  return String(source || "").split(/\n+/).map((part) => part.trim()).filter(Boolean)
    .map((text, index) => ({ id: index + 1, text }));
}

function renderSourceSegments(source) {
  return segmentSource(source).map((item) => `<P id="${item.id}">${item.text}</P>`).join("\n");
}

function profileRules(profile, chapterTerms = []) {
  const mergedTerms = new Map([...(profile.terms || []), ...chapterTerms.map((term) => [term.source, term.target])]);
  const terms = mergedTerms.size
    ? `\nThuật ngữ khóa bắt buộc:\n${[...mergedTerms].map(([source, target]) => `${source} = ${target}`).join("\n")}`
    : "";
  const forbidden = Object.entries(profile.forbiddenTerms || {}).flatMap(([source, aliases]) =>
    aliases.map((alias) => `${source}: cấm dùng “${alias}”`)
  );
  return `Thể loại: ${profile.genre}.\nGiọng văn: ${profile.tone}.${terms}${forbidden.length ? `\nBiến thể cấm:\n${forbidden.join("\n")}` : ""}`;
}

function countLiteral(text, needle) {
  if (!needle) return 0;
  return String(text || "").split(needle).length - 1;
}

function validateProfileTerms(source, translation, profile, chapterTerms = []) {
  const errors = [];
  const mergedTerms = new Map([...(profile.terms || []), ...chapterTerms.map((term) => [term.source, term.target])]);
  for (const [sourceTerm, targetTerm] of mergedTerms) {
    const sourceCount = countLiteral(source, sourceTerm);
    if (!sourceCount) continue;
    const targetCount = countLiteral(translation, targetTerm);
    if (targetCount < sourceCount) errors.push(`${sourceTerm} xuất hiện ${sourceCount} lần nhưng “${targetTerm}” chỉ xuất hiện ${targetCount} lần`);
    for (const alias of profile.forbiddenTerms?.[sourceTerm] || []) {
      if (String(translation || "").toLocaleLowerCase("vi-VN").includes(alias.toLocaleLowerCase("vi-VN"))) {
        errors.push(`${sourceTerm} còn biến thể cấm “${alias}”`);
      }
    }
  }
  if (errors.length) throw new Error(`Sai glossary xuyên truyện: ${errors.join("; ")}`);
  return true;
}

function buildRewritePrompt({ bookId, sourceTitle = "", source = "", chapterTerms = [], termCandidates = [] }) {
  const profile = getBookTranslationProfile(bookId);
  return [
    "Bạn là dịch giả tiểu thuyết Trung-Việt. Hãy dịch lại toàn bộ chương trực tiếp từ nguyên tác Trung Quốc sang tiếng Việt.",
    profileRules(profile, chapterTerms),
    "Bảo toàn tuyệt đối ai làm gì với ai, phủ định, điều kiện, quan hệ nhân quả, con số, cấp bậc và trình tự sự kiện. Không bỏ câu, không thêm ý. Dịch danh từ thông thường sang tiếng Việt dễ hiểu; giữ tên riêng nhất quán. Giữ ranh giới đoạn, dấu lời thoại, dấu ngắt cảnh và ngoặc thông báo hệ thống. Không tham khảo hay vá bản dịch API.",
    termCandidates.length ? `Ứng viên thuật ngữ mới đã tìm thấy trong chương: ${termCandidates.map((item) => item.source).join(", ")}. Chỉ đưa vào TERMS những mục thực sự là tên riêng/kỹ năng/vật phẩm/cấp bậc và đã dùng nhất quán trong CONTENT.` : "",
    outputContract(),
    `TIÊU ĐỀ GỐC:\n${sourceTitle}`,
    "Mỗi P đầu ra phải tương ứng đúng một P nguyên tác, giữ nguyên id và thứ tự; cấm thiếu, thêm, gộp hoặc tách P.",
    `NGUYÊN TÁC:\n${renderSourceSegments(source)}`
  ].join("\n\n");
}

function buildSelfAuditPrompt({ bookId, sourceTitle = "", source = "", translatedTitle = "", translatedContent = "", qualityFeedback = "", chapterTerms = [] }) {
  const profile = getBookTranslationProfile(bookId);
  return [
    "Bạn là kiểm định viên cuối. Hãy đối chiếu từng câu nguyên tác với bản dịch do chính GPT vừa tạo và xuất lại TOÀN BỘ bản dịch cuối đã sửa.",
    profileRules(profile, chapterTerms),
    "Sửa mọi lỗi sai chủ thể, đại từ, phủ định, số lượng, cấp bậc, thuật ngữ, thiếu/thêm ý, nhầm lời thoại và dấu câu. Không viết lại câu đúng chỉ để đổi văn phong. Bản xuất ra phải đầy đủ từ đầu đến cuối, không dùng dấu ba chấm để rút gọn.",
    qualityFeedback ? `Lỗi hình thức cần xử lý:\n${qualityFeedback}` : "",
    outputContract(),
    `TIÊU ĐỀ GỐC:\n${sourceTitle}`,
    "Mỗi P đầu ra phải tương ứng đúng một P nguyên tác, giữ nguyên id và thứ tự; cấm thiếu, thêm, gộp hoặc tách P.",
    `NGUYÊN TÁC:\n${renderSourceSegments(source)}`,
    `BẢN DỊCH GPT VÒNG ĐẦU:\n<TITLE>\n${translatedTitle}\n</TITLE>\n<CONTENT>\n${renderSourceSegments(translatedContent)}\n</CONTENT>`
  ].filter(Boolean).join("\n\n");
}

function parseFullTranslation(text, expectedSegmentIds = []) {
  const raw = String(text || "").trim();
  const title = raw.match(/<TITLE>\s*([\s\S]*?)\s*<\/TITLE>/i)?.[1]?.trim();
  const contentBlock = raw.match(/<CONTENT>\s*([\s\S]*?)\s*<\/CONTENT>/i)?.[1]?.trim();
  if (!title || !contentBlock) throw new Error("GPT Web không trả đủ cặp thẻ TITLE/CONTENT.");
  const segments = [...contentBlock.matchAll(/<P\s+id=["']?(\d+)["']?>\s*([\s\S]*?)\s*<\/P>/giu)]
    .map((match) => ({ id: Number(match[1]), text: match[2].trim() }));
  if (expectedSegmentIds.length) {
    const actual = segments.map((item) => item.id);
    if (actual.length !== expectedSegmentIds.length || actual.some((id, index) => id !== expectedSegmentIds[index])) {
      throw new Error(`Sai cấu trúc đoạn: cần [${expectedSegmentIds.join(",")}], nhận [${actual.join(",")}].`);
    }
  }
  const content = segments.length ? segments.map((item) => item.text).join("\n\n") : contentBlock;
  if (/<\/?(?:TITLE|CONTENT)>/i.test(title) || /<\/?(?:TITLE|CONTENT)>/i.test(content)) {
    throw new Error("GPT Web trả thẻ TITLE/CONTENT lồng sai cấu trúc.");
  }
  const terms = [];
  const termBlock = raw.match(/<TERMS>\s*([\s\S]*?)\s*<\/TERMS>/i)?.[1] || "";
  for (const match of termBlock.matchAll(/<TERM>\s*<ZH>([\s\S]*?)<\/ZH>\s*<VI>([\s\S]*?)<\/VI>\s*<\/TERM>/giu)) {
    terms.push({ source: match[1].trim(), target: match[2].trim(), status: "pending", confidence: 0.7 });
  }
  return { title, content, terms };
}

module.exports = { getBookTranslationProfile, buildRewritePrompt, buildSelfAuditPrompt, parseFullTranslation, validateProfileTerms, segmentSource, renderSourceSegments };
