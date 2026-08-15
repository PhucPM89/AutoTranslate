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
gemini-2.5-flash-lite
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
GEMINI_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-2.5-flash,gemini-3.5-flash-lite
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
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_FALLBACK_MODELS=gemini-2.0-flash-lite,gemini-2.5-flash
GEMINI_CHUNK_SIZE=4000
GEMINI_TRANSLATE_CONCURRENCY=1
```
