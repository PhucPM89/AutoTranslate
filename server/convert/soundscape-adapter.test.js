"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { naturalizeSoundscapes } = require("./soundscape-adapter.js");

test("Soundscape Adapter: converts raw sound loanwords into expressive Vietnamese onomatopoeia", () => {
  const raw = "Phanh một tiếng vang lên, xương sườn khát sát một tiếng gãy lìa, hắn phốc một tiếng phun ra máu tươi, kiếm minh ong ong rền rĩ, đinh đinh đang đang giao kích.";
  const polished = naturalizeSoundscapes(raw);

  assert.match(polished, /rầm một tiếng vang dội/i);
  assert.match(polished, /rắc một tiếng/i);
  assert.match(polished, /phụt một tiếng hộc ra/i);
  assert.match(polished, /thanh kiếm rung lên ong ong rền rĩ/i);
  assert.match(polished, /keng keng keng keng/i);
});
