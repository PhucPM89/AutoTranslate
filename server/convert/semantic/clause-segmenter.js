"use strict";

/**
 * Clause Segmenter (Phase 1)
 * 
 * High-precision structural & syntactic segmenter for literary Chinese:
 * - Decomposes Paragraph -> Sentence -> Clause
 * - Classifies Clause Roles: DIALOGUE, INNER_THOUGHT, ACTION, DESCRIPTION, EXPOSITION, INCANTATION
 * - Recognizes Special Structural Typologies:
 *   1. Pro-drop (Implicit Subject)
 *   2. Serial Action Sequences (连动结构)
 *   3. Topic-Comment Frames (话题-说明)
 *   4. Idiomatic / Metric 4-Character Units (四字成语 / 熟语)
 */

const { createClauseIR } = require("./contracts");
const { analyzeCognitiveEvent, COGNITIVE_KINDS } = require("./cognitive-event-analyzer");

// Speech & Dialogue Indicator Markers
const SPEECH_VERBS = new Set([
  "道", "说道", "冷笑道", "喝道", "怒喝道", "大喝道", "冷哼道",
  "微笑道", "淡笑道", "苦笑道", "叹道", "沉声道", "低语道", "轻声道",
  "询问道", "质问道", "喊道", "惊呼道", "喃喃道", "笑骂道", "吩咐道"
]);

// Common Chinese Pronouns & Subject Markers
const PRONOUN_SUBJECTS = new Set([
  "他", "她", "它", "我", "你", "您", "他们", "她们", "它们", "我们", "你们", "自己", "众人", "老者", "少年", "少女", "男子", "女子"
]);

// Incantation & Mantra Indicators
const INCANTATION_TRIGGERS = [
  /急急如律令/,
  /临兵斗者皆阵列前行/,
  /奉天承运/,
  /天道昭昭/,
  /九霄神雷.*听吾号令/
];

// Common 4-character fixed idioms / phrases
const IDIOM_4_PATTERN = /^[\u4e00-\u9fa5]{4}$/;

/**
 * Checks if a string contains quote bounds.
 */
function isEnclosedInQuotes(str) {
  const s = str.trim();
  return (
    (s.startsWith("“") && s.endsWith("”")) ||
    (s.startsWith("「") && s.endsWith("」")) ||
    (s.startsWith("『") && s.endsWith("』")) ||
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("‘") && s.endsWith("’"))
  );
}

/**
 * Strips outer quotation marks and trailing colons.
 */
function stripQuotes(str) {
  let s = str.trim();
  if (isEnclosedInQuotes(s)) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/[:：]$/, "").trim();
}

/**
 * Splits paragraph text into sentences based on major punctuation (. ! ? 。 ！ ？ … \n).
 * Correctly treats closing quotes after terminal punctuation (e.g. `！”`, `。”`, `？”`) as sentence boundaries.
 * 
 * @param {string} text
 * @returns {string[]}
 */
function splitIntoSentences(text) {
  if (!text || typeof text !== "string") return [];

  const sentences = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = null;
  let lastCharWasTerminal = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if ((ch === "“" || ch === "「" || ch === "『" || ch === '"') && !inQuotes) {
      inQuotes = true;
      quoteChar = ch;
      lastCharWasTerminal = false;
    } else if (
      ((ch === "”" && quoteChar === "“") ||
       (ch === "」" && quoteChar === "「") ||
       (ch === "』" && quoteChar === "『") ||
       (ch === '"' && quoteChar === '"')) && inQuotes
    ) {
      inQuotes = false;
      quoteChar = null;
      current += ch;

      // If the dialogue ended with terminal punctuation inside the quote (e.g. `！”`),
      // the closing quote ends the sentence!
      if (lastCharWasTerminal) {
        const trimmed = current.trim();
        if (trimmed) sentences.push(trimmed);
        current = "";
        lastCharWasTerminal = false;
        continue;
      }
      continue;
    }

    current += ch;

    const isTerminal = (ch === "。" || ch === "！" || ch === "？" || ch === "\n" || (ch === "!" || ch === "?" || ch === "."));
    if (isTerminal) {
      lastCharWasTerminal = true;
      if (!inQuotes) {
        const trimmed = current.trim();
        if (trimmed) sentences.push(trimmed);
        current = "";
        lastCharWasTerminal = false;
      }
    } else {
      lastCharWasTerminal = false;
    }
  }

  const remaining = current.trim();
  if (remaining) sentences.push(remaining);

  return sentences;
}

/**
 * Splits a sentence into semantic clauses based on comma, semicolon, colon, or quote boundaries.
 * 
 * @param {string} sentence
 * @returns {Array<{ text: string, delimiter: string }>}
 */
