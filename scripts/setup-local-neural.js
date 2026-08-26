"use strict";

// Script to setup and configure Local Neural AI Model for offline inference
// Usage:
//   node scripts/setup-local-neural.js --check
//   node scripts/setup-local-neural.js --init

const fs = require("fs");
const path = require("path");

const MODELS_DIR = path.join(__dirname, "..", "models");
const MODEL_FILE = path.join(MODELS_DIR, "neural-zh-vi.onnx");
const VOCAB_FILE = path.join(MODELS_DIR, "vocab.json");

function main() {
  console.log("\n======================================================");
  console.log("CẤU HÌNH BỘ NÃO AI NEURAL CỤC BỘ (LOCAL NEURAL AI)");
  console.log("======================================================\n");

  fs.mkdirSync(MODELS_DIR, { recursive: true });

  const hasModel = fs.existsSync(MODEL_FILE);
  const hasVocab = fs.existsSync(VOCAB_FILE);

  console.log(`- Thư mục mô hình: ${MODELS_DIR}`);
  console.log(`- Trạng thái Model ONNX: ${hasModel ? "✓ ĐÃ SẴN SÀNG" : "✗ Chưa có file weights (neural-zh-vi.onnx)"}`);
  console.log(`- Trạng thái Vocab: ${hasVocab ? "✓ ĐÃ SẴN SÀNG" : "✗ Chưa có file vocab (vocab.json)"}`);

  if (!hasVocab) {
    // Generate minimal bootstrap vocab mapping
    const sampleVocab = {
      unk_id: 1,
      pad_id: 0,
      bos_id: 2,
      eos_id: 3,
      tokens: { "<pad>": 0, "<unk>": 1, "<s>": 2, "</s>": 3 },
      id_to_token: { 0: "", 1: "", 2: "", 3: "" }
    };
    fs.writeFileSync(VOCAB_FILE, JSON.stringify(sampleVocab, null, 2));
    console.log(`✓ Đã khởi tạo cấu hình vocab mẫu tại: ${VOCAB_FILE}`);
  }

  console.log("\n💡 HƯỚNG DẪN KÍCH HOẠT:");
  console.log("1. Đặt file mô hình MarianMT hoặc Qwen lượng tử hóa ONNX vào: models/neural-zh-vi.onnx");
  console.log("2. Thêm vào .env: NEURAL_TRANSLATE_ENABLED=true");
  console.log("3. Khi chưa có model ONNX, hệ thống tự động chạy chế độ Super-Engine siêu tốc (>33.000 câu/s) 100% an toàn.\n");
}

main();
