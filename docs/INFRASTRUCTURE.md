# Hạ tầng và free tier

Toàn bộ hệ thống chạy trên Cloudflare, Supabase và GitHub Actions. Không còn phụ
thuộc nào vào hạ tầng khác.

## Dịch vụ nào làm gì

| Dịch vụ | Dùng cho | Không dùng cho |
|---|---|---|
| Cloudflare Workers | frontend tĩnh (ASSETS) + route admin | phục vụ chapter |
| Cloudflare R2 | chapter JSON, cover, EPUB archive, job/crawler state | dữ liệu quan hệ |
| Cloudflare CDN | phân phối chapter/cover qua `cdn.tram-chu.online` | — |
| Supabase Postgres | books/chapters metadata, categories, analytics events | nội dung chapter |
| GitHub Actions | crawl, ingest, dịch | phục vụ request |
| Gemini | dịch **một lần** lúc ingest | dịch theo từng người đọc |
| IndexedDB (browser) | bookmark, lịch sử đọc, tiến độ | — |

Người đọc **không** chạm Worker: catalogue và mọi chapter là object tĩnh trên R2 do
CDN phục vụ. Worker chỉ chạy cho `/api/admin/*`.

## Free tier và điểm sẽ vỡ trước

| Tài nguyên | Free tier | Ước lượng | Bottleneck |
|---|---|---|---|
| R2 storage | 10 GB | ~450 MB EPUB archive + ~120 MB chapter JSON | còn nhiều chỗ |
| R2 Class A (ghi) | 1 tr/tháng | ~3.000 ghi mỗi truyện ingest | ~330 truyện/tháng |
| R2 egress | **miễn phí** | — | không phải bottleneck |
| Cloudflare CDN | không giới hạn request | phần lớn chapter hit cache | không phải bottleneck |
| Workers requests | 100k/ngày | chỉ admin dùng | không phải bottleneck |
| Supabase DB | 500 MB | metadata + events, vài chục MB/năm | `analytics_events` lớn dần, cần cắt định kỳ |
| Supabase egress | 5 GB/tháng | chỉ metadata | không phải bottleneck |
| Supabase | **tự pause sau 7 ngày không hoạt động** | — | có cron keep-alive |
| GitHub Actions | 2.000 phút/tháng (public repo: không giới hạn) | crawl + dịch chạy liên tục | xem hạn mức của repo |
| Gemini | giới hạn theo phút/ngày | 1 call/chương, một lần duy nhất | ingest truyện dài phải chia nhiều ngày |

## Đo thật, không phải suy đoán

1.000 phiên đọc mô phỏng (4.000 request) trên `cdn.tram-chu.online`:

| | |
|---|---|
| lỗi | 0 |
| throughput | 763 req/s |
| latency | p50 101ms · p95 251ms · p99 485ms |
| cache | HIT 70% · DYNAMIC 25% · MISS 5% |

Trong 3.000 request chapter thì 2.801 là HIT (93,4%); 199 MISS là 200 chapter lần
đầu được yêu cầu. 1.000 request `DYNAMIC` là `index.json` — Cache Rule hiện chỉ
khớp đường dẫn chapter, nên mỗi lượt mở truyện vẫn về R2. Thêm rule cho
`*/index.json` và `catalog/latest.json` sẽ đưa con số đó về gần 0.

## Rủi ro cần biết

1. **Supabase free pause sau 7 ngày không truy vấn.** Đường đọc không chạm DB
   (đúng thiết kế), nên DB có thể bị pause. Workflow `supabase-keepalive.yml` đọc
   một hàng mỗi ngày để tránh.
2. **Gemini là nút cổ chai của ingest, không phải của đọc.** Bộ 3.000 chương cần
   ~3.000 lần gọi. Hàng đợi có `requestBudget` để chia theo ngày. Đo được: 3,37
   chương/phút một luồng, 0 lỗi quota.
3. **Ghi đè chapter đã publish là bẫy.** Object mang `immutable, max-age=31536000`;
   sửa tại chỗ thì CDN vẫn phục vụ bản cũ tới một năm. Sửa nội dung thì tăng
   revision.

## Biến môi trường

Không có giá trị nào bị commit vào Git. Danh sách đầy đủ cùng chỗ đặt nằm trong
`wrangler.toml` và `.env.example`.

Nguyên tắc: chỉ `R2_PUBLIC_BASE_URL`, `SUPABASE_URL` và `SUPABASE_ANON_KEY` được
inline vào bundle browser. `SUPABASE_SERVICE_ROLE_KEY`, `R2_SECRET_ACCESS_KEY`,
`GEMINI_API_KEY` và `LIBRARY_SESSION_SECRET` là server-side, không bao giờ ra
browser — `server/build.test.js` chạy build thật rồi grep từng bundle để chứng minh.

Khi thiếu `R2_*`, storage layer tự dùng driver filesystem (`LOCAL_STORAGE_DIR`),
nên toàn bộ pipeline vẫn chạy và test được ở local mà không cần cloud.

## Cloudflare: cái gì làm được bằng API

| Mặt | Trạng thái |
|---|---|
| R2 S3 API (đọc/ghi object) | hoạt động — đã ingest thật hàng nghìn object |
| R2 bucket CORS qua API | hoạt động — đã đặt cho cả hai bucket |
| Cache Rules, Pages/Workers project | cần token có quyền tương ứng; token R2 không đủ |

Tạo project và sửa Cache Rule vì vậy phải làm trong dashboard.