function splitSentenceIntoClauses(sentence) {
  if (!sentence) return [];

  const clauses = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = null;

  for (let i = 0; i < sentence.length; i++) {
    const ch = sentence[i];

    if ((ch === "“" || ch === "「" || ch === "『" || ch === '"') && !inQuotes) {
      const lead = current.trim();
      if (lead) {
        clauses.push({ text: lead.replace(/[:：]$/, "").trim(), delimiter: ":" });
        current = "";
      }
      inQuotes = true;
      quoteChar = ch;
      current += ch;
      continue;
    } else if (
      ((ch === "”" && quoteChar === "“") ||
       (ch === "」" && quoteChar === "「") ||
       (ch === "』" && quoteChar === "『") ||
       (ch === '"' && quoteChar === '"')) && inQuotes
    ) {
      inQuotes = false;
      quoteChar = null;
      current += ch;
      const quoteText = current.trim();
      if (quoteText) {
        clauses.push({ text: quoteText, delimiter: ch });
        current = "";
      }
      continue;
    }

    if (!inQuotes && (ch === "，" || ch === "、" || ch === "；" || ch === "," || ch === ";")) {
      const clauseText = current.trim();
      if (clauseText) {
        clauses.push({ text: clauseText, delimiter: ch });
        current = "";
      }
      continue;
    }

    current += ch;
  }

  const remainder = current.trim();
  if (remainder) {
    clauses.push({ text: remainder.replace(/[:：]$/, "").trim(), delimiter: "" });
  }

  return clauses;
}

/**
 * Detects the linguistic role of a clause.
 * 
 * @param {string} clauseText
 * @param {Object} contextHints
 * @returns {string} One of DIALOGUE | INNER_THOUGHT | INCANTATION | ACTION | DESCRIPTION | EXPOSITION
 */
function classifyClauseRole(clauseText, contextHints = {}) {
  const text = clauseText.trim();

  // 1. Incantation / Mantra
  if (INCANTATION_TRIGGERS.some((rx) => rx.test(text))) {
    return "INCANTATION";
  }

  // 2. Dialogue (enclosed in quotes or follows speech verb)
  if (isEnclosedInQuotes(text) || contextHints.precedingSpeechVerb) {
    return "DIALOGUE";
  }

  // 3. Cognitive/state semantics are classified before assigning a text role.
  // A surface marker such as 心中 is never sufficient on its own.
  const cognitiveEvent = contextHints.cognitiveEvent || analyzeCognitiveEvent(text);
  if (cognitiveEvent.kind !== COGNITIVE_KINDS.NONE) return cognitiveEvent.textRole;

  // 4. Action vs Description vs Exposition heuristics
  const hasActionVerbs = /(?:拔剑|斩|杀|冲|跃|踢|击|轰|出拳|闪身|掠出|退后|吐血|捏碎|结印|破空|看着|看向|望着)/.test(text);
  if (hasActionVerbs) {
    return "ACTION";
  }

  const hasDescriptive = /(?:如.*般|般.*|幽暗|苍茫|巍峨|绝美|晶莹|清澈|阴森|漆黑|绚烂)/.test(text);
  if (hasDescriptive) {
    return "DESCRIPTION";
  }

  return "EXPOSITION";
}

/**
 * Analyzes clause structure for Pro-Drop, Serial Actions, Topic-Comment, and Idioms.
 * 
 * @param {string} clauseText
 * @param {string} role
 * @returns {Object} StructuralAnalysis
 */
