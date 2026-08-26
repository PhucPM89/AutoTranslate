"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { naturalizeChronology } = require("./chronology-adapter.js");

test("Chronology Adapter: naturalizes incense, tea and breath durations", () => {
  const raw = "Trải qua một nén nhang công phu, hắn lại ngồi tĩnh tọa thêm nửa chén trà công phu. Trong vòng mấy cái hô hấp, trong một cái búng tay, ba canh nửa đêm trôi qua.";
  const polished = naturalizeChronology(raw);

  assert.match(polished, /chừng tàn một nén nhang/i);
  assert.match(polished, /chừng tàn nửa tuần trà/i);
  assert.match(polished, /chỉ trong vài nhịp thở ngắn ngủi/i);
  assert.match(polished, /chỉ trong cái búng tay/i);
  assert.match(polished, /nửa đêm canh ba/i);
});
