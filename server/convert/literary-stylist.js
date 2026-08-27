"use strict";

/**
 * Literary Stylist Engine for Webnovel Translation.
 * Eliminates stiff Sino-Vietnamese machine translation patterns (khử sượng Hán ngữ),
 * normalizes novel dialogue rhythm, and polishes Vietnamese prose into fluent,
 * immersive literary prose.
 */

// Patterns representing stiff word-by-word Sino-Vietnamese machine translations
const LITERARY_REPLACEMENTS = [
  // 1. Khử kết cấu "nhất thời / một thời gian" sượng
  { pattern: /\bnhất thời không biết phải làm sao\b/gi, replacement: "thoáng chốc chẳng biết phải làm sao" },
  { pattern: /\bnhất thời khó có thể\b/gi, replacement: "tạm thời khó lòng" },
  { pattern: /\bnhất thời nghĩ không ra\b/gi, replacement: "chợt không nghĩ ra" },
  { pattern: /\bnhất thời mọi người đều\b/gi, replacement: "trong chớp mắt tất cả mọi người đều" },
  { pattern: /\bnhất thời ở giữa\b/gi, replacement: "trong chớp mắt" },
  { pattern: /\bnhất thời chi gian\b/gi, replacement: "trong chốc lát" },
  { pattern: /\bmột thời gian ngắn ngủi\b/gi, replacement: "khoảng thời gian ngắn ngủi" },

  // 2. Khử kết cấu bị động Hán "Bị... cấp..." (被...给...)
  { pattern: /\bbị\s+([^,.;!?\n]+?)\s+cấp\s+(đánh|giết|chém|bắt|nuốt|phá|hủy|thương|đâm|chặn|hạ|thuyết phục)/gi, replacement: "bị $1 $2" },
  { pattern: /\bđem\s+([^,.;!?\n]+?)\s+cấp\s+(đánh|giết|chém|bắt|nuốt|phá|hủy|thương|đâm|chặn|hạ)/gi, replacement: "đem $1 ra $2" },

  // 3. Khử kết cấu "Không ngừng mà / không ngừng đích" (不停地 / 不断地)
  { pattern: /\bkhông ngừng\s+mà\s+/gi, replacement: "không ngừng " },
  { pattern: /\bliên tục\s+mà\s+/gi, replacement: "liên tục " },
  { pattern: /\bđiên cuồng\s+mà\s+/gi, replacement: "điên cuồng " },
  { pattern: /\bnhanh chóng\s+mà\s+/gi, replacement: "nhanh chóng " },
  { pattern: /\bbất tri bất giác\s+mà\s+/gi, replacement: "bất giác " },

  // 4. Khử các cụm từ miêu tả biểu cảm sượng
  { pattern: /\btrên mặt lộ ra vẻ\s+/gi, replacement: "ánh lên vẻ " },
  { pattern: /\bmặt lộ vẻ cười lạnh\b/gi, replacement: "nhếch mép cười khẩy" },
  { pattern: /\bmặt lộ cười lạnh\b/gi, replacement: "nhếch mép cười lạnh" },
  { pattern: /\bmặt lộ vẻ khinh bỉ\b/gi, replacement: "lộ rõ vẻ khinh bỉ" },
  { pattern: /\bmặt lộ vẻ kinh hãi\b/gi, replacement: "lộ rõ vẻ kinh hãi" },
  { pattern: /\bmặt lộ vẻ nghi hoặc\b/gi, replacement: "ánh lên vẻ nghi hoặc" },
  { pattern: /\btrong lòng lộ ra vẻ kinh hãi\b/gi, replacement: "trong lòng không khỏi kinh hãi" },
  { pattern: /\btrong lòng lộ ra vẻ chấn kinh\b/gi, replacement: "trong lòng không khỏi chấn kinh" },
  { pattern: /\btrong lòng dâng lên vẻ\s+/gi, replacement: "trong lòng dâng lên nỗi " },

  // 5. Khử kết cấu "Nói không ra lời / Nhịn không được mà"
  { pattern: /\bnói không ra lời\b/gi, replacement: "nghẹn lời" },
  { pattern: /\bnhịn không được mà\s+/gi, replacement: "không kìm được mà " },
  { pattern: /\bnhịn không được\s+(cười|run|khóc|kêu|hét|thốt|chửi)/gi, replacement: "không kìm được mà $1" },

  // 6. Khử kết cấu giới từ Hán "Tại trong... / Tại... bên trong" (在...之中)
  { pattern: /\btại trong\s+([^,.;!?\n]+?)\s+bên trong\b/gi, replacement: "trong $1" },
  { pattern: /\btại trong\s+([^,.;!?\n]+?)\s+ở giữa\b/gi, replacement: "giữa $1" },
  { pattern: /\btại trong lòng\b/gi, replacement: "trong lòng" },
  { pattern: /\btại trong mắt\b/gi, replacement: "trong mắt" },
  { pattern: /\btại trước mắt\b/gi, replacement: "trước mắt" },

  // 7. Khử kết cấu hướng di chuyển "Hướng về phía..." (朝着...方向)
  { pattern: /\bhướng về phía\s+([^,.;!?\n]+?)\s+phương hướng\s+(bay|lao|chạy|bắn|chém|đánh|tiến|đi)/gi, replacement: "nhắm thẳng hướng $1 mà $2" },
  { pattern: /\bhướng về phía\s+([^,.;!?\n]+?)\s+mà\s+(lao|bay|chạy|bắn|chém)/gi, replacement: "nhắm thẳng $1 mà $2" },

  // 8. Tinh chỉnh từ cảm thán & xưng hô đặc thù tiểu thuyết mạng
  { pattern: /\bvô cùng chi\s+/gi, replacement: "vô cùng " },
  { pattern: /\bcực kỳ chi\s+/gi, replacement: "cực kỳ " },
  { pattern: /\brất chi là\s+/gi, replacement: "hết sức " },
  { pattern: /\bhết sức chi\s+/gi, replacement: "hết sức " },
  { pattern: /\blẫn nhau ở giữa\b/gi, replacement: "giữa đôi bên" },
  { pattern: /\bhai người ở giữa\b/gi, replacement: "giữa hai người" },
  { pattern: /\btrong nháy mắt chi gian\b/gi, replacement: "trong chớp mắt" },
  { pattern: /\btrong nháy mắt đó\b/gi, replacement: "ngay trong khoảnh khắc đó" }
];

