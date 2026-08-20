# Vận hành

## Chạy pipeline ở local (không cần credential)

```bash
npm test                          # 99 test, gồm ingest end-to-end
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

## Không bao giờ ghi đè chapter đã publish

Chapter object mang `Cache-Control: immutable, max-age=31536000`. Ghi đè cùng key
thì CDN vẫn phục vụ bản cũ tới một năm — nội dung mới chỉ thấy được khi thêm query
lạ, tức là *người đọc thật sẽ không thấy*.

Sửa nội dung một chapter thì **tăng revision** và ingest lại: key mới, cache cũ
thành vô hại. Nếu buộc phải ghi đè (ví dụ vá gấp), phải purge đúng các URL đó
trong Cloudflare (Caching → Configuration → Purge Cache → Custom Purge → by URL);
không purge thì coi như chưa sửa gì.

Quy tắc này áp dụng cho cả script vá tay, không riêng pipeline.

## CORS trên R2

Reader và CDN khác origin nên trình duyệt bắt buộc cần CORS. `curl` và `node fetch`
không kiểm tra CORS, nên lỗi này **chỉ hiện ra khi test bằng trình duyệt thật**.

- `novel-storage`: chỉ `GET, HEAD`, giới hạn theo origin của site.
- `novel-archive`: chỉ `PUT`, cho trang admin upload presigned. Signature vẫn là
  thứ cấp quyền; CORS chỉ cho phép trình duyệt gửi request.

R2 trả thêm `Vary: Origin`, nên request có Origin được cache riêng — không cần
purge khi mới bật CORS.

## Cloudflare Pages

Static site trong `public/` (do `scripts/build-client.js` sinh ra, kèm `_headers`).
Function trong `functions/` được Pages tự route theo đường dẫn:
`functions/api/admin/upload.js` phục vụ `/api/admin/upload` — **cùng path** với
function Vercel tương ứng, nên `client/admin-upload.js` không cần biết đang chạy ở đâu.

Tạo project (cần quyền `Account · Cloudflare Pages · Edit`; token R2 **không** đủ):

```
Build command   : npm run build
Output directory : public
Production branch: main
```

Biến môi trường đặt trên project, danh sách đầy đủ trong `wrangler.toml`.
**Không** đặt `SUPABASE_SERVICE_ROLE_KEY` ở đây.

### Vì sao presign chứ không upload qua Worker

Cloudflare giới hạn request body 100 MB; EPUB có thể 200 MB. Nên browser nhận một
URL PUT có chữ ký ngắn hạn và đẩy thẳng lên R2 — byte không đi qua function nào.

Function chỉ ký và dispatch. `functions/_lib/sigv4.js` dùng Web Crypto thay vì
`node:crypto` để không phụ thuộc cờ `nodejs_compat`; `server/pages-functions.test.js`
so từng byte URL của hai bản ký để chúng không lệch nhau.

## Cấu hình crawler

Config và status nằm ở R2 bucket **private** (`crawler/config.json`,
`crawler/status.json`), không phải Vercel Blob, không phải bucket public.

```bash
node scripts/crawler-config.js --show
node scripts/crawler-config.js --enable
node scripts/crawler-config.js --set maxNewBooksPerRun=2
```

Trang admin trên Vercel vẫn ghi config vào Blob — crawler **không đọc chỗ đó nữa**.
Dùng CLI trên cho tới khi phần admin chuyển sang Pages function.
