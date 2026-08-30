# ==============================================================================
# HachimiMT autonomous Google Colab worker
# - Never overwrites Gemini / Gemini-QA chapters.
# - Builds a per-book character glossary from the complete source book.
# - Protects glossary terms before NMT and restores them afterwards.
# - Resumes the hachimi-quality-v3 campaign per chapter and supports Colab sharding.
# ==============================================================================

import json
import hashlib
import os
import re
import time
from collections import Counter
from pathlib import Path

print("[bootstrap 1/4] Python worker đã bắt đầu; đang import thư viện...", flush=True)
import boto3
import ctranslate2
import requests
from botocore.config import Config
from huggingface_hub import snapshot_download
from transformers import AutoTokenizer
print("[bootstrap 2/4] Import thư viện hoàn tất; đang kiểm tra cấu hình...", flush=True)

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / "colab"))
from hachimi_text import (
    build_glossary_cache_meta,
    evaluate_translation_quality,
    expected_placeholder_targets,
    glossary_cache_is_current,
    mine_character_names_conservative,
    restore_glossary_placeholders,
    split_text_by_token_budget,
)

MODEL_ID = os.environ.get("HACHIMI_MODEL_ID", "ngocdang83/HachimiMT-60-QT")
TRANSLATION_VERSION = "hachimi-quality-v3"
GLOSSARY_MINER_VERSION = "character-miner-v2"
WORKER_INDEX = int(os.environ.get("WORKER_INDEX", "0"))
TOTAL_WORKERS = max(1, int(os.environ.get("TOTAL_WORKERS", "1")))
BATCH_SIZE = max(1, int(os.environ.get("HACHIMI_BATCH_SIZE", "32")))
RETRANSLATE_NAME_LOCK = os.environ.get("RETRANSLATE_NAME_LOCK", "true").lower() != "false"
CHAPTER_RETRIES = max(1, int(os.environ.get("HACHIMI_CHAPTER_RETRIES", "3")))
CHAPTER_RETRY_DELAY_SECONDS = max(1, int(os.environ.get("HACHIMI_RETRY_DELAY_SECONDS", "5")))
SEMANTIC_REVIEW_VERSION = "semantic-v3"
HACHIMI_BOOK_LEASE_SECONDS = max(5 * 60, int(os.environ.get("HACHIMI_BOOK_LEASE_SECONDS", str(15 * 60))))
REVIEW_WRITE_LEASE_SECONDS = 2 * 60
REVIEW_WRITE_WAIT_SECONDS = 30 * 60
REVIEW_WRITE_OWNER = f"hachimi-w{WORKER_INDEX}-{os.getpid()}"
HACHIMI_BOOK_OWNER = f"hachimi-book-w{WORKER_INDEX}-{os.getpid()}"

R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "novel-storage")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

missing = [name for name, value in {
    "R2_ENDPOINT": R2_ENDPOINT,
    "R2_ACCESS_KEY_ID": R2_ACCESS_KEY_ID,
    "R2_SECRET_ACCESS_KEY": R2_SECRET_ACCESS_KEY,
    "SUPABASE_URL": SUPABASE_URL,
    "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_KEY,
}.items() if not value]
if missing:
    raise RuntimeError("Thiếu Colab Secrets: " + ", ".join(missing))
if WORKER_INDEX < 0 or WORKER_INDEX >= TOTAL_WORKERS:
    raise RuntimeError("WORKER_INDEX phải nằm trong khoảng 0..TOTAL_WORKERS-1")
print("[bootstrap 3/4] Cấu hình hợp lệ; đang khởi tạo kết nối R2...", flush=True)

s3_client = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name="auto",
    config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
)
print("[bootstrap 4/4] R2 client sẵn sàng; đang chuẩn bị model...", flush=True)


def r2_get_json(key):
    try:
        response = s3_client.get_object(Bucket=R2_BUCKET, Key=key)
        return json.loads(response["Body"].read().decode("utf-8"))
    except Exception:
        return None


def r2_put_json(key, data, cache_control="no-cache", if_none_match=""):
    options = dict(
        Bucket=R2_BUCKET,
        Key=key,
        Body=json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json; charset=utf-8",
        CacheControl=cache_control,
    )
    if if_none_match:
        options["IfNoneMatch"] = if_none_match
    s3_client.put_object(**options)


def r2_head(key):
    try:
        return s3_client.head_object(Bucket=R2_BUCKET, Key=key)
    except Exception:
        return None


def r2_delete(key, if_match=""):
    options = {"Bucket": R2_BUCKET, "Key": key}
    if if_match:
        options["IfMatch"] = if_match
    s3_client.delete_object(**options)


