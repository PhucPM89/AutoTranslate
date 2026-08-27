"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createRealCorpusEvaluator, calculateInterRaterAgreement, ERROR_SEVERITY } = require("./real-corpus-evaluator");
const { REAL_CORPUS_SAMPLES } = require("./real-corpus-data");

// Comprehensive mock baseline converter for real corpus test execution
function mockBaseConvert(zhText) {
  return String(zhText)
    .replace(/青云门屹立于青峰之巅已有三千载/g, "Thanh Vân Môn đứng sừng sững ở đỉnh núi xanh đã hơn ba ngàn năm")
    .replace(/门下弟子逾万/g, "đệ tử dưới trướng hơn vạn người")
    .replace(/威震八方/g, "uy chấn tám phương")
    .replace(/十年征战/g, "mười năm chinh chiến")
    .replace(/白骨蔽野/g, "xương trắng che đầy đồng hoang")
    .replace(/昔日繁华帝都如今只剩断壁残垣/g, "Đế Đô phồn hoa ngày xưa nay chỉ còn là bức tường đổ nát")
    .replace(/令人不胜唏嘘/g, "khiến người ta không khỏi thở dài cảm thán")
    .replace(/师尊/g, "Sư tôn")
    .replace(/弟子自知罪孽深重/g, "đệ tử tự biết tội nghiệt sâu nặng")
    .replace(/但绝无背叛宗门之意/g, "nhưng tuyệt đối không có ý phản bội tông môn")
    .replace(/青年跪倒在地/g, "thanh niên quỳ rạp xuống đất")
    .replace(/颤声说道/g, "giọng run rẩy nói")
    .replace(/白衣少女掩唇轻笑/g, "bạch y thiếu nữ che môi cười khẽ")
    .replace(/掌门师兄/g, "Chưởng môn sư huynh")
    .replace(/你平日里威严赫赫/g, "ngày thường huynh uy nghiêm lẫm liệt")
    .replace(/今日怎的这般局促/g, "hôm nay sao lại câu nệ thế này")
    .replace(/韩立心中暗暗盘算/g, "Hàn Lập trong lòng thầm tính toán")
    .replace(/此獠修为高深/g, "tên này tu vi thâm sâu")
    .replace(/正面迎敌绝无胜算/g, "đối đầu trực diện tuyệt đối không có phần thắng")
    .replace(/唯有智取/g, "chỉ có thể dùng mưu trí")
    .replace(/叶辰眼中寒芒一闪/g, "trong mắt Diệp Thần lóe lên tia lạnh lẽo")
    .replace(/拔剑出鞘/g, "rút kiếm ra khỏi vỏ")
    .replace(/凌厉的剑气瞬间撕裂了空气/g, "kiếm khí sắc bén nháy mắt xé toạc không khí")
    .replace(/萧炎盘膝而坐/g, "Tiêu Viêm ngồi xếp bằng")
    .replace(/闭目凝神/g, "nhắm mắt ngưng thần")
    .replace(/体内异火熊熊燃烧/g, "dị hỏa trong cơ thể bùng cháy dữ dội")
    .replace(/不断淬炼着经脉/g, "không ngừng tôi luyện kinh mạch")
    .replace(/苏落雪身着一袭素雅长裙/g, "Tô Lạc Tuyết khoác trên mình bộ váy dài thanh nhã")
    .replace(/青丝如绢/g, "tóc đen như lụa")
    .replace(/眼若秋水/g, "đôi mắt như nước mùa thu")
    .replace(/宛如九天仙女降临凡尘/g, "tựa như tiên nữ chín tầng trời giáng trần")
    .replace(/漆黑的古殿深处/g, "nơi sâu thẳm trong cổ điện tối tăm")
    .replace(/阴森鬼火明灭不定/g, "ngọn lửa quỷ âm u lập lòe bất định")
    .replace(/阵阵凄厉的哀嚎声自地底传来/g, "từng trận gào thét thê lương từ lòng đất truyền đến")
    .replace(/丞相躬身拜道/g, "Thừa tướng khom mình hành lễ")
    .replace(/启禀陛下/g, "khởi bẩm Bệ hạ")
    .replace(/南境乱民已平/g, "loạn dân phương nam đã dẹp yên")
    .replace(/但朝中仍有朋党勾结/g, "nhưng trong triều vẫn có bè phái cấu kết")
    .replace(/不可不防/g, "không thể không phòng ngừa")
    .replace(/竹林幽静/g, "rừng trúc thanh u yên tĩnh")
    .replace(/清风徐来/g, "gió mát nhẹ thổi")
    .replace(/石桌上一壶香茗正冒着袅袅白烟/g, "trên bàn đá một ấm trà thơm đang bốc lên làn khói trắng lượn lờ")
    .replace(/琴音破空而起/g, "tiếng đàn xé gió vút lên")
    .replace(/太上长老霍然拔剑/g, "Thái Thượng Trưởng lão đột ngột tuốt kiếm")
    .replace(/剑光如虹/g, "kiếm quang rực rỡ như cầu vồng")
    .replace(/狂暴的杀意如海啸般倾泻而出/g, "sát ý cuồng bạo tựa sóng thần tuôn trào")
    .replace(/他回想起当年宗门被灭的惨状/g, "hắn nhớ lại thảm cảnh tông môn bị tiêu diệt năm xưa")
    .replace(/长叹道/g, "thở dài thườn thượt nói")
    .replace(/师父没有骗我/g, "sư phụ không lừa gạt ta")
    .replace(/他真的已经离开了/g, "người thật sự đã rời đi rồi")
    .replace(/林动撇了撇嘴/g, "Lâm Động bĩu môi")
    .replace(/没好气地道/g, "bực bội nói")
    .replace(/你这死胖子/g, "cái tên béo chết tiệt nhà ngươi")
    .replace(/吃得比谁都多/g, "ăn thì nhiều hơn bất kỳ ai")
    .replace(/跑得比谁都慢/g, "mà chạy thì chậm hơn bất kỳ ai");
}

