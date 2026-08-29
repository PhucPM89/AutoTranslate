# Kiến trúc

## Nguyên tắc

Với dữ liệu đọc nhiều: **CDN > object storage > API > database**.

Đường đọc chapter không được chạm Worker, Supabase hay Gemini.

## Trạng thái migration

| Tầng | Trạng thái |
|---|---|
| Storage abstraction (R2 driver + local driver) | Xong, có test |
| EPUB → chapter extraction phía server | Xong, có test, đã chạy trên EPUB thật 1425 chương |
| Chapter/index JSON + cache policy theo key | Xong, có test |
| Translation queue (retry / backoff / resume / quota) | Xong, có test |
| `ingestBook()` dùng chung admin + crawler | Xong, có test |
| Supabase base schema (`0001`–`0004`) | **Đã apply** |
| R2 bucket `novel-storage` | **Đã có**, S3 read/write đã verify |
| Reader đọc chapter từ CDN | **Xong**, có feature flag + fallback, đã verify bằng Chrome |
| `_headers` cho Cloudflare Pages | **Xong**, CSP tự nhận CDN origin lúc build |
| R2 ingest thật | **Xong** — 1 truyện, 2.854 object, 33.2 MB, cache header đúng |
| Cloudflare Pages project | **Đã có**, project `tram-chu-web` |
| R2 public CDN domain | **Đã có**, `cdn.tram-chu.online` |
| Migration 49 truyện | **Đã bỏ** — crawl lại từ đầu |
| Cache Rule CDN | **Đã có**, `cf-cache-status: HIT` xác nhận |
| Security migration `0005` | **Đã apply production** và ghi nhận trong remote migration history |
| Crawler / translation | **Đã tách**, hai workflow riêng |

Reader giờ có hai đường: CDN (mới) và EPUB (cũ). Mặc định `READER_CDN_ENABLED`
tắt, nên production chạy y như trước tới khi bật.

## Host: Cloudflare Pages

```
GitHub → Cloudflare Pages → npm install → npm run build → public/
```

| Cấu hình | Giá trị (đọc từ project) |
|---|---|
| Install command | `npm install` (postinstall tự chạy build) |
| Build command | `npm run build` |
| Output directory | `public` |
| Node version | `>=18` |
| Header rules | `public/_headers` (sinh từ `client/_headers.template`) |

Biến build browser-safe: `R2_PUBLIC_BASE_URL`, `READER_CDN_ENABLED`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`. Secret **không** bao giờ vào bundle —
có test chạy build thật với secret trong env rồi grep output để chứng minh.

## Đường đọc mục tiêu

```
User → Cloudflare CDN → R2
   books/{bookId}/index.json           cache 60s, purge khi publish
   books/{bookId}/r{rev}/ch/{n}.json   cache ngắn, được semantic QA nâng cấp tại chỗ
   covers/{bookId}.webp                cache 7 ngày
```

`archives/{bookId}.epub` không bao giờ phục vụ người đọc (`private, no-store`).

## Vì sao có revision trong path

Bản gốc `.original.json` là immutable và cache một năm. Chapter reader dùng cache
ngắn vì semantic QA nâng private draft lên cùng chapter key sau khi duyệt. Một
lần ingest nguồn mới vẫn phải tăng `revision`, tạo key mới và để `index.json`
trỏ sang revision mới.

## Chapter JSON

Luôn có `content` để render kèm `translationStatus`. Chapter chưa dịch vẫn được
publish với nội dung gốc, nên người đọc không bao giờ gặp 404 và reader không phải
gọi API để biết vì sao trống.

## Số đo thực tế (EPUB 7.4 MB, 1425 chương)

| | Trước | Sau |
|---|---|---|
| Byte để đọc 1 chương | 7.4 MB (cả EPUB) | **11.2 KB** |
| Byte để mở mục lục | 7.4 MB | **95.6 KB** |
| Gemini call cho 1 chương / 1000 người đọc | 1000 | **1** |
| Tách 1425 chương | — | 0.6s |
| Ingest đầy đủ (extract + publish) | — | 5.0s |
