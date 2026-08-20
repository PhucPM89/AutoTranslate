# Hạ tầng và free tier

## Dịch vụ nào làm gì

| Dịch vụ | Dùng cho | Không dùng cho |
|---|---|---|
| Cloudflare Pages | frontend tĩnh (host chính) | phục vụ chapter |
| Vercel | **legacy** — admin/crawler API trong lúc migration | frontend, chapter |
| Vercel Blob | **legacy/backup, đang bị block** | mọi dữ liệu mới |
| Cloudflare R2 | chapter JSON, cover, EPUB archive, job state | dữ liệu quan hệ |
| Cloudflare CDN | phân phối chapter/cover | — |
| Supabase Postgres | books/chapters metadata, categories, analytics events | nội dung chapter |
| Gemini | dịch **một lần** lúc ingest | dịch theo từng người đọc |
| IndexedDB (browser) | bookmark, lịch sử đọc, tiến độ | — |

## Free tier và điểm sẽ vỡ trước

| Tài nguyên | Free tier | Ước lượng sau migration | Bottleneck |
|---|---|---|---|
| R2 storage | 10 GB | ~450 MB EPUB archive + ~120 MB chapter JSON | còn nhiều chỗ |
| R2 Class A (ghi) | 1 tr/tháng | ~3.000 ghi mỗi truyện ingest | ~330 truyện/tháng |
| R2 egress | **miễn phí** | — | không phải bottleneck |
| Cloudflare CDN | không giới hạn request | phần lớn chapter hit cache | không phải bottleneck |
| Supabase DB | 500 MB | metadata + events, vài chục MB/năm | `analytics_events` lớn dần, cần cắt định kỳ |
| Supabase egress | 5 GB/tháng | chỉ metadata | không phải bottleneck |
| Supabase | **tự pause sau 7 ngày không hoạt động** | — | rủi ro thật, xem dưới |
| Vercel bandwidth | 100 GB/tháng | ~200 KB/khách (HTML/JS/CSS) | ~500k lượt truy cập |
| Vercel functions | 12 | hiện 11 | đã kín, thêm phải gộp |
| Gemini | giới hạn theo phút/ngày | 1 call/chương, một lần duy nhất | ingest truyện dài phải chia nhiều ngày |

## Ba rủi ro cần biết

1. **Supabase free pause sau 7 ngày không truy vấn.** Đường đọc không chạm DB
   (đúng thiết kế), nên DB có thể bị pause và làm trang duyệt lỗi. Cần cron ping
   nhẹ hoặc chấp nhận cold start.
2. **Vercel Hobby không cho phép dùng thương mại.** Site có nút ủng hộ thì cần xem
   lại điều khoản.
3. **Gemini là nút cổ chai của ingest, không phải của đọc.** Bộ 3.000 chương cần
   3.000 lần gọi. Hàng đợi có `requestBudget` để chia theo ngày.

## Biến môi trường

Chưa có biến nào bị commit vào Git. Cần thêm:

```
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_BASE_URL          # domain CDN — biến duy nhất browser cần biết
SUPABASE_URL
SUPABASE_ANON_KEY           # browser dùng được; RLS chỉ cho đọc + insert analytics
SUPABASE_SERVICE_ROLE_KEY   # server-side only, KHÔNG gửi ra browser
```

Khi thiếu `R2_*`, storage layer tự dùng driver filesystem (`LOCAL_STORAGE_DIR`),
nên toàn bộ pipeline vẫn chạy và test được ở local mà không cần cloud.

## Trạng thái Vercel

Vercel đã **block** Blob store do vượt hạn mức Blob Advanced Operations trên plan
Hobby. Hệ quả đo được:

```
GET library/catalog.json → 403 "Your store is blocked"
GET /api/library         → 200 {"books": []}   (fallback rỗng)
```

Thư viện production hiện trắng. Blob chỉ còn là **nguồn legacy cần cứu dữ liệu**,
không dùng cho bất cứ ghi mới nào. Không xoá gì trên đó.

## Cloudflare: data plane vs control plane

| Mặt | Trạng thái |
|---|---|
| R2 S3 API (đọc/ghi object) | **hoạt động** — đã ingest thật 2.854 object |
| Cloudflare API (Pages, custom domain, cache purge) | **không truy cập được** — token trả `9109 Invalid access token` |

Vì vậy tạo Pages project và gắn custom domain cho R2 phải làm thủ công một lần.
