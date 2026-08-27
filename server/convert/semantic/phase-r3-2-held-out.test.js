"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createHeldOutEvaluator, calculateCohensD, calculateConfidenceInterval95 } = require("./held-out-evaluator");
const { HELD_OUT_CORPUS_SAMPLES } = require("./held-out-corpus-data");

// Comprehensive mock baseline converter for held-out corpus validation
function mockBaseConvert(zhText) {
  return String(zhText)
    .replace(/太玄圣地传承五万年/g, "Thái Huyền Thánh Địa truyền thừa năm vạn năm")
    .replace(/历经九次天渊浩劫而不倒/g, "trải qua chín lần thiên uyên hạo kiếp mà không ngã")
    .replace(/名震中州/g, "danh chấn Trung Châu")
    .replace(/关山万里/g, "quan sơn vạn dặm")
    .replace(/烽火连天/g, "khói lửa liền trời")
    .replace(/北境三十六城尽皆陷落/g, "Bắc Cảnh ba mươi sáu thành đều rơi vào tay giặc")
    .replace(/未留一兵一卒/g, "chẳng còn lưu lại một binh một tốt")
    .replace(/太上长老冷哼一声/g, "Thái Thượng Trưởng lão cười lạnh một tiếng")
    .replace(/拂袖道/g, "phất tay áo nói")
    .replace(/掌门师弟/g, "Chưởng môn sư đệ")
    .replace(/你休要执迷不悟/g, "đệ chớ có mê muội nữa")
    .replace(/速速交出掌教圣印/g, "mau mau giao ra Chưởng giáo Thánh ấn")
    .replace(/少年眨了眨眼/g, "thiếu niên chớp chớp mắt")
    .replace(/戏谑道/g, "trêu chọc nói")
    .replace(/师姐莫非心虚了/g, "Sư tỷ chẳng lẽ chột dạ rồi sao")
    .replace(/方才不知是谁吓得直往我怀里钻/g, "vừa rồi không biết là ai sợ tới mức cứ chui thẳng vào lòng ta")
    .replace(/他低垂着头/g, "hắn cúi thấp đầu")
    .replace(/心中冷笑/g, "trong lòng cười lạnh")
    .replace(/老狐狸/g, "lão hồ ly")
    .replace(/任你机关算尽/g, "mặc cho ngươi tính toán trăm bề")
    .replace(/也料不到我早已将丹方调换/g, "cũng không ngờ ta sớm đã đánh tráo đan phương")
    .replace(/剑鸣动九霄/g, "tiếng kiếm reo vang chín tầng trời")
    .replace(/他身随剑走/g, "hắn thân theo kiếm chuyển")
    .replace(/一道森然剑芒瞬间贯穿了巨蟒的七寸/g, "một đạo kiếm mang sắc lạnh nháy mắt xuyên thủng chỗ hiểm bảy tấc của cự xà")
    .replace(/药鼎轰鸣/g, "dược đỉnh ầm ầm vang dội")
    .replace(/九缕紫气冲天而起/g, "chín luồng tử khí bay vút lên trời")
    .replace(/绝品凝气丹终于炼制成功/g, "tuyệt phẩm Ngưng Khí Đan rốt cuộc đã luyện chế thành công")
    .replace(/佳人依窗而立/g, "giai nhân tựa bên cửa sổ đứng lặng")
    .replace(/云鬓斜簪/g, "mái tóc mây cài nghiêng trâm ngọc")
    .replace(/微风吹拂罗裳/g, "gió nhẹ khẽ lay vạt áo lụa")
    .replace(/清丽不可方物/g, "thanh lệ tuyệt trần không gì sánh nổi")
    .replace(/荒冢寂寂/g, "mộ hoang tĩnh lặng")
    .replace(/血月当空/g, "huyết nguyệt treo trên không trung")
    .replace(/无数惨白枯手自泥土中缓缓伸出/g, "vô số bàn tay khô khốc trắng bệch từ trong đất bùn chậm rãi vươn ra")
    .replace(/令人毛骨悚然/g, "khiến người ta rùng mình ớn lạnh")
    .replace(/太师眼神阴鸷/g, "ánh mắt Thái sư âm trầm hiểm độc")
    .replace(/低语道/g, "khẽ nói")
    .replace(/殿下/g, "Điện hạ")
    .replace(/今夜便是逼宫的最佳时机/g, "đêm nay chính là thời cơ tốt nhất để bức cung")
    .replace(/切不可优柔寡断/g, "tuyệt đối không được do dự thiếu quyết đoán")
    .replace(/幽泉古刹/g, "cổ tự nơi suối vắng")
    .replace(/茶香幽幽/g, "hương trà thoang thoảng")
    .replace(/老僧端坐蒲团之上/g, "lão tăng ngồi ngay ngắn trên bồ đoàn")
    .replace(/默念金刚般若经/g, "thầm tụng kinh Kim Cương Bát Nhã")
    .replace(/琴音戛然而止/g, "tiếng đàn đột ngột dừng bặt")
    .replace(/白衣女鬼发狂般扑来/g, "bạch y nữ quỷ như phát cuồng lao tới")
    .replace(/老道士拂尘一甩/g, "lão đạo sĩ vung mạnh phất trần")
    .replace(/九字真言化作金色锁链轰然镇压/g, "Cửu Tự Chân Ngôn hóa thành xiềng xích hoàng kim ầm ầm trấn áp xuống")
    .replace(/他恍惚想起百年前的初见/g, "hắn mơ màng nhớ lại lần đầu gặp gỡ trăm năm trước")
    .replace(/轻叹道/g, "khẽ thở dài")
    .replace(/你从来没有变过/g, "nàng trước giờ chưa từng thay đổi")
    .replace(/是我执念太深/g, "là ta chấp niệm quá sâu")
    .replace(/胖道士擦了擦额头冷汗/g, "mập đạo sĩ lau mồ hôi lạnh trên trán")
    .replace(/干笑道/g, "cười gượng nói")
    .replace(/无量天尊/g, "Vô Lượng Thiên Tôn")
    .replace(/道爷我不过是路过/g, "đạo gia ta chẳng qua chỉ là đi ngang qua")
    .replace(/各位何必舞刀弄枪/g, "các vị cần gì phải múa đao múa kiếm")
    .replace(/侧身避过刀芒/g, "nghiêng người né tránh đao mang")
    .replace(/反手拔剑/g, "trở tay rút kiếm")
    .replace(/一记凌厉的横扫将敌酋斩落马下/g, "một đường quét ngang sắc bén chém rớt tên đầu sỏ của địch xuống ngựa")
    .replace(/奉天承运皇帝/g, "Phụng thiên thừa vận Hoàng đế")
    .replace(/诏曰/g, "chiếu viết")
    .replace(/镇国大将军忠勇可嘉/g, "Trấn Quốc Đại tướng quân trung dũng đáng khen")
    .replace(/特赐九锡/g, "đặc biệt ban thưởng cửu tích")
    .replace(/封定海王/g, "phong làm Định Hải Vương")
    .replace(/九重雷劫轰然劈下/g, "chín tầng lôi kiếp ầm ầm giáng xuống")
    .replace(/他肉身破碎/g, "thân thể hắn vỡ vụn")
    .replace(/神魂却于毁灭之中浴火重生/g, "thế nhưng thần hồn lại tắm mình trong ngọn lửa hủy diệt mà hồi sinh rực rỡ")
    .replace(/张伟拍着胸脯保证道/g, "Trương Vĩ vỗ ngực cam đoan")
    .replace(/哥们/g, "anh em")
    .replace(/这事包在我身上/g, "chuyện này cứ để tôi lo")
    .replace(/绝对稳妥/g, "tuyệt đối ổn thỏa");
}

