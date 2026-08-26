"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { escalateDramaticProse } = require("./dramatic-escalator.js");

test("Dramatic Escalator: elevates tragic moments and vengeance vows", () => {
  const raw = "Tông môn bị diệt, mối huyết hải thâm thù này, hắn quyết tử chiến đến cùng, không chết không thôi.";
  const escalated = escalateDramaticProse(raw);

  assert.match(escalated, /máu chảy thành sông/i);
  assert.match(escalated, /huyết hải thâm thù không đội trời chung/i);
  assert.match(escalated, /tử chiến đến giọt máu cuối cùng/i);
  assert.match(escalated, /bất tử bất hưu/i);
});
