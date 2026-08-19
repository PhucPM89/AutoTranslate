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

Crawler chạy bằng GitHub Actions mỗi 6 giờ, lấy book ID từ bảng xếp hạng Fanqie, dùng Tomato Novel Downloader để tạo EPUB, rồi upload EPUB và ảnh bìa vào Vercel Blob. Không cần VPS và không cần nhập link thủ công.

Đặt hai GitHub Actions secrets:

```text
CRAWLER_SECRET
BLOB_READ_WRITE_TOKEN
```

Đặt cùng giá trị `CRAWLER_SECRET` trên Vercel. Sau khi deploy, đăng nhập khu vực quản trị, mở tab `Crawler`, chọn thể loại và bật tự động. Có thể chạy ngay workflow `Fanqie crawler` bằng nút `Run workflow`; lịch mặc định là phút 17 mỗi 6 giờ.

Worker ưu tiên cập nhật truyện Fanqie đã quá 24 giờ chưa đồng bộ; những lượt còn lại sẽ thêm truyện mới. File tải tạm chỉ nằm trong cache GitHub Actions, còn thư viện chính nằm trên Vercel Blob.
