"""
🚀 QWEN AUTONOMOUS SEMANTIC QA WORKER
Chạy 100% tự động trên Google Colab / Kaggle GPU (Tesla T4 16GB / V100 / A100) hoặc máy cá nhân.
- Tự động lấy các chương chờ QA từ Cloudflare R2 Semantic Queue.
- Dùng Hachimi làm bản dịch nền, nhưng Qwen bắt buộc biên dịch lại toàn bộ chương từ bản gốc.
- Chạy một lượt Qwen độc lập để xác minh bản biên dịch lại trước khi publish.
- Cập nhật Story Bible, Story Context và Translation Memory.
- Checkpoint từng chương lên R2, hỗ trợ chạy song song nhiều Colab (Sharding) và chịu lỗi ngắt kết nối.
"""

import os
import sys
import time
import json
import math
import re
import hashlib
import subprocess
from typing import Dict, Any, Optional, List
from pathlib import Path

import importlib.util
deps_to_check = ["boto3", "torch", "transformers", "bitsandbytes", "accelerate"]
missing = [dep for dep in deps_to_check if importlib.util.find_spec(dep) is None]

if missing:
    print(f"Đang cài đặt các thư viện cần thiết: {', '.join(missing)}...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "boto3", "torch", "transformers", "bitsandbytes", "accelerate", "huggingface_hub", "sentencepiece"])

import boto3
import torch
import transformers

# (Đã loại bỏ tham chiếu __file__ để chạy trên Colab)

try:
    from hachimi_text import classify_source_document, evaluate_translation_quality, parse_model_json
except ImportError:
    def evaluate_translation_quality(source: str, translation: str) -> Dict[str, Any]:
        original = str(source or "").strip()
        output = str(translation or "").strip()
        issues = []
        if not output:
            return {"qaRequired": True, "qaIssues": ["Nội dung rỗng"], "qualityScore": 0}
        han_count = len(re.findall(r"[\u3400-\u9fff]", output))
        if han_count:
            issues.append(f"Sót {han_count} chữ Hán chưa dịch")
        if re.search(r"__?\s*TC[ _-]*NAME", output, re.IGNORECASE):
            issues.append("Còn token khóa tên chưa được khôi phục")
        if original and len(original) >= 250:
            ratio = len(output) / len(original)
            if ratio < 0.60:
                issues.append(f"Bản dịch có thể bị cụt ({round(ratio * 100)}% bản gốc)")
            elif ratio > 3.5:
                issues.append(f"Bản dịch dài bất thường ({round(ratio * 100)}% bản gốc)")
        score = max(0, 10 - min(10, len(issues) * 2.5))
        return {"qaRequired": bool(issues), "qaIssues": issues, "qualityScore": score}

    def classify_source_document(source_title: str, source: str) -> str:
        title = str(source_title or "").strip()
        content = str(source or "").strip()
        markers = ("书名：", "作者：", "标签：", "已完结", "作品简介", "内容简介")
        if title in {"简介", "目录", "作品正文", "内容简介", "书籍简介", "前言", "序言"}:
            return "front_matter"
        return "front_matter" if len(content) <= 600 and sum(m in content for m in markers) >= 2 else "chapter"

    def parse_model_json(raw: str) -> Dict[str, Any]:
        clean = re.sub(r"^```(?:json)?\s*", "", str(raw or "").strip(), flags=re.IGNORECASE)
        clean = re.sub(r"\s*```$", "", clean).strip()
        match = re.search(r"\{[\s\S]*\}", clean)
        if not match:
            raise ValueError("Không tìm thấy JSON object trong phản hồi model")
        return json.loads(match.group(0), strict=False)

# ---------------------------------------------------------------------------
# Cấu hình Môi trường & Secret
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")

missing_config = [name for name, value in {
    "SUPABASE_URL": SUPABASE_URL,
    "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_KEY,
    "R2_ENDPOINT": R2_ENDPOINT,
    "R2_ACCESS_KEY_ID": R2_ACCESS_KEY_ID,
    "R2_SECRET_ACCESS_KEY": R2_SECRET_ACCESS_KEY,
    "R2_BUCKET": R2_BUCKET
}.items() if not value]
if missing_config:
    raise RuntimeError("Thiếu cấu hình môi trường: " + ", ".join(missing_config))

QA_MODEL_ID = os.environ.get("QA_MODEL_ID", "Qwen/Qwen2.5-7B-Instruct")
QA_QUANTIZATION = os.environ.get("QA_QUANTIZATION", "bitsandbytes").strip().lower()
WORKER_INDEX = int(os.environ.get("WORKER_INDEX", "0"))
TOTAL_WORKERS = max(1, int(os.environ.get("TOTAL_WORKERS", "1")))
if WORKER_INDEX < 0 or WORKER_INDEX >= TOTAL_WORKERS:
    raise ValueError("WORKER_INDEX phải nằm trong khoảng 0..TOTAL_WORKERS-1.")
configured_max_chapters = int(os.environ.get("QA_MAX_CHAPTERS", "50"))
MAX_CHAPTERS_PER_RUN = configured_max_chapters if configured_max_chapters > 0 else sys.maxsize
RUN_ONCE = os.environ.get("QA_RUN_ONCE", "false").lower() == "true"
REQUIRE_GPU = os.environ.get("QA_REQUIRE_GPU", "true").lower() != "false"
LEASE_MS = int(os.environ.get("QA_LEASE_MS", str(15 * 60 * 1000)))
MAX_ATTEMPTS = int(os.environ.get("QA_MAX_ATTEMPTS", "4"))
MAX_REWRITE_PASSES = max(1, int(os.environ.get("QA_MAX_REWRITE_PASSES", "3")))
RETRY_FAILED = os.environ.get("QA_RETRY_FAILED", "true").lower() != "false"
REVIEW_VERSION = "semantic-v3"
EXPECTED_DRAFT_VERSION = os.environ.get("HACHIMI_DRAFT_VERSION", "hachimi-quality-v3")
CURSOR_KEY = "jobs/semantic-review-cursor.json"
STATUS_KEY = "jobs/translate-status.json"
OWNER_ID = f"qwen-colab-w{WORKER_INDEX}-{os.getpid()}"

# ---------------------------------------------------------------------------
# S3 / R2 Storage & Supabase Client
# ---------------------------------------------------------------------------
def get_s3_client():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"})
    )

