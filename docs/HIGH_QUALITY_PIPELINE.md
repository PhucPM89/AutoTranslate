# Pipeline dịch chất lượng cao

## Trạng thái dữ liệu

```text
original → Hachimi private draft → semantic review → repair/verify → approved publish
```

- Bản gốc: `books/{bookId}/r{revision}/ch/{n}.original.json`
- Draft riêng tư: `drafts/{bookId}/r{revision}/ch/{n}.json`
- Bản reader đọc: `books/{bookId}/r{revision}/ch/{n}.json`
- Queue: `jobs/{bookId}/semantic-review.json`
- Story bible: `story-bible/{bookId}.json`
- Ngữ cảnh gần: `story-context/{bookId}.json`
- TM đã duyệt: `tm/books/{bookId}.json`
- Batch manifests: `jobs/gemini-batches/{batchId}.json`

Hachimi không còn ghi trực tiếp vào bản reader. Chỉ semantic reviewer được publish draft sau khi đối chiếu với bản gốc. Bản bị sửa phải qua vòng xác minh thứ hai.

## Hai lane vận hành

Realtime lane chạy `scripts/gemini-qa-reviewer.js`, phù hợp chương mới. Worker có giới hạn `QA_DAILY_MAX_INPUT_TOKENS` và `QA_DAILY_MAX_REQUESTS`.

Backlog lane chạy `scripts/gemini-batch-reviewer.js`. Batch chỉ tạo kết quả review; kết quả vẫn quay lại realtime reviewer để parse, repair, verify và publish theo cùng một chuẩn.

Batch dùng `displayName` xác định và manifest `prepared` trước khi gọi provider. Khi tiến trình chết giữa lúc tạo job, lượt sau tìm lại job theo `displayName`, tránh gửi trùng một Batch không idempotent.

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

4. Chạy realtime pilot:

   ```bash
   npm run qa:pilot
   ```

5. Chạy Batch thủ công:

   ```bash
   npm run qa:batch
   ```

Schedule Batch chỉ hoạt động khi repository variable `QA_BATCH_ENABLED=true`. Giá trị mặc định giữ Batch tắt để không tự phát sinh chi phí trước khi pilot được kiểm tra.

## Cấu hình an toàn

- `QA_DAILY_MAX_INPUT_TOKENS`: mặc định `250000`.
- `QA_DAILY_MAX_REQUESTS`: mặc định `100`.
- `QA_BATCH_SIZE`: mặc định `20`, tối đa `100`.
- `QA_BATCH_MAX_INPUT_TOKENS`: mặc định `200000`.
- `QA_MAX_ATTEMPTS`: mặc định `4`; lỗi quota không tiêu hao attempt.

Không tăng các giới hạn trước khi đo tỷ lệ pass/repair, token thực tế và kiểm tra thủ công mẫu chương đã approved.
