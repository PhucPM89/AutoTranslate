"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const v = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      let val = m[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      v[m[1]] = val;
    }
  }
  return v;
}

const ROOT = path.join(__dirname, "..");
const env = { ...process.env, ...loadEnv(path.join(ROOT, ".env")), ...loadEnv(path.join(ROOT, ".env.local")) };
const { createStorage } = require(path.join(ROOT, "server/storage"));
const storage = createStorage(env);

function isNarrationLine(inner) {
  const t = inner.trim();
  
  // Dialogue ending / vocative guard: if it asks or exclaims to interlocutor, keep dialogue
  if (/(đúng không\??!?|phải không\??!?|hả\??!?|sao\??!?|chứ\??!?|nhỉ\??!?|nhé\??!?|đấy\??!?)$/i.test(t)) {
    return false;
  }
  
  // 1. Third person entities & subjects
  if (/^(Hắn|Cậu|Y|Bọn họ|Đám người)\s+[a-zà-ỹ]/i.test(t)) return true;
  if (/^(Trần Dịch|Trần Hạo|Trần Kiến Quốc|Hoàng Nhân Hà|Bác Hoàng|Ông lão|Người đàn ông)\s+[a-zà-ỹ]/i.test(t)) return true;
  if (/^(Trái tim|Đôi mắt|Ánh mắt|Gương mặt|Khuôn mặt|Bàn tay|Ngón tay|Hai tay|Dưới chân|Bước chân|Thân thể|Cơ thể|Nội dung tâm can|Cuộc sống)\s+[a-zà-ỹ]/i.test(t)) return true;
  if (/^(Một thanh|Một luồng|Một lớp|Lớp sương|Lớp lồng|Biểu cảm|Khoảng cách|Thời gian|Con búp bê|Búp bê tử linh|Quái vật|Khung cảnh|Không gian|Bên ngoài|Bên trong|Xung quanh|Trước mắt|Phía trước|Đằng sau)\s+[a-zà-ỹ]/i.test(t)) return true;
  if (/^(Sau đó|Cùng lúc đó|Cùng lúc|Trên đường đi|Trên đường|Trong lúc|Thấy vẫn|Biết rõ|Theo giây|Sau khi|Lúc này|Vừa dứt lời|Vừa dứt câu|Đột nhiên|Bỗng nhiên|Ngay sau đó|Chỉ chốc lát|Chẳng mấy chốc)\s+[a-zà-ỹ]/i.test(t)) return true;
  
  // 2. Clear narrative actions
  if (/(kinh hãi nhìn|đập thình thịch|xuất hiện trong tay|cảm thấy trong cơ thể|dựa theo tốc độ|dồn lực|vẫn đứng yên|tiện miệng hỏi|nét mặt ngập tràn|lẩm bẩm một mình|không kịp suy nghĩ|mở ô chứa đồ|đón lấy|hết cách, đành phải|ngồi trong xe|trầm tư suy nghĩ|thở phào|nuốt một ngụm|hít một hơi|siết chặt|vung đao|giơ kiếm|xoay người|ngã gục|nói lời cảm ơn|ngồi xuống bên|ngậm miệng lại)/i.test(t)) {
    return true;
  }
  
  // 3. Narrative sentence describing thoughts or time from 3rd person
  if (/^Nhưng lúc này hắn cũng chẳng còn thời gian/i.test(t)) return true;
  if (/^Không có thời gian để lãng phí/i.test(t)) return true;
  if (/^Khoảng cách hai ba mét/i.test(t)) return true;
  
  return false;
}