s3_client = None

def r2_get_json(key: str) -> Optional[Dict[str, Any]]:
    global s3_client
    if s3_client is None:
        s3_client = get_s3_client()
    try:
        res = s3_client.get_object(Bucket=R2_BUCKET, Key=key)
        return json.loads(res["Body"].read().decode("utf-8"))
    except Exception:
        return None

def r2_put_json(key: str, data: Dict[str, Any], cache_control: str = "no-cache", if_none_match: str = ""):
    global s3_client
    if s3_client is None:
        s3_client = get_s3_client()
    payload = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    options = dict(
        Bucket=R2_BUCKET,
        Key=key,
        Body=payload,
        ContentType="application/json; charset=utf-8",
        CacheControl=cache_control
    )
    if if_none_match:
        options["IfNoneMatch"] = if_none_match
    s3_client.put_object(**options)

def r2_head(key: str) -> Optional[Dict[str, Any]]:
    global s3_client
    if s3_client is None:
        s3_client = get_s3_client()
    try:
        return s3_client.head_object(Bucket=R2_BUCKET, Key=key)
    except Exception:
        return None

def r2_delete(key: str, if_match: str = ""):
    global s3_client
    if s3_client is None:
        s3_client = get_s3_client()
    options = {"Bucket": R2_BUCKET, "Key": key}
    if if_match:
        options["IfMatch"] = if_match
    s3_client.delete_object(**options)

def r2_list_keys(prefix: str) -> List[str]:
    global s3_client
    if s3_client is None:
        s3_client = get_s3_client()
    keys = []
    paginator = s3_client.get_paginator("list_objects_v2")
    try:
        for page in paginator.paginate(Bucket=R2_BUCKET, Prefix=prefix):
            for item in page.get("Contents", []):
                keys.append(item["Key"])
    except Exception as e:
        print(f"⚠️ Lỗi list R2: {e}")
    return sorted(keys)

def supabase_patch(endpoint: str, body: Dict[str, Any]):
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    import requests
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{endpoint}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    try:
        requests.patch(url, headers=headers, json=body, timeout=15)
    except Exception as e:
        print(f"⚠️ [Supabase Error] {e}")

# ---------------------------------------------------------------------------
# Tiện ích Quản lý Hàng đợi (Semantic Queue & Fingerprint)
# ---------------------------------------------------------------------------
def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def content_fingerprint(revision: int, chapter_num: int, translation_version: str, content: str) -> str:
    payload = "\0".join([str(revision), str(chapter_num), str(translation_version or ""), str(content or "")])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]

def is_protected_gemini(doc: Optional[Dict[str, Any]]) -> bool:
    if not doc:
        return False
    provider = str(doc.get("provider") or "").lower()
    model = str(doc.get("model") or "").lower()
    return provider == "gemini" or "gemini" in model

def review_lock_key(book_id: str) -> str:
    return f"jobs/{book_id}/semantic-review.lock.json"

def acquire_review_lock(book_id: str, owner: str, lease_seconds: int = 3600) -> bool:
    key = review_lock_key(book_id)
    now_ms = int(time.time() * 1000)
    existing = r2_get_json(key)
    if existing and int(existing.get("expiresAtEpochMs") or 0) > now_ms:
        return existing.get("owner") == owner
    if existing:
        try:
            head = r2_head(key) or {}
            r2_delete(key, str(head.get("ETag") or ""))
        except Exception:
            return False
    lock = {
        "schema": 1,
        "bookId": book_id,
        "owner": owner,
        "acquiredAt": utc_now(),
        "expiresAtEpochMs": now_ms + lease_seconds * 1000,
    }
    try:
        r2_put_json(key, lock, cache_control="private, no-store", if_none_match="*")
        return True
    except Exception:
        return False

def refresh_review_lock(book_id: str, owner: str, lease_seconds: int = 3600) -> bool:
    key = review_lock_key(book_id)
    existing = r2_get_json(key)
    if not existing or existing.get("owner") != owner:
        return False
    existing["expiresAtEpochMs"] = int(time.time() * 1000) + lease_seconds * 1000
    existing["updatedAt"] = utc_now()
    r2_put_json(key, existing, cache_control="private, no-store")
    return True

def release_review_lock(book_id: str, owner: str):
    key = review_lock_key(book_id)
    existing = r2_get_json(key)
    if existing and existing.get("owner") == owner:
        head = r2_head(key) or {}
        try:
            r2_delete(key, str(head.get("ETag") or ""))
        except Exception:
            pass

def claim_next_review(queue: Dict[str, Any], owner: str, lease_ms: int = LEASE_MS) -> Optional[Dict[str, Any]]:
    if not queue or not isinstance(queue.get("entries"), list):
        return None
    now_ms = int(time.time() * 1000)
    now_iso = utc_now()
    valid_states = {"pending", "retrying", "processing"}
    if RETRY_FAILED:
        # A hard chapter must not be forgotten forever.  Once MAX_ATTEMPTS is
        # reached it sleeps on the existing bounded backoff, then receives a
        # fresh stochastic rewrite while the worker continues serving others.
        valid_states.add("failed")

    for entry in queue["entries"]:
        state = entry.get("state")
        if state not in valid_states:
            continue
        if state == "pending":
            pass
        elif state in {"retrying", "failed"}:
            avail = entry.get("availableAt")
            if avail:
                try:
                    avail_ms = time.mktime(time.strptime(avail, "%Y-%m-%dT%H:%M:%SZ")) * 1000
                    if avail_ms > now_ms:
                        continue
                except Exception:
                    pass
        elif state == "processing":
            lease_until = entry.get("leaseUntil")
            if lease_until:
                try:
                    until_ms = time.mktime(time.strptime(lease_until, "%Y-%m-%dT%H:%M:%SZ")) * 1000
                    if until_ms > now_ms:
                        continue
                except Exception:
                    pass
        else:
            continue

        entry["state"] = "processing"
        entry["attempts"] = int(entry.get("attempts") or 0) + 1
        entry["leaseOwner"] = str(owner)
        entry["leaseUntil"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime((now_ms + lease_ms) / 1000))
        entry["updatedAt"] = now_iso
        queue["updatedAt"] = now_iso
        return entry
    return None

