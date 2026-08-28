# ==============================================================================
# 🚀 HACHIMI-MT STANDALONE AUTONOMOUS TRANSLATOR FOR GOOGLE COLAB
# Chạy trực tiếp 100% trên Colab GPU - Tắt máy tính đi ngủ thoải mái!
# ==============================================================================

import os
import re
import json
import time
import requests
import torch
import boto3
from botocore.config import Config
from huggingface_hub import snapshot_download
import ctranslate2
from transformers import AutoTokenizer

# ------------------------------------------------------------------------------
# 1. CẤU HÌNH HỆ THỐNG & CLOUD
# ------------------------------------------------------------------------------
MODEL_ID = "ngocdang83/HachimiMT-60-QT"

# Cloudflare R2 Storage
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "novel-storage")

# Supabase Database
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ------------------------------------------------------------------------------
# 2. KHỞI TẠO CLIENTS
# ------------------------------------------------------------------------------
s3_client = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"})
)

def r2_get_json(key):
    try:
        res = s3_client.get_object(Bucket=R2_BUCKET, Key=key)
        return json.loads(res["Body"].read().decode("utf-8"))
    except Exception:
        return None

def r2_put_json(key, data):
    s3_client.put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json",
        CacheControl="no-cache"
    )

def supabase_patch_book(book_id, total, translated, rev=1):
    url = f"{SUPABASE_URL}/rest/v1/books?id=eq.{book_id}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    payload = {
        "total_chapters": total,
        "translated_chapters": translated,
        "revision": rev,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    try:
        requests.patch(url, headers=headers, json=payload, timeout=10)
    except Exception as e:
        print(f"  [Supabase Warning] {e}")

# ------------------------------------------------------------------------------
# 3. NẠP MODEL HACHIMI-MT LÊN GPU COLAB (Tự động định vị thư mục CT2)
# ------------------------------------------------------------------------------
print("\n" + "="*65)
print("   🚀 HACHIMI-MT AUTONOMOUS COLAB WORKER ĐANG KHỞI ĐỘNG...")
print("="*65 + "\n")

print(f"📦 Đang tải model {MODEL_ID} từ HuggingFace...")
model_path = snapshot_download(repo_id=MODEL_ID)
tokenizer = AutoTokenizer.from_pretrained(model_path)

# Tìm chính xác thư mục chứa model.bin của CTranslate2
ct2_dir = os.path.join(model_path, "ct2-int8_float32")
if not os.path.exists(ct2_dir):
    ct2_dir = os.path.join(model_path, "ct2")
if not os.path.exists(ct2_dir):
    for root, dirs, files in os.walk(model_path):
        if "model.bin" in files:
            ct2_dir = root
            break

device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "int8_float16" if device == "cuda" else "int8"
print(f"⚙️ Nạp model CTranslate2 từ '{ct2_dir}' vào {device.upper()} ({compute_type})...")

try:
    translator = ctranslate2.Translator(
        ct2_dir,
        device=device,
        compute_type=compute_type,
        inter_threads=2,
        intra_threads=4
    )
except Exception:
    translator = ctranslate2.Translator(
        ct2_dir,
        device=device,
        inter_threads=2,
        intra_threads=4
    )

print("✅ CTranslate2 GPU đã sẵn sàng phục vụ!\n")

def translate_paragraphs(paragraphs):
    if not paragraphs:
        return []
    
    clean_paras = [re.sub(r'[\r\n]+', ' ', p).strip() for p in paragraphs]
    non_empty = [p for p in clean_paras if p]
    if not non_empty:
        return paragraphs

    tokens = [tokenizer.convert_ids_to_tokens(tokenizer.encode(p)) for p in non_empty]
    results = translator.translate_batch(
        tokens,
        beam_size=1,
        max_decoding_length=1024,
        batch_type="tokens",
        max_batch_size=4096
    )
    
    translated_texts = []
    for r in results:
        t_text = tokenizer.decode(tokenizer.convert_tokens_to_ids(r.hypotheses[0]))
        translated_texts.append(t_text)

    # Ghép lại đúng vị trí các đoạn
    out = []
    idx = 0
    for p in clean_paras:
        if not p:
            out.append("")
        else:
            out.append(translated_texts[idx])
            idx += 1
    return out