// =========================================================================
// 1. Real Corpus Execution & Invariant Tests
// =========================================================================

test("Phase R3-1 - 1. Real Corpus Execution: Evaluates all stratified and hard-case passages", () => {
  const evaluator = createRealCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const { detailedResults, metrics } = evaluator.executeEvaluation();

  assert.equal(detailedResults.length, REAL_CORPUS_SAMPLES.length, "All passages evaluated");
  assert.ok(metrics.samplingDistribution.HARD_CASE_SAMPLE >= 4, "Includes hard cases");
  assert.ok(metrics.samplingDistribution.STRATIFIED_SAMPLE >= 5, "Includes stratified cases");
  assert.ok(metrics.samplingDistribution.RANDOM_SAMPLE >= 3, "Includes random cases");
  assert.equal(metrics.criticalRegressionRate, 0.0, "Zero critical semantic regression");
});

test("Phase R3-1 - 2. Quality Delta Vectors: Shadow demonstrates positive gain across naturalness and literary dimensions", () => {
  const evaluator = createRealCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const { metrics } = evaluator.executeEvaluation();

  const { aggregateDelta } = metrics;
  assert.ok(aggregateDelta.meanDeltaSemantic >= 0.0, `Semantic fidelity should not regress, got ${aggregateDelta.meanDeltaSemantic}`);
  assert.ok(aggregateDelta.meanDeltaNaturalness >= 0.5, `Naturalness gain should be >= +0.5, got ${aggregateDelta.meanDeltaNaturalness}`);
  assert.ok(aggregateDelta.meanDeltaLiterary >= 0.5, `Literary quality gain should be >= +0.5, got ${aggregateDelta.meanDeltaLiterary}`);
  assert.ok(aggregateDelta.meanDeltaRegister >= 0.5, `Register gain should be >= +0.5, got ${aggregateDelta.meanDeltaRegister}`);
});

test("Phase R3-1 - 3. Blind Review Cards: Generates randomized A/B review presentations", () => {
  const evaluator = createRealCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const sample = REAL_CORPUS_SAMPLES[0];
  const card = evaluator.generateBlindReviewCard(sample, 101);

  assert.ok(card.systemA.length > 0);
  assert.ok(card.systemB.length > 0);
  assert.ok(card.shadowSystem === "A" || card.shadowSystem === "B");
  assert.equal(card.id, sample.id);
});

test("Phase R3-1 - 4. Inter-Rater Agreement: Computes high agreement index on 1-5 rubric", () => {
  const agreementHigh = calculateInterRaterAgreement([4.5, 4.7, 4.6]);
  assert.ok(agreementHigh >= 0.90, `Expected high agreement, got ${agreementHigh}`);

  const agreementLow = calculateInterRaterAgreement([1.0, 5.0, 3.0]);
  assert.ok(agreementLow < 0.70, `Expected low agreement on scattered scores, got ${agreementLow}`);
});

test("Phase R3-1 - 5. Error Severity Triage: Ensures zero critical regressions on real webnovel corpus", () => {
  const evaluator = createRealCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const { detailedResults } = evaluator.executeEvaluation();

  for (const res of detailedResults) {
    const criticalErrors = res.shadowErrors.filter((e) => e.severity === ERROR_SEVERITY.CRITICAL);
    assert.equal(criticalErrors.length, 0, `Passage ${res.id} must not have critical errors`);
  }
});

test("Phase R3-1 - 6. Decision Gate: Confirms GO recommendation across all quality invariants", () => {
  const evaluator = createRealCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const evalResult = evaluator.executeEvaluation();
  const decision = evaluator.evaluateDecisionGate(evalResult);

  assert.equal(decision.verdict, "GO", "Evaluation decision gate must recommend GO");
  assert.equal(decision.gates.every((g) => g.passed), true, "All quality gates must pass");
});