def settle_review(queue: Dict[str, Any], chapter_num: int, result: Dict[str, Any], max_attempts: int = MAX_ATTEMPTS):
    entries = queue.get("entries", [])
    entry = next((item for item in entries if int(item.get("chapterNumber", -1)) == chapter_num), None)
    if not entry:
        return
    now_iso = utc_now()
    entry["leaseOwner"] = ""
    entry["leaseUntil"] = ""
    entry["updatedAt"] = now_iso

    if result.get("approved"):
        entry["state"] = "approved"
        entry["approvedAt"] = now_iso
        entry["reviewModel"] = str(result.get("model") or "")
        entry["decision"] = str(result.get("decision") or "pass")
        entry["scores"] = result.get("scores") or {}
        entry["issues"] = (result.get("issues") or [])[:20]
        entry["lastError"] = ""
    elif result.get("retryable"):
        entry["attempts"] = max(0, int(entry.get("attempts") or 0) - 1)
        entry["state"] = "retrying"
        entry["lastError"] = str(result.get("error") or "Worker bận")[:500]
        retry_delay = int(result.get("retryAfterSeconds") or 60)
        entry["availableAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + retry_delay))
    else:
        attempts = int(entry.get("attempts") or 0)
        entry["state"] = "failed" if attempts >= max_attempts else "retrying"
        entry["lastError"] = str(result.get("error") or "QA thất bại")[:500]
        retry_delay = min(6 * 3600, 30 * (2 ** min(10, max(0, attempts - 1))))
        entry["availableAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + retry_delay))
    queue["updatedAt"] = now_iso

# ---------------------------------------------------------------------------
# Tiện ích Cập nhật Story Bible, Story Context & Translation Memory
# ---------------------------------------------------------------------------
def merge_story_bible(current: Optional[Dict[str, Any]], updates: Dict[str, Any], book_id: str, chapter_num: int, evidence_text: str) -> Dict[str, Any]:
    bible = current if isinstance(current, dict) else {"schema": 1, "version": "story-bible-v1", "bookId": book_id, "characters": [], "worldTerms": []}
    by_name = {str(c.get("name", "")).lower(): dict(c) for c in bible.get("characters", []) if c.get("name")}

    for raw in (updates.get("characters") or []):
        name = str(raw.get("name") or "").strip()[:80]
        if not name:
            continue
        if evidence_text and (name not in evidence_text) and not any(alias in evidence_text for alias in raw.get("aliases", [])):
            continue
        key = name.lower()
        prev = by_name.get(key, {})
        aliases = list(set((prev.get("aliases") or []) + [str(a).strip() for a in (raw.get("aliases") or []) if a]))[:12]
        relationships = list(set((prev.get("relationships") or []) + [str(r).strip() for r in (raw.get("relationships") or []) if r]))[:20]
        gender = raw.get("gender") if raw.get("gender") in ("male", "female") else prev.get("gender", "unknown")
        by_name[key] = {
            "name": name,
            "aliases": aliases,
            "gender": gender,
            "role": str(raw.get("role") or prev.get("role") or "").strip()[:120],
            "relationships": relationships,
            "notes": str(raw.get("notes") or prev.get("notes") or "").strip()[:300],
            "lastSeenChapter": chapter_num
        }

    terms = {str(t.get("term", "")).lower(): dict(t) for t in bible.get("worldTerms", []) if t.get("term")}
    for raw in (updates.get("worldTerms") or []):
        term = str(raw.get("term") or "").strip()[:100]
        meaning = str(raw.get("meaning") or "").strip()[:240]
        if not term or not meaning:
            continue
        if evidence_text and (term not in evidence_text):
            continue
        terms[term.lower()] = {"term": term, "meaning": meaning, "lastSeenChapter": chapter_num}

    return {
        "schema": 1,
        "version": "story-bible-v1",
        "bookId": book_id,
        "characters": list(by_name.values())[-500:],
        "worldTerms": list(terms.values())[-500:],
        "updatedAt": utc_now()
    }

def append_story_context(current: Optional[Dict[str, Any]], chapter_num: int, summary: str, limit: int = 8) -> Dict[str, Any]:
    doc = current if isinstance(current, dict) else {"schema": 1, "chapters": []}
    chapters = [c for c in doc.get("chapters", []) if int(c.get("chapterNumber", -1)) != chapter_num]
    clean_summary = str(summary or "").strip()[:1200]
    if clean_summary:
        chapters.append({"chapterNumber": chapter_num, "summary": clean_summary, "approvedAt": utc_now()})
    return {
        "schema": 1,
        "chapters": sorted(chapters, key=lambda c: int(c.get("chapterNumber", 0)))[-limit:],
        "updatedAt": utc_now()
    }

def merge_translation_memory(current: Optional[Dict[str, Any]], updates: List[Dict[str, Any]], chapter_num: int, source: str, translation: str) -> Dict[str, Any]:
    doc = current if isinstance(current, dict) else {"schema": 1, "approvedOnly": True, "entries": []}
    by_source = {e["zh"]: dict(e) for e in doc.get("entries", []) if "zh" in e}

    for raw in updates or []:
        zh = str(raw.get("zh") or "").strip()[:80]
        vi = str(raw.get("vi") or "").strip()[:120]
        if not zh or not vi or len(zh) < 2 or (zh not in source) or (vi not in translation):
            continue
        by_source[zh] = {"zh": zh, "vi": vi, "approved": True, "chapterNumber": chapter_num, "updatedAt": utc_now()}

    return {
        "schema": 1,
        "approvedOnly": True,
        "entries": list(by_source.values())[-2000:],
        "updatedAt": utc_now()
    }


def story_bible_for_prompt(story_bible: Optional[Dict[str, Any]], max_chars: int = 8000) -> Dict[str, Any]:
    """Keep recent approved context without letting a mature book overflow Qwen context."""
    if not isinstance(story_bible, dict):
        return {}
    characters = list(story_bible.get("characters") or [])[-40:]
    world_terms = list(story_bible.get("worldTerms") or [])[-60:]
    compact = {"characters": characters, "worldTerms": world_terms}
    while len(json.dumps(compact, ensure_ascii=False)) > max_chars and (characters or world_terms):
        if len(characters) >= len(world_terms) and characters:
            characters.pop(0)
        elif world_terms:
            world_terms.pop(0)
    return compact

# ---------------------------------------------------------------------------
# Qwen Local QA Review Engine
# ---------------------------------------------------------------------------
class QwenReviewEngine:
    def __init__(self, model_id: str = QA_MODEL_ID):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

        print(f"\n⏳ [Qwen QA] Đang nạp mô hình: {model_id}...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        if self.device != "cuda" and REQUIRE_GPU:
            raise RuntimeError("Qwen QA cần GPU. Hãy bật Runtime > Change runtime type > T4 GPU.")
        self.tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)

        load_kwargs = {"device_map": "auto", "trust_remote_code": True, "low_cpu_mem_usage": True}
        if self.device == "cuda":
            load_kwargs["dtype"] = torch.float16
            if QA_QUANTIZATION == "bitsandbytes":
                load_kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_compute_dtype=torch.float16,
                    bnb_4bit_use_double_quant=True,
                )
        if "awq" in model_id.lower() and QA_QUANTIZATION == "bitsandbytes":
            raise RuntimeError(
                "Model AWQ không dùng chung với QA_QUANTIZATION=bitsandbytes. "
                "Hãy dùng Qwen/Qwen2.5-7B-Instruct hoặc đổi runtime sang Python <= 3.12 và tự cấu hình AutoAWQ."
            )

        self.model = AutoModelForCausalLM.from_pretrained(model_id, **load_kwargs)
        self.model.eval()
        configured_context = int(getattr(self.model.config, "max_position_embeddings", 32768) or 32768)
        tokenizer_context = int(getattr(self.tokenizer, "model_max_length", configured_context) or configured_context)
        self.max_context_tokens = min(configured_context, tokenizer_context, 32768)
        print("✅ Mô hình Qwen QA đã tải thành công và sẵn sàng trên GPU!\n")

    def _generate(self, messages: List[Dict[str, str]], max_new_tokens: int = 1024, temperature: float = 0.1) -> str:
        import torch
        prompt = self.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = self.tokenizer([prompt], return_tensors="pt").to(self.model.device)
        input_tokens = int(inputs.input_ids.shape[1])
        if input_tokens + max_new_tokens > self.max_context_tokens:
            raise RuntimeError(
                f"Prompt Qwen quá dài ({input_tokens} input + {max_new_tokens} output > "
                f"{self.max_context_tokens} context tokens); không được truncation làm mất nội dung."
            )

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=max(0.01, temperature),
                top_p=0.9,
                do_sample=temperature > 0.01
            )

        input_len = inputs.input_ids.shape[1]
        response_ids = outputs[0][input_len:]
        return self.tokenizer.decode(response_ids, skip_special_tokens=True).strip()

    def review_chapter(self, book_title: str, chapter_num: int, source: str, draft: str, glossary: Dict[str, str], story_bible: Optional[Dict[str, Any]] = None, recent_context: Optional[List[Dict[str, Any]]] = None, source_title: str = "", draft_title: str = "") -> Dict[str, Any]:
        matched_glossary = {k: v for k, v in (glossary or {}).items() if k in source}
        document_kind = classify_source_document(source_title, source)
        document_rule = (
            "Đây là TRANG ĐẦU SÁCH/METADATA, không phải chương truyện. Hãy kiểm tra bản dịch đúng từng nhãn và từng giá trị. "
            "Cách dịch tự nhiên ưu tiên: 书名=Tên sách, 作者=Tác giả, 标签=Thể loại, 已完结=Đã hoàn thành.\n"
            if document_kind == "front_matter"
            else "Đây là CHƯƠNG TRUYỆN; đánh giá theo văn phong tiểu thuyết tiếng Việt.\n"
        )
        system_msg = (
            "Bạn là tổng biên tập bản dịch tiểu thuyết Trung - Việt cao cấp.\n"
            "Ngôn ngữ đích duy nhất là TIẾNG VIỆT. Không yêu cầu đổi từ tiếng Việt sang tiếng Anh; "
            "ví dụ 爷爷 dịch là 'ông nội/ông', tuyệt đối không bắt đổi thành 'Grandpa'.\n"
            "Chỉ đối chiếu TIÊU ĐỀ BẢN DỊCH với TIÊU ĐỀ GỐC của tài liệu. "
            "Không yêu cầu nhét tên sách vào tiêu đề chương khi bản gốc không có.\n"
            + document_rule +
            "Hãy đối chiếu cả TIÊU ĐỀ và BẢN GỐC với BẢN NHÁP theo nghĩa từng câu, không chỉ kiểm tra văn phong.\n"
            "Kiểm tra: đủ ý, đúng chủ thể/hành động/phủ định/số lượng, xưng hô, giới tính, tên riêng và thuật ngữ.\n"
            "Không được đánh pass nếu bản nháp đảo nhân vật, gán nhầm lời thoại, lược ý hoặc thêm ý.\n"
            "Chỉ trả về JSON thuần theo đúng schema sau:\n"
            "{\n"
            '  "decision": "pass|repair",\n'
            '  "scores": {"accuracy": 0-10, "completeness": 0-10, "fluency": 0-10, "terminology": 0-10},\n'
            '  "issues": [{"type": "string", "severity": "minor|major|critical", "explanation": "string"}],\n'
            '  "chapterSummary": "Tóm tắt sự kiện/chủ thể quan trọng trong tối đa 120 từ",\n'
            '  "storyBibleUpdates": {"characters": [{"name": "", "aliases": [], "gender": "male|female|unknown", "role": "", "relationships": [], "notes": ""}], "worldTerms": [{"term": "", "meaning": ""}]},\n'
            '  "translationMemoryUpdates": [{"zh": "từ bản gốc", "vi": "từ bản dịch tương ứng"}]\n'
            "}\n"
            "Ngưỡng pass: accuracy >= 9, completeness >= 9, terminology >= 9, không có lỗi major/critical."
        )

        user_content_parts = [
            f"Truyện: {book_title or 'Chưa rõ'}; Chương: {chapter_num}",
            f"TIÊU ĐỀ GỐC: {source_title}",
            f"TIÊU ĐỀ BẢN NHÁP: {draft_title}",
            f"Glossary bắt buộc: {json.dumps(matched_glossary, ensure_ascii=False)}"
        ]
        if story_bible and (story_bible.get("characters") or story_bible.get("worldTerms")):
            user_content_parts.append(f"Story Bible đã duyệt: {json.dumps(story_bible_for_prompt(story_bible), ensure_ascii=False)}")
        if recent_context:
            user_content_parts.append(f"Tóm tắt các chương gần nhất: {json.dumps(recent_context[-4:], ensure_ascii=False)}")

        user_content_parts.append(f"BẢN GỐC:\n{source}")
        user_content_parts.append(f"BẢN DỊCH TIẾNG VIỆT CẦN KIỂM TRA:\n{draft}")

        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": "\n\n".join(user_content_parts)}
        ]

        raw = self._generate(messages, max_new_tokens=800, temperature=0.01)

        # Parse JSON
        try:
            parsed = parse_model_json(raw)
        except Exception as e:
            print(f"    ⚠️ [JSON Parse Exception] {e}")
            parsed = None

        if not parsed or not isinstance(parsed, dict) or parsed.get("decision") not in ("pass", "repair"):
            raise RuntimeError("Qwen trả semantic review không đúng schema JSON.")

        raw_scores = parsed.get("scores") if isinstance(parsed.get("scores"), dict) else {}
        scores = {}
        for k in ["accuracy", "completeness", "fluency", "terminology"]:
            try:
                value = float(raw_scores.get(k, 8))
                scores[k] = max(0.0, min(10.0, value)) if math.isfinite(value) else 8.0
            except Exception:
                scores[k] = 8.0

        issues = parsed.get("issues") if isinstance(parsed.get("issues"), list) else []
        has_serious = any(
            str(i.get("severity") or "").lower() in ("major", "critical")
            for i in issues if isinstance(i, dict)
        )
        can_pass = all(s >= 9 for s in scores.values()) and not has_serious

        if parsed.get("decision") == "pass" and not can_pass:
            parsed["decision"] = "repair"

        return {
            "decision": parsed.get("decision", "pass"),
            "scores": scores,
            "issues": issues,
            "chapterSummary": str(parsed.get("chapterSummary") or "").strip()[:1200],
            "storyBibleUpdates": parsed.get("storyBibleUpdates") if isinstance(parsed.get("storyBibleUpdates"), dict) else {},
            "translationMemoryUpdates": parsed.get("translationMemoryUpdates") if isinstance(parsed.get("translationMemoryUpdates"), list) else []
        }

    def rewrite_chapter(self, book_title: str, chapter_num: int, source: str, draft: str, glossary: Dict[str, str], story_bible: Optional[Dict[str, Any]] = None, recent_context: Optional[List[Dict[str, Any]]] = None, source_title: str = "", draft_title: str = "", repair_instructions: Optional[List[str]] = None) -> Dict[str, str]:
        matched_glossary = {k: v for k, v in (glossary or {}).items() if k in source}
        document_kind = classify_source_document(source_title, source)
        document_rule = (
            "Đây là trang đầu sách/metadata. Dịch nguyên vẹn từng nhãn và giá trị sang tiếng Việt; "
            "ưu tiên 书名=Tên sách, 作者=Tác giả, 标签=Thể loại, 已完结=Đã hoàn thành. Không viết thêm nội dung.\n"
            if document_kind == "front_matter"
            else "Đây là chương truyện; dùng văn phong tiểu thuyết Việt tự nhiên.\n"
        )
        system_msg = (
            "Bạn là dịch giả văn học Trung - Việt cao cấp. Hãy BIÊN DỊCH LẠI TOÀN BỘ tiêu đề và chương trực tiếp từ BẢN GỐC.\n"
            "Bản dịch đầu ra bắt buộc hoàn toàn bằng TIẾNG VIỆT; không chuyển từ tiếng Việt sang tiếng Anh.\n"
            "Tiêu đề đầu ra chỉ dịch TIÊU ĐỀ GỐC, không tự chèn tên sách vào tiêu đề.\n"
            + document_rule +
            "Bản Hachimi chỉ là tài liệu tham khảo để phát hiện cách hiểu hoặc chi tiết có thể bị bỏ sót; không sao chép máy móc câu chữ của nó.\n"
            "Bản xuất phải tự nhiên như tiểu thuyết Việt được biên tập chuyên nghiệp nhưng tuyệt đối trung thành: không tóm tắt, không lược ý, không thêm ý.\n"
            "Giữ đúng thứ tự đoạn, lời thoại, chủ thể, hành động, phủ định, số lượng, giới tính, xưng hô, tên riêng và thuật ngữ bắt buộc.\n"
            "Tự rà lại toàn bộ bản dịch trước khi trả lời; không để sót chữ Hán hoặc token kỹ thuật.\n"
            "Trong chuỗi JSON phải escape xuống dòng thành \\n; không đặt ký tự điều khiển thô trong chuỗi.\n"
            'Chỉ trả về JSON thuần: {"title":"tiêu đề tiếng Việt","content":"toàn bộ nội dung tiếng Việt"}.'
        )
        user_parts = [
            f"Truyện: {book_title or 'Chưa rõ'}; Chương: {chapter_num}\n"
            f"Glossary bắt buộc: {json.dumps(matched_glossary, ensure_ascii=False)}\n\n"
            f"TIÊU ĐỀ GỐC: {source_title}\n"
            f"TIÊU ĐỀ HACHIMI THAM KHẢO: {draft_title}"
        ]
        if story_bible and (story_bible.get("characters") or story_bible.get("worldTerms")):
            user_parts.append(f"Story Bible đã duyệt: {json.dumps(story_bible_for_prompt(story_bible), ensure_ascii=False)}")
        if recent_context:
            user_parts.append(f"Tóm tắt các chương gần nhất: {json.dumps(recent_context[-4:], ensure_ascii=False)}")
        if repair_instructions:
            user_parts.append(
                "CÁC LỖI CỦA BẢN TRƯỚC BẮT BUỘC SỬA:\n- "
                + "\n- ".join(str(item) for item in repair_instructions if item)
            )
        user_parts.append(f"BẢN GỐC PHẢI DỊCH:\n{source}")
        draft_label = "BẢN QWEN TRƯỚC CẦN SỬA" if repair_instructions else "BẢN HACHIMI CHỈ ĐỂ THAM KHẢO"
        user_parts.append(f"{draft_label}:\n{draft}")
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": "\n\n".join(user_parts)}
        ]
        raw = self._generate(messages, max_new_tokens=8192, temperature=0.18)
        try:
            parsed = parse_model_json(raw)
        except Exception as error:
            raise RuntimeError(f"Qwen trả JSON bản biên dịch lại không hợp lệ: {error}") from error
        title = str(parsed.get("title") or "").strip()
        content = str(parsed.get("content") or "").strip()
        if not title or not content:
            raise RuntimeError("Qwen trả bản biên dịch lại thiếu title hoặc content.")
        title_quality = evaluate_translation_quality("", title)
        content_quality = evaluate_translation_quality(source, content)
        issues_found = [f"Tiêu đề: {item}" for item in title_quality.get("qaIssues", [])] + content_quality.get("qaIssues", [])
        if issues_found:
            raise RuntimeError("Bản Qwen biên dịch lại không hợp lệ: " + "; ".join(issues_found))
        return {"title": title, "content": content}

