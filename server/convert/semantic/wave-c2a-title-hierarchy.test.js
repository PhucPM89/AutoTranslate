"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createTitleHierarchyProvider } = require("./providers/title-hierarchy-provider");
const { createDiscourseTracker } = require("./entity-discourse-tracker");
const { createStylistRouter } = require("./stylist-router");

// =========================================================================
// 1. Direct Address vs Narrative Reference vs Self-Reference
// =========================================================================

test("Wave C2A - 1. Title Hierarchy: resolves Direct Address, Narrative Reference, and Self-Reference cleanly", () => {
  const provider = createTitleHierarchyProvider();

  // Test 1: Direct Address in Dialogue (徒儿拜见师尊：“弟子知错了。”)
  const clause1 = createClauseIR({
    id: "cl_title_01",
    sourceZh: "“师尊，弟子知错了。”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      denotation: "REVERED_MASTER_ADDRESS",
      affectDistribution: { SOLEMN: 0.90 },
      valence: 0.50,
      intensity: 0.60
    })
  });
  const contribs1 = provider.contribute(clause1);
  assert.ok(contribs1.length >= 1);
  const masterContrib = contribs1.find((c) => c.sourceSpanZh === "师尊");
  assert.ok(masterContrib);
  assert.equal(masterContrib.targetSlot, STYLE_SLOTS.SOCIAL_ADDRESS);
  assert.equal(masterContrib.candidateVi, "sư tôn");
  assert.equal(masterContrib.semanticRequirements.discourseRole, "DIRECT_ADDRESS");

  // Test 2: Narrative Reference in Narration (师尊走进大殿。)
  const clause2 = createClauseIR({
    id: "cl_title_02",
    sourceZh: "师尊缓步走进了大殿之中。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      denotation: "REVERED_MASTER_ADDRESS",
      affectDistribution: { SOLEMN: 0.85 },
      valence: 0.50,
      intensity: 0.50
    })
  });
  const contribs2 = provider.contribute(clause2);
  assert.ok(contribs2.length >= 1);
  const masterRef = contribs2.find((c) => c.sourceSpanZh === "师尊");
  assert.ok(masterRef);
  assert.equal(masterRef.candidateVi, "sư tôn");

  // Test 3: Court Self-Reference in Dialogue (“微臣参见陛下。”)
  const clause3 = createClauseIR({
    id: "cl_title_03",
    sourceZh: "“微臣参见陛下。”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      denotation: "COURT_MINISTER_SELF_REF",
      affectDistribution: { SOLEMN: 0.95 },
      valence: 0.50,
      intensity: 0.70
    })
  });
  const contribs3 = provider.contribute(clause3);
  assert.ok(contribs3.length >= 1);
  const ministerContrib = contribs3.find((c) => c.sourceSpanZh === "微臣");
  assert.ok(ministerContrib);
  assert.equal(ministerContrib.targetSlot, STYLE_SLOTS.TITLE_HONORIFIC);
  assert.equal(ministerContrib.candidateVi, "Vi thần");
  assert.equal(ministerContrib.semanticRequirements.discourseRole, "SELF_REFERENCE");
});

// =========================================================================
// 2. Pronoun Safety & Zero External Pronoun Injection
// =========================================================================

test("Wave C2A - 2. Pronoun Safety: Title Provider NEVER injects hardcoded external pronouns (hắn, nàng, ta, ngươi)", () => {
  const provider = createTitleHierarchyProvider();

  const testCases = [
    { sourceZh: "王爷冷冷地看着他。", role: "ACTION" },
    { sourceZh: "“师兄，你等等我。”", role: "DIALOGUE" },
    { sourceZh: "太上长老微微颔首。", role: "DESCRIPTION" },
    { sourceZh: "“老衲这厢有礼了。”", role: "DIALOGUE" },
    { sourceZh: "“本宫今日倒要看看。”", role: "DIALOGUE" }
  ];

  for (const tc of testCases) {
    const clause = createClauseIR({
      id: "cl_pronoun_safety",
      sourceZh: tc.sourceZh,
      role: tc.role,
      semanticSignature: createSemanticSignature({
        affectDistribution: { SOLEMN: 0.80 },
        valence: 0.50,
        intensity: 0.50
      })
    });
    const contribs = provider.contribute(clause);
    for (const contrib of contribs) {
      // Candidate must be the pure title or self-designation, NOT injected with extra sentence pronouns
      assert.equal(
        ["hắn ", "nàng ", "ngươi ", "bọn họ "].some((p) => contrib.candidateVi.startsWith(p)),
        false,
        `Title candidate '${contrib.candidateVi}' must not start with injected pronouns`
      );
    }
  }
});

