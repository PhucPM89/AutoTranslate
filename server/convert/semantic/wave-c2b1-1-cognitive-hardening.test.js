"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR } = require("./contracts");
const { segmentParagraphToClauseIRs } = require("./clause-segmenter");
const { createSemanticAnalyzer } = require("./semantic-analyzer");
const { createDiscourseTracker } = require("./entity-discourse-tracker");
const {
  COGNITIVE_KINDS,
  analyzeCognitiveEvent,
  detectEmotion
} = require("./cognitive-event-analyzer");
const { createMonologueProvider, MONOLOGUE_RULE_ACCOUNTABILITY } = require("./providers/monologue-provider");
const { SEMANTIC_ROLES, STYLE_SLOT_DEFINITIONS } = require("./providers/style-slot-definitions");

test("C2B-1.1 golden semantics distinguish thought, state, reaction, recollection, decision, inference, and none", () => {
  const cases = [
    ["心中暗道", COGNITIVE_KINDS.EXPLICIT_THOUGHT],
    ["心中忍不住想", COGNITIVE_KINDS.EXPLICIT_THOUGHT],
    ["心中暗自思量", COGNITIVE_KINDS.EXPLICIT_THOUGHT],
    ["脑海中闪过一个念头", COGNITIVE_KINDS.EXPLICIT_THOUGHT],
    ["脑海中浮现出一个念头", COGNITIVE_KINDS.EXPLICIT_THOUGHT],
    ["心中一震", COGNITIVE_KINDS.AFFECTIVE_REACTION],
    ["心中升起寒意", COGNITIVE_KINDS.INNER_STATE],
    ["心中生出忌惮", COGNITIVE_KINDS.INNER_STATE],
    ["他微微皱眉", COGNITIVE_KINDS.NARRATIVE_REACTION],
    ["他看着窗外", COGNITIVE_KINDS.NONE],
    ["他想到师父", COGNITIVE_KINDS.RECOLLECTION],
    ["他决定立即离开", COGNITIVE_KINDS.DECISION],
    ["他由此推断敌人尚未走远", COGNITIVE_KINDS.INFERENCE]
  ];

  for (const [source, expected] of cases) {
    assert.equal(analyzeCognitiveEvent(source).kind, expected, source);
  }

  const compound = segmentParagraphToClauseIRs("想到这里，眼中闪过精光。");
  assert.deepEqual(compound.map((clause) => clause.cognitiveEvent.kind), [
    COGNITIVE_KINDS.DECISION,
    COGNITIVE_KINDS.NARRATIVE_REACTION
  ]);
});

test("C2B-1.1 provider consumes Semantic IR only and INNER_MONOLOGUE is COGNITION", () => {
  const provider = createMonologueProvider();
  const semanticEvent = analyzeCognitiveEvent("他心中暗道不妙");
  const authorized = createClauseIR({
    sourceZh: "他看着窗外",
    role: semanticEvent.textRole,
    cognitiveEvent: semanticEvent
  });
  assert.equal(provider.contribute(authorized).length, 1, "Provider trusts resolved Semantic IR rather than rescanning source");

  const rawKeywordOnly = createClauseIR({ sourceZh: "他心中暗道不妙", role: "INNER_THOUGHT" });
  assert.equal(provider.contribute(rawKeywordOnly).length, 0, "Raw keyword without cognitiveEvent must abstain");
  assert.equal(provider.getSuggestions(rawKeywordOnly).cognitiveAudit.constraint, "PROVIDER_CANNOT_CLASSIFY_RAW_SOURCE");

  const stateEvent = analyzeCognitiveEvent("他心中一震");
  const stateClause = createClauseIR({ sourceZh: "他心中一震", role: stateEvent.textRole, cognitiveEvent: stateEvent });
  const stateAudit = provider.getSuggestions(stateClause).cognitiveAudit;
  assert.equal(stateAudit.status, "REJECT");
  assert.equal(stateAudit.constraint, "INNER_MONOLOGUE_REQUIRES_EXPLICIT_THOUGHT_OR_RECOLLECTION");
  assert.equal(STYLE_SLOT_DEFINITIONS.INNER_MONOLOGUE.semanticRole, SEMANTIC_ROLES.COGNITION);
});

test("C2B-1.1 POV is preserved for all supported narration modes", () => {
  const provider = createMonologueProvider();
  for (const pov of ["FIRST_PERSON", "THIRD_PERSON_LIMITED", "THIRD_PERSON_OMNISCIENT", "OBJECTIVE_NARRATION"]) {
    const tracker = createDiscourseTracker({ initialPOV: pov });
    const event = analyzeCognitiveEvent("我心中暗道不妙", { discourse: tracker });
    const clause = createClauseIR({ sourceZh: "我心中暗道不妙", role: event.textRole, cognitiveEvent: event });
    const before = tracker.getActivePOV();
    const suggestions = provider.getSuggestions(clause);
    assert.equal(suggestions.cognitiveAudit.pov, pov);
    assert.equal(tracker.getActivePOV(), before, `Provider must not mutate ${pov}`);
    assert.equal(event.thinker.entityRole, "SELF");
  }
});