const { polishActionProse } = require("./action-stylist");
const { restructureSyntax } = require("./syntactic-restructurer");
const { enhanceSensoryImagery } = require("./sensory-enhancer");
const { versifyClassicalChants } = require("./chant-versifier");
const { refineInnerMonologue } = require("./monologue-refiner");
const { naturalizeSoundscapes } = require("./soundscape-adapter");
const { adaptSatiricalBanter } = require("./banter-adapter");
const { naturalizeChronology } = require("./chronology-adapter");
const { normalizeTitleHierarchy } = require("./title-hierarchy");
const { escalateDramaticProse } = require("./dramatic-escalator");
const { adaptUrbanSlang } = require("./urban-slang-adapter");
const { polishAlchemyProse } = require("./alchemy-stylist");
const { polishDaoistArrayProse } = require("./daoist-array-stylist");
const { polishBestiaryProse } = require("./bestiary-stylist");
const { polishBeautyProse } = require("./courtly-beauty-stylist");
const { polishTribulationProse } = require("./tribulation-stylist");
const { polishTopographyProse } = require("./topography-stylist");
const { polishDivineSenseProse } = require("./divine-sense-stylist");
const { polishInscriptProse } = require("./inscript-stylist");
const { polishAuctionProse } = require("./auction-stylist");
const { polishWarfareProse } = require("./warfare-stylist");
const { polishHealingProse } = require("./meridian-healing-stylist");
const { polishTranscendenceProse } = require("./transcendence-stylist");
const { polishCulinaryProse } = require("./culinary-stylist");
const { polishConspiracyProse } = require("./conspiracy-stylist");
const { polishSpatialProse } = require("./spatial-stylist");
const { polishElegyProse } = require("./elegy-stylist");
const { polishMadnessProse } = require("./madness-stylist");
const { polishSwordProse } = require("./sword-spirit-stylist");
const { polishKarmaProse } = require("./karma-stylist");
const { polishMantraProse } = require("./mantra-stylist");
const { polishMusicalProse } = require("./musical-dao-stylist");
const { polishChessProse } = require("./cosmic-chess-stylist");
const { polishZenProse } = require("./zen-tea-stylist");
const { polishSoulTokenProse } = require("./soul-token-stylist");
const { polishNecropolisProse } = require("./necropolis-stylist");
const { polishImperialProse } = require("./imperial-edict-stylist");
const { polishCyberProse } = require("./cyber-scifi-stylist");
const { polishBeastContractProse } = require("./beast-contract-stylist");
const { polishEldritchProse } = require("./eldritch-stylist");
const { polishGrimoireProse } = require("./grimoire-magic-stylist");
const { polishApocalypseProse } = require("./apocalypse-stylist");
const { polishForensicProse } = require("./forensic-deduction-stylist");
const { polishSupernaturalProse } = require("./supernatural-stylist");

/**
 * Polish and naturalize text.
 * @param {string} text
 * @returns {string}
 */
function polishLiteraryProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;

  // Apply syntactic restructurer (reorder inverted clauses)
  result = restructureSyntax(result);

  // Apply ancient chronology & measure naturalizer
  result = naturalizeChronology(result);

  // Apply title & peerage hierarchy modulator
  result = normalizeTitleHierarchy(result);

  // Apply imperial decrees & royal proclamations stylist
  result = polishImperialProse(result);

  // Apply forensic & deduction mystery stylist
  result = polishForensicProse(result);

  // Apply time skips & transcendence stylist
  result = polishTranscendenceProse(result);

  // Apply supernatural, folklore & taoist exorcism stylist
  result = polishSupernaturalProse(result);

  // Apply apocalypse & genetic mutant stylist
  result = polishApocalypseProse(result);

  // Apply grimoire & western magic stylist
  result = polishGrimoireProse(result);

  // Apply eldritch & cthulhu horror stylist
  result = polishEldritchProse(result);

  // Apply beast taming & familiar contracts stylist
  result = polishBeastContractProse(result);

  // Apply cyberpunk, VR & mecha stylist
  result = polishCyberProse(result);

  // Apply necropolis & ancient tombs stylist
  result = polishNecropolisProse(result);

  // Apply soul token & life-lamp stylist
  result = polishSoulTokenProse(result);

  // Apply zen tea & enlightenment stylist
  result = polishZenProse(result);

  // Apply cosmic chess & fate board stylist
  result = polishChessProse(result);

  // Apply musical dao & zither stylist
  result = polishMusicalProse(result);

  // Apply karma & destiny stylist
  result = polishKarmaProse(result);

  // Apply mantra & hand-seal stylist
  result = polishMantraProse(result);

  // Apply sword spirit & intent stylist
  result = polishSwordProse(result);

  // Apply heart-demon & madness stylist
  result = polishMadnessProse(result);

  // Apply memorial elegy & epitaph stylist
  result = polishElegyProse(result);

  // Apply court politics & conspiracy stylist
  result = polishConspiracyProse(result);

  // Apply culinary & immortal banquet stylist
  result = polishCulinaryProse(result);

  // Apply spatiotemporal & void stylist
  result = polishSpatialProse(result);

  // Apply topography & sacred grounds stylist
  result = polishTopographyProse(result);

  // Apply divine sense & soul force stylist
  result = polishDivineSenseProse(result);

  // Apply ancient inscriptions & jade slip stylist
  result = polishInscriptProse(result);

  // Apply auction house & bidding war stylist
  result = polishAuctionProse(result);

  // Apply military strategy & siege warfare stylist
  result = polishWarfareProse(result);

  // Apply medical diagnostics & acupuncture stylist
  result = polishHealingProse(result);

  // Apply tribulation & breakthrough stylist
  result = polishTribulationProse(result);

  // Apply martial action stylist
  result = polishActionProse(result);

  // Apply alchemy & artifact crafting stylist
  result = polishAlchemyProse(result);

  // Apply daoist array & talismanic stylist
  result = polishDaoistArrayProse(result);

  // Apply mythical bestiary & demonic stylist
  result = polishBestiaryProse(result);

  // Apply aesthetic beauty & courtly grace stylist
  result = polishBeautyProse(result);

  // Apply dramatic climax & pathos escalator
  result = escalateDramaticProse(result);

  // Apply sensory & atmospheric imagery enhancer
  result = enhanceSensoryImagery(result);

  // Apply soundscape & onomatopoeia naturalizer
  result = naturalizeSoundscapes(result);

  // Apply inner monologue refiner
  result = refineInnerMonologue(result);

  // Apply satirical banter adapter
  result = adaptSatiricalBanter(result);

  // Apply urban & internet slang adapter
  result = adaptUrbanSlang(result);

  // Apply poetry & chant versifier
  result = versifyClassicalChants(result);

  // Apply literary prose patterns
  for (const { pattern, replacement } of LITERARY_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  // Polish formatting and rhythm
  result = result
    // Clean grouped/spaced exclamation marks: "! ! ! !" -> "!!!"
    .replace(/![ \t!]+/g, (m) => "!".repeat(Math.min(3, m.replace(/[ \t]+/g, "").length)))
    .replace(/\?[ \t\?]+/g, (m) => "?".repeat(Math.min(3, m.replace(/[ \t]+/g, "").length)))
    .replace(/\.[ \t\.]+/g, (m) => (m.replace(/[ \t]+/g, "").length >= 3 ? "..." : "."))
    // Clean inner spaces in quotes: "Đừng đi " -> "Đừng đi"
    .replace(/([“‘"'])[ \t]+/g, "$1")
    .replace(/[ \t]+([”’"'])/g, "$1")
    // Clean horizontal spaces before punctuation: "mắt !" -> "mắt!"
    .replace(/[ \t]+([,.;:!?…]+)/g, "$1")
    // Ensure space after colon/comma/punctuation before OPEN quote: nói:"Đi -> nói: "Đi
    .replace(/([:,.;!?])([“‘"'][^\s0-9.,;:!?’”'’\)\]\}])/g, "$1 $2")
    // Clean redundant double horizontal spaces
    .replace(/[ \t]{2,}/g, " ")
    // Ensure single space after punctuation if followed by a word character
    .replace(/([,.;:!?])([^,.;:!?\s0-9"'\)\]\}”’…])/g, "$1 $2")
    .trim();

  return result;
}

module.exports = {
  polishLiteraryProse,
  LITERARY_REPLACEMENTS
};
