"use strict";

const PROMPT_VERSION = "agent-prompt-v2";

/**
 * Builds the structured context and prompt for a translation batch.
 */
function buildBatchPrompt({
  batch,
  allBatches = [],
  storyState = null,
  storyStateManager = null
}) {
  const currentBatchIndex = batch.batchIndex;
  const currentParagraphs = batch.paragraphs;

  // 1. Extract minimal previous context (last 2-3 paragraphs from previous batch or batches)
  const prevContextItems = [];
  if (currentBatchIndex > 0) {
    const prevBatch = allBatches[currentBatchIndex - 1];
    if (prevBatch && prevBatch.paragraphs.length > 0) {
      const sliceCount = Math.min(3, prevBatch.paragraphs.length);
      const recent = prevBatch.paragraphs.slice(-sliceCount);
      for (const p of recent) {
        // Prefer translated text if available in batch, else source
        const text = p.translation || p.source;
        prevContextItems.push(`[P${String(p.index).padStart(3, "0")}]: ${text}`);
      }
    }
  }

  // 2. Extract minimal next context (first 1-2 paragraphs from next batch)
  const nextContextItems = [];
  if (currentBatchIndex < allBatches.length - 1) {
    const nextBatch = allBatches[currentBatchIndex + 1];
    if (nextBatch && nextBatch.paragraphs.length > 0) {
      const sliceCount = Math.min(2, nextBatch.paragraphs.length);
      const upcoming = nextBatch.paragraphs.slice(0, sliceCount);
      for (const p of upcoming) {
        nextContextItems.push(`[P${String(p.index).padStart(3, "0")}]: ${p.source}`);
      }
    }
  }

  // 3. Compact story state
  let storyStateSection = "";
  if (storyState && storyStateManager) {
    const combinedSource = currentParagraphs.map(p => p.source).join(" ");
    const formatted = storyStateManager.formatForContext(storyState, combinedSource);
    if (formatted.trim()) {
      storyStateSection = `=== THÔNG TIN BỐI CẢNH & THUẬT NGỮ (STORY STATE) ===\n${formatted}\n`;
    }
  }

  // 4. Current batch tagged input
  const taggedInput = currentParagraphs
    .map(p => `<P${String(p.index).padStart(3, "0")}>${p.source}</P${String(p.index).padStart(3, "0")}>`)
    .join("\n\n");

  // 5. System instructions following strict priority hierarchy
  const prompt = `Bạn là dịch giả văn học chuyên nghiệp, thực hiện dịch chính xác văn bản tiếng Trung sang tiếng Việt.

=== NGUYÊN TẮC BẮT BUỘC ===
1. THỨ TỰ ƯU TIÊN:
   Độ chuẩn xác ngữ nghĩa (Semantic Fidelity)
   > Độ trung thực ngữ cảnh (Context Fidelity)
   > Bảo toàn thông tin (Information Preservation)
   > Nhất quán thực thể (Entity Consistency)
   > Nhất quán thuật ngữ (Terminology Consistency)
   > Tiếng Việt tự nhiên
   > Trau chuốt văn phong.
   * QUY TẮC VÀNG: Một câu hơi cứng nhưng đúng nghĩa > một câu cực mượt mà sai lệch nghĩa.

2. KHÔNG ĐƯỢC PHÉP:
   - KHÔNG tóm tắt, KHÔNG lược bỏ bất kỳ thông tin nào của tác giả.
   - KHÔNG bịa đặt, phóng tác hay tự thêm thắt chi tiết ngoài nguyên tác.
   - KHÔNG sửa đổi ý của tác giả theo ý mình.

3. ĐA NGHĨA & BẢO VỆ THỰC THỂ:
   - Dịch theo ngữ cảnh, không rập khuôn máy móc một từ tiếng Trung sang từ tiếng Việt cố định nếu ngữ cảnh không phù hợp.
   - Bảo vệ thực thể: Không tự biến cụm từ miêu tả thông thường thành tên riêng, không biến động từ thành chiêu thức, không biến danh từ chung thành bảo bối/vật phẩm nếu ngữ cảnh không xác nhận.

4. ĐỊNH DẠNG ĐẦU RA BẮT BUỘC:
   - Mỗi đoạn văn bản gốc được đặt trong cặp thẻ <Pxxx>...</Pxxx>.
   - Bản dịch đầu ra PHẢI giữ chính xác từng cặp thẻ <Pxxx>...</Pxxx> tương ứng.
   - TUYỆT ĐỐI KHÔNG làm mất thẻ, KHÔNG đổi thứ tự thẻ, KHÔNG trùng lặp thẻ.
   - KHÔNG thêm bất kỳ lời bình luận, giải thích hay chào hỏi nào ngoài các khối <Pxxx>.

${storyStateSection}
${prevContextItems.length ? `=== NGỮ CẢNH TRƯỚC ĐÓ (THAM KHẢO, KHÔNG DỊCH LẠI) ===\n${prevContextItems.join("\n")}\n` : ""}
${nextContextItems.length ? `=== ĐOẠN KẾ TIẾP (THAM KHẢO ĐỂ HIỂU HƯỚNG TÌNH TIẾT) ===\n${nextContextItems.join("\n")}\n` : ""}
=== CÁC ĐOẠN CẦN DỊCH (BẮT ĐẦU TỪ ĐÂY) ===
${taggedInput}
`;

  return {
    promptVersion: PROMPT_VERSION,
    prompt,
    taggedInput,
    paragraphCount: currentParagraphs.length,
    startIndex: batch.startIndex,
    endIndex: batch.endIndex
  };
}

module.exports = {
  PROMPT_VERSION,
  buildBatchPrompt
};

