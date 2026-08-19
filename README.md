# EPUB Translator

Web app cá nhân để upload EPUB tiếng Trung, đọc theo chương và dịch chương hiện tại sang tiếng Việt bằng Gemini API.

## Chạy local

```bash
npm install
```

Thiết lập API key:

Tạo file `.env` trong thư mục project:

```text
GEMINI_API_KEY=your_key
```

File `.env` đã nằm trong `.gitignore`, không nên commit file này.

Hoặc set trực tiếp trong terminal:

```bash
# PowerShell
$env:GEMINI_API_KEY="your_key"
```

Hoặc trên macOS/Linux:

```bash
export GEMINI_API_KEY=your_key
```

Chạy app:

```bash
npm start
```

Mở:

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

```bash
npm run build
```

Mỗi asset được gắn `?v=<hash nội dung>` nên có thể cache một năm mà vẫn cập nhật ngay khi nội dung đổi. Không sửa trực tiếp file trong `public/` (trừ `library/`, `assets/`, `favicon.svg`) vì build sẽ ghi đè.

## Ba màn hình

```text
Thư viện   ->  danh sách truyện, tìm kiếm, lọc thể loại
Giới thiệu ->  #book/<id> · thông tin truyện, tiến độ đọc, truyện cùng thể loại
Trình đọc  ->  mục lục, nội dung chương, dịch, giọng đọc
```

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
```

Có thể đổi bằng:

```bash
$env:GEMINI_MODEL="gemini-3.5-flash"
npm start
```

Để dịch chương dài nhanh hơn, server tự chia chương thành nhiều phần và gọi Gemini song song. Mặc định:

```text
GEMINI_CHUNK_SIZE=4000
GEMINI_TRANSLATE_CONCURRENCY=1
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-3.6-flash
```

Tăng `GEMINI_TRANSLATE_CONCURRENCY` có thể nhanh hơn nhưng dễ gặp rate limit hoặc high demand hơn. Nếu model chính quá tải, server sẽ tự thử model trong `GEMINI_FALLBACK_MODELS`.

## Deploy ngắn gọn

Đưa source lên GitHub, sau đó deploy lên hosting chạy Node.js như Render, Railway, Fly.io hoặc VPS. Trên hosting cần đặt environment variable:

```text
GEMINI_API_KEY=your_key
```

Build step không cần. Start command:

```bash
npm start
```

## Deploy Vercel

Project đã có `api/translate.js` để chạy trên Vercel Serverless Functions.

Vercel settings:

```text
Framework Preset: Other
Build Command: npm run build
Output Directory: public
Install Command: npm install
```

Environment Variables trên Vercel:

```text
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-3.6-flash
GEMINI_CHUNK_SIZE=4000
GEMINI_TRANSLATE_CONCURRENCY=1
```

## Upload EPUB không cần database

Thư viện dùng Vercel Blob. Gói Hobby có thể dùng miễn phí trong hạn mức của Vercel; file EPUB được upload thẳng từ trình duyệt lên Blob nên không đi qua giới hạn dung lượng request của Function.

1. Trong Vercel Dashboard, mở project, vào `Storage` > `Create Database` > `Blob`, rồi kết nối store với project. Vercel sẽ tự thêm `BLOB_READ_WRITE_TOKEN`.
2. Sinh hash mật khẩu và khóa phiên ở local:

```powershell
$env:ADMIN_PASSWORD="mat-khau-quan-tri"
npm run setup:admin
Remove-Item Env:ADMIN_PASSWORD
```

3. Mở `.env`, đưa hai giá trị sau vào Vercel `Settings` > `Environment Variables` cho Production, Preview và Development:

```text
LIBRARY_UPLOAD_PASSWORD_HASH
LIBRARY_SESSION_SECRET
```

4. Redeploy project. Nút hình khóa trên thanh đầu trang mở khu vực quản trị.

Mật khẩu không được ghi vào source. Server chỉ giữ hash `scrypt`, phiên quản trị nằm trong cookie `HttpOnly`, hết hạn sau 30 phút và endpoint upload kiểm tra quyền lại trước khi cấp token Blob. Mã HTML/CSS/JS gửi tới trình duyệt luôn có thể xem bằng DevTools; không đặt secret hay quyền ghi trong mã frontend.

## Fanqie crawler tự động

Crawler chạy bằng GitHub Actions mỗi 15 phút, 24/7, lấy book ID từ bảng xếp hạng Fanqie, dùng Tomato Novel Downloader để tạo EPUB, rồi upload EPUB và ảnh bìa vào Vercel Blob. Không cần VPS và không cần nhập link thủ công.

Workflow không cần GitHub secret: nó dùng GitHub OIDC token ngắn hạn, bị giới hạn cho đúng repo `PhucPM89/AutoTranslate`, nhánh `main` và file workflow crawler. Sau khi deploy, đăng nhập khu vực quản trị, mở tab `Crawler`, chọn thể loại và bật tự động. Có thể chạy ngay workflow `Fanqie crawler` bằng nút `Run workflow`; lịch mặc định là phút 07, 22, 37 và 52 mỗi giờ.

Worker ưu tiên cập nhật truyện Fanqie đã quá 24 giờ chưa đồng bộ; nếu lượt cập nhật đó không thêm được gì thì worker vẫn tiếp tục tìm truyện mới trong cùng lượt. File tải tạm chỉ nằm trong cache GitHub Actions, còn thư viện chính nằm trên Vercel Blob.

### Tìm truyện dài

Worker dùng chính bộ lọc số chữ của Fanqie (`/api/author/library/book_list/v0/`) thay vì mở trang từng truyện:

```text
category_id     mã thể loại của Fanqie (258 玄幻, 1140 仙侠, 751 悬疑, 8 末世, 539 推理...)
word_count      0 = <30 vạn, 1 = 30-50 vạn, 2 = 50-100 vạn, 3 = 100-200 vạn, 4 = trên 200 vạn
creation_status -1 tất cả, 0 đã hoàn thành, 1 đang ra chương
page_count      tối đa 100 truyện mỗi request
```

Chọn `Trên 2 triệu chữ` trong tab `Crawler` nghĩa là mọi truyện trả về đã có khoảng 900+ chương, nên một lượt chạy chỉ tốn khoảng 20 request cho cả 5 thể loại. Trước đây worker mở trang chi tiết của 220-360 truyện mỗi lượt và bị Fanqie chặn tốc độ (trả HTTP 200 kèm body rỗng).

`Độ dài truyện` là bộ điều khiển độ dài duy nhất; không còn ô `Số chương tối thiểu` vì Fanqie đã lọc sẵn theo số chữ. Sau khi tải xong, worker vẫn kiểm tra file EPUB và loại những file nghi bị tải dở.

Nếu API thư viện lỗi, worker tự chuyển sang quét bảng xếp hạng `1_2_*` (bảng truyện đã hoàn chỉnh) và đọc số chương từ `window.__INITIAL_STATE__` của trang xếp hạng.

### Tải truyện dài không bị ngắt giữa

Truyện vài nghìn chương cần nhiều giờ để tải, nên worker được thiết kế để chạy dài:

- **Token OIDC được làm mới trong lúc chạy.** Token của GitHub chỉ sống khoảng 5 phút; trước đây worker lấy một lần lúc khởi động rồi dùng lại cho mọi lần gọi `updateStatus`, nên mọi lượt tải dài đều chết ở phút thứ 5. Giờ token tự làm mới trước khi hết hạn và thử lại một lần nếu gặp 401.
- **Cache của Tomato luôn được lưu.** `actions/cache` chỉ lưu khi job thành công, tức là đúng những lượt tải dở lại bị mất sạch. Workflow tách thành `cache/restore` và `cache/save` với `if: always()`.
- **Lượt sau tải tiếp đúng truyện đó.** Nếu một lượt chết giữa lúc tải, `currentBookId` được giữ lại trong trạng thái và lượt kế tiếp tải tiếp truyện đó trước, tối đa 3 lần rồi mới bỏ qua.
- **Ngân sách thời gian.** Mặc định mỗi lượt làm việc tối đa 300 phút (`CRAWLER_RUN_BUDGET_MINUTES`), trong khi job cho phép 330 phút. Worker dừng chủ động khi gần hết ngân sách để còn kịp upload, publish và lưu cache; nó cũng không bắt đầu một truyện mới khi còn dưới 20 phút.

Repo đang là public nên GitHub Actions không giới hạn số phút. Lịch 15 phút vẫn giữ nguyên: nhờ `concurrency` group, lượt mới sẽ chờ lượt đang chạy kết thúc rồi khởi động gần như ngay lập tức, nên không còn khoảng trống 15 phút giữa các lần tải.

## Giới hạn 12 Serverless Function

Vercel Hobby chỉ cho phép **12 serverless function mỗi deployment**, và project đang dùng đúng 12. Thêm một file `.js` mới vào `api/` sẽ làm deploy thất bại với lỗi:

```text
No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
```

Vì vậy vài endpoint được gộp chung một function, phân nhánh theo HTTP method:

```text
api/analytics.js        POST   = beacon công khai từ trình duyệt người đọc
                        GET    = số liệu cho admin (cần phiên quản trị)
api/admin/login.js      GET    = kiểm tra phiên
                        POST   = đăng nhập
                        DELETE = đăng xuất
```

`vercel.json` giữ rewrite cho các path cũ (`/api/admin/logout`, `/api/admin/analytics`) để trình duyệt còn giữ bundle cũ không bị lỗi. Khi cần thêm endpoint mới, hãy gộp vào function sẵn có thay vì tạo file mới.

## Số liệu người đọc

Tab `Số liệu` trong khu quản trị hiển thị lượt truy cập và lượt mở truyện theo hôm nay / 7 ngày / 30 ngày / tổng cộng, kèm danh sách truyện được mở nhiều nhất.

Cách đếm được thiết kế cho hạn mức miễn phí: trình duyệt chỉ gửi beacon tới `/api/analytics` **một lần mỗi phiên** và **một lần cho mỗi truyện được mở**, chứ không phải mỗi lần đổi trang. Một người đọc vì vậy chỉ tốn một hai lần gọi function.

Số liệu nằm trong `library/analytics.json` trên Vercel Blob, giữ 60 ngày gần nhất. Không lưu IP, cookie hay bất kỳ danh tính nào, nên con số là **số phiên truy cập** chứ không phải số người chính xác.