# ---------------------------------------------------------------------------
# Vòng Lặp Worker Tự Động Xử Lý Toàn Bộ Hàng Đợi (Autonomous Main Loop)
# ---------------------------------------------------------------------------
class StaleJobGenerationError(RuntimeError):
    """Raised when a reset invalidates work already loaded in memory."""


def job_generation(state: Any) -> str:
    if not isinstance(state, dict):
        return ""
    return str(state.get("runGeneration") or state.get("resetAt") or "")


def assert_write_generation(book_id: str, expected_generation: str) -> None:
    reset_state = r2_get_json("jobs/reset-active.json")
    if (
        isinstance(reset_state, dict)
        and reset_state.get("active")
        and int(reset_state.get("expiresAtEpochMs") or 0) > int(time.time() * 1000)
    ):
        raise StaleJobGenerationError(
            "Toàn thư viện đang reset; Qwen hủy publish/checkpoint đang giữ trong RAM."
        )
    latest_job = r2_get_json(f"jobs/{book_id}/translation.json")
    latest_generation = job_generation(latest_job)
    if not isinstance(latest_job, dict) or latest_generation != expected_generation:
        raise StaleJobGenerationError(
            "Job đã đổi thế hệ trong lúc Qwen xử lý "
            f"({expected_generation!r} -> {latest_generation!r}); hủy kết quả cũ."
        )


