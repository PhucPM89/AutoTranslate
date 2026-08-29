# Pipeline dịch chất lượng cao

## Trạng thái dữ liệu

```text
original → Hachimi private draft → Qwen full rewrite → Qwen verify → approved publish
```

- Bản gốc: `books/{bookId}/r{revision}/ch/{n}.original.json`
- Draft riêng tư: `drafts/{bookId}/r{revision}/ch/{n}.json`
- Bản reader đọc: `books/{bookId}/r{revision}/ch/{n}.json`
- Queue: `jobs/{bookId}/semantic-review.json`
- Story bible: `story-bible/{bookId}.json`
- Ngữ cảnh gần: `story-context/{bookId}.json`
- TM đã duyệt: `tm/books/{bookId}.json`
- Batch manifests: `jobs/gemini-batches/{batchId}.json`

Hachimi không còn ghi trực tiếp vào bản reader. Qwen bắt buộc biên dịch lại toàn
bộ tiêu đề và nội dung từ bản gốc, chỉ dùng Hachimi làm bản tham khảo. Không có
nhánh publish nguyên draft Hachimi. Bản Qwen mới phải qua vòng xác minh độc lập
trước khi ghi ra reader.

Qwen local là semantic reviewer mặc định. Gemini chỉ được giữ làm audit thủ công.
Hai reviewer dùng cùng một khóa theo từng bộ để tránh claim trùng và tránh
read-modify-write đè queue. Reviewer phải kiểm tra cả tiêu đề lẫn nội dung, chạy
deterministic quality gate trước publish và chỉ cập nhật tiến độ thư viện sau khi
chương được `approved`.

## Các lane vận hành

Lane chính chạy `scripts/qwen_qa_worker.py` trên Colab GPU. Worker đọc queue liên
tục, hỗ trợ chia bộ theo `WORKER_INDEX/TOTAL_WORKERS`, luôn biên dịch lại toàn
chương rồi verify trước khi publish. Bốn điểm accuracy, completeness, fluency và
terminology đều phải đạt ít nhất 9, đồng thời không được có lỗi major/critical.
Worker không cắt âm thầm chương vượt context và sẽ dừng rõ ràng nếu không có GPU.

Gemini realtime chạy `scripts/gemini-qa-reviewer.js` và Gemini Batch chạy
`scripts/gemini-batch-reviewer.js`; cả hai chỉ dùng khi chủ động audit. Batch chỉ
tạo kết quả review; kết quả vẫn quay lại Gemini realtime reviewer để parse,
repair, verify và publish theo cùng một chuẩn.

Batch dùng `displayName` xác định và manifest `prepared` trước khi gọi provider. Khi tiến trình chết giữa lúc tạo job, lượt sau tìm lại job theo `displayName`, tránh gửi trùng một Batch không idempotent.

Nếu provider từ chối lúc tạo Batch, worker tự trả toàn bộ entry từ `batch_processing` về `pending`, đánh dấu manifest `failed` và không tự gửi lại. Sau khi đã xử lý billing/tier/model, chủ động chạy lại bằng `node scripts/gemini-batch-reviewer.js --retry-failed-batch`.

Kiểm tra các model mà API key hiện tại nhìn thấy cùng `supportedActions` bằng `node scripts/gemini-batch-reviewer.js --list-models`. Nếu model có `batchGenerateContent` nhưng cả probe một chương vẫn trả `FAILED_PRECONDITION`, giữ `QA_BATCH_ENABLED=false` và kiểm tra điều kiện billing/tier của Google AI project; đây không phải lỗi kích thước backlog.

## Triển khai lần đầu

1. Chạy backfill ở chế độ kiểm tra:

   ```bash
   node scripts/semantic-qa-backfill.js --dry-run --max-books 3
   ```

2. Backfill từng nhóm nhỏ:

   ```bash
   node scripts/semantic-qa-backfill.js --max-books 10
   ```

3. Xem trạng thái:

   ```bash
   npm run qa:status
   ```

4. Chạy Qwen pilot trên máy/Colab có NVIDIA GPU:

   ```bash
   npm run qa:pilot
   ```

5. Sau khi pilot đạt, chạy Qwen liên tục:

   ```bash
   npm run qa:daemon
   ```

6. Khi cần, audit thủ công một mẫu bằng Gemini:

   ```bash
   npm run qa:gemini:audit
   ```

7. Chạy Gemini Batch thủ công khi thực sự cần:

   ```bash
   npm run qa:batch
   ```

Hai workflow Gemini không còn schedule tự động; chỉ chạy bằng
`workflow_dispatch`. `QA_BATCH_ENABLED` vẫn phải là `true` khi chủ động chạy
Gemini Batch.

## Cấu hình an toàn

- `QA_MODEL_ID`: mặc định `Qwen/Qwen2.5-7B-Instruct-AWQ`.
- `QA_MAX_CHAPTERS`: giới hạn số chương Qwen xử lý trong một lượt; `0` là không giới hạn.
- `QA_RUN_ONCE`: `true` để quét một lượt rồi thoát.
- `QA_REQUIRE_GPU`: mặc định `true`; không cho phép vô tình chạy Qwen bằng CPU.
- `WORKER_INDEX/TOTAL_WORKERS`: chia bộ cho nhiều Qwen Colab; không đổi tổng worker giữa chiến dịch.
- `QA_DAILY_MAX_INPUT_TOKENS`: mặc định `250000`.
- `QA_DAILY_MAX_REQUESTS`: mặc định `100`.
- `QA_BATCH_SIZE`: mặc định `20`, tối đa `100`.
- `QA_BATCH_MAX_INPUT_TOKENS`: mặc định `200000`.
- `QA_MAX_ATTEMPTS`: mặc định `4`; lỗi quota không tiêu hao attempt.
- `QA_MAX_REPAIR_PASSES`: mặc định `2`, tối đa `3`; mỗi pass phải vượt quality gate và semantic verification mới được publish.

Hai giới hạn daily chỉ áp dụng cho Gemini audit, không áp dụng cho Qwen local.
Không tăng các giới hạn trước khi đo tỷ lệ pass/repair, token thực tế và kiểm tra
thủ công mẫu chương đã approved.
