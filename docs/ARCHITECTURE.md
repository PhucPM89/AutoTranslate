# Kiến trúc

## Nguyên tắc

Với dữ liệu đọc nhiều: **CDN > object storage > API > database**.

Đường đọc chapter không được chạm Vercel Function, Supabase hay Gemini.

## Trạng thái migration

| Tầng | Trạng thái |
|---|---|
| Storage abstraction (R2 driver + local driver) | Xong, có test |
| EPUB → chapter extraction phía server | Xong, có test, đã chạy trên EPUB thật 1425 chương |
| Chapter/index JSON + cache policy theo key | Xong, có test |
| Translation queue (retry / backoff / resume / quota) | Xong, có test |
| `ingestBook()` dùng chung admin + crawler | Xong, có test |
| Supabase schema | SQL đã viết, **chưa apply** — thiếu credential |
| R2 bucket + CDN domain | **Chưa tạo** — thiếu credential |
| Reader đọc chapter từ CDN | **Chưa đổi** — vẫn tải EPUB như cũ |
| Migration dữ liệu Blob → R2 | **Chưa chạy** — thiếu credential |

Reader và toàn bộ API hiện tại **chưa bị sửa**, nên production chạy y như trước.

## Đường đọc mục tiêu

```
User → Cloudflare CDN → R2
   books/{bookId}/index.json           cache 60s, purge khi publish
   books/{bookId}/r{rev}/ch/{n}.json   immutable 1 năm
   covers/{bookId}.webp                cache 7 ngày
```

`archives/{bookId}.epub` không bao giờ phục vụ người đọc (`private, no-store`).

## Vì sao có revision trong path

Chapter đã publish là immutable và CDN cache 1 năm. Sửa bản dịch thì **không ghi
đè**: ingest lại với `revision` mới → key mới; `index.json` (cache ngắn) trỏ sang
revision mới. Không cần purge từng chapter, và client đang cache bản cũ vẫn đọc được.

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