def process_claim(
    queue_key: str,
    queue: Dict[str, Any],
    entry: Dict[str, Any],
    engine: QwenReviewEngine,
    expected_generation: Optional[str] = None,
) -> Dict[str, Any]:
    book_id = queue["bookId"]
    if expected_generation is None:
        expected_generation = job_generation(r2_get_json(f"jobs/{book_id}/translation.json"))
    rev = int(entry.get("revision") or queue.get("revision") or 1)
    ch_num = int(entry["chapterNumber"])

    if entry.get("translationVersion") != EXPECTED_DRAFT_VERSION:
        assert_write_generation(book_id, expected_generation)
        entry.update({
            "state": "superseded",
            "leaseOwner": "",
            "leaseUntil": "",
            "lastError": f"Draft cũ {entry.get('translationVersion') or 'không rõ'}; chờ {EXPECTED_DRAFT_VERSION}",
            "updatedAt": utc_now(),
        })
        queue["updatedAt"] = utc_now()
        r2_put_json(queue_key, queue, cache_control="private, no-store")
        print(
            f"  ↷ [{book_id}] ch {ch_num}: bỏ entry {entry.get('translationVersion') or 'legacy'}; "
            f"chờ draft {EXPECTED_DRAFT_VERSION}.",
            flush=True,
        )
        return {"skipped": True, "superseded": True}

    chapter_key = f"books/{book_id}/r{rev}/ch/{ch_num}.json"
    draft_key = f"drafts/{book_id}/r{rev}/ch/{ch_num}.json"
    orig_key = f"books/{book_id}/r{rev}/ch/{ch_num}.original.json"
    index_key = f"books/{book_id}/index.json"

    index = r2_get_json(index_key)
    published = r2_get_json(chapter_key)
    private_draft = r2_get_json(draft_key)
    original = r2_get_json(orig_key)
    glossary = r2_get_json(f"glossary/{book_id}.json") or {}
    story_bible = r2_get_json(f"story-bible/{book_id}.json")
    story_context = r2_get_json(f"story-context/{book_id}.json")

    if is_protected_gemini(published) and not entry.get("forceReplacePublished"):
        assert_write_generation(book_id, expected_generation)
        entry["state"] = "skipped_gemini"
        entry["updatedAt"] = utc_now()
        r2_put_json(queue_key, queue)
        print(f"  ↷ [{book_id}] ch {ch_num}: Provenance Gemini đã được bảo vệ, bỏ qua.")
        return {"skipped": True}

    chapter = private_draft or published
    if not chapter or not chapter.get("content") or not original or not original.get("content"):
        raise RuntimeError("Thiếu bản gốc hoặc bản dịch nháp Hachimi.")

    fp = content_fingerprint(rev, ch_num, chapter.get("translationVersion", ""), chapter.get("content", ""))
    if fp != entry.get("fingerprint"):
        raise RuntimeError("Bản Hachimi đã thay đổi so với fingerprint lúc vào queue.")

    book_title = (index or {}).get("title") or book_id

    # Qwen luôn biên dịch lại từ bản gốc. Nếu formal gate/verifier phát hiện lỗi,
    # dùng chính phản hồi đó cho lượt refinement thay vì retry mù ở vòng queue sau.
    print(f"  → [{book_id}] ch {ch_num}: Qwen đang biên dịch lại toàn chương từ bản gốc...")
    candidate_draft = chapter["content"]
    candidate_title = chapter.get("title", "")
    repair_instructions = []
    final_review = None
    title = ""
    content = ""
    t_rewrite = 0.0
    t_verify = 0.0
    last_error = None

    for rewrite_pass in range(1, MAX_REWRITE_PASSES + 1):
        rewrite_started = time.time()
        try:
            rewritten_doc = engine.rewrite_chapter(
                book_title=book_title,
                chapter_num=ch_num,
                source=original["content"],
                draft=candidate_draft,
                glossary=glossary,
                story_bible=story_bible,
                recent_context=(story_context or {}).get("chapters"),
                source_title=original.get("title", ""),
                draft_title=candidate_title,
                repair_instructions=repair_instructions,
            )
        except Exception as error:
            t_rewrite += time.time() - rewrite_started
            last_error = error
            if rewrite_pass >= MAX_REWRITE_PASSES:
                raise
            repair_instructions = [
                str(error),
                "Trả đúng một JSON object title/content; escape mọi xuống dòng trong chuỗi JSON.",
            ]
            print(
                f"    ↻ Lượt viết {rewrite_pass}/{MAX_REWRITE_PASSES} chưa hợp lệ; "
                "Qwen tự viết lại có hướng dẫn...",
                flush=True,
            )
            continue

        t_rewrite += time.time() - rewrite_started
        title = rewritten_doc["title"]
        content = rewritten_doc["content"]

        verify_started = time.time()
        try:
            final_review = engine.review_chapter(
                book_title=book_title,
                chapter_num=ch_num,
                source=original["content"],
                draft=content,
                glossary=glossary,
                story_bible=story_bible,
                recent_context=(story_context or {}).get("chapters"),
                source_title=original.get("title", ""),
                draft_title=title,
            )
        except Exception as error:
            t_verify += time.time() - verify_started
            last_error = error
            if rewrite_pass >= MAX_REWRITE_PASSES:
                raise
            candidate_draft = content
            candidate_title = title
            repair_instructions = [
                "Tự đối chiếu lại toàn bộ bản gốc và bản dịch trước khi trả lời.",
                "Bản sửa phải giúp lượt semantic verification trả JSON hợp lệ và đạt đủ bốn tiêu chí.",
            ]
            print(
                f"    ↻ Verify lượt {rewrite_pass}/{MAX_REWRITE_PASSES} lỗi ({error}); "
                "Qwen tự refinement...",
                flush=True,
            )
            continue
        t_verify += time.time() - verify_started
        if final_review.get("decision") == "pass":
            break

        explanations = [
            str(item.get("explanation") or item.get("type") or "lỗi semantic")
            for item in final_review.get("issues", [])
            if isinstance(item, dict)
        ]
        detail = "; ".join(explanations[:5])
        last_error = RuntimeError(
            f"Bản Qwen biên dịch lại chưa vượt semantic verification{': ' + detail if detail else '.'}"
        )
        if rewrite_pass >= MAX_REWRITE_PASSES:
            raise last_error
        candidate_draft = content
        candidate_title = title
        repair_instructions = explanations[:8] or ["Tự đối chiếu lại từng câu và sửa toàn bộ lỗi semantic."]
        print(
            f"    ↻ Semantic repair {rewrite_pass}/{MAX_REWRITE_PASSES}: "
            f"{detail or 'cần đối chiếu lại'}",
            flush=True,
        )

    if final_review is None or final_review.get("decision") != "pass":
        raise last_error or RuntimeError("Qwen chưa tạo được bản dịch vượt semantic verification.")
    print(
        f"    ✓ Biên dịch lại {t_rewrite:.1f}s | Verify {t_verify:.1f}s: pass "
        f"({rewrite_pass} lượt viết)",
        flush=True,
    )

    now = utc_now()
    scores = final_review.get("scores", {})
    avg_score = sum(scores.values()) / max(1, len(scores)) if scores else 9.0

    updated_chapter = {
        **chapter,
        "title": title,
        "content": content,
        "paragraphs": [p.strip() for p in content.split("\n") if p.strip()],
        "characters": len(content),
        "provider": "qwen-rewrite",
        "model": QA_MODEL_ID,
        "translationVersion": "qwen-full-rewrite-v1",
        "qaStatus": "approved",
        "qaReviewed": True,
        "qaReviewedAt": now,
        "qaRequired": False,
        "qaIssues": [],
        "qaIssuesFixed": ["Qwen đã biên dịch lại toàn bộ chương từ bản gốc"],
        "qualityScore": round(avg_score, 2),
        "semanticReview": {
            "version": REVIEW_VERSION,
            "decision": final_review.get("decision", "pass"),
            "model": QA_MODEL_ID,
            "scores": scores,
            "issues": final_review.get("issues", []),
            "rewriteMode": "full",
            "sourceDraftProvider": chapter.get("provider", "hachimi"),
            "reviewedAt": now
        },
        "updatedAt": now
    }

    # Đọc lại ngay trước publish để không đè kết quả mới hơn.
    latest_published = r2_get_json(chapter_key)
    latest_draft = r2_get_json(draft_key)
    if is_protected_gemini(latest_published) and not entry.get("forceReplacePublished"):
        assert_write_generation(book_id, expected_generation)
        entry["state"] = "skipped_gemini"
        entry["updatedAt"] = utc_now()
        r2_put_json(queue_key, queue, cache_control="private, no-store")
        return {"skipped": True}
    latest = latest_draft or latest_published
    latest_fp = content_fingerprint(rev, ch_num, latest.get("translationVersion", ""), latest.get("content", "")) if latest else ""
    if latest_fp != entry.get("fingerprint"):
        raise RuntimeError("Chương đổi nội dung trong lúc Qwen đang review.")

    # Chapter dịch được QA nâng cấp tại chỗ nên phải dùng cache ngắn.
    assert_write_generation(book_id, expected_generation)
    r2_put_json(chapter_key, updated_chapter, cache_control="public, max-age=60, stale-while-revalidate=600")

    # Cập nhật index chương
    if index and isinstance(index.get("chapters"), list):
        ch_entry = next((c for c in index["chapters"] if int(c.get("chapterNumber") or c.get("n", -1)) == ch_num), None)
        if ch_entry:
            ch_entry.update({
                "title": updated_chapter.get("title", ch_entry.get("title")),
                "provider": updated_chapter["provider"],
                "model": QA_MODEL_ID,
                "qaStatus": "approved",
                "qaReviewed": True,
                "qaRequired": False,
                "qualityScore": updated_chapter["qualityScore"]
            })
            index["updatedAt"] = now
            approved = sum(
                1 for item in index["chapters"]
                if item.get("qaStatus") == "approved" or is_protected_gemini(item)
            )
            total = len(index["chapters"])
            index["approvedChapters"] = approved
            index["translatedChapters"] = approved
            index["status"] = "Hoàn thành" if total > 0 and approved >= total else "Đang cập nhật"
            assert_write_generation(book_id, expected_generation)
            r2_put_json(index_key, index)
            supabase_patch(f"books?id=eq.{book_id}", {
                "total_chapters": total,
                "translated_chapters": approved,
                "revision": rev,
                "status": index["status"],
                "updated_at": now
            })

    # Cập nhật Story Bible, Story Context & TM
    evidence = f"{original['content']}\n{content}"
    latest_bible = r2_get_json(f"story-bible/{book_id}.json")
    latest_context = r2_get_json(f"story-context/{book_id}.json")
    latest_tm = r2_get_json(f"tm/books/{book_id}.json")

    assert_write_generation(book_id, expected_generation)
    r2_put_json(f"story-bible/{book_id}.json", merge_story_bible(latest_bible, final_review.get("storyBibleUpdates", {}), book_id, ch_num, evidence), cache_control="private, no-store")
    r2_put_json(f"story-context/{book_id}.json", append_story_context(latest_context, ch_num, final_review.get("chapterSummary", "")), cache_control="private, no-store")
    r2_put_json(f"tm/books/{book_id}.json", merge_translation_memory(latest_tm, final_review.get("translationMemoryUpdates", []), ch_num, original["content"], content), cache_control="private, no-store")

    # Đánh dấu đã hoàn thành trong hàng đợi
    settle_review(queue, ch_num, {
        "approved": True,
        "decision": final_review.get("decision", "pass"),
        "model": QA_MODEL_ID,
        "scores": scores,
        "issues": final_review.get("issues", [])
    })
    assert_write_generation(book_id, expected_generation)
    r2_put_json(queue_key, queue)

    print(f"  ✓ [{book_id}] ch {ch_num:4d} biên dịch + duyệt xong · Điểm: {avg_score:.1f}/10 · Qwen: {QA_MODEL_ID}")
    return {"approved": True, "rewritten": True}

