"use strict";

/**
 * Dynamic Context Profiler (Phase 1)
 * 
 * Computes multi-domain semantic distributions, filters syntactic noise,
 * detects punctual shock transitions, and manages dynamic temporal inertia.
 * 
 * Domains:
 * - COMBAT, CULTIVATION_BREAKTHROUGH, SWORD_DAO, ALCHEMY, DAOIST_ARRAY
 * - SUPERNATURAL_HORROR, NECROPOLIS_TOMB, COURT_POLITICS, ZEN_TEA, MUSICAL_DAO
 * - ROMANCE_AESTHETICS, CYBER_SCIFI, APOCALYPSE_MUTANT, FORENSIC_MYSTERY
 */

const { scoreContextShock } = require("./contracts");

const DOMAIN_INDICATORS = {
  COMBAT: [
    "杀", "死", "战", "剑", "拳", "掌", "轰", "斩", "斩杀", "怒吼", "受死",
    "找死", "狂暴", "灵力", "真元", "魔气", "破空", "爆裂", "碎裂", "重创",
    "喋血", "自寻死路", "纳命来", "今日便是你的死期", "一剑劈下", "一掌拍出"
  ],
  SWORD_DAO: [
    "长剑", "拔剑", "宝剑", "剑气", "剑芒", "剑意", "剑心", "剑道", "剑魂",
    "万剑归宗", "人剑合一", "剑鸣", "寒芒", "出鞘", "绝世神剑"
  ],
  CULTIVATION_BREAKTHROUGH: [
    "突破", "渡劫", "天劫", "雷劫", "九天神雷", "金丹", "元婴", "化神", "炼气",
    "筑基", "大圆满", "瓶颈", "桎梏", "天地异象", "灵气灌顶", "脱胎换骨"
  ],
  ALCHEMY: [
    "炼丹", "丹药", "丹炉", "灵药", "药鼎", "丹香", "地火", "凝丹", "成丹",
    "极品丹药", "药效", "九转金丹", "药草"
  ],
  DAOIST_ARRAY: [
    "阵法", "大阵", "阵眼", "符箓", "符文", "禁制", "破阵", "阵旗", "护宗大阵",
    "引动天地灵气", "结界"
  ],
  SUPERNATURAL_HORROR: [
    "厉鬼", "红衣厉鬼", "阴魂", "恶鬼", "鬼气", "阴煞", "桃木剑", "八卦镜",
    "黑狗血", "朱砂", "冥婚", "纸扎人", "阴兵借道", "尸变", "僵尸", "阴阳眼"
  ],
  NECROPOLIS_TOMB: [
    "古墓", "地宫", "陵寝", "棺椁", "尸煞", "尸气", "机关", "暗器", "陪葬品",
    "石棺", "摸金", "镇墓兽"
  ],
  COURT_POLITICS: [
    "皇上", "陛下", "圣旨", "钦此", "微臣", "启奏", "谢主隆恩", "太子", "王爷",
    "宰相", "朝廷", "满朝文武", "欺君之罪", "诛九族", "夺嫡"
  ],
  ZEN_TEA: [
    "品茶", "煮茶", "茶香", "谈道", "论道", "禅意", "顿悟", "心如止水", "云淡风轻",
    "浮华", "大梦一场", "清幽"
  ],
  MUSICAL_DAO: [
    "古琴", "琴声", "笛声", "音波", "音律", "抚琴", "琴瑟", "高山流水", "拨动琴弦",
    "弦音", "曲调"
  ],
  ROMANCE_AESTHETICS: [
    "美眸", "柔情", "俏脸", "微红", "含情脉脉", "深情", "娇躯", "轻抚",
    "夫君", "娘子", "爱慕", "相思", "依偎", "脸颊绯红", "倾国倾城"
  ],
  CYBER_SCIFI: [
    "机甲", "神经连接", "虚拟现实", "全息投影", "主脑", "战舰", "激光炮",
    "能量盾", "生化", "赛博", "义体"
  ],
  APOCALYPSE_MUTANT: [
    "丧尸", "末世", "基因锁", "晶核", "辐射", "异能", "变异兽", "废土", "避难所"
  ]
};

/**
 * Creates a DynamicContextProfiler instance.
 */