function analyzeClauseStructure(clauseText, role) {
  const clean = stripQuotes(clauseText).trim();

  // 1. Idiomatic 4-character unit check
  if (IDIOM_4_PATTERN.test(clean)) {
    return {
      tier: "IDIOMATIC_CHUNK",
      isImplicitSubject: true,
      hasSerialVerbs: false,
      isTopicComment: false,
      serialActions: []
    };
  }

  // 2. Topic-Comment Check (e.g. `这家伙，心肠真黑`)
  const topicMatch = /^(这家伙|此人|那小子|那人|对方|老者|少女)(?:[，,])?\s*(.+)$/.exec(clean);
  if (topicMatch && topicMatch[2].length > 1) {
    return {
      tier: "TOPIC_COMMENT",
      isImplicitSubject: false,
      hasSerialVerbs: false,
      isTopicComment: true,
      topic: topicMatch[1],
      comment: topicMatch[2],
      serialActions: []
    };
  }

  // 3. Serial Verbs (连动结构) Detection in Action clauses
  const serialMatch = clean.match(/(?:拔剑|出鞘|纵身|跃起|翻身|凌空|抬手|一剑|一拳|一掌|斩出|劈下|刺去)/g);
  if (serialMatch && serialMatch.length >= 2) {
    return {
      tier: "SERIAL_ACTION",
      isImplicitSubject: !PRONOUN_SUBJECTS.has(clean.slice(0, 2)) && !PRONOUN_SUBJECTS.has(clean.slice(0, 1)),
      hasSerialVerbs: true,
      isTopicComment: false,
      serialActions: serialMatch.map((v) => ({ verbZh: v, manner: "SWIFT", intensity: 0.85 }))
    };
  }

  // Detect Entity Class of subject (PERSON, CREATURE, OBJECT, LOCATION, PHENOMENON, EVENT, ABSTRACT)
  let entityClass = null;
  if (/(?:药鼎|丹鼎|丹炉|长剑|宝剑|长刀|法宝|灵丹|神兵|玉佩|阵法|锁链|蒲团|经文|卷轴|罗裳|琴音|真言)/.test(clean)) {
    entityClass = "OBJECT";
  } else if (/(?:雷劫|天劫|紫气|霞光|鬼火|阴风|狂风|暴雨|血月|异象|剑鸣|茶香)/.test(clean)) {
    entityClass = "PHENOMENON";
  } else if (/(?:荒冢|古殿|古刹|大殿|深渊|山峰|宗门|城池|朝堂|古墓|禁地|九霄|泥土)/.test(clean)) {
    entityClass = "LOCATION";
  } else if (/(?:大战|拍卖|讲道|浩劫|大劫|逼宫)/.test(clean)) {
    entityClass = "EVENT";
  } else if (/(?:巨蟒|凶兽|神兽|灵兽|妖兽|白狐|灵禽)/.test(clean)) {
    entityClass = "CREATURE";
  } else if (/(?:少年|少女|老僧|老道|修士|道士|太师|皇帝|长老|掌门|师尊|弟子|女鬼|佳人|将军)/.test(clean)) {
    entityClass = "PERSON";
  }

  // 4. Pro-Drop Check: Does the clause start with a known subject or is it omitted?
  const opensWithPronounOrNoun =
    PRONOUN_SUBJECTS.has(clean.slice(0, 1)) ||
    PRONOUN_SUBJECTS.has(clean.slice(0, 2)) ||
    Boolean(entityClass) ||
    /^[A-Z\u4e00-\u9fa5]{2,4}(?:说|道|看|望|走|笑|拔|出|入|轰|立|现|响)/.test(clean);

  const isImplicitSubject = role === "ACTION" && !opensWithPronounOrNoun;

  return {
    tier: "FULL_FRAME",
    isImplicitSubject,
    entityClass,
    hasSerialVerbs: false,
    isTopicComment: false,
    serialActions: []
  };
}

/**
 * Master segmentation function for a paragraph of Chinese text.
 * Returns an array of parsed ClauseIR structures.
 * 
 * @param {string} paraText
 * @param {Object} options
 * @returns {Array<Object>} Array of ClauseIR
 */
function segmentParagraphToClauseIRs(paraText, {
  paraIndex = 0,
  baseId = "cl"
} = {}) {
  if (!paraText || typeof paraText !== "string" || !paraText.trim()) {
    return [];
  }

  const sentences = splitIntoSentences(paraText);
  const clauseIRs = [];

  let clauseCounter = 0;
  for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
    const sentence = sentences[sIdx];
    const rawClauses = splitSentenceIntoClauses(sentence);

    let precedingSpeechVerb = false;

    for (let cIdx = 0; cIdx < rawClauses.length; cIdx++) {
      const { text: rawText } = rawClauses[cIdx];
      if (!rawText) continue;

      clauseCounter++;
      const clauseId = `${baseId}_p${paraIndex}_s${sIdx + 1}_c${clauseCounter}`;

      const hasSpeechVerb = Array.from(SPEECH_VERBS).some((v) => rawText.endsWith(v) || rawText.includes(v + "："));
      const cognitiveEvent = analyzeCognitiveEvent(rawText);
      const role = classifyClauseRole(rawText, { precedingSpeechVerb, cognitiveEvent });
      const structure = analyzeClauseStructure(rawText, role);

      const clauseIR = createClauseIR({
        id: clauseId,
        tier: structure.tier,
        sourceZh: rawText,
        role,
        entityClass: structure.entityClass || null,
        cognitiveEvent: Object.freeze({ ...cognitiveEvent, textRole: role }),
        subjectSlot: {
          isImplicit: structure.isImplicitSubject,
          entityId: null,
          resolvedPronoun: null
        },
        actionSequence: structure.serialActions,
        invariants: {
          preserveClauseOrder: true,
          allowMetaphor: role !== "ACTION"
        }
      });

      clauseIRs.push(clauseIR);

      precedingSpeechVerb = hasSpeechVerb;
    }
  }

  return clauseIRs;
}

module.exports = {
  splitIntoSentences,
  splitSentenceIntoClauses,
  classifyClauseRole,
  analyzeClauseStructure,
  segmentParagraphToClauseIRs,
  isEnclosedInQuotes,
  stripQuotes
};
