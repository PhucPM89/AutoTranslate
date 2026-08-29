# ==============================================================================
# HachimiMT autonomous Google Colab worker
# - Never overwrites Gemini / Gemini-QA chapters.
# - Builds a per-book character glossary from the complete source book.
# - Protects glossary terms before NMT and restores them afterwards.
# - Resumes the hachimi-quality-v2 campaign per chapter and supports Colab sharding.
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
    glossary_cache_is_current,
    split_text_by_token_budget,
)

MODEL_ID = os.environ.get("HACHIMI_MODEL_ID", "ngocdang83/HachimiMT-60-QT")
TRANSLATION_VERSION = "hachimi-quality-v2"
GLOSSARY_MINER_VERSION = "character-miner-v1"
WORKER_INDEX = int(os.environ.get("WORKER_INDEX", "0"))
TOTAL_WORKERS = max(1, int(os.environ.get("TOTAL_WORKERS", "1")))
BATCH_SIZE = max(1, int(os.environ.get("HACHIMI_BATCH_SIZE", "32")))
RETRANSLATE_NAME_LOCK = os.environ.get("RETRANSLATE_NAME_LOCK", "true").lower() != "false"
SEMANTIC_REVIEW_VERSION = "semantic-v1"
HACHIMI_BOOK_LEASE_SECONDS = 3 * 60 * 60

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


def r2_put_json(key, data, cache_control="no-cache"):
    s3_client.put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json; charset=utf-8",
        CacheControl=cache_control,
    )


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
    entries = document.get("entries") if isinstance(document.get("entries"), list) else []
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
        }
    return {
        "schema": 1,
        "reviewVersion": SEMANTIC_REVIEW_VERSION,
        "bookId": book_id,
        "revision": revision,
        "updatedAt": now,
        "entries": [by_number[key] for key in sorted(by_number)],
    }


def mark_hachimi_activity(book_id, active):
    now = int(time.time())
    r2_put_json(f"jobs/{book_id}/hachimi-active.json", {
        "schema": 1,
        "bookId": book_id,
        "workerIndex": WORKER_INDEX,
        "active": bool(active),
        "updatedAt": utc_now(),
        "expiresAtEpochMs": (now + HACHIMI_BOOK_LEASE_SECONDS) * 1000 if active else now * 1000,
    })


def supabase_patch_book(book_id, total, translated, revision=1):
    payload = {
        "total_chapters": total,
        "translated_chapters": translated,
        "revision": revision,
        "updated_at": utc_now(),
    }
    if total > 0 and translated >= total:
        payload["status"] = "Hoàn thành"
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
    combined = "\n".join(str(text or "") for text in texts if text)
    candidates = Counter()
    for start in range(len(combined)):
        compound = combined[start:start + 2]
        surname = compound if compound in COMPOUND_SURNAMES else combined[start:start + 1]
        if surname not in COMPOUND_SURNAMES and surname not in SINGLE_SURNAMES:
            continue
        for given_length in (2, 1):
            end = start + len(surname) + given_length
            candidate = combined[start:end]
            given = candidate[len(surname):]
            if not HAN_RE.match(candidate) or INVALID_GIVEN_RE.match(given):
                continue
            if any(char in INVALID_GIVEN_CHARS or char in PERSON_ACTIONS for char in given):
                continue
            if not likely_name_boundary(combined, start, end):
                continue
            candidates[candidate] += 1
            break

    glossary = {}
    for source, count in candidates.items():
        strong = False
        position = combined.find(source)
        while position >= 0:
            before = combined[position - 1] if position > 0 else ""
            end = position + len(source)
            after = combined[end] if end < len(combined) else ""
            if after in SPEECH_ACTIONS or before in NAME_MARKERS:
                strong = True
                break
            position = combined.find(source, position + len(source))
        if count >= 2 and (strong or count >= 4):
            target = hanviet_name(source)
            if target and target != source:
                glossary[source] = target
    return glossary


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
    def restore(text, replacements):
        result = str(text or "")
        for token, target in replacements:
            number = re.search(r"\d+", token).group(0)
            flexible = re.compile(rf"__?\s*TC[ _-]*NAME[ _-]*{number}\s*__?", re.IGNORECASE)
            result = flexible.sub(target, result).replace(token, target)
        result = re.sub(r"\s+([，。！？；：、])", r"\1", result)
        return result.strip()


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
            metadata.append((index, replacements))

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
            output_index, replacements = metadata[offset + inner_index]
            token_ids = tokenizer.convert_tokens_to_ids(result.hypotheses[0])
            translated = tokenizer.decode(token_ids, skip_special_tokens=True)
            translated = clean_text(protector.restore(translated, replacements))
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