function createContextProfiler({
  baselineGenre = "XIANXIA",
  initialDomains = {}
} = {}) {
  let currentDomains = { ...initialDomains };
  let currentMood = "NEUTRAL";
  let currentPacing = "MODERATE";
  let currentIntensity = 0.5;

  let clauseIndexCounter = 0;
  let lastShockDecision = null;

  /**
   * Evaluates evidence weights for domains in a given clause.
   */
  function extractDomainEvidence(clauseIR) {
    const text = clauseIR.sourceZh || "";
    const evidence = {};

    // Dialogue-domain activation comes from Semantic IR, never from a banter keyword.
    if (clauseIR.dialogueAct && clauseIR.dialogueAct.status === "RESOLVED" && clauseIR.dialogueAct.dialogueAct !== "NONE") {
      evidence.BANTER_DIALOGUE = clauseIR.dialogueAct.confidence;
    }

    // Determine syntactic position weight
    let weightMultiplier = 1.0;
    if (clauseIR.role === "DESCRIPTION") weightMultiplier = 0.7;
    else if (clauseIR.role === "EXPOSITION") weightMultiplier = 0.5;
    else if (clauseIR.role === "DIALOGUE") weightMultiplier = 0.8;

    // Check if metaphoric / comparison
    if (/如.*般|仿佛|好似|宛如/.test(text)) {
      weightMultiplier *= 0.25;
    }

    for (const [domain, keywords] of Object.entries(DOMAIN_INDICATORS)) {
      let count = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          count++;
        }
      }
      if (count > 0) {
        evidence[domain] = Number((Math.min(1.0, count * 0.35) * weightMultiplier).toFixed(3));
      }
    }

    return evidence;
  }

  /**
   * Updates context state with a new clause.
   */
  function updateContext(clauseIR) {
    clauseIndexCounter++;
    const text = clauseIR.sourceZh || "";

    // 1. Detect shock evidence
    const isQuotedOrRecollection =
      clauseIR.role === "DIALOGUE" && (text.includes("古籍记载") || text.includes("当年") || text.includes("曾有传闻"));

    const hasAcousticShock = /^[“"「『]?(?:Ầm|Rầm|Oanh|Xoảng|Keng|Phập|Bỗng nhiên|Đột nhiên|Đúng lúc này|轰|砰|咔嚓)[!,.!?，。！]/i.test(text);
    const hasViolentActionShock = /(?:huyết quang|kiếm khí bùng nổ|sát khí ngập trời|血光|剑气爆发|轰然碎裂)/.test(text);
    const hasSpatioTemporalJump = /(?:ba năm sau|sau khi trở về|bên trong một mật thất khác|三年后|数日后)/.test(text);

    const shockDecision = scoreContextShock({
      isQuotedOrRecollection,
      hasAcousticShock,
      hasViolentActionShock,
      hasSpatioTemporalJump,
      syntacticRole: isQuotedOrRecollection ? "EMBEDDED_QUOTE" : "MAIN_ASSERTION"
    });

    lastShockDecision = shockDecision;

    // 2. Compute dynamic alpha (inertia)
    const alpha = shockDecision.recommendedAlpha;

    // 3. Extract clause evidence
    const clauseEvidence = extractDomainEvidence(clauseIR);

    // 4. Update running domain vector
    const allDomains = new Set([...Object.keys(currentDomains), ...Object.keys(clauseEvidence)]);
    const updated = {};

    for (const d of allDomains) {
      const prevVal = currentDomains[d] || 0.0;
      const evidenceVal = clauseEvidence[d] || 0.0;
      const blended = (alpha * prevVal) + ((1 - alpha) * evidenceVal);
      if (blended > 0.05) {
        updated[d] = Number(blended.toFixed(3));
      }
    }

    currentDomains = updated;

    // 5. Update mood, intensity and pacing
    if (currentDomains.COMBAT > 0.6 || currentDomains.SWORD_DAO > 0.6) {
      currentMood = "TENSE_HOSTILE";
      currentPacing = "FAST_PUNCHY";
      currentIntensity = Math.max(0.8, currentDomains.COMBAT || 0.8);
    } else if (currentDomains.SUPERNATURAL_HORROR > 0.5 || currentDomains.NECROPOLIS_TOMB > 0.5) {
      currentMood = "EERIE_CHILLING";
      currentPacing = "SLOW_SUSPENSEFUL";
      currentIntensity = 0.75;
    } else if (currentDomains.ZEN_TEA > 0.5) {
      currentMood = "TRANQUIL_ZEN";
      currentPacing = "SLOW_DELIBERATE";
      currentIntensity = 0.3;
    } else if (currentDomains.ROMANCE_AESTHETICS > 0.5) {
      currentMood = "AFFECTIONATE";
      currentPacing = "MODERATE";
      currentIntensity = 0.5;
    } else {
      currentMood = "NEUTRAL";
      currentPacing = "MODERATE";
      currentIntensity = 0.5;
    }

    return getContextSnapshot();
  }

  /**
   * Returns a snapshot of the current semantic context.
   */
  function getContextSnapshot() {
    // Find primary domain
    let primaryDomain = "NEUTRAL";
    let maxWeight = 0;
    for (const [dom, wt] of Object.entries(currentDomains)) {
      if (wt > maxWeight) {
        maxWeight = wt;
        primaryDomain = dom;
      }
    }

    return Object.freeze({
      primaryDomain,
      domainWeights: Object.freeze({ ...currentDomains }),
      mood: currentMood,
      intensity: currentIntensity,
      pacing: currentPacing,
      lastShockDecision: lastShockDecision ? Object.freeze({ ...lastShockDecision }) : null
    });
  }

  return {
    updateContext,
    getContextSnapshot,
    extractDomainEvidence
  };
}

module.exports = {
  createContextProfiler,
  DOMAIN_INDICATORS
};
