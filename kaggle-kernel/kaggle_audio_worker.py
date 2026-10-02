#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kaggle High-Speed GPU Audio TTS Worker (Nguyen Ngoc Ngan Voice Only)
Tự động đồng bộ với Google Drive Storage của hệ thống Trạm Chữ.
"""

import os
import sys
import time
import json
import re
import tempfile
import urllib.request
import urllib.parse
import subprocess
from pathlib import Path

os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"

print("==================================================================")
print("=== KAGGLE GPU AUDIO WORKER (NGUYEN NGOC NGAN AI EXCLUSIVE)   ===")
print("==================================================================")

# 1. Cấu hình Credentials Google Drive
DRIVE_CLIENT_ID = os.environ.get("GOOGLE_DRIVE_CLIENT_ID", "")
DRIVE_CLIENT_SECRET = os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET", "")
DRIVE_REFRESH_TOKEN = os.environ.get("GOOGLE_DRIVE_REFRESH_TOKEN", "")
DRIVE_STORAGE_ROOT = os.environ.get("GOOGLE_DRIVE_STORAGE_FOLDER_ID", "1-TvHLKA7z_hyt90BdJpRBsjmCQGW3z8P")
DRIVE_AUDIO_ROOT = os.environ.get("GOOGLE_DRIVE_AUDIO_FOLDER_ID", "1R5zhmL3XQS22Z4Ia1HD5s1m-NW_OOGaw")

TOKEN_URL = "https://oauth2.googleapis.com/token"
FILES_URL = "https://www.googleapis.com/drive/v3/files"
UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"

cached_token = None
token_expires_at = 0

def get_access_token():
    global cached_token, token_expires_at
    now = time.time()
    if cached_token and now < token_expires_at - 60:
        return cached_token
    data = urllib.parse.urlencode({
        "client_id": DRIVE_CLIENT_ID,
        "client_secret": DRIVE_CLIENT_SECRET,
        "refresh_token": DRIVE_REFRESH_TOKEN,
        "grant_type": "refresh_token"
    }).encode("utf-8")
    req = urllib.request.Request(TOKEN_URL, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        cached_token = res["access_token"]
        token_expires_at = now + int(res.get("expires_in", 3600))
        return cached_token

def drive_fetch(url, method="GET", headers=None, data=None):
    token = get_access_token()
    h = {"Authorization": f"Bearer {token}"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read(), resp.status
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503):
                time.sleep(2 ** attempt + 1)
                continue
            if e.code == 404:
                return None, 404
            raise
    return None, 500

def drive_find_file_by_key(rel_path):
    q = f"trashed = false and appProperties has {{ key='relPath' and value='{rel_path}' }}"
    url = f"{FILES_URL}?q={urllib.parse.quote(q)}&fields=files(id,name,size,appProperties)&pageSize=2"
    body, code = drive_fetch(url)
    if not body:
        return None
    files = json.loads(body.decode("utf-8")).get("files", [])
    return files[0] if files else None

def drive_get_json(rel_path):
    f = drive_find_file_by_key(rel_path)
    if not f:
        return None
    body, code = drive_fetch(f"{FILES_URL}/{f['id']}?alt=media")
    if not body:
        return None
    try:
        return json.loads(body.decode("utf-8"))
    except Exception:
        return None

def drive_put_json(rel_path, obj):
    token = get_access_token()
    existing = drive_find_file_by_key(rel_path)
    body_bytes = json.dumps(obj, indent=2, ensure_ascii=False).encode("utf-8")
    if existing:
        url = f"{UPLOAD_URL}/{existing['id']}?uploadType=media"
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}
        req = urllib.request.Request(url, data=body_bytes, headers=h, method="PATCH")
        with urllib.request.urlopen(req) as resp:
            return resp.status in (200, 201)
    meta = {
        "name": rel_path.split("/")[-1],
        "parents": [DRIVE_STORAGE_ROOT],
        "mimeType": "application/json",
        "appProperties": {"relPath": rel_path}
    }
    boundary = "----WebKitFormBoundaryKaggle" + str(int(time.time()))
    payload = (
        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{json.dumps(meta)}\r\n"
        f"--{boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n"
    ).encode("utf-8") + body_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
    h = {"Authorization": f"Bearer {token}", "Content-Type": f"multipart/related; boundary={boundary}"}
    req = urllib.request.Request(f"{UPLOAD_URL}?uploadType=multipart&fields=id", data=payload, headers=h, method="POST")
    with urllib.request.urlopen(req) as resp:
        return resp.status in (200, 201)

def ensure_drive_book_folder(book_id, book_name):
    token = get_access_token()
    folder_name = f"{book_name} ({book_id})" if book_name else book_id
    q = f"'{DRIVE_AUDIO_ROOT}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '{folder_name}'"
    url = f"{FILES_URL}?q={urllib.parse.quote(q)}&fields=files(id,name)"
    body, _ = drive_fetch(url)
    if body:
        files = json.loads(body.decode("utf-8")).get("files", [])
        if files:
            return files[0]["id"]
    meta = {
        "name": folder_name,
        "parents": [DRIVE_AUDIO_ROOT],
        "mimeType": "application/vnd.google-apps.folder",
        "appProperties": {"audioBookId": str(book_id)}
    }
    req = urllib.request.Request(f"{FILES_URL}?fields=id", data=json.dumps(meta).encode("utf-8"), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))["id"]

def upload_audio_to_drive(file_path, book_id, book_name, chapter_num, duration_sec):
    token = get_access_token()
    folder_id = ensure_drive_book_folder(book_id, book_name)
    file_size = os.path.getsize(file_path)
    file_name = f"{book_id}-chapter-{int(chapter_num):04d}.mp3"

    # Kiểm tra xem file đã có trong folder chưa
    q = f"'{folder_id}' in parents and trashed = false and name = '{file_name}'"
    url = f"{FILES_URL}?q={urllib.parse.quote(q)}&fields=files(id,name,size)"
    body, _ = drive_fetch(url)
    if body:
        files = json.loads(body.decode("utf-8")).get("files", [])
        if files and int(files[0].get("size", 0)) > 10000:
            return files[0]["id"], f"https://drive.google.com/uc?export=download&id={files[0]['id']}"

    meta = {
        "name": file_name,
        "parents": [folder_id],
        "mimeType": "audio/mpeg",
        "appProperties": {
            "bookId": str(book_id),
            "chapterNumber": str(chapter_num),
            "durationSeconds": f"{duration_sec:.2f}",
            "pipeline": "kaggle-gpu-nguyen-ngoc-ngan-v1"
        }
    }
    init_req = urllib.request.Request(
        f"{UPLOAD_URL}?uploadType=resumable&fields=id",
        data=json.dumps(meta).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
            "X-Upload-Content-Type": "audio/mpeg",
            "X-Upload-Content-Length": str(file_size)
        },
        method="POST"
    )
    with urllib.request.urlopen(init_req) as resp:
        upload_url = resp.headers.get("Location")

    with open(file_path, "rb") as f:
        put_req = urllib.request.Request(
            upload_url,
            data=f.read(),
            headers={"Content-Type": "audio/mpeg", "Content-Length": str(file_size)},
            method="PUT"
        )
        with urllib.request.urlopen(put_req) as upload_resp:
            file_id = json.loads(upload_resp.read().decode("utf-8"))["id"]

    # Cấp quyền public đọc
    perm_req = urllib.request.Request(
        f"{FILES_URL}/{file_id}/permissions",
        data=json.dumps({"type": "anyone", "role": "reader"}).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(perm_req):
            pass
    except Exception:
        pass
    return file_id, f"https://drive.google.com/uc?export=download&id={file_id}"

# 2. Kiểm tra GPU CUDA & Cài đặt Vieneu
import torch
cuda_ok = torch.cuda.is_available()
print(f"CUDA Available: {cuda_ok}")
if cuda_ok:
    print(f"Active GPU: {torch.cuda.get_device_name(0)}")

subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "vieneu", "soundfile", "edge-tts"], check=True)

import soundfile as sf
from vieneu import Vieneu

# 3. Tải Voice Seeds Chú Nguyễn Ngọc Ngạn
VOICES_DIR = Path("/tmp/voices_ngan")
VOICES_DIR.mkdir(parents=True, exist_ok=True)
SEEDS = []
RAW_SEED_URL_BASE = "https://raw.githubusercontent.com/PhucPM89/AutoTranslate/main/server/audio/voices"
for idx in range(5):
    fn = f"nguyen_ngoc_ngan_seed_{idx:02d}.wav"
    tgt = VOICES_DIR / fn
    if not tgt.exists():
        url = f"{RAW_SEED_URL_BASE}/{fn}"
        try:
            urllib.request.urlretrieve(url, str(tgt))
        except Exception as e:
            print(f"Lỗi tải {fn}: {e}")
    if tgt.exists():
        SEEDS.append(str(tgt))

print(f"-> Sẵn sàng {len(SEEDS)} file seed giọng Nguyễn Ngọc Ngạn.")

# 4. Khởi tạo VieNeu-TTS Turbo
device = "cuda" if cuda_ok else "cpu"
backend = "pytorch" if cuda_ok else "onnx"
print(f">>> Khởi tạo VieNeu-TTS Turbo trên thiết bị: {device} ({backend})...")
tts = Vieneu(mode="v3turbo", device=device, backend=backend)
print("-> Mô hình VieNeu-TTS đã sẵn sàng!")

def split_paragraphs(text, max_chars=750):
    lines = [p.strip() for p in re.split(r"\n+", str(text or "")) if p.strip()]
    chunks = []
    curr = ""
    for line in lines:
        if curr and len(curr) + len(line) + 2 > max_chars:
            chunks.append(curr.strip())
            curr = ""
        if len(line) > max_chars:
            parts = re.split(r"([.!?…]+[\s\n]+)", line)
            temp = ""
            for p in parts:
                if len(temp) + len(p) > max_chars:
                    if temp:
                        chunks.append(temp.strip())
                    temp = p
                else:
                    temp += p
            if temp:
                chunks.append(temp.strip())
        else:
            curr += ("\n" + line if curr else line)
    if curr:
        chunks.append(curr.strip())
    return [c for c in chunks if c.strip()]

def get_audio_duration(file_path):
    try:
        res = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, check=True
        )
        return float(res.stdout.strip())
    except Exception:
        return os.path.getsize(file_path) / 16000.0

def process_single_chapter(job, chapter_num, work_dir):
    book_id = job["bookId"]
    book_title = job.get("bookTitle", book_id)
    rev = job.get("revision", 1)

    ch_key = f"books/{book_id}/r{rev}/ch/{chapter_num}.json"
    ch_doc = drive_get_json(ch_key)
    if not ch_doc:
        print(f"Chưa có bản dịch cho chương {chapter_num}. Bỏ qua.")
        return False

    text = str(ch_doc.get("content") or ch_doc.get("text") or "").strip()
    if not text or len(text) < 10:
        return False

    chunks = split_paragraphs(text, max_chars=700)
    if not chunks:
        return False

    wav_files = []
    for c_idx, chunk in enumerate(chunks, 1):
        # Cập nhật stage message
        job["stageMessage"] = f"Kaggle GPU: Chương {chapter_num}/{job['totalChapters']} [Nguyễn Ngọc Ngạn] đoạn {c_idx}/{len(chunks)}"
        job["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        drive_put_json(f"audio-jobs/jobs/{job['id']}.json", job)

        seed = SEEDS[(c_idx - 1) % len(SEEDS)]
        wav_path = os.path.join(work_dir, f"chunk_{c_idx:03d}.wav")
        tts.synthesize(text=chunk, voice=seed, output_path=wav_path)
        wav_files.append(wav_path)

    # Ghép nối các file WAV thành file MP3
    list_path = os.path.join(work_dir, "concat.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for w in wav_files:
            f.write(f"file '{w}'\n")

    out_mp3 = os.path.join(work_dir, f"{book_id}_{chapter_num}.mp3")
    cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path, "-c:a", "libmp3lame", "-b:a", "64k", out_mp3]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    dur = get_audio_duration(out_mp3)
    file_id, pub_url = upload_audio_to_drive(out_mp3, book_id, book_title, chapter_num, dur)

    # Cập nhật ch_doc
    ch_doc["audio"] = {
        "status": "ready",
        "provider": "nguyen-ngoc-ngan-ai-kaggle-gpu",
        "url": pub_url,
        "fileId": file_id,
        "durationSeconds": dur,
        "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    drive_put_json(ch_key, ch_doc)

    # Cập nhật manifest
    manifest_key = f"audio-jobs/manifests/{book_id}.json"
    manifest = drive_get_json(manifest_key) or {"bookId": book_id, "audioChapters": {}}
    if "audioChapters" not in manifest or not isinstance(manifest["audioChapters"], dict):
        manifest["audioChapters"] = {}
    manifest["audioChapters"][str(chapter_num)] = {"ready": True, "url": pub_url, "fileId": file_id, "durationSeconds": dur}
    drive_put_json(manifest_key, manifest)

    # Dọn dẹp
    for w in wav_files:
        try: os.remove(w)
        except: pass
    try: os.remove(out_mp3)
    except: pass

    return True

def main_loop():
    print(">>> Bắt đầu lắng nghe hàng đợi trên Google Drive...")
    while True:
        idx_doc = drive_get_json("audio-jobs/index.json")
        if not idx_doc or "jobs" not in idx_doc:
            print("Không đọc được index.json. Đợi 30s...")
            time.sleep(30)
            continue

        jobs = idx_doc.get("jobs", [])
        active_candidates = [
            j for j in jobs
            if j.get("status") in ("pending", "running", "retrying")
        ]

        if not active_candidates:
            print("Không có audio job nào đang chờ. Đợi 60s...")
            time.sleep(60)
            continue

        # Sắp xếp ưu tiên: Ranh Giới Hoàng Hôn trước
        def sort_key(j):
            b_id = j.get("bookId", "")
            title = j.get("bookTitle", "")
            if b_id == "qidian-1036575193" or "ranh giới hoàng hôn" in title.lower():
                return 0
            return 1

        active_candidates.sort(key=sort_key)
        target_summary = active_candidates[0]
        job_id = target_summary["id"]
        job = drive_get_json(f"audio-jobs/jobs/{job_id}.json")
        if not job or job.get("status") == "canceled":
            time.sleep(10)
            continue

        print(f"\n=======================================================")
        print(f"Xử lý Job: {job['bookTitle']} ({job['bookId']})")
        print(f"Tiến độ hiện tại: {job.get('completedChapters', 0)}/{job.get('totalChapters', 0)}")
        print(f"=======================================================")

        job["status"] = "running"
        job["attempts"] = int(job.get("attempts", 0)) + 1
        job["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        drive_put_json(f"audio-jobs/jobs/{job_id}.json", job)

        start_ch = max(1, int(job.get("startChapter", 1)))
        total_ch = int(job.get("totalChapters", 1))

        with tempfile.TemporaryDirectory() as work_dir:
            for ch_num in range(start_ch, total_ch + 1):
                # Kiểm tra cancel
                fresh = drive_get_json(f"audio-jobs/jobs/{job_id}.json")
                if fresh and fresh.get("status") == "canceled":
                    print("Job đã bị người dùng hủy.")
                    break

                # Kiểm tra xem chương đã có audio chưa
                manifest = drive_get_json(f"audio-jobs/manifests/{job['bookId']}.json") or {}
                aud_ch = manifest.get("audioChapters", {})
                if str(ch_num) in aud_ch and aud_ch[str(ch_num)].get("ready"):
                    job["completedChapters"] = max(int(job.get("completedChapters", 0)), ch_num)
                    job["currentChapter"] = ch_num
                    continue

                t_ch_start = time.time()
                success = process_single_chapter(job, ch_num, work_dir)
                if success:
                    ch_dur = time.time() - t_ch_start
                    job["completedChapters"] = max(int(job.get("completedChapters", 0)), ch_num)
                    job["currentChapter"] = ch_num
                    job["progress"] = int(round(ch_num / total_ch * 100))
                    job["stageMessage"] = f"Kaggle GPU: Đã tạo và đồng bộ chương {ch_num}/{total_ch} ({ch_dur:.1f}s)."
                    job["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    drive_put_json(f"audio-jobs/jobs/{job_id}.json", job)
                    print(f"-> Hoàn tất chương {ch_num}/{total_ch} trong {ch_dur:.1f}s.")
                else:
                    time.sleep(1)

            # Đánh dấu xong job
            job["status"] = "completed"
            job["progress"] = 100
            job["stageMessage"] = "Kaggle GPU: Đã tạo và kiểm định toàn bộ audio thành công."
            job["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            drive_put_json(f"audio-jobs/jobs/{job_id}.json", job)
            print(f">>> HOÀN THÀNH TOÀN BỘ SÁCH: {job['bookTitle']} <<<")

        time.sleep(5)

if __name__ == "__main__":
    try:
        main_loop()
    except KeyboardInterrupt:
        print("\nDừng worker.")
    except Exception as e:
        print(f"\nLỗi worker Kaggle: {e}")
        time.sleep(10)
        sys.exit(1)
