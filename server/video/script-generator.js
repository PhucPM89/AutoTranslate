"use strict";

const { generateStructuredText } = require("../gemini");

/**
 * Valid modes:
 * - "teaser": Giới thiệu tóm tắt mở đầu, tạo cảm giác hồi hộp, không spoil plot twist sâu
 * - "summary_review": Tóm tắt diễn biến kịch tính và bình luận chuyên sâu
 */
const SCRIPT_MODES = {
  TEASER: "teaser",
  SUMMARY_REVIEW: "summary_review"
};

/**
 * Valid narration tones
 */
const TONES = {
  SUSPENSE: "suspense",      // Hồi hộp, ly kỳ, bí ẩn
  DRAMATIC: "dramatic",      // Hùng tráng, cao trào, xúc cảm
  PHILOSOPHICAL: "philosophical", // Chiêm nghiệm, lắng đọng
  ENGAGING: "engaging"       // Sôi nổi, cuốn hút, gần gũi
};

/**
 * Normalizes text string
 */
function cleanString(str, max = 500) {
  return String(str || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Build condensed context from chapters and story bible
 */
function buildSourceContext(book, chapters = [], storyBible = null, storyContext = null) {
  const charList = (storyBible?.characters || []).slice(0, 15).map(c => `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.aliases?.length ? ` [Bí danh: ${c.aliases.join(", ")}]` : ""}`).join("\n");
  const termList = (storyBible?.worldTerms || []).slice(0, 15).map(t => `- ${t.term}: ${t.meaning}`).join("\n");

  const chapterSnippets = (chapters || []).slice(0, 10).map((ch, idx) => {
    const num = ch.chapterNumber || (idx + 1);
    const title = ch.title || `Chương ${num}`;
    const rawContent = String(ch.content || "");
    const sample = rawContent.length > 800
      ? rawContent.slice(0, 450) + "\n...\n" + rawContent.slice(-350)
      : rawContent;
    return `[Chương ${num}: ${title}]\n${sample}`;
  }).join("\n\n---\n\n");

  const contextChapters = (storyContext?.chapters || []).map(c => `Chương ${c.chapterNumber}: ${c.summary}`).join("\n");

  return {
    bookTitle: book.title || "Tác phẩm",
    author: book.author || "Khuyết danh",
    genre: Array.isArray(book.genres) ? book.genres.join(", ") : (book.genres || "Tiểu thuyết"),
    description: cleanString(book.description, 1000),
    charList,
    termList,
    chapterSnippets,
    contextChapters
  };
}

/**
 * Validate script consistency against book metadata and story bible
 */
function validateScript(script, { book, storyBible = null, chapters = [] } = {}) {
  const issues = [];
  if (!script || typeof script !== "object") {
    return { valid: false, issues: ["Kịch bản không hợp lệ hoặc rỗng"] };
  }

  if (!script.title || typeof script.title !== "string" || script.title.length < 5) {
    issues.push("Tiêu đề video quá ngắn hoặc thiếu");
  }

  if (!Array.isArray(script.scenes) || script.scenes.length < 3) {
    issues.push("Kịch bản phải có tối thiểu 3 phân cảnh (scenes)");
  } else {
    let totalWords = 0;
    script.scenes.forEach((sc, idx) => {
      if (!sc.text || sc.text.trim().length < 10) {
        issues.push(`Phân cảnh ${idx + 1} thiếu nội dung lời bình (narration text)`);
      }
      const words = String(sc.text || "").trim().split(/\s+/).length;
      totalWords += words;
      if (!sc.visualPrompt && !sc.visualKeyword) {
        issues.push(`Phân cảnh ${idx + 1} thiếu visualPrompt hoặc visualKeyword`);
      }
    });

    if (totalWords < 60) {
      issues.push(`Tổng độ dài lời bình quá ngắn (${totalWords} từ), khuyến nghị tối thiểu 80 từ`);
    }
  }

  // Anti-hallucination check for characters
  const bibleChars = new Set((storyBible?.characters || []).map(c => c.name.toLowerCase()));
  if (bibleChars.size > 0 && Array.isArray(script.scenes)) {
    const fullText = script.scenes.map(s => s.text).join(" ").toLowerCase();
    let characterFound = false;
    for (const name of bibleChars) {
      if (fullText.includes(name)) {
        characterFound = true;
        break;
      }
    }
    if (!characterFound && bibleChars.size > 0) {
      script._warning = "Không tìm thấy tên nhân vật chính trong lời thoại kịch bản";
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Deterministic fallback script generator (used if AI API is completely unavailable)
 */
function generateFallbackScript(book, chapters = [], options = {}) {
  const title = book.title || "Tác phẩm";
  const author = book.author || "Khuyết danh";
  const startNum = chapters[0]?.chapterNumber || 1;
  const endNum = chapters[chapters.length - 1]?.chapterNumber || (startNum + chapters.length - 1);
  const chapterScope = chapters.length > 1 ? `Từ chương ${startNum} đến chương ${endNum}` : `Chương ${startNum}`;

  const scenes = [
    {
      id: "scene_1_hook",
      type: "hook",
      section: "Mở đầu",
      text: `Mở mắt ra trong căn nhà gỗ rách nát giữa sương mù ác mộng, nơi chỉ cần bước chân ra ngoài sau hoàng hôn là chết chắc! Liệu bạn có dám đối mặt với thế giới kinh hoàng trong siêu phẩm sinh tồn ${title} của tác giả ${author}?`,
      visualPrompt: `Terrifying dark fantasy forest with misty wooden cabin at twilight, eerie silhouette in the fog, glowing eyes, 8k vertical webtoon manhwa style`,
      visualPrompt2: `Intense close-up of protagonist holding a makeshift weapon with panicked expression, cinematic rim lighting, vertical composition`,
      visualKeyword: title,
      badge: "🔥 SIÊU PHẨM SINH TỒN"
    },
    {
      id: "scene_2_premise",
      type: "premise",
      section: "Bối cảnh & Nghịch cảnh",
      text: book.description
        ? `${cleanString(book.description, 190)}. Từng quy tắc sinh tồn khắc nghiệt ép nhân vật chính phải tính toán chuẩn xác từng bước đi để giữ lấy mạng sống.`
        : `Bị ném vào không gian sinh tồn không lối thoát, nhân vật chính phải dựa vào trí tuệ và lòng quả cảm để thu thập tài nguyên và tìm kiếm hy vọng sống sót mong manh.`,
      visualPrompt: `Grimdark survival atmosphere, mysterious crafting workbench with glowing blueprints, shadowy monsters lurking outside cabin window`,
      visualPrompt2: `Mysterious arcane system interface floating in mid-air with warning signs, dark webtoon art`,
      visualKeyword: "Quy Tắc Sinh Tử",
      badge: "BỐI CẢNH"
    },
    {
      id: "scene_3_conflict",
      type: "conflict",
      section: "Cao trào kịch tính",
      text: `Từ chương ${startNum} đến ${endNum}, bóng tối bao trùm khi làn sóng dị thú đầu tiên ập đến! Ranh giới sống chết chỉ tính bằng giây trong những trận tử chiến nghẹt thở và những bí mật rùng rợn dần lộ diện.`,
      visualPrompt: `Epic intense battle scene at night against horrifying dark creatures, dramatic blood and magic sparks, high adrenaline action manhwa`,
      visualPrompt2: `Monstrous beast lunging from pitch black shadow with razor sharp claws, dynamic action blur, 8k vertical art`,
      visualKeyword: chapterScope,
      badge: "⚡ CAO TRÀO ĐỈNH ĐIỂM"
    },
    {
      id: "scene_4_critique",
      type: "critique",
      section: "Đặc sắc & Đánh giá",
      text: `Điểm cuốn hút nhất là thiết lập thế giới logic chặt chẽ, nhân vật quyết đoán có đầu óc và bản dịch tiếng Việt mượt mà đến từng câu chữ, khiến bạn một khi đã đọc là không thể dừng lại!`,
      visualPrompt: `Cinematic dramatic character standing tall amidst defeated foes, glowing golden aura of mastery, webtoon masterpiece`,
      visualPrompt2: `Beautiful golden ancient book floating with mystical runes, cinematic fantasy concept art`,
      visualKeyword: "Đánh Giá 9.9/10",
      badge: "⭐⭐⭐⭐⭐ ĐỀ CỬ"
    },
    {
      id: "scene_5_outro",
      type: "outro",
      section: "Lời kết & Kêu gọi",
      text: `Lưu ngay video lại kẻo lạc mất! Truy cập ngay Trạm Chữ tại tram-chu.online để cày trọn bộ bản dịch mới nhất của ${title} và nhấn theo dõi kênh để không bỏ lỡ các siêu phẩm tiếp theo!`,
      visualPrompt: `Modern stylized typography banner Tram Chu tram-chu.online, aesthetic cosmic portal, vibrant glowing neon accents`,
      visualPrompt2: `Smartphone displaying novel reader on tram-chu.online with elegant dark mode interface`,
      visualKeyword: "Trạm Chữ • tram-chu.online",
      badge: "TRẠM CHỮ"
    }
  ];

  return {
    title: `[Review Truyện] ${title} - ${chapterScope} | Trạm Chữ`,
    summary: `Review kịch tính bộ truyện ${title} (${chapterScope}) trên Trạm Chữ (tram-chu.online).`,
    tags: [title, "Review Truyện", "Trạm Chữ", "Audio Truyện", "TikTok Truyện", "Tiểu Thuyết"],
    targetDurationSeconds: 120,
    scenes
  };
}

/**
 * Builds the AI generation prompt
 */
function buildScriptPrompt(context, options = {}) {
  const mode = options.mode || SCRIPT_MODES.TEASER;
  const tone = options.tone || TONES.SUSPENSE;
  const targetDuration = Number(options.targetDurationSeconds || 120);
  const targetWords = Math.round(targetDuration * 2.5);

  const modeInstruction = mode === SCRIPT_MODES.TEASER
    ? "Chế độ TEASER (Giới thiệu kịch tính, khơi gợi tò mò): Giữ bí mật các plot twist lớn, nhấn mạnh vào thế giới quan nghẹt thở và điểm cuốn hút độc nhất."
    : "Chế độ SUMMARY & REVIEW (Tóm tắt & bình luận): Phân tích diễn biến các chương, bình luận sắc sảo về tính cách nhân vật và nghệ thuật kể chuyện.";

  const toneInstruction = {
    [TONES.SUSPENSE]: "Giọng văn hồi hộp, bí ẩn, dồn dập, đẩy mạnh hiểm nguy rình rập và bí mật sinh tử.",
    [TONES.DRAMATIC]: "Giọng văn hùng hồn, nhấn mạnh mâu thuẫn đỉnh điểm và các bước ngoặt cảm xúc lớn.",
    [TONES.PHILOSOPHICAL]: "Giọng văn lắng đọng, chiêm nghiệm về nhân sinh và chiều sâu tâm lý.",
    [TONES.ENGAGING]: "Giọng văn cuốn hút, gần gũi như một người bạn say mê đang kể lại câu chuyện hay nhất."
  }[tone] || "Giọng văn lôi cuốn, giàu kịch tính.";

  return `Bạn là chuyên gia biên kịch video review truyện ngắn hàng đầu trên TikTok / Reels / YouTube Shorts cho kênh "Trạm Chữ" (tram-chu.online).
Nhiệm vụ của bạn: Tạo kịch bản video review ngắn cực kỳ lôi cuốn, giữ chân người xem từ giây đầu tiên bằng tiếng Việt tự nhiên, dồn dập.

THÔNG TIN TÁC PHẨM:
- Tên truyện: ${context.bookTitle}
- Tác giả: ${context.author}
- Thể loại: ${context.genre}
- Giới thiệu tóm tắt: ${context.description}

NHÂN VẬT & THUẬT NGỮ CHÍNH TRONG STORY BIBLE:
${context.charList || "(Chưa có ghi chú đặc biệt)"}
${context.termList || ""}

NỘI DUNG CÁC CHƯƠNG ĐƯỢC CHỌN:
${context.chapterSnippets || "(Xem tóm tắt truyện)"}

${context.contextChapters ? `TÓM TẮT LIÊN TỤC CÁC CHƯƠNG:\n${context.contextChapters}` : ""}

QUY TẮC BẮT BUỘC CHO PHONG CÁCH TIKTOK VIRAL:
1. HOOK 3 GIÂY ĐẦU (Cực kỳ quan trọng): Bắt đầu NGAY LẬP TỨC bằng một câu hỏi tình huống sinh tử, một nghịch cảnh chấn động hoặc bí mật nghẹt thở. TUYỆT ĐỐI KHÔNG chào hỏi kiểu "Xin chào các bạn", "Hôm nay mình xin giới thiệu".
2. ${modeInstruction}
3. ${toneInstruction}
4. Nhịp điệu: Câu ngắn gọn, dứt khoát, dùng từ ngữ gợi hình gợi cảm mạnh.
5. Cấu trúc 5 phân cảnh chuẩn:
   - scene_1_hook: Hook giật mình / câu hỏi tình huống sinh tử (15-20s).
   - scene_2_premise: Bối cảnh thế giới độc lạ và quy tắc sinh tồn khắc nghiệt (25-30s).
   - scene_3_conflict: Cao trào kịch tính nhất trong các chương được chọn (30-40s).
   - scene_4_critique: Điểm hay độc đáo khiến truyện được chấm 9.9/10 và độ mượt của bản dịch (20-25s).
   - scene_5_outro: Kêu gọi lưu video, đọc trọn bộ tại tram-chu.online (10-15s).

ĐỊNH DẠNG ĐẦU RA JSON BẮT BUỘC (DUY NHẤT JSON HỢP LỆ):
{
  "title": "[Tiêu đề TikTok giật gân, cuốn hút, chứa tên truyện và Trạm Chữ]",
  "summary": "[Mô tả ngắn hấp dẫn]",
  "tags": ["Tên truyện", "Trạm Chữ", "Review Truyện", "TikTok", "TruyenHay"],
  "targetDurationSeconds": ${targetDuration},
  "scenes": [
    {
      "id": "scene_1_hook",
      "type": "hook",
      "section": "Mở đầu",
      "text": "Lời dẫn thu âm tiếng Việt dồn dập, sắc bén...",
      "visualPrompt": "English descriptive prompt for wide cinematic dark fantasy manhwa webtoon scene, vertical 9:16, 8k",
      "visualPrompt2": "English descriptive prompt for intense close-up action or character moment, vertical 9:16",
      "visualKeyword": "Từ khóa ngắn 2-4 từ hiển thị trên màn hình",
      "badge": "🔥 SIÊU PHẨM SINH TỒN"
    }
  ]
}`;
}

/**
 * Generates a complete video review script
 *
 * @param {Object} book Book metadata
 * @param {Array} chapters Array of chapter objects
 * @param {Object} options Configuration options
 * @param {Array|string} apiKeys API keys pool
 */
async function generateReviewScript(book, chapters = [], options = {}, apiKeys = []) {
  if (!book || (!book.id && !book.bookId)) {
    throw new Error("Thông tin sách (book) không hợp lệ");
  }

  const storyBible = options.storyBible || null;
  const storyContext = options.storyContext || null;
  const context = buildSourceContext(book, chapters, storyBible, storyContext);

  const keys = Array.isArray(apiKeys) ? apiKeys : (apiKeys ? [apiKeys] : []);
  const hasApiKeys = keys.length > 0 || Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);

  if (!hasApiKeys) {
    // Graceful fallback to deterministic script
    const fallback = generateFallbackScript(book, chapters, options);
    fallback._source = "fallback_offline";
    return fallback;
  }

  const prompt = buildScriptPrompt(context, options);

  try {
    const response = await generateStructuredText(prompt, keys, {
      responseFormat: "json",
      temperature: 0.3,
      maxTokens: 4096
    });

    let script = null;
    const rawText = String(response.text || response.content || "").trim();
    const cleanJson = rawText.replace(/^\`\`\`json\s*/i, "").replace(/\s*\`\`\`$/i, "").trim();
    script = JSON.parse(cleanJson);

    const validation = validateScript(script, { book, storyBible, chapters });
    if (!validation.valid) {
      console.warn("[ScriptGenerator] Script validation warnings:", validation.issues);
      // If critical structure is missing, repair with fallback structure
      if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
        return generateFallbackScript(book, chapters, options);
      }
    }

    script._source = "ai_generated";
    return script;
  } catch (error) {
    console.error("[ScriptGenerator] Error generating script with AI, using fallback:", error.message);
    const fallback = generateFallbackScript(book, chapters, options);
    fallback._source = "fallback_on_error";
    fallback._error = error.message;
    return fallback;
  }
}

module.exports = {
  SCRIPT_MODES,
  TONES,
  buildSourceContext,
  validateScript,
  generateFallbackScript,
  generateReviewScript
};
