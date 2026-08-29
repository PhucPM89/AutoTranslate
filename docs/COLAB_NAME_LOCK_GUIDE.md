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
- `translatedChapters` và trạng thái `Hoàn thành` chỉ tính chương đã semantic
  QA `approved` (hoặc chương Gemini có provenance rõ ràng). Draft Hachimi được
  theo dõi riêng bằng `draftedChapters` và không còn làm sách hoàn thành sớm.
- Mỗi chương được checkpoint sau khi upload. Colab ngắt thì chạy lại cùng
  `WORKER_INDEX` và `TOTAL_WORKERS`; chương hoàn tất sẽ được bỏ qua.
- Colab in `[Quét]` khi đang tải bản gốc, `→` khi bắt đầu một chương, tiến độ
  từng batch, và `✓` sau khi chương đã được upload/checkpoint.
- Không thay đổi `TOTAL_WORKERS` giữa một chiến dịch vì phép chia bộ cho worker
  phụ thuộc vào giá trị này.

# Qwen Semantic QA sau Hachimi (mặc định)

Từ pipeline `semantic-v2`, mỗi chương do Hachimi `hachimi-quality-v2` tạo ra được đưa vào queue riêng của bộ truyện tại:

```text
jobs/{bookId}/semantic-review.json
```

Queue có lease, retry, fingerprint nội dung và checkpoint `approved`, vì vậy Colab dừng giữa chừng không làm mất tiến độ. Chương có provenance Gemini đã duyệt vẫn được giữ nguyên.

Qwen là tầng biên dịch lại kiêm reviewer chính. Mọi chương đều được Qwen viết
lại toàn bộ từ bản gốc; bản Hachimi chỉ được dùng làm tài liệu tham khảo để tránh
bỏ sót cách hiểu. Không có nhánh publish thẳng bản Hachimi dù review ban đầu có
thể đạt. Nên chạy Hachimi và Qwen ở hai Colab GPU riêng vì cả hai đều cần VRAM.
Qwen chưa thấy việc cho đến khi Hachimi hoàn thành draft của ít nhất một bộ; có
thể mở worker Qwen trước và để nó chờ queue.

Trong Colab Qwen, clone/pull cùng repository rồi chạy launcher:

```bash
!python -u /content/AutoTranslate/colab/qwen_qa_launcher.py
```

Launcher mặc định dùng `Qwen/Qwen2.5-7B-Instruct-AWQ`, tự cài dependency cần
thiết và từ chối chạy nếu notebook chưa bật GPU. Nếu repository nằm ở đường dẫn
khác, chạy entry point trực tiếp từ thư mục repository:

```bash
%cd /content/AutoTranslate
!python -u scripts/qwen_qa_worker.py
```

Pilot một lượt, tối đa 20 chương (máy chạy lệnh này phải có NVIDIA GPU):

```bash
npm run qa:pilot
```

Chạy liên tục:

```bash
npm run qa:daemon
```

Qwen dịch lại từ `.original.json` với glossary, story bible và ngữ cảnh chương
trước; sau đó một lượt Qwen riêng đối chiếu toàn bộ bản mới với bản gốc. Chỉ bản
đạt ít nhất 9 ở accuracy, completeness, fluency và terminology, không có lỗi
major/critical và vượt quality gate hình thức mới được ghi `qaStatus=approved`.

Reviewer kiểm tra cả tiêu đề và nội dung. Quality gate hình thức luôn chạy ngay
trước publish, kể cả khi model đánh `pass`; bản còn chữ Hán, token name-lock hoặc
có dấu hiệu bị cụt không thể đi thẳng ra reader.

Qwen đọc draft tại `drafts/{bookId}/r{revision}/ch/{n}.json`, glossary tại
`glossary/{bookId}.json` và chỉ publish sau lượt verification đạt `pass`. Bản
publish mang `provider=qwen-rewrite`, `translationVersion=qwen-full-rewrite-v1`
và `semanticReview.rewriteMode=full` để phân biệt rõ với draft Hachimi.
Có thể chạy nhiều Qwen Colab bằng `WORKER_INDEX/TOTAL_WORKERS`; mỗi notebook phải
có `WORKER_INDEX` khác nhau và phải giữ nguyên `TOTAL_WORKERS` trong suốt chiến
dịch.

Gemini chỉ còn là audit thủ công, không có lịch GitHub Actions tự động. Khi cần
đối chiếu một mẫu 20 chương bằng Gemini:

```bash
npm run qa:gemini:audit
```

Gemini và Qwen vẫn dùng chung semantic-review lock theo từng bộ, nên không chạy
audit Gemini trên đúng bộ mà Qwen đang xử lý.

`colab/hachimi_worker.py` chỉ còn là entry point tương thích và tự chuyển sang
`scripts/colab_standalone_worker.py`; nó không còn publish trực tiếp bản Hachimi.
