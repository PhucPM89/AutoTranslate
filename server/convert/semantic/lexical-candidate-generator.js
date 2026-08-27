"use strict";

/**
 * Lexical Candidate Generator (Phase 1: Architecture Reconciliation)
 * 
 * Generates a multi-hypothesis LexicalCandidateGraph from a Chinese source chunk.
 * Gathers candidate evidence from:
 * 1. Book Glossaries (LOCKED)
 * 2. Proper Noun Matcher (Names & Places)
 * 3. Genre Dictionaries & Translation Memory
 * 4. Phrase Dictionary (Trie Longest Match)
 * 5. Polysemy Context Tables
 * 6. Han-Viet Fallback
 */

const { createLexicalCandidate } = require("./lexical-candidate");
const { createSemanticSignature } = require("./contracts");

// Explicit Polysemy Table for common ambiguous Chinese characters & roots
const KNOWN_POLYSEMOUS_ENTRIES = {
  "重": [
    {
      candidateVi: "nặng",
      partOfSpeech: "adj",
      semanticFeatures: ["WEIGHT", "SEVERITY"],
      semanticSignature: createSemanticSignature({ denotation: "HEAVY_OR_SEVERE", valence: 0.0, intensity: 0.70 }),
      confidence: 0.90,
      indicatorContexts: ["如泰山", "重如", "伤", "创", "量", "重沉", "万斤"]
    },
    {
      candidateVi: "trùng",
      partOfSpeech: "num",
      semanticFeatures: ["LAYER", "MULTIPLE"],
      semanticSignature: createSemanticSignature({ denotation: "LAYERED_REPETITION", valence: 0.0, intensity: 0.50 }),
      confidence: 0.85,
      indicatorContexts: ["九重", "三重", "重天", "重叠", "叠"]
    },
    {
      candidateVi: "lại",
      partOfSpeech: "adv",
      semanticFeatures: ["ITERATION", "RENEWAL"],
      semanticSignature: createSemanticSignature({ denotation: "AGAIN_OR_RENEW", valence: 0.10, intensity: 0.60 }),
      confidence: 0.90,
      indicatorContexts: ["重整", "重新", "重逢", "重聚", "重见", "重出"]
    }
  ],
  "门": [
    {
      candidateVi: "cửa",
      partOfSpeech: "noun",
      semanticFeatures: ["PHYSICAL_PORTAL", "OBJECT"],
      semanticSignature: createSemanticSignature({ denotation: "PHYSICAL_DOOR", valence: 0.0, intensity: 0.30 }),
      confidence: 0.95,
      indicatorContexts: ["关", "开", "推", "房", "大门", "铁门", "木门", "锁", "门扇", "门前", "破门"]
    },
    {
      candidateVi: "môn",
      partOfSpeech: "noun",
      semanticFeatures: ["ORGANIZATION", "FACTION", "DOCTRINE"],
      semanticSignature: createSemanticSignature({ denotation: "SECT_OR_DOCTRINE", valence: 0.10, intensity: 0.50 }),
      confidence: 0.95,
      indicatorContexts: ["佛", "宗", "师", "山门", "入门", "外门", "内门", "旁门", "法门", "宗门", "掌门"]
    }
  ],
  "行": [
    {
      candidateVi: "đoàn",
      partOfSpeech: "cl",
      semanticFeatures: ["GROUP", "PEOPLE_SEQUENCE"],
      semanticSignature: createSemanticSignature({ denotation: "PARTY_OR_GROUP", valence: 0.0, intensity: 0.40 }),
      confidence: 0.95,
      indicatorContexts: ["一行人", "一行", "同行"]
    },
    {
      candidateVi: "đi",
      partOfSpeech: "verb",
      semanticFeatures: ["MOTION", "ACTION"],
      semanticSignature: createSemanticSignature({ denotation: "WALK_OR_MOVE", valence: 0.0, intensity: 0.50 }),
      confidence: 0.90,
      indicatorContexts: ["走", "行进", "行走", "潜行", "前行"]
    }
  ],
  "便": [
    {
      candidateVi: "liền",
      partOfSpeech: "adv",
      semanticFeatures: ["ASPECT_IMMEDIATE"],
      semanticSignature: createSemanticSignature({ denotation: "IMMEDIATELY_THEN", valence: 0.0, intensity: 0.50 }),
      confidence: 0.95,
      indicatorContexts: ["出招", "是", "可", "能", "退", "去", "杀", "至", "斩"]
    },
    {
      candidateVi: "tiện",
      partOfSpeech: "adj",
      semanticFeatures: ["CONVENIENCE"],
      semanticSignature: createSemanticSignature({ denotation: "CONVENIENT", valence: 0.30, intensity: 0.40 }),
      confidence: 0.85,
      indicatorContexts: ["方便", "便宜", "随手", "便当", "不便"]
    }
  ],
  "九字真言": [
    {
      candidateVi: "Cửu Tự Chân Ngôn",
      partOfSpeech: "noun",
      semanticFeatures: ["DAOIST_INCANTATION", "LOCKED_TERM"],
      semanticSignature: createSemanticSignature({ denotation: "DAOIST_HOLY_MANTRA", valence: 0.50, intensity: 0.90 }),
      confidence: 1.0,
      indicatorContexts: ["锁链", "道士", "真言", "道法", "符", "金光", "镇压", "阵法", "金刚"]
    }
  ],
  "舞刀弄枪": [
    {
      candidateVi: "múa đao múa kiếm",
      partOfSpeech: "verb",
      semanticFeatures: ["IDIOM", "MARTIAL_DISPLAY"],
      semanticSignature: createSemanticSignature({ denotation: "MARTIAL_WEAPON_PLAY", valence: 0.0, intensity: 0.60 }),
      confidence: 0.95,
      indicatorContexts: ["何必", "动武", "切磋", "打架", "动手", "各位", "道爷"]
    }
  ],
  "打入冷宫": [
    {
      candidateVi: "đày vào lãnh cung",
      partOfSpeech: "verb",
      semanticFeatures: ["IMPERIAL_PUNISHMENT", "COURT_CONSTRUCTION"],
      semanticSignature: createSemanticSignature({ denotation: "BANISH_TO_COLD_PALACE", valence: -0.70, intensity: 0.85 }),
      confidence: 0.95,
      indicatorContexts: ["皇帝", "废黜", "冷宫", "贵妃", "惩处", "贬", "娘娘", "太师"]
    }
  ],
  "包在我身上": [
    {
      candidateVi: "cứ để tôi lo",
      partOfSpeech: "phrase",
      semanticFeatures: ["IDIOMATIC_ASSURANCE", "COLLOQUIAL"],
      semanticSignature: createSemanticSignature({ denotation: "COLLOQUIAL_ASSURANCE", valence: 0.40, intensity: 0.80 }),
      confidence: 0.98,
      indicatorContexts: ["哥们", "这事", "放心", "包在", "保证", "稳妥", "兄弟"]
    }
  ],
  "吓得": [
    {
      candidateVi: "sợ đến mức",
      partOfSpeech: "verb",
      semanticFeatures: ["DEGREE_COMPLEMENT", "AFFECT_FEAR"],
      semanticSignature: createSemanticSignature({ denotation: "SCARED_TO_DEGREE", valence: -0.60, intensity: 0.80 }),
      confidence: 0.95,
      indicatorContexts: ["直往", "发抖", "浑身", "面无人色", "哭", "逃", "钻"]
    }
  ],
  "直往我怀里钻": [
    {
      candidateVi: "chui thẳng vào lòng ta",
      partOfSpeech: "phrase",
      semanticFeatures: ["DIRECTIONAL_BURROW", "IDIOM"],
      semanticSignature: createSemanticSignature({ denotation: "BURROW_INTO_EMBRACE", valence: 0.20, intensity: 0.70 }),
      confidence: 0.98,
      indicatorContexts: ["吓得", "不知是谁", "师姐", "怀里", "钻"]
    }
  ],
  "轰然": [
    {
      candidateVi: "ầm ầm",
      partOfSpeech: "adv",
      semanticFeatures: ["ACOUSTIC_IMPACT", "INTENSITY"],
      semanticSignature: createSemanticSignature({ denotation: "THUNDEROUS_BOOM", valence: 0.0, intensity: 0.85 }),
      confidence: 0.95,
      indicatorContexts: ["劈下", "倒下", "破裂", "爆发", "降临", "镇压", "炸开", "作响", "巨响", "雷劫", "崩塌"]
    },
    {
      candidateVi: "oanh nhiên",
      partOfSpeech: "adv",
      semanticFeatures: ["LITERARY_FLOURISH"],
      semanticSignature: createSemanticSignature({ denotation: "LITERARY_BOOM", valence: 0.0, intensity: 0.50 }),
      confidence: 0.60,
      indicatorContexts: []
    }
  ],
  "幽幽": [
    {
      candidateVi: "thoang thoảng",
      partOfSpeech: "adj",
      semanticFeatures: ["SENSORY_AROMA", "ATMOSPHERE"],
      semanticSignature: createSemanticSignature({ denotation: "FAINT_DELICATE_SCENT", valence: 0.30, intensity: 0.50 }),
      confidence: 0.95,
      indicatorContexts: ["茶香", "清香", "花香", "香气", "药香", "暗香", "飘香", "茶", "泉"]
    },
    {
      candidateVi: "u u",
      partOfSpeech: "adj",
      semanticFeatures: ["EERIE_OR_FAINT_SOUND"],
      semanticSignature: createSemanticSignature({ denotation: "EERIE_ATMOSPHERE", valence: -0.20, intensity: 0.50 }),
      confidence: 0.80,
      indicatorContexts: ["叹", "语", "声", "古刹", "冷风", "鬼火", "阴森"]
    }
  ],
  "依窗而立": [
    {
      candidateVi: "tựa bên cửa sổ mà đứng",
      partOfSpeech: "verb",
      semanticFeatures: ["POSTURE", "CLASSICAL_BEAUTY"],
      semanticSignature: createSemanticSignature({ denotation: "LEANING_BY_WINDOW", valence: 0.20, intensity: 0.50 }),
      confidence: 0.98,
      indicatorContexts: ["佳人", "少女", "云鬓", "罗裳", "望", "独立"]
    }
  ],
  "依窗": [
    {
      candidateVi: "tựa bên cửa sổ",
      partOfSpeech: "verb",
      semanticFeatures: ["POSTURE", "DESCRIPTION"],
      semanticSignature: createSemanticSignature({ denotation: "LEANING_BY_WINDOW", valence: 0.20, intensity: 0.50 }),
      confidence: 0.95,
      indicatorContexts: ["而立", "看", "望", "佳人", "独坐", "凭栏"]
    }
  ],
  "直往": [
    {
      candidateVi: "thẳng vào",
      partOfSpeech: "adv",
      semanticFeatures: ["DIRECTIONAL_MOTION"],
      semanticSignature: createSemanticSignature({ denotation: "STRAIGHT_TOWARDS", valence: 0.0, intensity: 0.70 }),
      confidence: 0.95,
      indicatorContexts: ["怀里", "钻", "深处", "去", "冲", "飞", "落", "洞"]
    }
  ],
  "不可不": [
    {
      candidateVi: "nhất định phải",
      partOfSpeech: "adv",
      semanticFeatures: ["NECESSITY_DOUBLE_NEGATIVE"],
      semanticSignature: createSemanticSignature({ denotation: "ABSOLUTE_NECESSITY", valence: 0.10, intensity: 0.80 }),
      confidence: 0.95,
      indicatorContexts: ["防", "察", "戒", "留心", "慎", "虑", "备"]
    }
  ],
  "却于": [
    {
      candidateVi: "thế nhưng lại ở trong",
      partOfSpeech: "fn",
      semanticFeatures: ["ADVERSATIVE_LOCATIVE"],
      semanticSignature: createSemanticSignature({ denotation: "ADVERSATIVE_WITHIN", valence: 0.10, intensity: 0.75 }),
      confidence: 0.95,
      indicatorContexts: ["毁灭", "绝境", "危难", "无声处", "暗中", "死地", "浴火重生"]
    }
  ],
  "戏谑道": [
    {
      candidateVi: "trêu chọc nói",
      partOfSpeech: "verb",
      semanticFeatures: ["DIALOGUE_TAG", "BANTER"],
      semanticSignature: createSemanticSignature({ denotation: "TEASING_SPEECH", valence: 0.30, intensity: 0.60 }),
      confidence: 0.95,
      indicatorContexts: ["眨眼", "笑道", "嘴角", "师姐", "师妹", "笑眯眯"]
    }
  ],
  "干笑道": [
    {
      candidateVi: "cười gượng nói",
      partOfSpeech: "verb",
      semanticFeatures: ["DIALOGUE_TAG", "AWKWARD"],
      semanticSignature: createSemanticSignature({ denotation: "AWKWARD_LAUGH_SPEECH", valence: -0.10, intensity: 0.50 }),
      confidence: 0.95,
      indicatorContexts: ["冷汗", "擦汗", "干笑", "挠头", "尴尬"]
    }
  ],
  "逼宫": [
    {
      candidateVi: "bức cung",
      partOfSpeech: "noun",
      semanticFeatures: ["IMPERIAL_CONSPIRACY", "COURT_CONSTRUCTION"],
      semanticSignature: createSemanticSignature({ denotation: "PALACE_COUP", valence: -0.40, intensity: 0.85 }),
      confidence: 0.98,
      indicatorContexts: ["最佳时机", "时机", "政变", "皇帝", "登基", "陛下", "叛变", "朝廷"]
    }
  ],
  "一记": [
    {
      candidateVi: "một cú",
      partOfSpeech: "cl",
      semanticFeatures: ["KINETIC_STRIKE_MEASURE"],
      semanticSignature: createSemanticSignature({ denotation: "STRIKE_MEASURE", valence: 0.0, intensity: 0.70 }),
      confidence: 0.95,
      indicatorContexts: ["横扫", "重拳", "飞踢", "耳光", "闷棍", "重击", "刀光", "剑光", "劈砍", "凌厉"]
    }
  ],
  "凌厉": [
    {
      candidateVi: "sắc bén",
      partOfSpeech: "adj",
      semanticFeatures: ["MARTIAL_SHARPNESS", "INTENSITY"],
      semanticSignature: createSemanticSignature({ denotation: "FIERCE_SHARP", valence: 0.0, intensity: 0.80 }),
      confidence: 0.95,
      indicatorContexts: ["横扫", "剑气", "刀芒", "攻势", "眼神", "一记", "剑光", "杀意"]
    }
  ],
  "浴火重生": [
    {
      candidateVi: "dục hỏa trùng sinh",
      partOfSpeech: "phrase",
      semanticFeatures: ["DAOIST_REBIRTH", "MYTHICAL"],
      semanticSignature: createSemanticSignature({ denotation: "PHOENIX_REBIRTH", valence: 0.60, intensity: 0.95 }),
      confidence: 0.98,
      indicatorContexts: ["毁灭", "神魂", "烈火", "火", "凤凰", "重生", "死地"]
    }
  ],
  "气得": [
    {
      candidateVi: "tức đến mức",
      partOfSpeech: "verb",
      semanticFeatures: ["DEGREE_COMPLEMENT", "AFFECT_ANGER"],
      semanticSignature: createSemanticSignature({ denotation: "ANGERED_TO_DEGREE", valence: -0.70, intensity: 0.85 }),
      confidence: 0.95,
      indicatorContexts: ["浑身发抖", "发抖", "吐血", "跳脚", "脸色发青", "脸色铁青", "咬牙切齿"]
    }
  ],
  "浑身发抖": [
    {
      candidateVi: "toàn thân run rẩy",
      partOfSpeech: "phrase",
      semanticFeatures: ["PHYSICAL_REACTION", "FEAR_OR_ANGER"],
      semanticSignature: createSemanticSignature({ denotation: "BODY_TREMBLING", valence: -0.50, intensity: 0.80 }),
      confidence: 0.95,
      indicatorContexts: ["气得", "吓得", "冷得", "发抖", "战栗"]
    }
  ],
  "跑得飞快": [
    {
      candidateVi: "chạy nhanh như bay",
      partOfSpeech: "phrase",
      semanticFeatures: ["RESULTATIVE_SPEED", "MOTION"],
      semanticSignature: createSemanticSignature({ denotation: "RUNNING_SWIFTLY", valence: 0.20, intensity: 0.75 }),
      confidence: 0.98,
      indicatorContexts: ["小丫头", "溜", "逃", "追", "跑得"]
    }
  ],
  "笑得合不拢嘴": [
    {
      candidateVi: "cười toe toét",
      partOfSpeech: "phrase",
      semanticFeatures: ["FACIAL_EXPRESSION", "AMUSEMENT"],
      semanticSignature: createSemanticSignature({ denotation: "GRINNING_EAR_TO_EAR", valence: 0.80, intensity: 0.85 }),
      confidence: 0.98,
      indicatorContexts: ["乐得", "高兴", "开心", "合不拢嘴"]
    }
  ],
  "心中暗道": [
    {
      candidateVi: "thầm nghĩ",
      partOfSpeech: "verb",
      semanticFeatures: ["COGNITIVE_INNER_THOUGHT", "DIALOGUE_TAG"],
      semanticSignature: createSemanticSignature({ denotation: "THOUGHT_TAG", valence: 0.0, intensity: 0.50 }),
      confidence: 0.98,
      indicatorContexts: ["萧炎", "韩立", "暗道", "心想", "暗自"]
    }
  ],
  "心中暗想": [
    {
      candidateVi: "thầm nghĩ",
      partOfSpeech: "verb",
      semanticFeatures: ["COGNITIVE_INNER_THOUGHT"],
      semanticSignature: createSemanticSignature({ denotation: "THOUGHT_TAG", valence: 0.0, intensity: 0.50 }),
      confidence: 0.98,
      indicatorContexts: ["暗想", "心想", "暗自"]
    }
  ]
};

