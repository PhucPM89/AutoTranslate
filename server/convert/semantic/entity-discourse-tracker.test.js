"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createDiscourseTracker } = require("./entity-discourse-tracker");
const { createClauseIR } = require("./contracts");

test("Entity Discourse Tracker: registers entities and updates salience with decay", () => {
  const tracker = createDiscourseTracker();

  tracker.registerEntity({ id: "char_diep_than", name: "Diệp Thần", gender: "MALE", role: "PROTAGONIST" });
  tracker.registerEntity({ id: "char_to_lac_tuyet", name: "Tô Lạc Tuyết", gender: "FEMALE", role: "HEROINE" });

  tracker.updateSalience({ entityId: "char_diep_than", roleInClause: "SUBJECT", clauseIndex: 1 });
  let stack = tracker.getSalienceStack();
  assert.equal(stack[0].entityId, "char_diep_than");
  assert.equal(stack[0].salience, 1.0);

  // Clause 4: Tô Lạc Tuyết is subject -> Diệp Thần decays
  tracker.updateSalience({ entityId: "char_to_lac_tuyet", roleInClause: "SUBJECT", clauseIndex: 4 });
  stack = tracker.getSalienceStack();
  assert.equal(stack[0].entityId, "char_to_lac_tuyet");
  assert.ok(stack.find((s) => s.entityId === "char_diep_than").salience < 1.0);
});

test("Entity Discourse Tracker: resolves Master-Disciple dialogue pronouns accurately", () => {
  const tracker = createDiscourseTracker();

  tracker.registerEntity({
    id: "char_su_phu",
    name: "Lý Huyền Cơ",
    gender: "MALE",
    role: "MASTER",
    relationships: {
      "char_do_nhi": { type: "MASTER_DISCIPLE", hierarchy: "SUPERIOR_TO_INFERIOR" }
    }
  });

  tracker.registerEntity({
    id: "char_do_nhi",
    name: "Diệp Thần",
    gender: "MALE",
    role: "DISCIPLE",
    relationships: {
      "char_su_phu": { type: "MASTER_DISCIPLE", hierarchy: "INFERIOR_TO_SUPERIOR" }
    }
  });

  // Disciple speaking to Master
  const res1 = tracker.resolvePronoun({
    pronounZh: "我",
    clauseRole: "DIALOGUE",
    speakerId: "char_do_nhi",
    targetId: "char_su_phu"
  });
  assert.equal(res1.resolvedValue, "đồ nhi");

  const res2 = tracker.resolvePronoun({
    pronounZh: "师尊",
    clauseRole: "DIALOGUE",
    speakerId: "char_do_nhi",
    targetId: "char_su_phu"
  });
  assert.ok(res2);

  const res3 = tracker.resolvePronoun({
    pronounZh: "你",
    clauseRole: "DIALOGUE",
    speakerId: "char_do_nhi",
    targetId: "char_su_phu"
  });
  assert.equal(res3.resolvedValue, "sư tôn");

  // Master speaking to Disciple
  const res4 = tracker.resolvePronoun({
    pronounZh: "我",
    clauseRole: "DIALOGUE",
    speakerId: "char_su_phu",
    targetId: "char_do_nhi"
  });
  assert.equal(res4.resolvedValue, "vi sư");
});

test("Entity Discourse Tracker: resolves Emperor-Subject dialogue pronouns accurately", () => {
  const tracker = createDiscourseTracker();

  tracker.registerEntity({
    id: "char_hoang_de",
    name: "Vũ Đế",
    relationships: {
      "char_dai_than": { type: "RULER_SUBJECT", hierarchy: "SUPERIOR_TO_INFERIOR" }
    }
  });

  tracker.registerEntity({
    id: "char_dai_than",
    name: "Tần Thừa Tướng",
    relationships: {
      "char_hoang_de": { type: "RULER_SUBJECT", hierarchy: "INFERIOR_TO_SUPERIOR" }
    }
  });

  const resEmperor = tracker.resolvePronoun({
    pronounZh: "我",
    clauseRole: "DIALOGUE",
    speakerId: "char_hoang_de",
    targetId: "char_dai_than"
  });
  assert.equal(resEmperor.resolvedValue, "trẫm");

  const resMinister = tracker.resolvePronoun({
    pronounZh: "我",
    clauseRole: "DIALOGUE",
    speakerId: "char_dai_than",
    targetId: "char_hoang_de"
  });
  assert.equal(resMinister.resolvedValue, "vi thần");
});

test("Entity Discourse Tracker: abstains on ambiguous equal-salience ties", () => {
  const tracker = createDiscourseTracker();

  tracker.registerEntity({ id: "char_su_huynh_a", name: "Đại Sư Huynh", gender: "MALE" });
  tracker.registerEntity({ id: "char_su_huynh_b", name: "Nhị Sư Huynh", gender: "MALE" });

  tracker.updateSalience({ entityId: "char_su_huynh_a", roleInClause: "OBJECT", clauseIndex: 1 });
  tracker.updateSalience({ entityId: "char_su_huynh_b", roleInClause: "OBJECT", clauseIndex: 1 });

  // Both have equal ~0.60 salience -> margin delta < 0.20
  const res = tracker.resolvePronoun({
    pronounZh: "他",
    clauseRole: "ACTION",
    clauseIndex: 1
  });

  assert.equal(res.status, "AMBIGUOUS");
  assert.equal(res.resolvedValue, "đối phương");
});

test("Entity Discourse Tracker: populates Pro-Drop ClauseIR with implicit subject from salience stack", () => {
  const tracker = createDiscourseTracker();
  tracker.registerEntity({ id: "char_hero", name: "Diệp Thần", gender: "MALE" });
  tracker.updateSalience({ entityId: "char_hero", roleInClause: "SUBJECT", clauseIndex: 1 });

  const rawIR = createClauseIR({
    id: "cl_test_01",
    sourceZh: "拔剑斩去",
    role: "ACTION",
    subjectSlot: { isImplicit: true }
  });

  const populated = tracker.populateClauseDiscourse(rawIR, { clauseIndex: 1 });

  assert.equal(populated.subjectSlot.isImplicit, true);
  assert.equal(populated.subjectSlot.resolvedPronoun, "hắn");
  assert.equal(populated.uncertainty.flag, "INFERRED_FROM_SALIENCE_TOP");
});
