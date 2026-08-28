"""
🚀 HACHIMI-MT AUTONOMOUS COLAB WORKER
Chạy 100% tự động trên Google Colab GPU (T4/V100/A100).
- Tự động lấy các chương raw từ Cloudflare R2 / Supabase.
- Dịch bằng mô hình HachimiMT-60-QT qua CTranslate2 GPU siêu tốc (>300-500 tokens/giây).
- Tự động lưu bản dịch hoàn chỉnh lên Cloudflare R2 và cập nhật tiến độ Supabase.
- KHÔNG CẦN copy/dán URL, KHÔNG CẦN chạy script ở máy cá nhân!
"""

import os
import sys
import time
import json
import re
import urllib.request
import urllib.error
from typing import List, Dict, Any, Optional

# ---------------------------------------------------------------------------
# Cấu hình Mặc định (Tự động nạp từ Environment hoặc Preset)
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://bckwrfucultwxirorglv.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "https://aa644d98f2377007f0fa98abcafe3d21.r2.cloudflarestorage.com")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "e41b13620224d90c9e14e4277a5495b3")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "11644c6ee18adb791a2d62d7501da26ab0995ffa3fcd85460026328a662b113c")
R2_BUCKET = os.environ.get("R2_BUCKET", "novel-storage")

MODEL_ID = os.environ.get("MODEL_ID", "ngocdang83/HachimiMT-60-QT")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "32"))

# ---------------------------------------------------------------------------
# R2 Storage Client (boto3)
# ---------------------------------------------------------------------------
def get_s3_client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto"
    )

def r2_get_json(s3, key: str) -> Optional[Dict[str, Any]]:
    try:
        res = s3.get_object(Bucket=R2_BUCKET, Key=key)
        content = res["Body"].read().decode("utf-8")
        return json.loads(content)
    except Exception:
        return None

def r2_put_json(s3, key: str, data: Dict[str, Any], cache_control: str = "no-cache"):
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
    s3.put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=payload,
        ContentType="application/json; charset=utf-8",
        CacheControl=cache_control
    )

# ---------------------------------------------------------------------------
# Supabase REST Client
# ---------------------------------------------------------------------------
def supabase_request(endpoint: str, method: str = "GET", body: Any = None) -> Any:
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{endpoint}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    if method in ["POST", "PATCH"]:
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"

    req_data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            resp_body = res.read().decode("utf-8")
            return json.loads(resp_body) if resp_body else None
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"⚠️ [Supabase Error] HTTP {e.code}: {err_msg[:150]}")
        return None
    except Exception as e:
        print(f"⚠️ [Supabase Request Exception]: {e}")
        return None

# ---------------------------------------------------------------------------
# HachimiMT GPU Engine (CTranslate2)
# ---------------------------------------------------------------------------
class ColabHachimiEngine:
    def __init__(self, model_id: str = MODEL_ID):
        import torch
        import ctranslate2
        from transformers import AutoTokenizer
        from huggingface_hub import snapshot_download

        print(f"\n⏳ [HachimiMT] Đang tải mô hình: {model_id}...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.compute_type = "int8_float16" if self.device == "cuda" else "int8"
        print(f"✓ Thiết bị: {self.device.upper()} ({self.compute_type})")

        model_path = snapshot_download(repo_id=model_id)
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)

        ct2_dir = os.path.join(model_path, "ct2-int8_float32")
        if not os.path.exists(ct2_dir): ct2_dir = os.path.join(model_path, "ct2")
        if not os.path.exists(ct2_dir): ct2_dir = model_path

        self.translator = ctranslate2.Translator(
            ct2_dir,
            device=self.device,
            compute_type=self.compute_type,
            intra_threads=4,
            inter_threads=2
        )
        print("✅ Mô hình HachimiMT GPU đã tải thành công và sẵn sàng dịch!\n")

    def clean_output(self, text: str) -> str:
        if not text: return ""
        text = text.replace("『", "“").replace("』", "”").replace("「", "“").replace("」", "”")
        text = text.replace("……", "...").replace("…", "...").replace("、", ", ")
        text = re.sub(r'[ \t]+', ' ', text).strip()
        return text

    def translate_batch(self, texts: List[str], max_length: int = 480, beam_size: int = 4) -> List[str]:
        if not texts: return []
        cleaned_indices, cleaned_texts = [], []
        for i, t in enumerate(texts):
            s = str(t or "").strip()
            if s:
                cleaned_indices.append(i)
                cleaned_texts.append(s)
        
        if not cleaned_texts: return [""] * len(texts)
        results = [""] * len(texts)

        source_tokens = [self.tokenizer.convert_ids_to_tokens(self.tokenizer.encode(t, truncation=True, max_length=max_length)) for t in cleaned_texts]
        translations = self.translator.translate_batch(source_tokens, beam_size=beam_size, max_decoding_length=max_length)

        for idx, trans in zip(cleaned_indices, translations):
            output_tokens = trans.hypotheses[0]
            output_ids = self.tokenizer.convert_tokens_to_ids(output_tokens)
            decoded = self.tokenizer.decode(output_ids, skip_special_tokens=True)
            results[idx] = self.clean_output(decoded)

        return results

    def translate_chapter(self, title_zh: str, content_zh: str) -> Dict[str, str]:
        # 1. Dịch Tiêu đề
        title_vi = title_zh
        if title_zh and re.search(r'[\u4e00-\u9fa5]', title_zh):
            t_res = self.translate_batch([title_zh])
            if t_res and t_res[0]: title_vi = t_res[0]

        # 2. Dịch Nội dung đoạn văn
        lines = content_zh.split("\n")
        non_empty_indices = []
        batch_lines = []

        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped:
                non_empty_indices.append(i)
                batch_lines.append(stripped)

        if not batch_lines:
            return {"title": title_vi, "content": content_zh}

        translated_lines_map = {}
        for b_start in range(0, len(batch_lines), BATCH_SIZE):
            chunk = batch_lines[b_start : b_start + BATCH_SIZE]
            trans_chunk = self.translate_batch(chunk)
            for idx_in_batch, trans_text in enumerate(trans_chunk):
                orig_idx = non_empty_indices[b_start + idx_in_batch]
                translated_lines_map[orig_idx] = trans_text

        output_lines = []
        for i, line in enumerate(lines):
            output_lines.append(translated_lines_map.get(i, ""))

        final_content = "\n\n".join([p for p in output_lines if p])
        return {"title": title_vi, "content": final_content}

