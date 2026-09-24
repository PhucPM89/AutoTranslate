"use strict";

// General bilingual concepts, never record IDs or sentence-specific overrides.
// This is deliberately a bounded recognizer, not a multilingual entailment model.
const EVENTS = [
  ['kill', /击杀|杀死|杀了|猎杀|团灭|消灭/, ['tiêu diệt', 'giết', 'diệt sạch']],
  ['seal', /封印/, ['phong ấn']],
  ['flee', /跑路|逃跑|逃了|逃命|逃走/, ['bỏ chạy', 'chạy trốn', 'thoát chết', 'bỏ trốn']],
  ['receive', /获得|得到|收到/, ['nhận được', 'thu được']],
  ['sell', /出售|贩卖|卖出/, ['bán', 'rao bán']],
  ['buy', /购买|买下|买了/, ['mua']],
  ['open', /打开|推开|开启/, ['mở']],
  ['close', /关闭|关上/, ['đóng']],
  ['transfuse', /输血/, ['truyền máu']],
  ['born', /诞生|出生/, ['ra đời', 'sinh ra']],
  ['fall', /(?<!低)落地|掉落|摔倒/, ['chạm đất', 'rơi', 'ngã']],
  ['emerge', /破土而出|钻出|冒出/, ['trồi lên', 'chui ra', 'nhô ra']],
  ['observe', /观察|注视/, ['quan sát', 'nhìn chăm chú']],
  ['analyze', /分析/, ['phân tích']],
  ['think', /思考|转动大脑|想了想/, ['suy nghĩ', 'động não', 'nghĩ ngợi']],
  ['shoot', /射击|射了|开枪/, ['bắn', 'nổ súng']],
  ['sleep', /睡觉|入睡|深眠/, ['ngủ']],
  ['wake', /醒来|苏醒/, ['tỉnh dậy', 'tỉnh lại']],
  ['eat', /吃掉|吃了|吞食/, ['ăn', 'nuốt']],
  ['drink', /喝了|饮用|喝水/, ['uống']],
  ['leave', /离开|离去|走出/, ['rời', 'đi ra', 'bước ra']],
  ['enter', /进入|走进|跑进/, ['tiến vào', 'bước vào', 'chạy vào', 'chạy tọt vào']],
  ['search', /寻找|搜索/, ['tìm kiếm', 'tìm', 'truy lùng']],
  ['attack', /攻击|袭击/, ['tấn công', 'tập kích']],
  ['heal', /治疗|治愈/, ['chữa trị', 'chữa lành', 'trị liệu']],
  ['build', /建造|修建/, ['xây dựng', 'xây']],
  ['destroy', /摧毁|毁掉/, ['phá hủy', 'hủy diệt']],
  ['give', /赠送|送给/, ['tặng', 'đưa cho']],
  ['throw', /扔向|扔出|丢出/, ['ném']],
  ['pray', /祈祷/, ['cầu nguyện']],
  ['hide', /躲在|躲藏/, ['núp', 'nấp', 'ẩn nấp', 'trốn']],
  ['change', /改变/, ['thay đổi', 'xoay chuyển']],
  ['recover', /恢复/, ['hồi phục', 'phục hồi', 'khôi phục']],
  ['increase', /增加|提升/, ['tăng', 'nâng cao']],
  ['decompose', /分解/, ['phân giải']],
  ['frown', /皱眉|皱起眉头/, ['nhíu mày']],
  ['ask', /询问|问道/, ['hỏi']],
  ['answer', /回答|答道/, ['trả lời', 'đáp']],
];
const ARGUMENTS = [
  ['monster', /怪物|怪兽/, ['quái vật', 'quái thú']],
  ['doll', /娃娃/, ['búp bê']],
  ['meat', /肉块/, ['khối thịt', 'miếng thịt', 'cục thịt']],
  ['tentacle', /触手/, ['xúc tu']],
  ['door', /门/, ['cửa']],
  ['window', /窗户/, ['cửa sổ']],
  ['house', /木屋|房屋|房子/, ['nhà', 'căn nhà']],
  ['water', /水/, ['nước']],
  ['medicine', /丹药|药品/, ['đan dược', 'thuốc']],
  ['chain', /产业链/, ['đường dây', 'chuỗi']],
  ['pond', /池塘/, ['ao nước', 'ao']],
  ['rock', /巨石|石头/, ['tảng đá', 'cự thạch', 'đá lớn']],
  ['tree', /树/, ['cây']],
  ['danger', /危险/, ['nguy hiểm']],
];
const MARKERS = {
  negation: [[/没有|不|没|未|无/, ['không', 'chưa', 'chẳng']]],
  temporal: [[/已经|已|了/, ['đã', 'rồi']], [/之后|以后/, ['sau']], [/之前|以前/, ['trước']], [/正在|正/, ['đang']]],
  causal: [[/因为|由于/, ['vì', 'do']], [/所以|于是/, ['nên', 'thế là']], [/但是|不过|但/, ['nhưng', 'tuy nhiên']]],
};
function viMatch(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}
function signature(text, language, lexicon = []) {
  text = String(text || '').normalize('NFC');
  const source = language === 'zh';
  const scan = rows => rows.filter(([, re, aliases]) => source ? re.test(text) : aliases.some(a => viMatch(text, a)))
    .map(([id, re, aliases]) => {
      const surface = source ? text.match(re)[0] : aliases.find(a => viMatch(text, a));
      return { id, surface, offset: source ? text.search(re) : text.toLocaleLowerCase('vi').indexOf(surface.toLocaleLowerCase('vi')) };
    });
  const entities = scan(lexicon.map(([re, aliases], i) => [`lex:${i}`, re, aliases]));
  const predicates = scan(EVENTS).filter(p => {
    // Disambiguate lexicalized compounds before accepting a predicate token.
    if (source) return true;
    const masked = text.replace(/cảm nhận được|săn bắn|ăn mòn|rơi vào/giu, '');
    return viMatch(masked, p.surface);
  });
  const arguments_ = scan(ARGUMENTS);
  const numbers = text.match(/\d+(?:\.\d+)?/g) || [];
  // Surface-position role hypotheses are exposed, never passed off as a parser.
  // Passive voice reverses the simple before/after hypothesis. Pronouns and
  // unknown names stay unresolved; the gate does not judge translation fidelity.
  const participants = [...entities, ...arguments_].filter(a => !predicates.some(p => a.surface.includes(p.surface) || p.surface.includes(a.surface)));
  const frames = predicates.map(p => {
    const passive = source ? /被/.test(text.slice(0, p.offset)) : /\bbị\s*$/u.test(text.slice(0, p.offset));
    const before = participants.filter(a => a.offset < p.offset), after = participants.filter(a => a.offset > p.offset);
    return { predicate: p, role_confidence: 'HEURISTIC', subjects: passive ? [] : before,
      objects: passive ? before : after, passive };
  });
  return { entities, numbers, quantities: text.match(source ? /[一二三四五六七八九十百千万两几多]+[个只根斤枚张天]|\d+\s*(?:ml|个|只|张|单位)/g : /\d+\s*(?:ml|con|cái|đơn vị)|(?:vài|mấy|chục)\s+\p{L}+/gu) || [],
    subjects: { status: frames.length ? 'HEURISTIC' : 'UNKNOWN', candidates: frames.flatMap(f => f.subjects) },
    objects: { status: frames.length ? 'HEURISTIC' : 'UNKNOWN', candidates: frames.flatMap(f => f.objects) }, frames,
    predicates, events: predicates.map(p => p.id), arguments: arguments_,
    ...Object.fromEntries(Object.entries(MARKERS).map(([key, rows]) => [key, rows.flatMap(([re, aliases]) => source ? (text.match(re) || []).slice(0, 1) : aliases.filter(a => viMatch(text, a)))])),
    system: /【[^】]*】|\[[^\]]*\]/s.test(text), dialogue: /(?:^|\n)\s*[“"「]/.test(text),
  };
}
module.exports = { signature, viMatch };