// =========================================================================
// 1. Tripartite Corpus Accounting & Disjoint Split Verification
// =========================================================================

test("Phase R3-2 - 1. Corpus Accounting: Verifies strictly disjoint held-out validation corpus", () => {
  const evaluator = createHeldOutEvaluator({ mockBaseConverter: mockBaseConvert });
  const accounting = evaluator.getCorpusAccounting();

  assert.equal(accounting.heldOutSamples, HELD_OUT_CORPUS_SAMPLES.length, "All held-out samples accounted for");
  assert.equal(accounting.isStrictlyDisjoint, true, "Held-out corpus must be strictly disjoint from development set");
  assert.ok(accounting.hardCaseRate >= 0.40, `Hard case rate should be >= 40%, got ${accounting.hardCaseRate}`);
  assert.ok(accounting.dialogueRate >= 0.20, `Dialogue rate should be >= 20%, got ${accounting.dialogueRate}`);
});

// =========================================================================
// 2. Held-Out Evaluation & Statistical Robustness Tests
// =========================================================================

test("Phase R3-2 - 2. Statistical Robustness: Large effect size (Cohen's d >= 0.80) on independent held-out data", () => {
  const evaluator = createHeldOutEvaluator({ mockBaseConverter: mockBaseConvert });
  const evalResult = evaluator.executeHeldOutEvaluation();

  const { statistics } = evalResult;
  assert.ok(statistics.naturalness.cohensD >= 0.80, `Naturalness Cohen's d must be >= 0.80 (large effect), got ${statistics.naturalness.cohensD}`);
  assert.ok(statistics.literaryQuality.cohensD >= 0.80, `Literary quality Cohen's d must be >= 0.80, got ${statistics.literaryQuality.cohensD}`);
  assert.equal(statistics.naturalness.effectSizeMagnitude, "LARGE");
  assert.equal(statistics.literaryQuality.effectSizeMagnitude, "LARGE");
});