def utc_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def review_fingerprint(revision, chapter_number_value, translation_version, content):
    value = "\0".join([
        str(revision),
        str(chapter_number_value),
        str(translation_version or ""),
        str(content or ""),
    ])
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def merge_semantic_review_queue(queue, book_id, revision, candidates):
    document = queue if isinstance(queue, dict) else {}
    version_changed = bool(document.get("reviewVersion")) and document.get("reviewVersion") != SEMANTIC_REVIEW_VERSION
    entries = document.get("entries") if isinstance(document.get("entries"), list) else []
    if version_changed:
        # Do not let Qwen race ahead on corrupt drafts from the retired
        # campaign. Published approvals remain durable until their new v3
        # draft arrives with a different fingerprint.
        entries = [
            entry for entry in entries
            if entry.get("state") in ("approved", "skipped_gemini")
            or entry.get("translationVersion") == TRANSLATION_VERSION
        ]
    by_number = {
        chapter_number(entry): dict(entry)
        for entry in entries
        if chapter_number(entry) is not None
    }
    now = utc_now()
    for candidate in candidates:
        number = candidate["chapterNumber"]
        fingerprint = review_fingerprint(
            revision,
            number,
            candidate.get("translationVersion"),
            candidate.get("content"),
        )
        previous = by_number.get(number)
        if previous and previous.get("fingerprint") == fingerprint:
            if not version_changed or previous.get("state") in ("approved", "skipped_gemini"):
                continue
        by_number[number] = {
            "chapterNumber": number,
            "revision": revision,
            "translationVersion": candidate.get("translationVersion", ""),
            "fingerprint": fingerprint,
            "state": "pending",
            "attempts": 0,
            "availableAt": now,
            "createdAt": now,
            "updatedAt": now,
            "leaseOwner": "",
            "leaseUntil": "",
            "lastError": "",
            "forceReplacePublished": bool(candidate.get("forceReplacePublished")),
        }
    return {
        "schema": 1,
        "reviewVersion": SEMANTIC_REVIEW_VERSION,
        "bookId": book_id,
        "revision": revision,
        "updatedAt": now,
        "entries": [by_number[key] for key in sorted(by_number)],
    }


def hachimi_activity_key(book_id):
    return f"jobs/{book_id}/hachimi-active.json"


def acquire_hachimi_book_lease(book_id):
    key = hachimi_activity_key(book_id)
    now_ms = int(time.time() * 1000)
    existing = r2_get_json(key)
    if existing and existing.get("active") and int(existing.get("expiresAtEpochMs") or 0) > now_ms:
        return existing.get("owner") == HACHIMI_BOOK_OWNER
    if existing:
        try:
            head = r2_head(key) or {}
            r2_delete(key, str(head.get("ETag") or ""))
        except Exception:
            return False
    lease = {
        "schema": 1,
        "bookId": book_id,
        "workerIndex": WORKER_INDEX,
        "owner": HACHIMI_BOOK_OWNER,
        "active": True,
        "acquiredAt": utc_now(),
        "updatedAt": utc_now(),
        "expiresAtEpochMs": now_ms + HACHIMI_BOOK_LEASE_SECONDS * 1000,
    }
    try:
        r2_put_json(key, lease, "private, no-store", if_none_match="*")
        return True
    except Exception:
        return False


def refresh_hachimi_book_lease(book_id):
    key = hachimi_activity_key(book_id)
    existing = r2_get_json(key)
    if not existing or existing.get("owner") != HACHIMI_BOOK_OWNER:
        return False
    existing.update({
        "active": True,
        "updatedAt": utc_now(),
        "expiresAtEpochMs": int(time.time() * 1000) + HACHIMI_BOOK_LEASE_SECONDS * 1000,
    })
    r2_put_json(key, existing, "private, no-store")
    return True


def release_hachimi_book_lease(book_id):
    key = hachimi_activity_key(book_id)
    existing = r2_get_json(key)
    if not existing or existing.get("owner") != HACHIMI_BOOK_OWNER:
        return
    try:
        head = r2_head(key) or {}
        r2_delete(key, str(head.get("ETag") or ""))
    except Exception:
        pass


def review_lock_key(book_id):
    return f"jobs/{book_id}/semantic-review.lock.json"


