"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishForensicProse } = require("./forensic-deduction-stylist.js");

test("Forensic Stylist: enhances locked room murders and deduction reveals", () => {
  const raw = "Đây là một vụ mật thất sát nhân, hung thủ có bằng chứng ngoại phạm, nhưng dựa vào manh mối tơ nhện, chân tướng đại bạch.";
  const polished = polishForensicProse(raw);

  assert.match(polished, /vụ án mạng bí ẩn trong mật thất phong tỏa hoàn toàn/i);
  assert.match(polished, /bằng chứng ngoại phạm hoàn hảo không một kẽ hở/i);
  assert.match(polished, /từng manh mối vụn vặt và dấu vết tơ nhện khó nhận ra nhất/i);
  assert.match(polished, /toàn bộ chân tướng đen tối cuối cùng cũng được phơi bày ra trước ánh sáng/i);
});
