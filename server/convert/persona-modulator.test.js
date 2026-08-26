"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectPersonas, formatPersonaPrompt } = require("./persona-modulator.js");

test("Persona Modulator: detects elder and enchantress personas", () => {
  const source = "老夫纵横天下数百年，何曾将你这黄口小儿放在眼里？女子娇笑一声，美眸流转：'好哥哥，何必动怒呢？'";
  const personas = detectPersonas(source);

  assert.equal(personas.length, 2);
  assert.ok(personas.some((p) => p.type === "elder_ancestor"));
  assert.ok(personas.some((p) => p.type === "enchantress"));

  const prompt = formatPersonaPrompt(personas);
  assert.ok(prompt.includes("Lão Quái Vật"));
  assert.ok(prompt.includes("Ma Nữ"));
});

test("Persona Modulator: detects sword cultivator persona", () => {
  const source = "李子夜面无表情，拔剑冷冷道：'接我一剑，死！'";
  const personas = detectPersonas(source);

  assert.ok(personas.some((p) => p.type === "sword_cultivator"));
});
