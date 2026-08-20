# Migration

## Đã làm (không cần credential)

Branch `refactor/r2-supabase-migration`:

1. `server/storage/` — interface + driver R2 (SigV4 tự ký, không thêm dependency) + driver filesystem.
2. `server/ingest/epub.js` — tách chapter phía server, không cần DOM.
3. `server/ingest/documents.js` — chapter JSON, index JSON, cache policy suy ra từ key.
4. `server/ingest/translation-queue.js` — state machine bền, resume, backoff, quota-aware.
5. `server/ingest/ingest-book.js` — pipeline dùng chung cho admin và crawler.
6. `supabase/migrations/0001_initial_schema.sql` — schema, index, RLS.
7. `server/ingest.test.js` — 18 test mới. Tổng **70/70 pass** (52 test cũ giữ nguyên).

**Chưa sửa reader, chưa sửa API, chưa xoá gì.** Production không bị ảnh hưởng.

## Quyết định: không cứu dữ liệu Blob cũ

49 EPUB trên Vercel Blob (store `auto-translate-library`, trạng thái **Suspended**)
**không** được migrate. Chủ project chọn crawl lại từ đầu qua pipeline mới.

Đã xác nhận không có đường lấy nội dung ra:

```
GET public blob URL      -> 403 "Your store is blocked"
vercel blob get <path>   -> 403 Forbidden   (CLI dùng cùng public URL bên dưới)
list()/head() qua token  -> OK, nhưng chỉ trả metadata
```

`scripts/migration/migrate-blob-to-r2.js` được giữ lại: nếu store được bỏ suspend
thì chạy được ngay. Không xoá gì trên Blob.

## Còn lại (bị chặn bởi credential)

| Bước | Chặn bởi |
|---|---|
| Tạo Cloudflare Pages project | token Cloudflare không hợp lệ (`9109`) |
| Gắn custom domain cho R2 | token Cloudflare không hợp lệ |
| Apply schema Supabase | cần connection string / DB password |
| Load test 1.000 reader đồng thời | cần CDN domain thật |
| Migrate 49 EPUB cũ | **đã bỏ** — crawl lại |

## Thứ tự an toàn khi đã có credential

Mỗi bước additive; rollback bằng cách tắt biến môi trường.

1. Apply schema — không ảnh hưởng production vì chưa có gì đọc nó.
2. Ingest **một** truyện vào R2, verify bằng tay.
3. Ingest toàn bộ 49 truyện. Verify: số truyện, số chapter, cover tồn tại, kích thước.
4. Bật `READER_CDN_ENABLED` trên **preview**. Reader thử CDN trước, 404 thì fallback EPUB.
5. Bật trên production. Theo dõi tỉ lệ fallback.
6. Chỉ khi tỉ lệ fallback = 0 mới bỏ đường EPUB.
7. **Không xoá Blob cũ** cho tới khi R2 chạy ổn định nhiều ngày.

Nếu số liệu verify lệch ở bước 3 thì **không** chuyển traffic.

## Rollback

| Đã đến bước | Cách lùi |
|---|---|
| Chưa bật reader CDN | Không cần làm gì — code mới không nằm trên đường chạy |
| Đã bật reader CDN | Tắt `READER_CDN_ENABLED`, reader về đường EPUB cũ ngay |
| Schema đã apply | Không cần lùi |
| Đã ingest lên R2 | Để nguyên, chỉ tốn dung lượng |

Vercel Blob gốc vẫn là bản backup cho tới khi xoá thủ công.

## Đã xong trong lượt mới nhất

- Reader đọc chapter từ CDN, có `READER_CDN_ENABLED` + fallback EPUB. Verify bằng
  Chrome: mở truyện và sang chương kế tiếp phát sinh **0 lượt gọi `/api`**, không
  tải EPUB, không nạp JSZip, không chạm Gemini.
- `client/_headers.template` sinh `public/_headers` cho Cloudflare Pages; CSP tự
  nhận CDN origin lúc build.
- `server/supabase.js` — PostgREST client, service role cho ghi, anon cho đọc,
  analytics INSERT-only.
- `server/ingest/run-ingest.js` — điểm vào ingest duy nhất, dùng bởi cả crawler và
  admin upload.
- Crawler đã bỏ `@vercel/blob`: chương và cover đi R2, metadata đi Supabase, dịch
  metadata tại worker khi có `GEMINI_API_KEY`.
- R2 ingest thật: 2.854 object, 33.2 MB, cache header đúng từng loại key.
