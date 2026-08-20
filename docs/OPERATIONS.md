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
