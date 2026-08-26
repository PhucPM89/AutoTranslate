"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { adaptLiteraryIdioms, findMatchedIdioms } = require("./idiom-adapter.js");

test("Idiom Adapter: replaces Chinese idioms with vivid Vietnamese equivalents", () => {
  const source = "对方向来喜欢落井下石，此次更是想要釜底抽薪，真是自寻死路！";
  const adapted = adaptLiteraryIdioms(source);

  assert.ok(adapted.includes("giậu đổ bìm leo"));
  assert.ok(adapted.includes("rút củi đáy nồi"));
  assert.ok(adapted.includes("tự tìm đường chết"));
});

test("Idiom Adapter: findMatchedIdioms extracts idioms from source", () => {
  const source = "你这是班门弄斧！今日你插翅难逃，必定让你灰飞烟灭！";
  const matched = findMatchedIdioms(source);

  assert.equal(matched.length, 3);
  assert.ok(matched.some((m) => m.zh === "班门弄斧" && m.vi === "múa rìu qua mắt thợ"));
  assert.ok(matched.some((m) => m.zh === "插翅难逃" && m.vi === "mọc cánh cũng khó thoát"));
  assert.ok(matched.some((m) => m.zh === "灰飞烟灭" && m.vi === "tan thành tro bụi"));
});
