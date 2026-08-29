# Tái dịch Hachimi chất lượng v2, giữ nguyên Gemini

Worker chuẩn là `scripts/colab_standalone_worker.py`. Không dán khóa R2 hoặc
Supabase trực tiếp vào notebook.

## 1. Thu hồi khóa cũ

Nếu khóa từng xuất hiện trong notebook, tin nhắn, log hoặc Git, hãy tạo khóa R2
mới, rotate Supabase service-role secret, cập nhật các GitHub/Cloudflare secret
đang sử dụng rồi vô hiệu hóa khóa cũ.

## 2. Tạo Colab Secrets

Trong Google Colab, mở biểu tượng chìa khóa **Secrets**, tạo và cấp notebook
quyền truy cập cho năm giá trị:

- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 3. Chạy cell

Mỗi notebook đặt `WORKER_INDEX` khác nhau từ `0` đến `TOTAL_WORKERS - 1`.

```python
#@title Hachimi quality-v2 worker
WORKER_INDEX = 0 #@param {type:"integer"}
TOTAL_WORKERS = 7 #@param {type:"integer"}
MODEL_ID = "ngocdang83/HachimiMT-60-QT" #@param ["ngocdang83/HachimiMT-60-QT", "ngocdang83/HachimiMT-60-zh-vi"]

!pip install -q ctranslate2 transformers sentencepiece huggingface_hub boto3 requests

import os, pathlib, subprocess
from google.colab import userdata

for name in [
    "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"
]:
    os.environ[name] = userdata.get(name)

os.environ["WORKER_INDEX"] = str(WORKER_INDEX)
os.environ["TOTAL_WORKERS"] = str(TOTAL_WORKERS)
os.environ["HACHIMI_MODEL_ID"] = MODEL_ID
os.environ["RETRANSLATE_NAME_LOCK"] = "true"

repo = pathlib.Path("/content/AutoTranslate")
if repo.exists():
    subprocess.run(["git", "-C", str(repo), "pull", "--ff-only"], check=True)
else:
    subprocess.run(["git", "clone", "https://github.com/PhucPM89/AutoTranslate.git", str(repo)], check=True)

subprocess.run(["python", "-u", str(repo / "scripts/colab_standalone_worker.py")], cwd=repo, check=True)
```

## Cách đơn giản: ghi khóa thẳng trong một cell

Nếu chấp nhận lưu khóa trong notebook riêng, mở file
`colab/hachimi_private_launcher.py`, thay sáu giá trị trong khối **CHỈ SỬA KHỐI
NÀY**, sau đó copy toàn bộ file vào một cell Colab và chạy. Không cần tạo Colab
Secrets và không cần chạy thêm cell nào.

File này đã được `.gitignore`; tuyệt đối không dùng `git add -f`, không chia sẻ
notebook và không sử dụng lại những khóa từng xuất hiện trong chat hoặc log.

## Quy tắc an toàn

- Chương có `provider=gemini` hoặc model chứa `gemini` luôn được giữ nguyên, kể
  cả trong chiến dịch tái dịch toàn thư viện.
- `qaReviewed=true` đứng một mình không còn được coi là bằng chứng Gemini. Các
  chương Hachimi bị đánh dấu nhầm bởi bộ đánh giá cũ vẫn được tái dịch.
- Chỉ chương Hachimi/convert/cũ chưa có `translationVersion=hachimi-quality-v2` được
  tái dịch.
- Glossary được khai thác từ toàn bộ bản gốc của từng bộ trước khi dịch.
- Cache `glossary-meta/<bookId>.json` lưu revision, số chương, dấu vân tay danh
  sách chương và phiên bản miner. Cache hợp lệ thì lần chạy sau bỏ qua quét toàn
  bộ `.original.json`; bản gốc chỉ được tải lười cho chương thực sự cần dịch.
- Cache tự xây lại khi có chương mới, đổi revision hoặc nâng phiên bản miner.
- Đoạn dài được tách theo câu và ghép lại đầy đủ, không còn dùng `truncation`
  làm mất phần cuối; decoder dùng beam search và bộ lọc chống lặp.
- Heuristic vẫn gắn `qaRequired=true` cho lỗi hình thức, nhưng mọi chương
  Hachimi quality-v2 đều được đưa vào semantic QA, kể cả khi heuristic đạt.
- Mỗi chương được checkpoint sau khi upload. Colab ngắt thì chạy lại cùng
  `WORKER_INDEX` và `TOTAL_WORKERS`; chương hoàn tất sẽ được bỏ qua.
- Colab in `[Quét]` khi đang tải bản gốc, `→` khi bắt đầu một chương, tiến độ
  từng batch, và `✓` sau khi chương đã được upload/checkpoint.
- Không thay đổi `TOTAL_WORKERS` giữa một chiến dịch vì phép chia bộ cho worker
  phụ thuộc vào giá trị này.

# Semantic QA sau Hachimi

Từ pipeline `semantic-v1`, mỗi chương do Hachimi `hachimi-quality-v2` tạo ra được đưa vào queue riêng của bộ truyện tại:

```text
jobs/{bookId}/semantic-review.json
```

Queue có lease, retry, fingerprint nội dung và checkpoint `approved`, vì vậy Colab hoặc GitHub Actions dừng giữa chừng không làm mất tiến độ. Chương có provenance Gemini vẫn được giữ nguyên.

Chạy pilot 20 chương:

```bash
npm run qa:pilot
```

Chạy một bộ và giới hạn 100 chương:

```bash
node scripts/gemini-qa-reviewer.js --book BOOK_ID --max-chapters 100
```

Chạy thử chỉ để xem queue, không gọi Gemini và không ghi dữ liệu:

```bash
node scripts/gemini-qa-reviewer.js --dry-run --max-chapters 20
```

Mỗi bản Hachimi được đối chiếu trực tiếp với `.original.json`, glossary và ngữ cảnh chương trước. Nếu Gemini sửa nội dung, bản sửa phải vượt qua một lượt semantic verification thứ hai mới được ghi `qaStatus=approved`.
