# Vận hành

## Chạy pipeline ở local (không cần credential)

```bash
npm test                          # 99 test, gồm ingest end-to-end
LOCAL_STORAGE_DIR=.storage npm test
```

Storage layer tự chọn driver filesystem khi thiếu `R2_*`, nên ingest chạy đầy đủ
và kiểm tra được mà không cần cloud.

## Thêm truyện

Admin upload và crawler đi qua cùng một `ingestBook()`. Không cần redeploy gì.

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
Crawler        (mỗi 10 phút) phát hiện -> tách chương -> xếp hàng -> thoát nhanh
Translate      (mỗi 15 phút) rút hàng đợi -> AI -> R2 -> Supabase -> checkpoint
```

Crawler gọi `runIngest({ translateEnabled: false })` nên **không bao giờ** chờ AI.
Crawler, admin ingest và translator dùng chung concurrency group
`novel-pipeline-storage-writes`: cả ba đều ghi book index/job state trên R2, nên
không được chạy chồng lên nhau khi chưa có compare-and-swap/transaction.

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

Static site trong `public/` (do `scripts/build-client.js` sinh ra, kèm `_headers`,
mà Workers Assets có phục vụ và tôn trọng). Route động do `worker/index.js` phân
phối; mọi đường khác trả về asset.

Tạo project (cần token có quyền Workers; token R2 **không** đủ):

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
`crawler/status.json`), không phải bucket public.

```bash
node scripts/crawler-config.js --show
node scripts/crawler-config.js --enable
node scripts/crawler-config.js --set maxNewBooksPerRun=2
```

Trang admin ghi cùng hai object đó qua Worker, nên CLI và UI luôn khớp nhau.

## Deploy (Cloudflare Pages)

Project `tram-chu-web`. Biến và binding nằm trên project, không trong file config:

```bash
npm run configure:cf   # đặt 13 biến + 2 R2 binding + nodejs_compat
npm run build          # cần R2_PUBLIC_BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY
npm run deploy         # wrangler pages deploy
```

`configure:cf` đọc `.env`/`.env.local` **bằng Node, không qua shell**. Đây không
phải chuyện thẩm mỹ: `set -a; . ./.env` sẽ expand `$` trong giá trị, và hash mật
khẩu có dạng `scrypt$salt$hash` — nó từng bị cắt từ 116 xuống 27 ký tự và tạo ra
một bản deploy mà mật khẩu đúng vẫn bị từ chối. Script kiểm tra hash có đúng 3
phần và dừng nếu không.

`READER_CDN_ENABLED` không bao giờ được đặt bởi script này. Build in ra chế độ nó
tạo (`reader: chapter từ EPUB|CDN`) nên đọc log là biết.

### Tên miền

`cdn.tram-chu.online` trỏ vào R2 và đang chạy. `tram-chu.online` cùng
`www.tram-chu.online` đã được gắn vào Pages nhưng ở trạng thái `initializing`: cần
một bản ghi DNS mà token hiện tại không tạo được. Thêm trong dashboard:

```
CNAME  @      tram-chu-web.pages.dev   (proxied)
CNAME  www    tram-chu-web.pages.dev   (proxied)
```

Sau đó custom domain tự chuyển sang `active`.
