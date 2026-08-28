# 🚀 Hướng Dẫn Dịch Truyện Bằng Model HachimiMT Trên Google Colab (Zero-Click)

Hệ thống đã hỗ trợ quy trình **Dịch Tự Động 100% (Zero-Click)**: Bạn **KHÔNG CẦN COPY DÁN URL THỦ CÔNG** nữa!

---

## 🌟 Có 2 Cách Sử Dụng Siêu Tiện Lợi:

### Cách 1: Dịch Tự Động 100% Trực Tiếp Trên Colab (KHUYÊN DÙNG NHẤT ⭐)
> Không cần máy tính cá nhân bật, không cần chạy kịch bản local, không cần đường link URL.

1. Mở [Google Colab](https://colab.research.google.com/) ➔ Upload file notebook [`colab/hachimi_colab_server.ipynb`](file:///d:/Trans/epub-translator/colab/hachimi_colab_server.ipynb).
2. Menu **Runtime** ➔ **Change runtime type** ➔ Chọn **T4 GPU** ➔ Bấm **Save**.
3. Chạy **Ô 1** (Cài đặt) và **Ô 2** (Dịch tự động 100%).
4. **Xong!** Colab sẽ tự động:
   * Lấy các chương raw cần dịch từ Cloudflare R2 / Supabase.
   * Dịch với tốc độ GPU T4 cực nhanh (>300-500 từ/giây).
   * Tự động lưu bản dịch tiếng Việt hoàn chỉnh lên R2 và cập nhật tiến độ Supabase theo thời gian thực.

---

### Cách 2: Chạy Server Colab + Tự Động Bắt URL Về Máy Tính (Zero-Click Server)
> Colab tự động ghi nhớ URL mới lên Cloudflare R2, script máy tính tự động bắt URL mà không cần bạn copy-paste.

1. Trên Colab, chạy **Ô 1** và **Ô 3** (Khởi chạy Server API).
2. Khi đường hầm Cloudflare Tunnel khởi tạo xong, Colab tự động gửi URL lên R2.
3. Ở máy tính cá nhân, bạn chỉ cần gõ lệnh dịch bình thường:
   ```bash
   node scripts/hachimi-translate.js --continuous
   ```
   *(Script sẽ tự động tìm thấy URL Colab đang hoạt động mà không cần bạn cấu hình gì thêm!)*
```bash
# Dịch tất cả các bộ truyện còn chương chờ
node scripts/hachimi-translate.js

# Dịch một bộ truyện cụ thể
node scripts/hachimi-translate.js --book <book_id>

# Dịch 1 chương cụ thể
node scripts/hachimi-translate.js --book <book_id> --chapter 1

# Chạy chế độ vòng lặp liên tục (tự động quét và dịch khi có chương mới)
node scripts/hachimi-translate.js --continuous
```

### Cách 2: Chạy translation worker tổng hợp
```bash
node scripts/translate-worker.js --continuous
```

### Cách 3: Dịch tự động khi Upload / Ingest EPUB mới
Trong file `.env`:
```env
INGEST_TRANSLATE=true
TRANSLATION_PROVIDER=hachimi
HACHIMI_API_URL=https://example-random-subdomain.trycloudflare.com
```
Khi bạn chạy crawler hoặc tải file EPUB lên qua Admin Studio, hệ thống sẽ tự động gọi Colab để dịch toàn bộ chương.

---

## 5. Lưu Ý & Khắc Phục Sự Cố

- **Google Colab ngắt kết nối sau vài giờ:** Colab miễn phí có thể ngắt kết nối sau thời gian không tương tác. Bạn chỉ cần mở lại Colab và ấn **Run all**, sau đó cập nhật link `HACHIMI_API_URL` mới vào `.env`.
- **Tốc độ dịch:** Với CTranslate2 GPU T4, tốc độ đạt **>200-500 tokens/giây**, có thể dịch một chương 3.000 chữ chỉ trong **~1-3 giây**.
- **Không tốn chi phí:** 100% miễn phí, không giới hạn request hay quota như Gemini/OpenAI.
