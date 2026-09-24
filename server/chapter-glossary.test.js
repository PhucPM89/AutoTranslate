"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const g = require("./chapter-glossary");

test("selects only approved terms present in the chapter, longest first", () => {
  const registry = g.createSeedRegistry([["物品栏", "Túi đồ"], ["物品栏扩展石", "Đá Mở Rộng Túi Đồ"], ["蝎蝠", "Dơi Bọ Cạp"]]);
  assert.deepEqual(g.selectTermsForChapter("使用物品栏扩展石", registry).map((x) => x.source), ["物品栏扩展石", "物品栏"]);
});

test("extracts bounded unknown candidates without replacing approved terms", () => {
  const registry = g.createSeedRegistry([["物品栏", "Túi đồ"]]);
  const terms = g.extractTermCandidates("使用物品栏，又拿出雷光能量枪。雷光能量枪十分轻盈。", registry);
  assert.ok(terms.some((x) => x.source.endsWith("枪")));
  assert.ok(!terms.some((x) => x.source === "物品栏"));
});

test("keeps machine terms non-approved even after repeated confirmations", () => {
  const candidates = [{ source: "雷光能量枪", count: 2 }];
  const plan = g.parseTermPlan("<TERM><ZH>雷光能量枪</ZH><VI>Súng Năng Lượng Lôi Quang</VI></TERM><TERM><ZH>不存在</ZH><VI>Bịa</VI></TERM>", "雷光能量枪", candidates);
  assert.equal(plan.length, 1);
  let registry = g.mergeConfirmedTerms(g.createSeedRegistry(), plan, 10, "Súng Năng Lượng Lôi Quang");
  assert.equal(registry.entries["雷光能量枪"].status, "pending");
  assert.equal(g.selectPendingTermsForChapter("再次使用雷光能量枪", registry)[0].target, "Súng Năng Lượng Lôi Quang");
  registry = g.mergeConfirmedTerms(registry, plan, 11, "Súng Năng Lượng Lôi Quang");
  assert.equal(registry.entries["雷光能量枪"].status, "pending");
  registry = g.mergeConfirmedTerms(registry, plan, 12, "Súng Năng Lượng Lôi Quang");
  assert.equal(registry.entries["雷光能量枪"].status, "stable");
  assert.equal(g.selectTermsForChapter("雷光能量枪", registry).length, 0);
});

test("curated terms override an older learned value", () => {
  const registry = { schema: 1, entries: { "洞悉": { source: "洞悉", target: "Động Sát", status: "approved", origin: "gpt" } } };
  const updated = g.applyCuratedTerms(registry, [["洞悉", "Nhìn Thấu"]]);
  assert.equal(updated.entries["洞悉"].target, "Nhìn Thấu");
  assert.equal(updated.entries["洞悉"].origin, "curated");
});