def run_translation_loop():
    job_keys = load_job_keys()
    print(f"Worker được giao {len(job_keys)} bộ truyện.\n")

    for job_key in job_keys:
        book_id = job_key.split("/")[1]
        print(f"\n[Quét] {book_id}: đang đọc index và kiểm tra cache glossary...", flush=True)
        state = r2_get_json(job_key)
        index_document = r2_get_json(f"books/{book_id}/index.json")
        if not state or not index_document or not isinstance(state.get("chapters"), list):
            continue

        # Semantic QA never edits a queue while Colab is still translating the
        # same book. The lease expires automatically if a Colab runtime dies.
        mark_hachimi_activity(book_id, True)

        revision = state.get("revision", 1) or 1
        chapters = state["chapters"]
        index_chapters = index_document.get("chapters", [])
        index_by_number = {chapter_number(ch): ch for ch in index_chapters}
        glossary_document = r2_get_json(f"glossary/{book_id}.json")
        existing_glossary = glossary_document if isinstance(glossary_document, dict) else {}
        glossary_meta = r2_get_json(f"glossary-meta/{book_id}.json")
        cache_current = (
            isinstance(glossary_document, dict)
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
            glossary = {**mined_glossary, **existing_glossary}
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

        pending, completed_count, gemini_count = [], 0, 0
        review_candidates = []
        for chapter in chapters:
            number = chapter_number(chapter)
            if number is None:
                continue
            document = r2_get_json(f"books/{book_id}/r{revision}/ch/{number}.json")
            if is_gemini_document(document) or is_gemini_document(index_by_number.get(number)) or is_gemini_document(chapter):
                chapter["status"] = "completed"
                completed_count += 1
                gemini_count += 1
                continue

            content = str((document or {}).get("content") or "").strip()
            corrupt = not document or len(content) < 50 or bool(re.search(r"[\u4e00-\u9fa5]", content))
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
                })

        review_queue_key = f"jobs/{book_id}/semantic-review.json"
        review_queue = merge_semantic_review_queue(
            r2_get_json(review_queue_key),
            book_id,
            revision,
            review_candidates,
        )
        r2_put_json(review_queue_key, review_queue)

        if not pending:
            mark_hachimi_activity(book_id, False)
            print(f"Bỏ qua {book_id}: đã xong {TRANSLATION_VERSION}; giữ nguyên Gemini: {gemini_count} chương.")
            continue

        print("\n" + "=" * 70)
        print(f"DỊCH: {index_document.get('title', book_id)} ({book_id})")
        print(f"Giữ nguyên Gemini: {gemini_count} · Hachimi cần làm: {len(pending)} · Glossary: {len(glossary)}")
        print("=" * 70)

        def checkpoint():
            mark_hachimi_activity(book_id, True)
            r2_put_json(job_key, state)
            r2_put_json(review_queue_key, review_queue)
            index_document["translatedChapters"] = completed_count
            index_document["updatedAt"] = utc_now()
            if completed_count >= len(chapters):
                index_document["status"] = "Hoàn thành"
            r2_put_json(f"books/{book_id}/index.json", index_document)
            supabase_patch_book(book_id, len(chapters), completed_count, revision)

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
            if is_gemini_document(latest) or is_gemini_document(latest_index) or is_gemini_document(chapter):
                chapter["status"] = "completed"
                completed_count += 1
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
            title, content = translate_chapter(
                original.get("title", f"Chương {number}"),
                source_content,
                protector,
                chapter_number=number,
            )
            latest = r2_get_json(f"books/{book_id}/r{revision}/ch/{number}.json")
            if is_gemini_document(latest):
                chapter["status"] = "completed"
                completed_count += 1
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
            r2_put_json(f"books/{book_id}/r{revision}/ch/{number}.json", document)
            review_queue = merge_semantic_review_queue(
                review_queue,
                book_id,
                revision,
                [{
                    "chapterNumber": number,
                    "translationVersion": TRANSLATION_VERSION,
                    "content": content,
                }],
            )
            chapter.update({
                "status": "completed", "translationVersion": TRANSLATION_VERSION,
                "provider": "hachimi", "model": MODEL_ID, "attempts": 0,
                "lastError": "", "nextAttemptAt": 0, "completedAt": utc_now(),
                **quality,
            })
            index_entry = index_by_number.get(number)
            if index_entry is not None:
                index_entry.update({
                    "title": title, "status": "completed", "translationStatus": "completed",
                    "translationVersion": TRANSLATION_VERSION, "provider": "hachimi", "model": MODEL_ID,
                    "qaStatus": "review_pending", "qaReviewed": False,
                    **quality,
                })
            completed_count += 1
            qa_label = f" · chờ Gemini QA: {', '.join(quality['qaIssues'])}" if quality["qaRequired"] else ""
            print(f"  ✓ ch {number} ({time.time() - started:.1f}s) · {completed_count}/{len(chapters)}{qa_label}")

            if position % 5 == 0 or position == len(pending):
                checkpoint()

        mark_hachimi_activity(book_id, False)

    print("\nHoàn tất phần việc của worker.")


if __name__ == "__main__":
    run_translation_loop()