function createLexicalCandidateGenerator({
  trie = null,
  phraseDict = {},
  properNounMatcher = null,
  nameGlossary = {},
  genreDict = {},
  hanvietChars = {}
} = {}) {
  /**
   * Generates a LexicalCandidateGraph for a given source text.
   * 
   * @param {string} textZh
   * @param {Object} contextHints
   * @returns {{ nodes: Array<Object>, hasAmbiguity: boolean, isFastPathEligible: boolean }}
   */
  function generateCandidateGraph(textZh, contextHints = {}) {
    if (!textZh || typeof textZh !== "string") {
      return { nodes: [], hasAmbiguity: false, isFastPathEligible: true };
    }

    const chars = Array.from(textZh);
    const nodes = [];
    let hasAmbiguity = false;
    let i = 0;

    while (i < chars.length) {
      const ch = chars[i];
      const positionCandidates = [];

      // 1. Check Book Glossary (LOCKED)
      for (const [gZh, gVi] of Object.entries(nameGlossary || {})) {
        if (textZh.startsWith(gZh, i)) {
          positionCandidates.push(createLexicalCandidate({
            spanZh: gZh,
            candidateVi: gVi,
            segmentation: { start: i, end: i + gZh.length, length: gZh.length },
            lexicalSource: "BOOK_GLOSSARY",
            isLocked: true,
            partOfSpeech: "name",
            confidence: 1.0,
            provenance: "book-glossary"
          }));
        }
      }

      // 2. Check Proper Noun Matcher
      if (properNounMatcher) {
        const pMatch = properNounMatcher.match(chars, i);
        if (pMatch) {
          positionCandidates.push(createLexicalCandidate({
            spanZh: chars.slice(i, i + pMatch.length).join(""),
            candidateVi: pMatch.vi,
            segmentation: { start: i, end: i + pMatch.length, length: pMatch.length },
            lexicalSource: "PROPER_NOUN",
            isProperNoun: true,
            partOfSpeech: "name",
            confidence: 0.90,
            provenance: "proper-noun-matcher"
          }));
        }
      }

      // 3. Check Trie Longest Match (Phrase Dictionary)
      let phraseMatch = null;
      if (trie) {
        let node = trie.root || (trie instanceof Map ? trie : null);
        if (node) {
          let j = i;
          let longest = null;
          while (j < chars.length) {
            const next = node.get(chars[j]);
            if (!next) break;
            node = next;
            j++;
            // Check terminal value
            for (const [k, val] of node.entries()) {
              if ((typeof k === "symbol" || k === "") && typeof val === "string") {
                longest = { vi: val, length: j - i };
              }
            }
          }
          if (longest) {
            phraseMatch = longest;
          }
        }
      } else if (phraseDict) {
        for (let len = 6; len >= 2; len--) {
          const sub = chars.slice(i, i + len).join("");
          if (phraseDict[sub]) {
            phraseMatch = { vi: phraseDict[sub], length: len };
            break;
          }
        }
      }

      if (phraseMatch) {
        positionCandidates.push(createLexicalCandidate({
          spanZh: chars.slice(i, i + phraseMatch.length).join(""),
          candidateVi: phraseMatch.vi,
          segmentation: { start: i, end: i + phraseMatch.length, length: phraseMatch.length },
          lexicalSource: "PHRASE_DICT",
          confidence: 0.85,
          provenance: "trie-phrase-dict"
        }));

        // Lookahead for overlapping proper nouns or glossary within phrase span
        if (phraseMatch.length > 1) {
          for (let k = 1; k < phraseMatch.length; k++) {
            if (properNounMatcher) {
              const subName = properNounMatcher.match(chars, i + k);
              if (subName && subName.length >= 2) {
                hasAmbiguity = true;
                // Provide single char prefix candidate to allow alternative segmentation
                const singleChar = chars[i];
                const singleHv = hanvietChars[singleChar] ? hanvietChars[singleChar].hv : singleChar;
                positionCandidates.push(createLexicalCandidate({
                  spanZh: singleChar,
                  candidateVi: singleHv,
                  segmentation: { start: i, end: i + 1, length: 1 },
                  lexicalSource: "PHRASE_DICT",
                  confidence: 0.70,
                  provenance: "competing-segmentation:prefix"
                }));
              }
            }
          }
        }
      }

      // 4. Check Explicit Polysemy Table
      for (const [polyZh, polyAlts] of Object.entries(KNOWN_POLYSEMOUS_ENTRIES)) {
        if (textZh.startsWith(polyZh, i)) {
          hasAmbiguity = true;
          for (const alt of polyAlts) {
            const isIdiomOrTerm = polyZh.length >= 3 || (alt.semanticFeatures && (alt.semanticFeatures.includes("IDIOM") || alt.semanticFeatures.includes("LOCKED_TERM") || alt.semanticFeatures.includes("DAOIST_INCANTATION")));
            const src = isIdiomOrTerm ? "IDIOM_CONSTRUCTION" : "POLYSEMY_ALT";
            positionCandidates.push(createLexicalCandidate({
              spanZh: polyZh,
              candidateVi: alt.candidateVi,
              segmentation: { start: i, end: i + polyZh.length, length: polyZh.length },
              lexicalSource: src,
              partOfSpeech: alt.partOfSpeech,
              semanticFeatures: alt.semanticFeatures,
              semanticSignature: alt.semanticSignature,
              confidence: alt.confidence,
              provenance: `polysemy-table:${polyZh}`
            }));
          }
        }
      }

      // 5. Fallback Han-Viet if no candidates at all
      if (positionCandidates.length === 0 && hanvietChars[ch]) {
        const hv = hanvietChars[ch].hv || ch;
        positionCandidates.push(createLexicalCandidate({
          spanZh: ch,
          candidateVi: hv,
          segmentation: { start: i, end: i + 1, length: 1 },
          lexicalSource: "HANVIET_FALLBACK",
          confidence: 0.50,
          provenance: "hanviet-chars"
        }));
      }

      // If multiple candidates exist with different segmentations or meanings, flag ambiguity
      if (positionCandidates.length > 1) {
        const uniqueVi = new Set(positionCandidates.map((c) => c.candidateVi));
        const uniqueLens = new Set(positionCandidates.map((c) => (c.segmentation ? c.segmentation.length : 1)));
        if (uniqueVi.size > 1 || uniqueLens.size > 1) {
          hasAmbiguity = true;
        }
      }

      // Determine step forward: prioritize best matched multi-character candidate
      const bestLen = positionCandidates.reduce((max, c) => Math.max(max, c.segmentation ? c.segmentation.length : 1), 1);
      nodes.push({
        position: i,
        sourceChar: ch,
        candidates: Object.freeze(positionCandidates)
      });

      i += Math.max(1, bestLen);
    }

    return Object.freeze({
      textZh,
      nodes: Object.freeze(nodes),
      hasAmbiguity,
      isFastPathEligible: !hasAmbiguity
    });
  }

  return Object.freeze({
    generateCandidateGraph,
    KNOWN_POLYSEMOUS_ENTRIES
  });
}

module.exports = {
  createLexicalCandidateGenerator,
  KNOWN_POLYSEMOUS_ENTRIES
};
