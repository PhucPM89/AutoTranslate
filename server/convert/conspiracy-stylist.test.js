"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishConspiracyProse } = require("./conspiracy-stylist.js");

test("Conspiracy Stylist: enhances court intrigue and insidious plots", () => {
  const raw = "Triều đình sóng ngầm cuộn trào, thừa tướng mang dã tâm lang sói, mượn đao giết người, phạm phải tội khi quân phạm thượng.";
  const polished = polishConspiracyProse(raw);

  assert.match(polished, /sóng ngầm cuộn trào nơi thâm cung nội viện/i);
  assert.match(polished, /dã tâm lang sói muôn phần hiểm độc khó lường/i);
  assert.match(polished, /mượn gió bẻ măng, mượn đao giết người không vấy một giọt máu/i);
  assert.match(polished, /tội tày đình khi quân phạm thượng, muôn chết không tha/i);
});