test("C2B-1.1 thinker and referent resolution stays in the discourse tracker and abstains on ambiguity", () => {
  const tracker = createDiscourseTracker({
    initialEntities: [
      { id: "thinker", name: "Diệp Thần", aliases: ["叶辰"], gender: "MALE", role: "PROTAGONIST" },
      { id: "other", name: "Tô Tuyết", aliases: ["苏雪"], gender: "FEMALE", role: "DISCIPLE" },
      { id: "master", name: "Lý Huyền Cơ", aliases: ["李玄机"], gender: "MALE", role: "MASTER" },
      { id: "enemy", name: "Ma Quân", aliases: ["魔君"], gender: "MALE", role: "ENEMY" }
    ]
  });

  assert.equal(analyzeCognitiveEvent("叶辰心中暗道师尊有异", { discourse: tracker }).thinker.entityId, "thinker");
  assert.equal(analyzeCognitiveEvent("苏雪心中暗道不妙", { discourse: tracker }).thinker.entityId, "other");
  assert.equal(analyzeCognitiveEvent("叶辰想到师尊", { discourse: tracker }).referent.entityId, "master");
  assert.equal(analyzeCognitiveEvent("叶辰想到敌人", { discourse: tracker }).referent.entityId, "enemy");

  const ambiguous = createDiscourseTracker({
    initialEntities: [
      { id: "master_a", name: "甲", role: "MASTER" },
      { id: "master_b", name: "乙", role: "MASTER" }
    ]
  });
  const event = analyzeCognitiveEvent("他想到师尊", { discourse: ambiguous });
  assert.equal(event.referent.status, "AMBIGUOUS");
  assert.equal(event.referent.entityId, null);
});

test("C2B-1.1 emotion evidence preserves source category without escalation", () => {
  const cases = [
    ["冷笑", "CONTEMPT"],
    ["苦笑", "SORROW"],
    ["震惊", "SURPRISE"],
    ["愤怒", "WRATH"],
    ["悲伤", "SORROW"],
    ["恐惧", "FEAR"],
    ["迟疑", "HESITATION"],
    ["疑惑", "DOUBT"],
    ["杀意", "HOSTILITY"]
  ];
  for (const [source, category] of cases) assert.equal(detectEmotion(source).category, category, source);

  assert.notEqual(detectEmotion("愤怒").category, "MADNESS");
  assert.notEqual(detectEmotion("悲伤").category, "DESPAIR");
  assert.notEqual(detectEmotion("震惊").category, "FEAR");
});

test("C2B-1.1 adversarial paragraphs preserve dialogue/action boundaries", () => {
  const first = segmentParagraphToClauseIRs("他看着师尊，心中一震。");
  assert.deepEqual(first.map((clause) => clause.cognitiveEvent.kind), [COGNITIVE_KINDS.NONE, COGNITIVE_KINDS.AFFECTIVE_REACTION]);
  assert.deepEqual(first.map((clause) => clause.role), ["ACTION", "DESCRIPTION"]);

  const second = segmentParagraphToClauseIRs("“师尊……”\n他心中暗道不妙。");
  assert.equal(second[0].role, "DIALOGUE");
  assert.equal(second[1].cognitiveEvent.kind, COGNITIVE_KINDS.EXPLICIT_THOUGHT);

  const recollection = analyzeCognitiveEvent("他想到三年前的事情。");
  assert.equal(recollection.kind, COGNITIVE_KINDS.RECOLLECTION);
  assert.equal(Object.hasOwn(recollection, "flashbackEvent"), false, "Must not invent a flashback event");
  assert.equal(analyzeCognitiveEvent("他微微皱眉。").kind, COGNITIVE_KINDS.NARRATIVE_REACTION);
});

test("C2B-1.1 provenance traces the complete cognitive resolution", () => {
  const analyzer = createSemanticAnalyzer({
    initialPOV: "THIRD_PERSON_LIMITED",
    initialEntities: [
      { id: "thinker", name: "Diệp Thần", aliases: ["叶辰"], role: "PROTAGONIST", gender: "MALE" },
      { id: "master", name: "Sư phụ", aliases: ["师尊"], role: "MASTER", gender: "MALE" }
    ]
  });
  const paragraph = analyzer.analyzeParagraph("叶辰心中暗道师尊有异。");
  const event = paragraph.clauses[0].cognitiveEvent;
  const audit = analyzer.getProvenanceLog()[0].cognitiveAudit;

  assert.equal(event.kind, COGNITIVE_KINDS.EXPLICIT_THOUGHT);
  for (const field of ["sourceSpan", "textRole", "cognitiveEventKind", "speaker", "thinker", "referent", "pov", "emotion", "candidate", "confidence", "status", "reason"]) {
    assert.ok(Object.hasOwn(audit, field), field);
  }
  assert.equal(audit.thinker.entityId, "thinker");
  assert.equal(audit.referent.entityId, "master");
  assert.equal(audit.pov, "THIRD_PERSON_LIMITED");
});

test("C2B-1.1 legacy 15-rule accountability is exhaustive and explicit", () => {
  assert.equal(MONOLOGUE_RULE_ACCOUNTABILITY.length, 15);
  assert.deepEqual(MONOLOGUE_RULE_ACCOUNTABILITY.map((entry) => entry.oldRule), Array.from({ length: 15 }, (_, index) => index + 1));
  for (const entry of MONOLOGUE_RULE_ACCOUNTABILITY) {
    assert.match(entry.disposition, /^(MIGRATED|MOVED|MERGED_MOVED|DEPRECATED_WITH_REASON)$/);
    if (entry.disposition !== "MIGRATED") assert.ok(entry.reason);
  }
});
