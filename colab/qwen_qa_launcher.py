"""
🚀 Google Colab / Kaggle 1-Click Launcher for Qwen Semantic QA Worker
Tự động cài đặt thư viện, cấu hình GPU, nạp Secret và khởi chạy Qwen QA Worker.
"""

import os
import pathlib
import subprocess
import sys
import time
from importlib.util import find_spec

# ======================= CẤU HÌNH TÙY CHỌN =======================
WORKER_INDEX = int(os.environ.get("WORKER_INDEX", "0"))
TOTAL_WORKERS = int(os.environ.get("TOTAL_WORKERS", "1"))
MODEL_ID = os.environ.get("QA_MODEL_ID", "Qwen/Qwen2.5-7B-Instruct")
QUANTIZATION = os.environ.get("QA_QUANTIZATION", "bitsandbytes")
if TOTAL_WORKERS < 1 or WORKER_INDEX < 0 or WORKER_INDEX >= TOTAL_WORKERS:
    raise ValueError("WORKER_INDEX phải nằm trong khoảng 0..TOTAL_WORKERS-1.")

# Cấu hình Secret (Nếu chưa set trong Colab Secrets, có thể điền trực tiếp ở đây)
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
# ================================================================

# Thử lấy secret từ Google Colab userdata nếu có
try:
    from google.colab import userdata
    R2_ENDPOINT = userdata.get("R2_ENDPOINT") or R2_ENDPOINT
    R2_ACCESS_KEY_ID = userdata.get("R2_ACCESS_KEY_ID") or R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY = userdata.get("R2_SECRET_ACCESS_KEY") or R2_SECRET_ACCESS_KEY
    R2_BUCKET = userdata.get("R2_BUCKET") or R2_BUCKET
    SUPABASE_URL = userdata.get("SUPABASE_URL") or SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY = userdata.get("SUPABASE_SERVICE_ROLE_KEY") or SUPABASE_SERVICE_ROLE_KEY
except Exception:
    pass

CONFIG = {
    "R2_ENDPOINT": R2_ENDPOINT,
    "R2_ACCESS_KEY_ID": R2_ACCESS_KEY_ID,
    "R2_SECRET_ACCESS_KEY": R2_SECRET_ACCESS_KEY,
    "R2_BUCKET": R2_BUCKET,
    "SUPABASE_URL": SUPABASE_URL,
    "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_SERVICE_ROLE_KEY,
    "QA_MODEL_ID": MODEL_ID,
    "QA_QUANTIZATION": QUANTIZATION,
    "WORKER_INDEX": str(WORKER_INDEX),
    "TOTAL_WORKERS": str(TOTAL_WORKERS),
    "PYTHONUNBUFFERED": "1"
}

missing = [k for k, v in CONFIG.items() if not v and k in (
    "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET",
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"
)]
if missing:
    raise RuntimeError(f"Thiếu cấu hình bắt buộc: {', '.join(missing)}")

print("[1/4] Kiểm tra thư viện AI & Cloud...", flush=True)
required_packages = {
    "transformers": "transformers",
    "accelerate": "accelerate",
    "boto3": "boto3",
    "requests": "requests",
    "torch": "torch",
    "bitsandbytes": "bitsandbytes"
}

missing_packages = [pkg for mod, pkg in required_packages.items() if find_spec(mod) is None]
if missing_packages:
    print(f"[2/4] Đang cài đặt thư viện: {', '.join(missing_packages)}...", flush=True)
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "-q",
        "--disable-pip-version-check",
        "--no-input",
        *missing_packages
    ])
else:
    print("[2/4] Tất cả thư viện đã có sẵn.", flush=True)

print("[3/4] Kiểm tra GPU...", flush=True)
import torch
if torch.cuda.is_available():
    print(f"✓ GPU sẵn sàng: {torch.cuda.get_device_name(0)} (VRAM: {torch.cuda.get_device_properties(0).total_memory / (1024**3):.1f} GB)", flush=True)
else:
    raise RuntimeError("Chưa bật GPU. Hãy vào Runtime > Change runtime type > T4 GPU rồi chạy lại.")

os.environ.update(CONFIG)

worker_script = pathlib.Path(__file__).resolve().parent / "qwen_qa_worker.py"
print(f"[4/4] Khởi động Qwen Semantic QA Worker: {worker_script}...", flush=True)

process = subprocess.Popen(
    [sys.executable, "-u", str(worker_script)],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    encoding="utf-8",
    errors="replace",
    bufsize=1
)

assert process.stdout is not None
for line in process.stdout:
    print(line, end="", flush=True)

return_code = process.wait()
if return_code != 0:
    raise subprocess.CalledProcessError(return_code, process.args)
