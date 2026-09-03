# Gemini Web Translator

Tool này dùng Playwright điều khiển Gemini Web bằng một Chrome profile riêng, mô phỏng quy trình thủ công: mở Gemini, dán prompt dịch, gửi, đợi kết quả ổn định rồi đưa bản dịch về pipeline sẵn có.

Nó không dùng Gemini API key. Lần đầu chạy, Chrome sẽ mở ra để bạn tự đăng nhập Google/Gemini. Tool không xử lý CAPTCHA, không né rate limit và chạy tuần tự một phiên trình duyệt để giảm rủi ro khóa tài khoản.

## Chạy thử một file

```powershell
npm run translate:gemini-web -- --file .\chapter.txt --out .\chapter.vi.txt --book-title "Tên truyện"
```

Nếu Composer của Gemini chưa hiện, đăng nhập trong cửa sổ Chrome vừa mở rồi chạy lại lệnh.

## Bật cho worker 24/7

Trong `.env.local`:

```env
TRANSLATION_PROVIDER=gemini-web
GEMINI_WEB_HEADLESS=false
GEMINI_WEB_USER_DATA_DIR=.cache/gemini-web-profile
GEMINI_WEB_TIMEOUT_MS=180000
GEMINI_WEB_STABLE_MS=3000
GEMINI_WEB_MAX_ATTEMPTS=2
GEMINI_WEB_SPACING_MS=3000
```

Sau đó chạy worker như cũ:

```powershell
node scripts/translate-worker.js --once --book <book-id>
```

Hoặc chạy continuous nếu máy được để online:

```powershell
node scripts/translate-worker.js --continuous
```

## Chạy 24/7

Daemon chuyên cho Gemini Web tự ép worker chạy tuần tự và tự restart sau mỗi phiên. Mặc định chạy đủ 7 ngày mỗi tuần:

```powershell
npm run translate:gemini-web:daemon
```

Hoặc mở file:

```powershell
.\run-gemini-web-daemon.bat
```

Tùy chỉnh:

```env
GEMINI_WEB_SESSION_MINUTES=300
GEMINI_WEB_RESTART_DELAY_MS=15000
GEMINI_WEB_REST_DAY=none
```

Đặt `GEMINI_WEB_REST_DAY=sun` nếu muốn nghỉ Chủ Nhật hoặc đổi sang `mon/tue/wed/thu/fri/sat`. Khi chạy theo Gemini Web, worker tự dùng `batchSize=1` và `GEMINI_WEB_SPACING_MS` để tránh gửi request dồn dập như API.

## Tự chạy khi mở Windows

Cài autostart bằng Startup Shortcut. Cách này hiện tên `Trạm Chữ Gemini Web Translator` trong **Task Manager > Startup apps**, nên có thể bật/tắt trực tiếp trong Windows:

```powershell
npm run translate:gemini-web:autostart:install
```

Shortcut chạy lúc user đăng nhập Windows, dùng Chrome profile đã đăng nhập Gemini và ghi log vào:

```text
logs/gemini-web-daemon.log
```

Khởi động thủ công ngay:

```powershell
npm run translate:gemini-web:daemon
```

Dừng daemon đang chạy:

```powershell
npm run translate:gemini-web:stop
```

Gỡ autostart khỏi Startup apps:

```powershell
npm run translate:gemini-web:autostart:uninstall
```

Nếu cần dùng Task Scheduler thay vì Startup apps:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-gemini-web-autostart.ps1 -Mode ScheduledTask
```

Lưu ý: Gemini Web cần phiên Windows đã đăng nhập. Nếu máy chưa login user, daemon local sẽ không chạy được Chrome/session Gemini ổn định.

## Web và API chạy cùng nhau thế nào

Gemini Web daemon dùng cùng queue dịch chính, nhưng khi chạy nó ghi heartbeat vào `jobs/gemini-web-active.json`. Cloud/API translation worker sẽ đọc heartbeat này trước khi dịch; nếu heartbeat còn hạn, API worker tự dừng sớm để không tranh cùng chương.

Nếu máy local tắt, sleep hoặc mất mạng, heartbeat không được gia hạn. Sau `GEMINI_WEB_LOCK_TTL_MS` mặc định 10 phút, GitHub Actions translation worker theo lịch sẽ tiếp quản queue bằng API key như trước. Crawler vẫn tiếp tục thêm/cập nhật chương vào R2; khi máy bật lại, Gemini Web daemon lại ghi heartbeat và dịch tiếp các chương còn pending.

## Khi giao diện Gemini thay đổi

Các selector có thể override bằng env mà không cần sửa code:

```env
GEMINI_WEB_INPUT_SELECTOR=rich-textarea [contenteditable='true']
GEMINI_WEB_SEND_SELECTOR=button[aria-label*='Send']
GEMINI_WEB_RESPONSE_SELECTOR=message-content
```

Nếu kết quả bị bắt nhầm, ưu tiên chỉnh `GEMINI_WEB_RESPONSE_SELECTOR` tới node chứa riêng câu trả lời cuối cùng.