# ------------------------------------------------------------------------------
# 4. QUY TRÌNH DỊCH TỰ ĐỘNG LIÊN TỤC
# ------------------------------------------------------------------------------
def has_chinese(text):
    return bool(re.search(r'[\u4e00-\u9fa5]', str(text)))

def run_translation_loop():
    print("🔍 Đang quét danh sách các bộ truyện trong hệ thống R2...")
    paginator = s3_client.get_paginator('list_objects_v2')
    pages = paginator.paginate(Bucket=R2_BUCKET, Prefix="jobs/")
    
    job_keys = []
    for page in pages:
        for obj in page.get("Contents", []):
            if obj["Key"].endswith("/translation.json"):
                job_keys.append(obj["Key"])
                
    print(f"📚 Tìm thấy {len(job_keys)} bộ truyện trong queue!\n")

    for job_key in job_keys:
        book_id = job_key.split("/")[1]
        state = r2_get_json(job_key)
        if not state or "chapters" not in state:
            continue
            
        rev = state.get("revision", 1)
        index_doc = r2_get_json(f"books/{book_id}/index.json") or {}
        book_title = index_doc.get("title", book_id)
        
        chapters = state.get("chapters", [])
        total_ch = len(chapters)
        
        # Deep audit
        pending_chapters = []
        completed_count = 0
        
        for ch in chapters:
            n = ch.get("n")
            doc = r2_get_json(f"books/{book_id}/r{rev}/ch/{n}.json")
            content = doc.get("content", "") if doc else ""
            
            if not doc or len(content) < 50 or has_chinese(content):
                ch["status"] = "pending"
                pending_chapters.append(ch)
            else:
                ch["status"] = "completed"
                completed_count += 1
                
        if not pending_chapters:
            continue
            
        print(f"\n=======================================================")
        print(f"📖 BẮT ĐẦU DỊCH: [{book_title}] ({book_id})")
        print(f"   - Đã có: {completed_count}/{total_ch} chương")
        print(f"   - Cần dịch: {len(pending_chapters)} chương")
        print(f"=======================================================")

        for idx, ch in enumerate(pending_chapters, 1):
            n = ch.get("n")
            
            orig_doc = r2_get_json(f"books/{book_id}/r{rev}/ch/{n}.original.json")
            if not orig_doc:
                orig_doc = r2_get_json(f"books/{book_id}/r{rev}/ch/{n}.json")
                
            if not orig_doc:
                continue

            raw_title = orig_doc.get("title", f"Chương {n}")
            raw_content = orig_doc.get("content", "")
            paras = raw_content.split("\n")
            
            t0 = time.time()
            trans_title = translate_paragraphs([raw_title])[0] if raw_title else raw_title
            trans_paras = translate_paragraphs(paras)
            trans_content = "\n".join(trans_paras)
            dur = time.time() - t0
            
            chapter_doc = {
                "schema": 1,
                "bookId": book_id,
                "chapterNumber": n,
                "revision": rev,
                "title": trans_title,
                "content": trans_content,
                "translatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "provider": "hachimi",
                "model": MODEL_ID
            }
            r2_put_json(f"books/{book_id}/r{rev}/ch/{n}.json", chapter_doc)
            
            ch["status"] = "completed"
            completed_count += 1
            
            print(f"  ✓ ch {n} [{trans_title[:30]}...] ({dur:.1f}s) | Tiến độ: {completed_count}/{total_ch} ({(completed_count/total_ch*100):.1f}%)")
            
            if idx % 5 == 0 or idx == len(pending_chapters):
                r2_put_json(job_key, state)
                if index_doc and "chapters" in index_doc:
                    index_doc["translatedChapters"] = completed_count
                    index_doc["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    r2_put_json(f"books/{book_id}/index.json", index_doc)
                supabase_patch_book(book_id, total_ch, completed_count, rev)

    print("\n🎉 TẤT CẢ TRUYỆN ĐÃ DỊCH HOÀN TẤT 100%!")

if __name__ == "__main__":
    run_translation_loop()
