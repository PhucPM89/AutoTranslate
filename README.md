# EPUB Translator
# 🌌 Trạm Chữ (Tram Chu)

Web app cá nhân để upload EPUB tiếng Trung, đọc theo chương và dịch chương hiện tại sang tiếng Việt bằng Gemini API.
> **Nền tảng đọc tiểu thuyết dịch thuật tự động thế hệ mới — Nơi chữ hoá thành thế giới.**  
> URL chính thức: [https://tram-chu.online](https://tram-chu.online)

## Chạy local
---

```bash
npm install
```
## 📖 Giới thiệu

Thiết lập API key:
**Trạm Chữ** là nền tảng đọc và khám phá tiểu thuyết tiếng Trung được dịch thuật sang tiếng Việt mượt mà, áp dụng kiến trúc **Living World UI/UX** sống động, hiện đại và hệ thống dịch song hành (Dual-Mode Autonomous Engine) mạnh mẽ: kết hợp tài khoản **Gemini Web cá nhân** (qua daemon tự động trên máy) và **Cloud API failover** (tự động kích hoạt trên đám mây khi tắt máy tính).

Tạo file `.env` trong thư mục project:
---

## 🏛️ Kiến trúc hệ thống

```text
GEMINI_API_KEY=your_key
┌─────────────────────────────────────────────────────────────┐
│                    TRẠM CHỮ PLATFORM                        │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Cloudflare Pages)                                │
│   ├── Living World Experience (Pure CSS 3D + Atmosphere)    │
│   ├── Reader Mode (TTS giọng đọc, Dark/Light, Typography)   │
│   └── PWA & Offline Cache (Service Worker v2)               │
├─────────────────────────────────────────────────────────────┤
│  Storage & CDN (Cloudflare R2)                              │
│   ├── novel-storage (Public CDN: chương JSON, index, bìa)   │
│   └── novel-archive (Private: nguồn gốc EPUB, API keys pool)│
├─────────────────────────────────────────────────────────────┤
│  Database (Supabase PostgreSQL)                             │
│   ├── User Sync: Dấu trang, lịch sử tiến độ đọc             │
│   └── Community: Đánh giá, báo lỗi từ ngữ, Analytics        │
├─────────────────────────────────────────────────────────────┤
│  Dual-Mode Translation Engine (Bộ máy dịch thuật song hành) │
│   ├── Mode 1 (Primary): Local Gemini Web Daemon             │
│   │    └── Chạy nền trên máy tính qua Playwright            │
│   └── Mode 2 (Cloud Failover): GitHub Actions Worker        │
│        └── Tự động dịch bằng API keys khi tắt máy           │
└─────────────────────────────────────────────────────────────┘
```

File `.env` đã nằm trong `.gitignore`, không nên commit file này.
---

Hoặc set trực tiếp trong terminal:
## ✨ Điểm nổi bật & Tính năng chính

```bash
# PowerShell
$env:GEMINI_API_KEY="your_key"
```
### 1. Trải nghiệm Living World UI
- **Khí quyển biến đổi theo truyện (World Atmosphere)**: Mỗi bộ truyện mang một thế giới riêng với bảng màu, ánh sáng nền và hiệu ứng sương mờ phản chiếu cảm xúc tác phẩm.
- **Hiệu ứng sách vật lý 3D (Pure CSS 3D Perspective)**: Tương tác chạm lật tự nhiên, góc nghiêng chiều sâu không phụ thuộc thư viện 3D cồng kềnh, tải trang tức thì.
- **Trình đọc chuyên sâu (Reader Mode)**:
  - Tùy biến phông chữ văn học (*Merriweather, Literata, Be Vietnam Pro*), kích cỡ chữ, khoảng cách dòng, độ rộng lề.
  - Tích hợp động cơ đọc giọng nói **TTS (Text-to-Speech)** mượt mà, hỗ trợ hẹn giờ tắt khi ngủ.
  - Trích xuất ảnh trích dẫn nghệ thuật (**Quote Card Generator**) chia sẻ mạng xã hội.
  - Tìm kiếm thông minh, mục lục chia trang 50 chương/tab mượt mà không giật lag.

Hoặc trên macOS/Linux:
### 2. Bộ máy dịch thuật Dual-Mode (Tự động 100%)
Hệ thống cho phép bạn đọc truyện liền mạch mà không phụ thuộc vào một nhà cung cấp đơn lẻ:
- **Chế độ Gemini Web Daemon (Chạy trên máy khi mở máy)**:
  - Đăng nhập tài khoản Google một lần qua trình duyệt tự động.
  - Tận dụng sức mạnh suy luận tiếng Việt tự nhiên của Gemini Advanced / Gemini Web với độ dài ngữ cảnh không giới hạn và hoàn toàn miễn phí.
  - Lệnh điều khiển nhanh: `npm run translate:gemini-web:daemon`.
- **Chế độ Cloud API Failover (Tự động kích hoạt khi tắt máy)**:
  - Khi máy tính tắt hoặc daemon dừng hoạt động, hệ thống GitHub Actions Worker (`.github/workflows/translate-worker.yml`) tự động đảm nhận việc dịch thông qua cụm khoá API dự phòng (`GROQ_API_KEYS`, `GEMINI_API_KEYS`).
  - Thuật toán cân bằng tải, tự động xoay vòng khoá khi chạm ngưỡng giới hạn (rate-limit) và tự phục hồi khi có lỗi.
  - Tự động đồng bộ bản dịch mới lên Cloudflare R2 CDN ngay khi hoàn thành.

```bash
export GEMINI_API_KEY=your_key
```
### 3. Tối ưu hoá ngôn ngữ văn học & Sửa lỗi tự động
- Chuẩn hóa hội thoại tiếng Việt (phân định chính xác lời thoại nhân vật và lời trần thuật của tác giả).
- Tự động thay thế các cụm từ Hán Việt thô cứng, lỗi phiên âm thường gặp thành từ ngữ văn học tự nhiên (`tịch tà`, `yểm sát khí`, `giơ cao`, `lên cấp`).
- Loại bỏ hoàn toàn các ký tự phân cách tiếng Trung tồn đọng (`、`).

Chạy app:
---

```bash
npm run dev
```
## 🚀 Cài đặt & Phát triển cục bộ

Mở:
### 1. Yêu cầu hệ thống
- **Node.js** >= 20
- **npm** >= 10

```text
http://localhost:3000
```

## Cấu trúc frontend

Source của frontend nằm trong `client/`, còn `public/` là thư mục output:

```text
client/index.html   ->  public/index.html   (chèn URL asset kèm hash)
client/style.css    ->  public/style.css    (minify)
client/app.js       ->  public/app.js       (bundle + minify)
client/admin-upload.js -> public/admin-upload.js (ES module, chỉ tải khi mở quản trị)
node_modules/jszip  ->  public/vendor/jszip.min.js
```

Sau khi sửa file trong `client/`, chạy lại:

### 2. Cài đặt thư viện
```bash
npm run build
npm install
```

Mỗi asset được gắn `?v=<hash nội dung>` nên có thể cache một năm mà vẫn cập nhật ngay khi nội dung đổi. Không sửa trực tiếp file trong `public/` (trừ `library/`, `assets/`, `favicon.svg`) vì build sẽ ghi đè.
### 3. Cấu hình biến môi trường
Tạo file `.env` hoặc `.env.local` ở thư mục gốc (xem `.env.example` làm mẫu):

## Ba màn hình
```env
# Cloudflare R2 Storage (Bắt buộc cho CDN & Quản lý chương)
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET=novel-storage
R2_ARCHIVE_BUCKET=novel-archive
R2_PUBLIC_BASE_URL=https://cdn.tram-chu.online

```text
Thư viện   ->  danh sách truyện, tìm kiếm, lọc thể loại
Giới thiệu ->  #book/<id> · thông tin truyện, tiến độ đọc, truyện cùng thể loại
Trình đọc  ->  mục lục, nội dung chương, dịch, giọng đọc
```
# Supabase Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key

Bấm **bìa truyện** mở trang giới thiệu; nút **`Đọc ngay`** trên thẻ truyện vào thẳng trình đọc. Trang giới thiệu chỉ dùng dữ liệu có trong danh mục nên **không tải file EPUB** — file chỉ được tải khi bấm đọc. Địa chỉ `#book/<id>` chia sẻ được; mở link đó sẽ vào đúng trang giới thiệu của truyện.

## Cách dùng

1. Bấm `Upload EPUB`.
2. Chọn chương ở danh sách bên trái hoặc dropdown trên mobile.
3. Đọc nguyên văn tiếng Trung.
4. Bấm `Dịch chương`.
5. Bản dịch tiếng Việt sẽ hiện bên dưới và được lưu trong `localStorage`.
6. Nếu chương đã dịch rồi, app sẽ tự hiện bản dịch đã lưu và không gọi Gemini lại.
7. Bấm `Dịch lại` nếu muốn gọi Gemini lại cho chương đó.

App cũng nhớ dark mode, cỡ chữ, độ rộng reader và chương đang đọc cho từng file EPUB.

## Gemini

API key chỉ nằm ở backend qua biến môi trường `GEMINI_API_KEY`. Frontend không chứa API key.

Mặc định server dùng model:

```text
gemini-3.1-flash-lite
# Gemini API Keys (Cụm khoá dự phòng Cloud Failover)
GEMINI_API_KEYS=key1,key2,key3
GROQ_API_KEYS=gsk_key1,gsk_key2
```

Có thể đổi bằng:

### 4. Khởi động môi trường phát triển
```bash
$env:GEMINI_MODEL="gemini-3.5-flash"
npm start
```
# Chạy local dev server
npm run serve

Để dịch chương dài nhanh hơn, server tự chia chương thành nhiều phần và gọi Gemini song song. Mặc định:

```text
GEMINI_CHUNK_SIZE=4000
GEMINI_TRANSLATE_CONCURRENCY=1
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-3.6-flash
# Hoặc dùng Cloudflare Wrangler Pages Dev
npm run dev
```
Mở trình duyệt tại: `http://localhost:3000`

Tăng `GEMINI_TRANSLATE_CONCURRENCY` có thể nhanh hơn nhưng dễ gặp rate limit hoặc high demand hơn. Nếu model chính quá tải, server sẽ tự thử model trong `GEMINI_FALLBACK_MODELS`.
---

## Deploy ngắn gọn
## 🛠️ Hướng dẫn vận hành hệ thống dịch

Đưa source lên GitHub, sau đó deploy lên hosting chạy Node.js như Render, Railway, Fly.io hoặc VPS. Trên hosting cần đặt environment variable:
### 1. Vận hành Gemini Web Daemon (Chạy cục bộ)
Để dịch truyện miễn phí chất lượng cao bằng tài khoản Google cá nhân:

```text
GEMINI_API_KEY=your_key
```
1. **Đăng nhập lần đầu**:
   ```bash
   npm run translate:gemini-web:login
   ```
   *Trình duyệt Chromium sẽ mở ra, bạn đăng nhập tài khoản Google rồi đóng trình duyệt.*
2. **Khởi động daemon**:
   - Cách 1: Click đúp vào file `run-gemini-web-daemon.bat`.
   - Cách 2: Chạy lệnh `npm run translate:gemini-web:daemon`.
3. **Cài đặt tự động chạy cùng Windows (Tùy chọn)**:
   ```bash
   npm run translate:gemini-web:autostart:install
   ```

Build step không cần. Start command:

### 2. Quản lý bản dịch & Tiến độ
```bash
npm run dev
```
# Kiểm tra tiến độ dịch các bộ truyện
npm run progress

## Deploy Cloudflare
# Xem trực tiếp các chương mới dịch
npm run chapters:live

Mỗi lần có commit được push lên nhánh `main`, workflow
`.github/workflows/deploy-pages.yml` sẽ tự chạy test, build lại `public/` với cấu
hình production và deploy project Cloudflare Pages `tram-chu-web`. Có thể chạy
lại thủ công từ tab **Actions → Deploy website → Run workflow**.

Workflow cần các GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `R2_PUBLIC_BASE_URL`, `SUPABASE_URL` và
`SUPABASE_ANON_KEY`.

Toàn bộ site là một Cloudflare Worker: `worker/index.js` phục vụ file tĩnh qua
binding `ASSETS` và xử lý các route `/api/admin/*`. Người đọc không chạm Worker —
catalogue và mọi chapter là object tĩnh trên R2 do CDN phục vụ.

Cấu hình build:

```text
Build command   : npm run build
Deploy command  : npx wrangler deploy
# Rà soát và chuẩn hóa văn phong toàn bộ chương
node scripts/repair-acmong-chapters.js
```

`wrangler.toml` khai báo `main`, `[assets]` và hai R2 binding. Danh sách biến đầy
đủ, kèm cái nào là secret và cái nào build cần, nằm ngay trong file đó.
---

Ba biến được inline vào bundle browser nên **phải có lúc build**, không chỉ lúc
chạy: `R2_PUBLIC_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Log build sẽ in
## 🚢 Build & Deploy lên Cloudflare Pages

```text
/_headers 2.1 KB (cdn: https://cdn.tram-chu.online)
```
Quy trình build client hoàn toàn tự động, tích hợp nén mã nguồn, gắn hash phiên bản và tạo `sitemap.xml` chuẩn SEO tiếng Việt:

Nếu thấy `(chưa có CDN origin)` thì `R2_PUBLIC_BASE_URL` chưa tới được bước build.

`READER_CDN_ENABLED` để **trống** cho tới khi đường đọc CDN được kiểm tra tay.

Chạy thử đúng runtime production ở local:

```bash
npm run dev          # wrangler dev, chạy workerd thật
```
# 1. Chạy test kiểm thử toàn bộ hệ thống
npm test

## Quản trị và upload EPUB
# 2. Build bundle tối ưu hoá tĩnh
npm run build

1. Sinh hash mật khẩu và khóa phiên ở local:

```powershell
$env:ADMIN_PASSWORD="mat-khau-quan-tri"
npm run setup:admin
Remove-Item Env:ADMIN_PASSWORD
# 3. Triển khai trực tiếp lên Cloudflare Pages
npm run deploy
```

2. Đặt `LIBRARY_UPLOAD_PASSWORD_HASH` và `LIBRARY_SESSION_SECRET` làm secret của
   Worker. Đổi `LIBRARY_SESSION_SECRET` sẽ đăng xuất mọi phiên đang mở.
---

3. Nút hình khóa trên thanh đầu trang mở khu vực quản trị.
## 📂 Cấu trúc thư mục

EPUB **không** đi qua Worker. Cloudflare giới hạn body request 100 MB còn EPUB có
thể 200 MB, nên Worker chỉ cấp một URL `PUT` có chữ ký ngắn hạn (30 phút) và trình
duyệt đẩy file thẳng lên bucket private `novel-archive`. Sau đó Worker gọi
`workflow_dispatch` để GitHub Actions ingest — việc đó mất nhiều phút, quá lâu cho
bất kỳ request nào.

Mật khẩu không nằm trong source: server chỉ giữ hash `scrypt`, phiên nằm trong
cookie `HttpOnly; Secure; SameSite=Strict` hết hạn sau 30 phút, và mọi route admin
kiểm tra lại quyền cùng same-origin trước khi làm gì. Mã gửi tới browser luôn xem
được bằng DevTools; không đặt secret nào trong đó.

## Fanqie crawler tự động

Crawler chạy bằng GitHub Actions mỗi 15 phút, 24/7, lấy book ID từ bảng xếp hạng Fanqie, dùng Tomato Novel Downloader để tạo EPUB, rồi ingest thẳng vào R2 và Supabase. Không cần VPS và không cần nhập link thủ công.

Worker crawler đọc config và ghi trạng thái trực tiếp trên R2, không gọi website nào, nên không cần token phiên. Sau khi deploy, đăng nhập khu vực quản trị, mở tab `Crawler`, chọn thể loại và bật tự động — hoặc dùng `node scripts/crawler-config.js --enable`. Có thể chạy ngay workflow `Fanqie crawler` bằng nút `Run workflow`; lịch mặc định là phút 07, 22, 37 và 52 mỗi giờ.

Worker ưu tiên cập nhật truyện Fanqie đã quá 24 giờ chưa đồng bộ; nếu lượt cập nhật đó không thêm được gì thì worker vẫn tiếp tục tìm truyện mới trong cùng lượt. File tải tạm chỉ nằm trong cache GitHub Actions, còn thư viện chính nằm trên R2.

### Tìm truyện dài

Worker dùng chính bộ lọc số chữ của Fanqie (`/api/author/library/book_list/v0/`) thay vì mở trang từng truyện:

```text
category_id     mã thể loại của Fanqie (258 玄幻, 1140 仙侠, 751 悬疑, 8 末世, 539 推理...)
word_count      0 = <30 vạn, 1 = 30-50 vạn, 2 = 50-100 vạn, 3 = 100-200 vạn, 4 = trên 200 vạn
creation_status -1 tất cả, 0 đã hoàn thành, 1 đang ra chương
page_count      tối đa 100 truyện mỗi request
├── client/                 # Mã nguồn frontend (Giao diện người dùng)
│   ├── app.js              # Entrypoint chính (Living World UI, Bookmarks, Navigation)
│   ├── style.css           # Toàn bộ CSS phong cách Living World & 3D Book
│   ├── reader-text.js      # Bộ phân tách đoạn văn và chuẩn hoá văn bản đọc
│   ├── tts.js              # Trình phát giọng nói Text-to-Speech & hẹn giờ
│   ├── seo.js              # Quản lý Meta thẻ SEO, OpenGraph và Tiêu đề động
│   ├── quote-card.js       # Bộ tạo ảnh trích dẫn nghệ thuật cho bạn đọc
│   └── user-sync.js        # Đồng bộ lịch sử đọc & dấu trang với Supabase
├── scripts/                # Kịch bản tự động hoá, build và bảo trì
│   ├── build-client.js     # Trình biên dịch esbuild cho frontend + sitemap generator
│   ├── deploy-pages.js     # Kịch bản deploy lên Cloudflare Pages
│   ├── gemini-web-daemon.js# Daemon dịch thuật Gemini Web qua Playwright
│   ├── translate-worker.js # Worker dịch thuật tự động (Gemini Web & Cloud API)
│   └── repair-acmong-chapters.js # Kịch bản rà soát và chuẩn hoá văn phong
├── server/                 # Logic lõi xử lý dịch thuật, bảo mật và lưu trữ
│   ├── gemini.js           # Engine kết nối Gemini (Web daemon & Cloud API pool)
│   ├── translation-engine.js# Engine dịch thuật, tiền xử lý và hậu xử lý văn bản
│   └── storage/            # Driver giao tiếp Cloudflare R2 (S3-compatible)
├── public/                 # Thư mục output triển khai tĩnh lên Cloudflare Pages
├── functions/              # Cloudflare Pages Functions (API Edge serverless)
└── .github/workflows/      # GitHub Actions CI/CD và Translation Worker
```

Chọn `Trên 2 triệu chữ` trong tab `Crawler` nghĩa là mọi truyện trả về đã có khoảng 900+ chương, nên một lượt chạy chỉ tốn khoảng 20 request cho cả 5 thể loại. Trước đây worker mở trang chi tiết của 220-360 truyện mỗi lượt và bị Fanqie chặn tốc độ (trả HTTP 200 kèm body rỗng).
---

`Độ dài truyện` là bộ điều khiển độ dài duy nhất; không còn ô `Số chương tối thiểu` vì Fanqie đã lọc sẵn theo số chữ. Sau khi tải xong, worker vẫn kiểm tra file EPUB và loại những file nghi bị tải dở.

Nếu API thư viện lỗi, worker tự chuyển sang quét bảng xếp hạng `1_2_*` (bảng truyện đã hoàn chỉnh) và đọc số chương từ `window.__INITIAL_STATE__` của trang xếp hạng.

### Tải truyện dài không bị ngắt giữa

Truyện vài nghìn chương cần nhiều giờ để tải, nên worker được thiết kế để chạy dài:

- **Không còn phụ thuộc website.** Trạng thái được ghi thẳng lên R2. Trước đây worker gọi API của site bằng token OIDC sống ~5 phút, nên mọi lượt tải dài đều chết ở phút thứ 5; và khi storage của site ngừng hoạt động thì mọi lượt đều thất bại.
- **Cache của Tomato luôn được lưu.** `actions/cache` chỉ lưu khi job thành công, tức là đúng những lượt tải dở lại bị mất sạch. Workflow tách thành `cache/restore` và `cache/save` với `if: always()`.
- **Lượt sau tải tiếp đúng truyện đó.** Nếu một lượt chết giữa lúc tải, `currentBookId` được giữ lại trong trạng thái và lượt kế tiếp tải tiếp truyện đó trước, tối đa 3 lần rồi mới bỏ qua.
- **Ngân sách thời gian.** Mặc định mỗi lượt làm việc tối đa 300 phút (`CRAWLER_RUN_BUDGET_MINUTES`), trong khi job cho phép 330 phút. Worker dừng chủ động khi gần hết ngân sách để còn kịp upload, publish và lưu cache; nó cũng không bắt đầu một truyện mới khi còn dưới 20 phút.

Repo đang là public nên GitHub Actions không giới hạn số phút. Lịch 15 phút vẫn giữ nguyên: nhờ `concurrency` group, lượt mới sẽ chờ lượt đang chạy kết thúc rồi khởi động gần như ngay lập tức, nên không còn khoảng trống 15 phút giữa các lần tải.

## Số liệu người đọc

Tab `Số liệu` trong khu quản trị hiển thị lượt truy cập và lượt mở truyện theo hôm nay / 7 ngày / 30 ngày / tổng cộng, kèm danh sách truyện được mở nhiều nhất.

Cách đếm được thiết kế cho hạn mức miễn phí: trình duyệt insert thẳng vào Supabase bằng khóa anon **một lần mỗi phiên** và **một lần cho mỗi truyện được mở**, chứ không phải mỗi lần đổi trang. Không có function nào được gọi. RLS cho phép anon insert `analytics_events` và không cho đọc lại, sửa hay xoá bất cứ thứ gì.

Số liệu nằm ở bảng `analytics_events` trên Supabase và được đọc qua view tổng hợp `analytics_daily`. Không lưu IP, cookie hay bất kỳ danh tính nào — chỉ một id phiên ngẫu nhiên trong `sessionStorage` — nên con số là **số phiên truy cập** chứ không phải số người chính xác.
## 🛡️ Bản quyền & Giấy phép
Mã nguồn phát triển riêng cho dự án **Trạm Chữ**. Toàn bộ tác phẩm được khai thác từ nguồn công khai phục vụ mục đích nghiên cứu và phi thương mại.