function repairChapterText(title, content) {
  let text = content;
  
  // 1. Remove Chinese commas on their own lines or in lists
  text = text.replace(/^[ \t]*、[ \t]*$/gm, "");
  text = text.replace(/([^\n])\s*、\s*([^\n])/g, "$1, $2");
  text = text.replace(/、/g, ", ");
  
  // 2. Fix glued title at the start
  const cleanTitle = (title || "")
    .replace(/^Chương\s*\d+\s*[:.]?\s*/i, "")
    .replace(/[.:]+$/, "")
    .trim();
  if (cleanTitle && cleanTitle.length >= 3) {
    const lines = text.split("\n");
    const firstNonEmptyIdx = lines.findIndex(l => l.trim().length > 0);
    if (firstNonEmptyIdx !== -1) {
      let firstLine = lines[firstNonEmptyIdx].trim();
      if (firstLine.startsWith(cleanTitle)) {
        let remainder = firstLine.slice(cleanTitle.length).trim();
        remainder = remainder.replace(/^[-:.,\s]+/, "").trim();
        if (remainder.length > 0) {
          lines[firstNonEmptyIdx] = remainder;
        } else {
          lines.splice(firstNonEmptyIdx, 1);
        }
        text = lines.join("\n");
      }
    }
  }
  
  // 3. Split system evaluation / parentheses glued to narration
  text = text.replace(/\)([A-ZÀ-Ỹ])/g, ")\n\n$1");
  text = text.replace(/】([A-ZÀ-Ỹ])/g, "】\n\n$1");
  
  // 4. Line-by-line repair
  const lines = text.split("\n");
  const cleanedLines = [];
  
  for (let rawLine of lines) {
    let l = rawLine.trim();
    if (!l) {
      cleanedLines.push("");
      continue;
    }
    
    // Remove isolated single-punctuation lines
    if (/^[."“”'、]+$/.test(l)) {
      continue;
    }
    
    // Fix stray quote at end of narration following dialogue
    const strayQuoteMatch = l.match(/^(".*?["”])\s+([^"“”]+)["”]$/);
    if (strayQuoteMatch) {
      l = `${strayQuoteMatch[1]} ${strayQuoteMatch[2]}`;
    }
    
    // Fix broken speech intro
    l = l.replace(/^"Trong lòng thầm niệm"\s*(.*)$/i, 'Trong lòng thầm niệm: "$1"');
    l = l.replace(/^"thầm nghĩ"\s*(.*)$/i, 'Thầm nghĩ: "$1"');
    l = l.replace(/^"nghĩ thầm"\s*(.*)$/i, 'Nghĩ thầm: "$1"');
    
    // Fix spacing around quotes
    l = l.replace(/([a-zA-Zà-ỹÀ-Ỹ])"([A-ZÀ-Ỹa-zà-ỹ])/g, '$1 "$2');
    l = l.replace(/"\s+([A-ZÀ-Ỹa-zà-ỹ])/g, '"$1');
    l = l.replace(/([a-zA-Zà-ỹÀ-Ỹ])\s+"/g, '$1"');
    
    // Check if line is falsely wrapped in quotes
    if ((l.startsWith('"') && l.endsWith('"')) || (l.startsWith('“') && l.endsWith('”'))) {
      const inner = l.slice(1, -1).trim();
      if (isNarrationLine(inner)) {
        l = inner;
      }
    }
    
    // Han-Viet & terminology normalization
    l = l.replace(/\bcao cử\b/gi, "giơ cao");
    l = l.replace(/\bBích Tà Đào Mộc Kiếm\b/g, "Tịch Tà Đào Mộc Kiếm");
    l = l.replace(/\bbích tà đào mộc kiếm\b/g, "tịch tà đào mộc kiếm");
    l = l.replace(/\bBích Tà\b/g, "Tịch Tà");
    l = l.replace(/\bbích tà\b/g, "tịch tà");
    l = l.replace(/\bSát Khí Phụ Trám\b/g, "Sát Khí Bám");
    l = l.replace(/\bsát khí phụ trám\b/g, "sát khí bám");
    l = l.replace(/\bphụ trám\b/gi, "bám sát khí");
    l = l.replace(/\bquỷ Quái\b/g, "quỷ quái");
    l = l.replace(/\bQuỷ Quái\b/g, "Quỷ quái");
    l = l.replace(/\bchưa nhập giai\b/gi, "chưa vào cấp");
    l = l.replace(/\bChưa nhập giai\b/gi, "Chưa vào cấp");
    l = l.replace(/\bnhập giai\b/gi, "lên cấp");
    l = l.replace(/\bcấp nhị giai\b/gi, "cấp hai");
    l = l.replace(/\bthực lực cấp nhị giai\b/gi, "thực lực cấp hai");
    l = l.replace(/\bnhị giai\b/gi, "cấp hai");
    l = l.replace(/\bđệ nhất giai\b/gi, "cấp một");
    l = l.replace(/\bđệ nhị giai\b/gi, "cấp hai");
    l = l.replace(/\bđệ tam giai\b/gi, "cấp ba");
    l = l.replace(/\bđệ tứ giai\b/gi, "cấp bốn");
    l = l.replace(/\bđệ ngũ giai\b/gi, "cấp năm");
    
    cleanedLines.push(l);
  }
  
  return cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function putWithRetry(key, buf, options, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await storage.put(key, buf, options);
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = attempt * 800 + Math.floor(Math.random() * 400);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function run() {
  const bookId = "fanqie-7027679289931729920";
  const rev = 1;
  console.log(`Bắt đầu rà soát toàn bộ chương của ${bookId}...`);
  
  const rawList = await storage.list(`books/${bookId}/r${rev}/ch/`);
  const keys = rawList.map(item => typeof item === "string" ? item : item.key);
  const chNums = keys
    .filter(k => k.endsWith(".json") && !k.endsWith(".original.json"))
    .map(k => {
      const m = k.match(/\/ch\/(\d+)\.json$/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter(Boolean)
    .sort((a, b) => a - b);
  
  console.log(`Tìm thấy ${chNums.length} chương đã dịch. Đang tiến hành rà soát và sửa lỗi tuần tự...`);
  
  let repairedCount = 0;
  let skippedCount = 0;
  
  for (let i = 0; i < chNums.length; i++) {
    const n = chNums[i];
    const key = `books/${bookId}/r${rev}/ch/${n}.json`;
    const raw = await storage.get(key);
    if (!raw) continue;
    
    const doc = JSON.parse(raw.toString("utf8"));
    const originalContent = doc.content;
    const repairedContent = repairChapterText(doc.title, originalContent);
    
    if (repairedContent !== originalContent) {
      doc.content = repairedContent;
      doc.updatedAt = new Date().toISOString();
      let saved = false;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          await storage.put(key, Buffer.from(JSON.stringify(doc, null, 2), "utf8"));
          saved = true;
          break;
        } catch (err) {
          console.warn(`[Cảnh báo] Chương ${n} lỗi R2 (lần ${attempt}/4): ${err.message}. Chờ ${attempt * 2}s thử lại...`);
          await new Promise(r => setTimeout(r, attempt * 2000));
        }
      }
      if (saved) {
        repairedCount++;
      } else {
        console.error(`[Lỗi] Không thể lưu chương ${n} lên R2 sau 4 lần thử.`);
      }
      await new Promise(r => setTimeout(r, 60));
    } else {
      skippedCount++;
    }
    
    if ((i + 1) % 50 === 0 || i + 1 === chNums.length) {
      console.log(`Tiến độ: ${i + 1}/${chNums.length} chương (Đã sửa: ${repairedCount}, Không đổi: ${skippedCount})`);
    }
  }
  
  console.log(`\n✅ Hoàn tất sửa đổi! Tổng chương đã sửa: ${repairedCount} / ${chNums.length}`);
  
  // Refresh book index.json & r1/index.json
  console.log("Đang cập nhật lại index.json của bộ truyện...");
  const indexKey = `books/${bookId}/index.json`;
  const r1IndexKey = `books/${bookId}/r1/index.json`;
  const rawIndex = await storage.get(indexKey);
  if (rawIndex) {
    const indexDoc = JSON.parse(rawIndex.toString("utf8"));
    indexDoc.updatedAt = new Date().toISOString();
    const indexBuf = Buffer.from(JSON.stringify(indexDoc, null, 2), "utf8");
    await storage.put(indexKey, indexBuf, {
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=60"
    });
    await storage.put(r1IndexKey, indexBuf, {
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=60"
    });
    console.log("✅ Đã đồng bộ index.json!");
  }
}

run().catch(console.error);