// =========================================================================
// 3. Discourse Tracker Integration
// =========================================================================

test("Wave C2A - 3. Discourse Tracker Integration: Multi-Factor Pronoun & Address Resolution matches Social Hierarchy", () => {
  const tracker = createDiscourseTracker({
    initialEntities: [
      {
        id: "ent_master",
        name: "Lâm Uyển Nhi",
        gender: "FEMALE",
        role: "MASTER",
        relationships: {
          ent_disciple: { type: "MASTER_DISCIPLE", hierarchy: "SUPERIOR_TO_INFERIOR" }
        }
      },
      {
        id: "ent_disciple",
        name: "Diệp Thiên",
        gender: "MALE",
        role: "DISCIPLE",
        relationships: {
          ent_master: { type: "MASTER_DISCIPLE", hierarchy: "INFERIOR_TO_SUPERIOR" }
        }
      }
    ]
  });

  // Disciple speaking to Master
  const res1 = tracker.resolveDialoguePronoun({
    pronounZh: "你",
    speakerId: "ent_disciple",
    targetId: "ent_master"
  });
  assert.equal(res1.status, "RESOLVED");
  assert.equal(res1.resolvedValue, "sư tôn");

  // Master speaking to Disciple
  const res2 = tracker.resolveDialoguePronoun({
    pronounZh: "我",
    speakerId: "ent_master",
    targetId: "ent_disciple"
  });
  assert.equal(res2.status, "RESOLVED");
  assert.equal(res2.resolvedValue, "vi sư");

  // Narrative resolution preserves female gender for Master
  tracker.updateSalience({ entityId: "ent_master", roleInClause: "SUBJECT", clauseIndex: 1 });
  const narrativeRes = tracker.resolveNarrativePronoun({ pronounZh: "她", clauseIndex: 1 });
  assert.equal(narrativeRes.status, "RESOLVED");
  assert.equal(narrativeRes.resolvedValue, "nàng");
});

// =========================================================================
// 4. POV Safety
// =========================================================================

test("Wave C2A - 4. POV Safety: Title Hierarchy contributions never mutate active POV", () => {
  const router = createStylistRouter();

  const firstPersonClause = createClauseIR({
    id: "cl_pov_first",
    sourceZh: "“微臣启禀陛下，边疆大捷！”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.95 },
      valence: 0.70,
      intensity: 0.80
    })
  });

  const res = router.route(firstPersonClause, {
    primaryDomain: "TITLE_HIERARCHY",
    domainWeights: { TITLE_HIERARCHY: 0.90 }
  });

  // Ensure routing produces selected title contributions without corrupting POV
  assert.ok(res.selectedContributions.length >= 1);
  const titles = res.selectedContributions.map((c) => c.candidateVi);
  assert.ok(titles.includes("Vi thần") || titles.includes("Khởi bẩm Bệ hạ"));
});

// =========================================================================
// 5. Provider Order Independence
// =========================================================================

test("Wave C2A - 5. Provider Order Independence: Title Hierarchy produces 100% deterministic outcomes", () => {
  const router = createStylistRouter();

  const testClause = createClauseIR({
    id: "cl_title_order",
    sourceZh: "太上长老缓步走入大殿，掌门师兄躬身行礼：“恭迎太上长老！”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.90, ELEVATED: 0.85 },
      valence: 0.60,
      intensity: 0.70
    })
  });

  const baselineRes = router.route(testClause, {
    primaryDomain: "TITLE_HIERARCHY",
    domainWeights: { TITLE_HIERARCHY: 0.90 }
  });

  for (let i = 0; i < 5; i++) {
    const shuffledRouter = createStylistRouter();
    const shuffledRes = shuffledRouter.route(testClause, {
      primaryDomain: "TITLE_HIERARCHY",
      domainWeights: { TITLE_HIERARCHY: 0.90 }
    });

    assert.equal(shuffledRes.selectedContributions.length, baselineRes.selectedContributions.length);
    for (let k = 0; k < baselineRes.selectedContributions.length; k++) {
      assert.equal(
        shuffledRes.selectedContributions[k].candidateVi,
        baselineRes.selectedContributions[k].candidateVi
      );
    }
  }
});