def acquire_review_write_lock(book_id):
    key = review_lock_key(book_id)
    now_ms = int(time.time() * 1000)
    existing = r2_get_json(key)
    if existing and int(existing.get("expiresAtEpochMs") or 0) > now_ms:
        return existing.get("owner") == REVIEW_WRITE_OWNER
    if existing:
        try:
            head = r2_head(key) or {}
            r2_delete(key, str(head.get("ETag") or ""))
        except Exception:
            return False
    lock = {
        "schema": 1,
        "bookId": book_id,
        "owner": REVIEW_WRITE_OWNER,
        "acquiredAt": utc_now(),
        "expiresAtEpochMs": now_ms + REVIEW_WRITE_LEASE_SECONDS * 1000,
    }
    try:
        r2_put_json(key, lock, "private, no-store", if_none_match="*")
        return True
    except Exception:
        return False


def release_review_write_lock(book_id):
    key = review_lock_key(book_id)
    existing = r2_get_json(key)
    if not existing or existing.get("owner") != REVIEW_WRITE_OWNER:
        return
    try:
        head = r2_head(key) or {}
        r2_delete(key, str(head.get("ETag") or ""))
    except Exception:
        pass


def wait_for_review_write_lock(book_id):
    deadline = time.time() + REVIEW_WRITE_WAIT_SECONDS
    announced = False
    last_lease_refresh = 0.0
    while time.time() < deadline:
        if time.time() - last_lease_refresh >= 60:
            if not refresh_hachimi_book_lease(book_id):
                raise RuntimeError(f"Mất Hachimi book lease khi chờ Qwen checkpoint {book_id}.")
            last_lease_refresh = time.time()
        if acquire_review_write_lock(book_id):
            return
        if not announced:
            print(f"  ↻ [{book_id}] Qwen đang publish; Hachimi chờ khóa checkpoint...", flush=True)
            announced = True
        time.sleep(1)
    raise RuntimeError(f"Chờ semantic-review lock quá lâu cho {book_id}.")


def supabase_patch_book(book_id, total, translated, revision=1):
    payload = {
        "total_chapters": total,
        "translated_chapters": translated,
        "revision": revision,
        "status": "Hoàn thành" if total > 0 and translated >= total else "Đang cập nhật",
        "updated_at": utc_now(),
    }
    try:
        requests.patch(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/books?id=eq.{book_id}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json=payload,
            timeout=15,
        ).raise_for_status()
    except Exception as error:
        print(f"  [Supabase warning] {error}")


def chapter_number(chapter):
    value = chapter.get("n")
    if value is None:
        value = chapter.get("chapterNumber")
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def is_gemini_document(document):
    if not document:
        return False
    provider = str(document.get("provider") or document.get("translationProvider") or "").lower()
    model = str(document.get("model") or "").lower()
    # qaReviewed alone is not provider provenance: the old broad audit marked
    # some Hachimi chapters as reviewed even though they still need quality-v2.
    return provider == "gemini" or "gemini" in model


# Per-book character glossary (same conservative policy as the Node worker).
HAN_RE = re.compile(r"^[\u3400-\u9fff]+$")
PUNCTUATION = set("，。！？、：；“”\"'（）\n\r\t ")
PERSON_ACTIONS = set("说道问答喊叫笑哭看望听想点摇抬低转走来去退进出站坐跪起落冲追挡接握拿拔挥施运催皱挑瞪闭睁咬拍摸推拉抱扶杀打骂喝叹哼惊怒喜愣沉")
SPEECH_ACTIONS = set("说道问答喊叫笑哭骂喝叹哼")
INVALID_GIVEN_CHARS = set("的了着过在就都也还又才便却将把被给和与或而很更最太直连忙已没可要会能让向对跟同从到为以于上下里外回出进看听说问答想觉走坐站伸点抬骂掏准备")
INVALID_GIVEN_RE = re.compile(r"^(兄弟|兄|弟|叔|父|母|大师|先生|小姐|老板|局长|警官|师父|师兄|师弟|师叔|爸爸|妈妈|爸|妈|哥|姐|胖子|老头|夫人|公子|姑娘)")
LEFT_MARKERS = set("叫称让向对同跟见找救杀问答")
NAME_MARKERS = set("叫称谓名")


