# Vận hành

## Chạy pipeline ở local (không cần credential)

```bash
npm test                          # 70 test, gồm ingest end-to-end
LOCAL_STORAGE_DIR=.storage npm test
```

Storage layer tự chọn driver filesystem khi thiếu `R2_*`, nên ingest chạy đầy đủ
và kiểm tra được mà không cần cloud.

## Thêm truyện

Admin upload và crawler đi qua cùng một `ingestBook()`. Không cần redeploy Vercel.

Ingest publish `index.json` **trước khi** dịch xong, nên truyện đọc được ngay bằng
nội dung gốc; bản dịch lấp dần theo hàng đợi.

## Hàng đợi dịch

State ở `jobs/{bookId}/translation.json`. Trạng thái mỗi chapter:
`pending` / `processing` / `completed` / `failed` / `retrying`.

- Chapter chỉ `completed` **sau khi** upload thành công. Worker chết giữa đường thì
  chapter còn `processing` và lượt sau làm lại — không bao giờ có chapter ghi là
  xong mà thiếu file.
- Hết quota Gemini: chapter về `pending`, **không** trừ lượt thử, run dừng thay vì
  đập vào cửa đóng.
- `requestBudget` giới hạn số lần gọi mỗi lượt, để chia ingest theo ngày.
- Chương số nhỏ được ưu tiên, nên đầu truyện đọc được trước.

## Sửa bản dịch một chapter

Ingest lại với `revision` mới. Chapter cũ giữ nguyên cho client đang cache;
`index.json` trỏ sang revision mới sau khoảng 60s.

## Log

Ingest phát: `ingest.started`, `ingest.chapters_extracted`,
`ingest.chapter_translated`, `ingest.completed`. Không log key, token hay mật khẩu.

## Kiểm tra sức khoẻ

- Chapter phục vụ từ CDN: kiểm `cache-control` có `immutable` và `cf-cache-status`.
- Thấy request `/api/translate` phát ra từ người đọc → sai, reader không được gọi nó.
- Supabase free pause sau 7 ngày không query — cần cron ping nếu trang duyệt dựa vào DB.

## Hai workload tách rời

```
Crawler        (*/15 phút)  phát hiện -> tách chương -> xếp hàng -> thoát nhanh
Translate      (:05, :35)   rút hàng đợi -> Gemini -> R2 -> Supabase -> checkpoint
```

Crawler gọi `runIngest({ translateEnabled: false })` nên **không bao giờ** chờ Gemini.
Hai workflow có `concurrency` group riêng, chạy song song an toàn.

## Số đo Gemini thật (19 chương thật)

| | |
|---|---|
| chars vào / chương | avg 3.025 (p50 3.297, p95 4.465) |
| chars ra / chương | avg 10.396 |
| Gemini req / chương | avg 1,11 (max 2) |
| latency / chương | avg 17,8s (p50 16,6s, p95 35,3s) |
| throughput 1 luồng | **3,37 chương/phút** = 3,7 req/phút |
| lỗi quota | **0** |

`TRANSLATE_SPACING_MS` mặc định 1000ms: độ trễ 17,8s đã tự tạo nhịp, RPM thực 3,7
còn rất xa mọi hạn mức. Tăng lên nếu thấy 429; đừng đặt về 0.

## Chạy worker thủ công

```bash
node scripts/translate-worker.js --budget 150 --minutes 300
node scripts/translate-worker.js --book fanqie-123 --budget 50
```

Worker bỏ qua Gemini nếu object dịch đã tồn tại trên R2 — restart không tốn quota.