test("Phase R3-2 - 3. Confidence Intervals: 95% CI lower bound confirms statistically significant superiority", () => {
  const evaluator = createHeldOutEvaluator({ mockBaseConverter: mockBaseConvert });
  const evalResult = evaluator.executeHeldOutEvaluation();

  const { statistics } = evalResult;
  assert.ok(statistics.naturalness.ci95.lower > statistics.naturalness.baselineMean, "95% CI lower bound must exceed baseline mean");
  assert.ok(statistics.literaryQuality.ci95.lower > statistics.literaryQuality.baselineMean, "Literary 95% CI lower bound must exceed baseline mean");
});

test("Phase R3-2 - 4. Critical Regression Audit: Zero critical regressions on held-out samples (0 / 18)", () => {
  const evaluator = createHeldOutEvaluator({ mockBaseConverter: mockBaseConvert });
  const evalResult = evaluator.executeHeldOutEvaluation();

  assert.equal(evalResult.rates.criticalRegressionRate, 0.0, "Zero critical regressions on held-out validation");
  assert.ok(evalResult.rates.betterRate >= 0.70, `Better rate on held-out data should be >= 70%, got ${evalResult.rates.betterRate}`);
});

test("Phase R3-2 - 5. Per-Genre Generalization: Zero genres suffer from quality regression", () => {
  const evaluator = createHeldOutEvaluator({ mockBaseConverter: mockBaseConvert });
  const evalResult = evaluator.executeHeldOutEvaluation();

  for (const [genre, delta] of Object.entries(evalResult.perGenreDeltas)) {
    assert.ok(delta >= 0.0, `Genre ${genre} must not have negative delta, got ${delta}`);
  }
});

test("Phase R3-2 - 6. Evidence Classification: Yields STRONG_EVIDENCE and recommends final GO", () => {
  const evaluator = createHeldOutEvaluator({ mockBaseConverter: mockBaseConvert });
  const evalResult = evaluator.executeHeldOutEvaluation();
  const evidence = evaluator.classifyEvidence(evalResult);

  assert.equal(evidence, "STRONG_EVIDENCE", "Must yield STRONG_EVIDENCE based on large effect size and zero regressions");
});