def load_mapping(filename):
    result = {}
    with open(filename, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            source, target = line.split("=", 1)
            if source.strip() and target.strip():
                result[source.strip()] = target.strip()
    return result


SURNAMES = load_mapping(ROOT / "data" / "convert" / "names" / "surnames.txt")
HANVIET = load_mapping(ROOT / "data" / "convert" / "hanviet-chars.txt")
SINGLE_SURNAMES = {name for name in SURNAMES if len(name) == 1}
COMPOUND_SURNAMES = {name for name in SURNAMES if len(name) == 2}


def hanviet_name(source):
    words = [HANVIET.get(char, char) for char in source]
    return " ".join(word[:1].upper() + word[1:].lower() for word in words if word)


def likely_name_boundary(text, start, end):
    before = text[start - 1] if start > 0 else ""
    after = text[end] if end < len(text) else ""
    left = not before or before in PUNCTUATION or before in LEFT_MARKERS
    right = not after or after in PUNCTUATION or after in PERSON_ACTIONS
    return left and right


def mine_character_names(texts):
    return mine_character_names_conservative(texts, SURNAMES, HANVIET, limit=2000)


class GlossaryProtector:
    def __init__(self, glossary):
        self.glossary = {str(k): str(v) for k, v in (glossary or {}).items() if k and v}
        terms = sorted(self.glossary, key=len, reverse=True)
        self.pattern = re.compile("|".join(re.escape(term) for term in terms)) if terms else None

    def protect(self, text):
        replacements = []
        if not self.pattern or not text:
            return str(text or ""), replacements
        token_by_term = {}

        def replace(match):
            source = match.group(0)
            token = token_by_term.get(source)
            if token is None:
                token = f"__TC_NAME_{len(replacements):04d}__"
                token_by_term[source] = token
                replacements.append((token, self.glossary[source]))
            return f" {token} "

        return self.pattern.sub(replace, str(text)), replacements

    @staticmethod
    def restore(text, replacements, expected_targets=None):
        return restore_glossary_placeholders(text, replacements, expected_targets)


print("\n" + "=" * 70)
print(f"HachimiMT worker {WORKER_INDEX + 1}/{TOTAL_WORKERS} · campaign {TRANSLATION_VERSION}")
print(f"Đang tải model {MODEL_ID}...")
model_path = snapshot_download(repo_id=MODEL_ID)
tokenizer = AutoTokenizer.from_pretrained(model_path)
ct2_dir = os.path.join(model_path, "ct2-int8_float32")
if not os.path.exists(ct2_dir):
    ct2_dir = os.path.join(model_path, "ct2")
if not os.path.exists(ct2_dir):
    for candidate_root, _, files in os.walk(model_path):
        if "model.bin" in files:
            ct2_dir = candidate_root
            break

device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
compute_type = "int8_float16" if device == "cuda" else "int8"
translator = ctranslate2.Translator(ct2_dir, device=device, compute_type=compute_type, inter_threads=2, intra_threads=4)
print(f"Model sẵn sàng trên {device.upper()} ({compute_type}).\n")


def clean_text(text):
    result = str(text or "").replace("『", "“").replace("』", "”").replace("「", "“").replace("」", "”")
    return re.sub(r"[^\S\r\n]+", " ", result).strip()


def translate_paragraphs(paragraphs, protector, progress_label=""):
    output = [""] * len(paragraphs)
    prepared, metadata = [], []
    for index, paragraph in enumerate(paragraphs):
        source = re.sub(r"[\r\n]+", " ", str(paragraph or "")).strip()
        if not source:
            continue
        protected, replacements = protector.protect(source)
        for piece in split_text_by_token_budget(protected, tokenizer, max_tokens=440):
            prepared.append(piece)
            metadata.append((index, replacements, expected_placeholder_targets(piece, replacements)))

    total_batches = (len(prepared) + BATCH_SIZE - 1) // BATCH_SIZE
    for offset in range(0, len(prepared), BATCH_SIZE):
        batch_number = offset // BATCH_SIZE + 1
        texts = prepared[offset:offset + BATCH_SIZE]
        if progress_label:
            print(
                f"    {progress_label}: batch {batch_number}/{total_batches} "
                f"({len(texts)} đoạn)...",
                flush=True,
            )
        source_tokens = [tokenizer.convert_ids_to_tokens(tokenizer.encode(text, truncation=False)) for text in texts]
        results = translator.translate_batch(
            source_tokens,
            beam_size=4,
            max_input_length=512,
            max_decoding_length=512,
            repetition_penalty=1.2,
            no_repeat_ngram_size=2,
        )
        for inner_index, result in enumerate(results):
            output_index, replacements, expected_targets = metadata[offset + inner_index]
            token_ids = tokenizer.convert_tokens_to_ids(result.hypotheses[0])
            translated = tokenizer.decode(token_ids, skip_special_tokens=True)
            translated = clean_text(protector.restore(translated, replacements, expected_targets))
            output[output_index] = " ".join(part for part in (output[output_index], translated) if part)
    return output


def translate_chapter(title, content, protector, chapter_number=None):
    translated_title = translate_paragraphs([title], protector)[0] if title else title
    label = f"ch {chapter_number}" if chapter_number is not None else "nội dung"
    translated_lines = translate_paragraphs(
        str(content or "").split("\n"),
        protector,
        progress_label=label,
    )
    return translated_title, "\n\n".join(line for line in translated_lines if line)


def load_job_keys():
    keys = []
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=R2_BUCKET, Prefix="jobs/"):
        for item in page.get("Contents", []):
            if item["Key"].endswith("/translation.json"):
                keys.append(item["Key"])
    keys.sort()
    return [key for index, key in enumerate(keys) if index % TOTAL_WORKERS == WORKER_INDEX]


