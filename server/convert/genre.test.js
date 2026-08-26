"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { buildConvertEngineFromDisk } = require("./index");

test("genre: xianxia mounts cultivation realm and daoist terminology", () => {
  const engine = buildConvertEngineFromDisk(process.env, { genre: "Tiên Hiệp, Huyền Huyễn" });
  assert.ok(engine, "engine builds successfully");

  const out1 = engine.convert("筑基期的修士面对半步至尊。");
  assert.ok(out1.includes("Trúc Cơ kỳ"), `expected Trúc Cơ kỳ, got: ${out1}`);
  assert.ok(out1.includes("nửa bước Chí Tôn"), `expected nửa bước Chí Tôn, got: ${out1}`);

  const out2 = engine.convert("本尊在此，休得放肆！");
  assert.ok(out2.includes("Bổn tôn"), `expected Bổn tôn, got: ${out2}`);
});

test("genre: modern mounts urban and corporate terminology", () => {
  const engine = buildConvertEngineFromDisk(process.env, { genre: "Đô Thị, Tổng Tài" });
  assert.ok(engine, "engine builds");

  const out1 = engine.convert("总裁和董事长正在召集董事会。");
  assert.ok(out1.includes("Tổng tài"), `expected Tổng tài, got: ${out1}`);
  assert.ok(out1.includes("Chủ tịch Hội đồng quản trị"), `expected Chủ tịch HĐQT, got: ${out1}`);

  const out2 = engine.convert("主治医师从急诊科走了出来。");
  assert.ok(out2.includes("Bác sĩ chủ trị"), `expected Bác sĩ chủ trị, got: ${out2}`);
  assert.ok(out2.includes("khoa cấp cứu"), `expected khoa cấp cứu, got: ${out2}`);
});

test("genre: romance mounts imperial palace and ancient family hierarchy", () => {
  const engine = buildConvertEngineFromDisk(process.env, { genre: "Cung Đấu, Ngôn Tình" });
  assert.ok(engine, "engine builds");

  const out1 = engine.convert("本宫今日便要将你打入冷宫！");
  assert.ok(out1.includes("Bổn cung"), `expected Bổn cung, got: ${out1}`);
  assert.ok(out1.includes("đày vào lãnh cung"), `expected đày vào lãnh cung, got: ${out1}`);

  const out2 = engine.convert("臣妾参见皇上，太后哀家凤体安康。");
  assert.ok(out2.includes("Thần thiếp"), `expected Thần thiếp, got: ${out2}`);
  assert.match(out2, /ai gia/i, `expected Ai gia, got: ${out2}`);
});

test("genre: system mounts game and status mechanics", () => {
  const engine = buildConvertEngineFromDisk(process.env, { genre: "Võng Du, Hệ Thống" });
  assert.ok(engine, "engine builds");

  const out1 = engine.convert("叮！【系统提示】恭喜宿主绑定系统。");
  assert.ok(out1.includes("Đinh!"), `expected Đinh!, got: ${out1}`);
  assert.ok(out1.includes("【Nhắc nhở của Hệ Thống】"), `expected system prompt, got: ${out1}`);
  assert.ok(out1.includes("ký chủ"), `expected ký chủ, got: ${out1}`);

  const out2 = engine.convert("通关隐藏副本，获得十倍暴击奖励。");
  assert.ok(out2.includes("phó bản"), `expected phó bản, got: ${out2}`);
  assert.ok(out2.includes("bạo kích gấp mười"), `expected bạo kích gấp mười, got: ${out2}`);
});

test("genre: scifi mounts starships and cybernetics", () => {
  const engine = buildConvertEngineFromDisk(process.env, { genre: "Khoa Huyễn, Cơ Giáp" });
  assert.ok(engine, "engine builds");

  const out1 = engine.convert("帝国舰队的星舰启动了曲率引擎。");
  assert.ok(out1.toLowerCase().includes("chiến hạm không gian"), `expected chiến hạm không gian, got: ${out1}`);
  assert.ok(out1.includes("động cơ bẻ cong không gian"), `expected động cơ bẻ cong không gian, got: ${out1}`);

  const out2 = engine.convert("机甲战士连接了光脑。");
  assert.ok(out2.toLowerCase().includes("cơ giáp"), `expected cơ giáp, got: ${out2}`);
  assert.ok(out2.includes("quang não"), `expected quang não, got: ${out2}`);
});


test("genre: horror mounts paranormal and forensic terms", () => {
  const engine = buildConvertEngineFromDisk(process.env, { genre: "Kinh Dị, Huyền Nghi" });
  assert.ok(engine, "engine builds");

  const out1 = engine.convert("法医到达案发现场，死因极其诡异。");
  assert.ok(out1.includes("Pháp y"), `expected Pháp y, got: ${out1}`);
  assert.ok(out1.includes("hiện trường vụ án"), `expected hiện trường vụ án, got: ${out1}`);
  assert.ok(out1.includes("quỷ dị"), `expected quỷ dị, got: ${out1}`);

  const out2 = engine.convert("深夜在停尸房遇到了厉鬼。");
  assert.ok(out2.includes("nhà xác"), `expected nhà xác, got: ${out2}`);
  assert.ok(out2.includes("lệ quỷ"), `expected lệ quỷ, got: ${out2}`);
});