# ---------------------------------------------------------------------------
# Vòng Lặp Dịch Tự Động Toàn Bộ Truyện (Autonomous Pipeline Loop)
# ---------------------------------------------------------------------------
def run_autonomous_translation():
    print("=" * 70)
    print("   🚀 HACHIMI-MT AUTONOMOUS COLAB TRANSLATOR (TỰ ĐỘNG 100%)")
    print("=" * 70)

    s3 = get_s3_client()
    engine = ColabHachimiEngine()

    # Lấy danh sách toàn bộ truyện từ Supabase (hỗ trợ tới 2000 bộ)
    books = supabase_request("books?select=id,title,total_chapters,translated_chapters,revision&order=updated_at.desc&limit=2000")
    if not books:
        print("⚠️ Không tìm thấy danh sách truyện từ Supabase.")
        return

    pending_books = [b for b in books if (b.get("translated_chapters", 0) or 0) < (b.get("total_chapters", 0) or 0)]
    print(f"\n📚 TỔNG QUAN HỆ THỐNG: Tìm thấy {len(books)} bộ truyện ({len(pending_books)} bộ còn chương cần dịch):")
    for b in books:
        total = b.get("total_chapters", 0)
        done = b.get("translated_chapters", 0)
        pct = round((done / max(1, total)) * 100)
        print(f"  • [{b['id']}] {b.get('title', 'Untitled')} ({done}/{total} ch - {pct}%)")

    for book in books:
        book_id = book["id"]
        rev = book.get("revision", 1) or 1
        total_ch = book.get("total_chapters", 0)

        index_key = f"books/{book_id}/index.json"
        index_data = r2_get_json(s3, index_key)
        if not index_data or "chapters" not in index_data:
            continue

        chapters = index_data.get("chapters", [])
        pending_list = []

        # Audit và kiểm tra chương nào cần dịch
        for ch in chapters:
            n = ch.get("chapterNumber") or ch.get("n")
            doc_key = f"books/{book_id}/r{rev}/ch/{n}.json"
            doc = r2_get_json(s3, doc_key)
            # Không bao giờ dịch đè lên chương đã được Gemini hoàn thiện
            if doc and (doc.get("provider") == "gemini" or doc.get("qaReviewed")):
                continue
            content = (doc.get("content") or "").strip() if doc else ""
            has_chinese = bool(re.search(r'[\u4e00-\u9fa5]', content))
            
            if not doc or len(content) < 50 or has_chinese:
                pending_list.append(ch)

        if not pending_list:
            continue

        print("\n" + "=" * 70)
        print(f">>> [BẮT ĐẦU DỊCH] {book.get('title')} ({book_id})")
        print(f"    Số chương cần dịch: {len(pending_list)} / {len(chapters)} chương")
        print("=" * 70)

        translated_count = len(chapters) - len(pending_list)

        for ch in pending_list:
            n = ch.get("chapterNumber")
            orig_key = f"books/{book_id}/r{rev}/ch/{n}.original.json"
            orig_doc = r2_get_json(s3, orig_key)
            if not orig_doc or "content" not in orig_doc:
                continue

            t0 = time.time()
            trans_res = engine.translate_chapter(orig_doc.get("title", ch.get("title", "")), orig_doc["content"])
            elapsed = time.time() - t0

            # Lưu document bản dịch tiếng Việt lên R2
            doc_key = f"books/{book_id}/r{rev}/ch/{n}.json"
            trans_doc = {
                "schemaVersion": 2,
                "bookId": book_id,
                "revision": rev,
                "chapterNumber": n,
                "title": trans_res["title"],
                "content": trans_res["content"],
                "paragraphs": [p.strip() for p in trans_res["content"].split("\n") if p.strip()],
                "translationStatus": "completed",
                "provider": "hachimi",
                "model": MODEL_ID,
                "translatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            r2_put_json(s3, doc_key, trans_doc, cache_control="public, max-age=31536000, immutable")

            # Đánh dấu chương hoàn thành trong index
            ch["translationStatus"] = "completed"
            ch["title"] = trans_res["title"]
            translated_count += 1

            pct = round((translated_count / len(chapters)) * 100)
            print(f"  ✓ ch {n:4d} [{trans_res['title'][:25]:25s}] ({elapsed:.1f}s) | Tiến độ: {translated_count}/{len(chapters)} ({pct}%)")

            # Cập nhật Supabase và index sau mỗi 10 chương hoặc khi hoàn thành
            if translated_count % 10 == 0 or translated_count == len(chapters):
                index_data["translatedChapters"] = translated_count
                index_data["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                r2_put_json(s3, index_key, index_data, cache_control="no-cache")
                supabase_request(f"books?id=eq.{book_id}", method="PATCH", body={
                    "translated_chapters": translated_count,
                    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                })

        print(f"\n🎉 Hoàn tất dịch toàn bộ truyện {book_id}!\n")

if __name__ == "__main__":
    run_autonomous_translation()