def job_generation(state):
    """Return the reset generation carried by a translation job.

    Older jobs may not have a generation yet.  That is safe: the first reset
    adds ``resetAt``, so a worker which loaded the pre-reset job will still see
    a mismatch before it can checkpoint stale in-memory state.
    """
    if not isinstance(state, dict):
        return ""
    return str(state.get("runGeneration") or state.get("resetAt") or "")


def assert_write_generation(job_key, expected_generation):
    """Refuse every durable write after maintenance starts or a job is reset."""
    reset_state = r2_get_json("jobs/reset-active.json")
    if (
        isinstance(reset_state, dict)
        and reset_state.get("active")
        and int(reset_state.get("expiresAtEpochMs") or 0) > int(time.time() * 1000)
    ):
        raise RuntimeError("Toàn thư viện đang reset; hủy checkpoint để không ghi đè dữ liệu mới.")

    latest_state = r2_get_json(job_key)
    latest_generation = job_generation(latest_state)
    if not isinstance(latest_state, dict) or latest_generation != expected_generation:
        raise RuntimeError(
            "Job đã được reset trong lúc worker đang chạy "
            f"(generation {expected_generation!r} -> {latest_generation!r}); hủy dữ liệu cũ."
        )


def run_translation_loop():
    failed_chapters = []
    reset_state = r2_get_json("jobs/reset-active.json")
    if reset_state and reset_state.get("active") and int(reset_state.get("expiresAtEpochMs") or 0) > int(time.time() * 1000):
        raise RuntimeError("Toàn thư viện đang reset; dừng Hachimi worker và chạy lại sau.")
    job_keys = load_job_keys()
    print(f"Worker được giao {len(job_keys)} bộ truyện.\n")

    for job_key in job_keys:
        reset_state = r2_get_json("jobs/reset-active.json")
        if reset_state and reset_state.get("active") and int(reset_state.get("expiresAtEpochMs") or 0) > int(time.time() * 1000):
            raise RuntimeError("Toàn thư viện bắt đầu reset; dừng trước khi ghi bộ tiếp theo.")
        book_id = job_key.split("/")[1]
        print(f"\n[Quét] {book_id}: đang đọc index và kiểm tra cache glossary...", flush=True)
        state = r2_get_json(job_key)
        index_document = r2_get_json(f"books/{book_id}/index.json")
        if not state or not index_document or not isinstance(state.get("chapters"), list):
            continue
        expected_generation = job_generation(state)

        # Only one Hachimi process may own a book. This prevents an old Colab
        # runtime from overwriting a newly rebuilt glossary or draft checkpoint.
        if not acquire_hachimi_book_lease(book_id):
            print(f"Bỏ qua {book_id}: một Hachimi worker khác đang giữ lease.", flush=True)
            continue

        revision = state.get("revision", 1) or 1
        force_retranslate_all = bool(state.get("forceRetranslateAll"))
        chapters = state["chapters"]
        index_chapters = index_document.get("chapters", [])
        index_by_number = {chapter_number(ch): ch for ch in index_chapters}
        glossary_document = r2_get_json(f"glossary/{book_id}.json")
        existing_glossary = glossary_document if isinstance(glossary_document, dict) else {}
        manual_glossary_document = r2_get_json(f"glossary-manual/{book_id}.json")
        manual_glossary = manual_glossary_document if isinstance(manual_glossary_document, dict) else {}
        glossary_meta = r2_get_json(f"glossary-meta/{book_id}.json")
        cache_current = (
            isinstance(glossary_document, dict)
            and len(existing_glossary) <= 2500 + len(manual_glossary)
            and int((glossary_meta or {}).get("termCount") or -1) == len(existing_glossary)
            and glossary_cache_is_current(
                glossary_meta,
                revision,
                chapters,
                GLOSSARY_MINER_VERSION,
            )
        )

        originals = {}
        if cache_current:
            glossary = existing_glossary
            print(
                f"[Glossary cache] {book_id}: HIT · {len(glossary)} thuật ngữ; "
                "bỏ qua quét toàn bộ bản gốc.",
                flush=True,
            )
        else:
            print(
                f"[Glossary cache] {book_id}: MISS · đang đọc toàn bộ bản gốc...",
                flush=True,
            )
            source_texts = []
            valid_chapters = [ch for ch in chapters if chapter_number(ch) is not None]
            for source_position, chapter in enumerate(valid_chapters, 1):
                number = chapter_number(chapter)
                original = r2_get_json(f"books/{book_id}/r{revision}/ch/{number}.original.json")
                if original:
                    originals[number] = original
                    source_texts.extend([original.get("title", ""), original.get("content", "")])
                if source_position % 100 == 0 or source_position == len(valid_chapters):
                    if not refresh_hachimi_book_lease(book_id):
                        raise RuntimeError(f"Mất Hachimi book lease khi quét glossary {book_id}.")
                    print(
                        f"    Đã đọc {source_position}/{len(valid_chapters)} file nguồn...",
                        flush=True,
                    )

            print(
                f"[Glossary cache] {book_id}: đã đọc {len(originals)}/{len(valid_chapters)} "
                "bản gốc; đang khai thác tên...",
                flush=True,
            )
            mined_glossary = mine_character_names(source_texts)
            trusted_existing = (
                existing_glossary
                if isinstance(glossary_meta, dict)
                and glossary_meta.get("minerVersion") == GLOSSARY_MINER_VERSION
                and len(existing_glossary) <= 2500 + len(manual_glossary)
                else {}
            )
            if existing_glossary and not trusted_existing:
                print(
                    f"[Glossary cache] loại {len(existing_glossary)} mục legacy/không tin cậy; "
                    "chỉ giữ glossary-manual.",
                    flush=True,
                )
            glossary = {**mined_glossary, **trusted_existing, **manual_glossary}
            assert_write_generation(job_key, expected_generation)
            if glossary != existing_glossary or not isinstance(glossary_document, dict):
                r2_put_json(f"glossary/{book_id}.json", glossary)
            next_meta = build_glossary_cache_meta(
                revision,
                chapters,
                GLOSSARY_MINER_VERSION,
                len(originals),
                len(glossary),
                utc_now(),
            )
            r2_put_json(f"glossary-meta/{book_id}.json", next_meta)
            if next_meta["completed"]:
                print(
                    f"[Glossary cache] {book_id}: SAVED · {len(glossary)} thuật ngữ.",
                    flush=True,
                )
            else:
                print(
                    f"[Glossary cache] {book_id}: chưa cache vì thiếu "
                    f"{next_meta['chapterCount'] - next_meta['sourceChapterCount']} bản gốc.",
                    flush=True,
                )
        protector = GlossaryProtector(glossary)

        pending, completed_count, approved_count, gemini_count = [], 0, 0, 0
        review_candidates = []
        for chapter in chapters:
            number = chapter_number(chapter)
            if number is None:
                continue
            published_document = r2_get_json(f"books/{book_id}/r{revision}/ch/{number}.json")
            draft_document = r2_get_json(f"drafts/{book_id}/r{revision}/ch/{number}.json")
            if not force_retranslate_all and (is_gemini_document(published_document) or is_gemini_document(index_by_number.get(number)) or is_gemini_document(chapter)):
                chapter["status"] = "completed"
                completed_count += 1
                approved_count += 1
                gemini_count += 1
                continue

            if published_document and published_document.get("qaStatus") == "approved":
                approved_count += 1

            # One-time compatibility migration: an existing quality-v2 Hachimi
            # chapter becomes a private draft without changing reader output.
            if (
                not draft_document
                and published_document
                and str(published_document.get("provider") or "").lower() == "hachimi"
                and published_document.get("translationVersion") == TRANSLATION_VERSION
            ):
                draft_document = dict(published_document)
                draft_document["qaStatus"] = draft_document.get("qaStatus") or "review_pending"
                assert_write_generation(job_key, expected_generation)
                r2_put_json(f"drafts/{book_id}/r{revision}/ch/{number}.json", draft_document, "private, no-store")

            document = draft_document or published_document

            content = str((document or {}).get("content") or "").strip()
            original = originals.get(number) or {}
            source_content = str(original.get("content") or "").strip()
            quality = evaluate_translation_quality(source_content, content) if document else {"qaIssues": []}
            broken_name_lock = "Còn token khóa tên chưa được khôi phục" in quality.get("qaIssues", [])
            suspiciously_short = len(source_content) >= 50 and len(content) < 50
            corrupt = (
                not document
                or not content
                or suspiciously_short
                or bool(re.search(r"[\u4e00-\u9fa5]", content))
                or broken_name_lock
            )
            stale_name_lock = (document or {}).get("translationVersion") != TRANSLATION_VERSION
            if corrupt or (RETRANSLATE_NAME_LOCK and stale_name_lock):
                chapter.update({"status": "pending", "attempts": 0, "lastError": "", "nextAttemptAt": 0})
                pending.append(chapter)
            else:
                chapter["status"] = "completed"
                completed_count += 1

            if (
                document
                and str(document.get("provider") or "").lower() == "hachimi"
                and document.get("translationVersion") == TRANSLATION_VERSION
                and content
            ):
                review_candidates.append({
                    "chapterNumber": number,
                    "translationVersion": TRANSLATION_VERSION,
                    "content": content,
                    "forceReplacePublished": force_retranslate_all,
                })

        review_queue_key = f"jobs/{book_id}/semantic-review.json"
        draft_index_updates = {}

        def sync_shared_state():
            """Merge queue/index while holding the same short lock as Qwen."""
            nonlocal index_document, index_by_number, approved_count
            assert_write_generation(job_key, expected_generation)
            wait_for_review_write_lock(book_id)
            try:
                # Maintenance/reset may begin while we were waiting for Qwen.
                assert_write_generation(job_key, expected_generation)
                latest_queue = r2_get_json(review_queue_key)
                merged_queue = merge_semantic_review_queue(
                    latest_queue,
                    book_id,
                    revision,
                    review_candidates,
                )
                r2_put_json(review_queue_key, merged_queue, "private, no-store")

                index_key = f"books/{book_id}/index.json"
                latest_index = r2_get_json(index_key)
                if not isinstance(latest_index, dict):
                    latest_index = dict(index_document)
                latest_chapters = latest_index.get("chapters") if isinstance(latest_index.get("chapters"), list) else []
                latest_by_number = {chapter_number(item): item for item in latest_chapters}
                for draft_number, quality_update in draft_index_updates.items():
                    item = latest_by_number.get(draft_number)
                    if not item or item.get("qaStatus") == "approved" or is_gemini_document(item):
                        continue
                    item.update({"qaStatus": "review_pending", "qaReviewed": False, **quality_update})

                approved_count = sum(
                    1 for item in latest_chapters
                    if item.get("qaStatus") == "approved" or is_gemini_document(item)
                )
                drafted_count = len({candidate["chapterNumber"] for candidate in review_candidates})
                latest_index["draftedChapters"] = drafted_count
                latest_index["approvedChapters"] = approved_count
                latest_index["translatedChapters"] = approved_count
                latest_index["updatedAt"] = utc_now()
                latest_index["status"] = (
                    "Hoàn thành"
                    if approved_count >= len(chapters) and chapters
                    else "Đang cập nhật"
                )
                r2_put_json(index_key, latest_index)
                supabase_patch_book(book_id, len(chapters), approved_count, revision)
                index_document = latest_index
                index_by_number = latest_by_number
            finally:
                release_review_write_lock(book_id)

        sync_shared_state()

        if not pending:
            release_hachimi_book_lease(book_id)
            print(f"Bỏ qua {book_id}: đã xong {TRANSLATION_VERSION}; giữ nguyên Gemini: {gemini_count} chương.")
            continue

        print("\n" + "=" * 70)
        print(f"DỊCH: {index_document.get('title', book_id)} ({book_id})")
        print(f"Giữ nguyên Gemini: {gemini_count} · Hachimi cần làm: {len(pending)} · Glossary: {len(glossary)}")
        print("=" * 70)

        def checkpoint():
            assert_write_generation(job_key, expected_generation)
            if not refresh_hachimi_book_lease(book_id):
                raise RuntimeError(f"Mất Hachimi book lease trước checkpoint {book_id}.")
            assert_write_generation(job_key, expected_generation)
            r2_put_json(job_key, state)
            sync_shared_state()

        for position, chapter in enumerate(pending, 1):
            number = chapter_number(chapter)
            original = originals.get(number)
            if not original:
                original = r2_get_json(f"books/{book_id}/r{revision}/ch/{number}.original.json")
            if not original:
                print(f"  ! ch {number}: thiếu bản gốc, bỏ qua")
                continue

            latest = r2_get_json(f"books/{book_id}/r{revision}/ch/{number}.json")
            latest_index = index_by_number.get(number)
            if not force_retranslate_all and (is_gemini_document(latest) or is_gemini_document(latest_index) or is_gemini_document(chapter)):
                chapter["status"] = "completed"
                completed_count += 1
                approved_count += 1
                print(f"  ↷ ch {number}: Gemini vừa hoàn tất, giữ nguyên")
                if position % 5 == 0 or position == len(pending):
                    checkpoint()
                continue

            started = time.time()
            source_content = original.get("content", "")
            print(
                f"  → [{position}/{len(pending)}] ch {number}: bắt đầu dịch "
                f"{len(str(source_content)):,} ký tự...",
                flush=True,
            )
            translation_error = None
            title, content = "", ""
            for translate_attempt in range(1, CHAPTER_RETRIES + 1):
                try:
                    title, content = translate_chapter(
                        original.get("title", f"Chương {number}"),
                        source_content,
                        protector,
                        chapter_number=number,
                    )
                    translation_error = None
                    break
                except Exception as error:
                    translation_error = error
                    print(
                        f"    ⚠ ch {number}: lượt dịch {translate_attempt}/{CHAPTER_RETRIES} lỗi: {error}",
                        flush=True,
                    )
                    if translate_attempt < CHAPTER_RETRIES:
                        time.sleep(CHAPTER_RETRY_DELAY_SECONDS * translate_attempt)
            if translation_error is not None:
                attempts = int(chapter.get("attempts") or 0) + 1
                chapter.update({
                    "status": "pending",
                    "attempts": attempts,
                    "lastError": str(translation_error)[:500],
                    "nextAttemptAt": int(time.time()) + min(6 * 3600, 60 * (2 ** min(attempts, 8))),
                })
                print(
                    f"  ✗ ch {number}: giữ pending sau {CHAPTER_RETRIES} lượt; worker tiếp tục chương kế tiếp.",
                    flush=True,
                )
                failed_chapters.append((book_id, number))
                if position % 5 == 0 or position == len(pending):
                    checkpoint()
                continue
            latest = r2_get_json(f"books/{book_id}/r{revision}/ch/{number}.json")
            if not force_retranslate_all and is_gemini_document(latest):
                chapter["status"] = "completed"
                completed_count += 1
                approved_count += 1
                print(f"  ↷ ch {number}: hủy kết quả Hachimi vì Gemini đã ghi trong lúc dịch")
                if position % 5 == 0 or position == len(pending):
                    checkpoint()
                continue
            document = {
                "schema": 1, "bookId": book_id, "revision": revision, "chapterNumber": number,
                "title": title, "content": content,
                "paragraphs": [part.strip() for part in content.split("\n") if part.strip()],
                "translationStatus": "completed", "provider": "hachimi", "model": MODEL_ID,
                "translationVersion": TRANSLATION_VERSION, "characters": len(content), "updatedAt": utc_now(),
                "qaStatus": "review_pending", "qaReviewed": False,
            }
            quality = evaluate_translation_quality(original.get("content", ""), content)
            document.update(quality)
            assert_write_generation(job_key, expected_generation)
            r2_put_json(f"drafts/{book_id}/r{revision}/ch/{number}.json", document, "private, no-store")
            review_candidates.append({
                "chapterNumber": number,
                "translationVersion": TRANSLATION_VERSION,
                "content": content,
                "forceReplacePublished": force_retranslate_all,
            })
            chapter.update({
                "status": "completed", "translationVersion": TRANSLATION_VERSION,
                "provider": "hachimi", "model": MODEL_ID, "attempts": 0,
                "lastError": "", "nextAttemptAt": 0, "completedAt": utc_now(),
                **quality,
            })
            index_entry = index_by_number.get(number)
            if index_entry is not None:
                index_entry.update({
                    # Reader-facing provider/title remain unchanged until QA
                    # publishes this private draft.
                    "qaStatus": "review_pending", "qaReviewed": False,
                    **quality,
                })
            draft_index_updates[number] = quality
            completed_count += 1
            qa_label = f" · chờ Qwen QA: {', '.join(quality['qaIssues'])}" if quality["qaRequired"] else ""
            print(f"  ✓ ch {number} ({time.time() - started:.1f}s) · {completed_count}/{len(chapters)}{qa_label}")

            if position % 5 == 0 or position == len(pending):
                checkpoint()

        release_hachimi_book_lease(book_id)

    if failed_chapters:
        preview = ", ".join(f"{book_id}:ch{number}" for book_id, number in failed_chapters[:10])
        print(
            f"\n↻ Còn {len(failed_chapters)} chương lỗi ({preview}). "
            "Nghỉ 60s rồi tự quét lại để xử lý các chương còn pending...",
            flush=True,
        )
    else:
        print("\nHoàn tất phần việc của worker.")
    return len(failed_chapters)


if __name__ == "__main__":
    while True:
        if run_translation_loop() <= 0:
            break
        time.sleep(60)
