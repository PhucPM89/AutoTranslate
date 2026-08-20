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

## Còn lại (bị chặn bởi credential)

| Bước | Chặn bởi |
|---|---|
| Tạo R2 bucket + custom domain CDN | R2 credential |
| Apply schema Supabase | Supabase credential |
| Migrate 49 EPUB + 47 cover từ Blob sang R2 | R2 credential |
| Đổi reader sang đọc chapter từ CDN (kèm fallback EPUB) | cần R2 để test thật |
| Analytics sang INSERT-only | Supabase credential |
| Thay `catalog.json` bằng Supabase query | Supabase credential |
| Load test 1.000 reader đồng thời | cần CDN thật |

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