def run_worker_loop():
    print("=" * 70)
    print("   🚀 QWEN LOCAL AUTONOMOUS SEMANTIC QA WORKER")
    print(f"   Model: {QA_MODEL_ID} ({QA_QUANTIZATION} 4-bit) | Worker: #{WORKER_INDEX}/{TOTAL_WORKERS}")
    print("=" * 70)

    engine = QwenReviewEngine(QA_MODEL_ID)

    while True:
        reset_state = r2_get_json("jobs/reset-active.json")
        if reset_state and reset_state.get("active") and int(reset_state.get("expiresAtEpochMs") or 0) > int(time.time() * 1000):
            if RUN_ONCE:
                print("↷ Toàn thư viện đang reset; kết thúc lượt pilot mà không claim chương.", flush=True)
                return
            print("💤 Toàn thư viện đang reset. Qwen QA nghỉ 60s...", flush=True)
            time.sleep(60)
            continue
        all_queue_keys = r2_list_keys("jobs/")
        queue_keys = [k for k in all_queue_keys if re.match(r"^jobs/[^/]+/semantic-review\.json$", k)]

        if not queue_keys:
            if RUN_ONCE:
                print("✓ Không có hàng đợi semantic QA nào đang chờ; kết thúc lượt pilot.")
                return
            print("💤 Không có hàng đợi semantic QA nào đang chờ. Tạm nghỉ 60s...")
            time.sleep(60)
            continue

        # Sharding theo worker index
        assigned_queues = [k for i, k in enumerate(queue_keys) if (i % TOTAL_WORKERS) == WORKER_INDEX]
        processed_total = 0

        for queue_key in assigned_queues:
            if processed_total >= MAX_CHAPTERS_PER_RUN:
                break

            queue = r2_get_json(queue_key)
            if not queue or not queue.get("bookId") or not isinstance(queue.get("entries"), list):
                continue

            book_id = queue["bookId"]
            expected_generation = job_generation(r2_get_json(f"jobs/{book_id}/translation.json"))
            if not acquire_review_lock(book_id, OWNER_ID):
                print(f"  ↷ [{book_id}]: một semantic reviewer khác đang xử lý bộ này.")
                continue
            # Đọc lại queue sau khi đã sở hữu khóa để tránh dùng snapshot cũ.
            queue = r2_get_json(queue_key)
            if not queue or not isinstance(queue.get("entries"), list):
                release_review_lock(book_id, OWNER_ID)
                continue
            try:
                # Chỉ giữ lock cho một chương. Hachimi có thể chen vào giữa hai
                # chương để merge draft mới mà không ghi đè checkpoint Qwen.
                entry = claim_next_review(queue, owner=OWNER_ID, lease_ms=LEASE_MS)
                if not entry:
                    continue

                assert_write_generation(book_id, expected_generation)
                r2_put_json(queue_key, queue)  # Lưu lease trước khi xử lý
                processed_total += 1

                try:
                    process_claim(queue_key, queue, entry, engine, expected_generation)
                except Exception as error:
                    print(f"  ✗ Lỗi xử lý [{book_id}] ch {entry.get('chapterNumber')}: {error}")
                    if isinstance(error, StaleJobGenerationError):
                        print("  ↷ Bỏ checkpoint lỗi vì job đã reset; worker sẽ nạp lại trạng thái mới.", flush=True)
                        continue
                    if "out of memory" in str(error).lower() and torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    transient = bool(re.search(r"quota|rate limit|timeout|temporar|503|502|504", str(error), re.IGNORECASE))
                    assert_write_generation(book_id, expected_generation)
                    settle_review(queue, int(entry.get("chapterNumber", 0)), {"error": str(error), "retryable": transient})
                    r2_put_json(queue_key, queue)
            finally:
                release_review_lock(book_id, OWNER_ID)

        print(f"\n✨ Đã hoàn thành phiên làm việc ({processed_total} chương). Nghỉ 15s trước vòng lặp kế tiếp...\n")
        if RUN_ONCE:
            return
        time.sleep(15)

if __name__ == "__main__":
    run_worker_loop()
