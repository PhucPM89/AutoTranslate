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
import socket
import tempfile
import urllib.request
import urllib.parse
import urllib.error
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

def http_drive_request(url, data=None, headers=None, method=None, max_retries=6, timeout=60, auth=True):
    """
    Thực hiện HTTP request bền bỉ với cơ chế thử lại tự động và làm mới token khi gặp lỗi 401/429/500/502/503/504.
    """
    global cached_token, token_expires_at
    for attempt in range(max_retries):
        try:
            req_headers = dict(headers or {})
            if auth and "Authorization" not in req_headers:
                token = get_access_token()
                req_headers["Authorization"] = f"Bearer {token}"

            req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read(), resp.status, resp.headers
        except urllib.error.HTTPError as e:
            # 401 Unauthorized -> Refresh token và thử lại ngay
            if e.code == 401 and auth:
                print("[AUTH 401] Access token hết hạn, đang làm mới token...")
                cached_token = None
                token_expires_at = 0
                time.sleep(1)
                continue
            # 404 Not Found
            if e.code == 404:
                return None, 404, getattr(e, "headers", {})
            # Transient server / rate limit errors
            if e.code in (429, 500, 502, 503, 504):
                sleep_s = min(60, (2 ** attempt) + 2)
                short_url = url.split("?")[0]
                print(f"[HTTP {e.code}] Google Drive tạm thời nghẽn ({short_url}). Thử lại {attempt + 1}/{max_retries} sau {sleep_s}s...")
                time.sleep(sleep_s)
                continue
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="ignore")[:200]
            except Exception:
                pass
            print(f"[HTTP {e.code}] {err_body}")
            if attempt == max_retries - 1:
                raise
            time.sleep(3)
        except (urllib.error.URLError, TimeoutError, ConnectionResetError, socket.timeout) as e:
            sleep_s = min(60, (2 ** attempt) + 2)
            print(f"[Network] {e}. Thử lại {attempt + 1}/{max_retries} sau {sleep_s}s...")
            time.sleep(sleep_s)
            if attempt == max_retries - 1:
                raise
    raise RuntimeError(f"Yêu cầu HTTP thất bại sau {max_retries} lần thử: {url}")

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
    body, status, _ = http_drive_request(
        TOKEN_URL,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
        auth=False
    )
    res = json.loads(body.decode("utf-8"))
    cached_token = res["access_token"]
    token_expires_at = now + int(res.get("expires_in", 3600))
    return cached_token

def drive_fetch(url, method="GET", headers=None, data=None):
    try:
        body, status, _ = http_drive_request(url, data=data, headers=headers, method=method)
        return body, status
    except Exception as e:
        print(f"Lỗi drive_fetch ({url}): {e}")
        return None, 500

def drive_find_file_by_key(rel_path):
    q = f"trashed = false and appProperties has {{ key='relPath' and value='{rel_path}' }}"
    url = f"{FILES_URL}?q={urllib.parse.quote(q)}&fields=files(id,name,size,appProperties)&pageSize=2"
    body, code = drive_fetch(url)
    if not body:
        return None
    try:
        files = json.loads(body.decode("utf-8")).get("files", [])
        return files[0] if files else None
    except Exception:
        return None

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
    existing = drive_find_file_by_key(rel_path)
    body_bytes = json.dumps(obj, indent=2, ensure_ascii=False).encode("utf-8")
    if existing:
        url = f"{UPLOAD_URL}/{existing['id']}?uploadType=media"
        h = {"Content-Type": "application/json; charset=utf-8"}
        body, status, _ = http_drive_request(url, data=body_bytes, headers=h, method="PATCH")
        return status in (200, 201)
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
    h = {"Content-Type": f"multipart/related; boundary={boundary}"}
    body, status, _ = http_drive_request(f"{UPLOAD_URL}?uploadType=multipart&fields=id", data=payload, headers=h, method="POST")
    return status in (200, 201)

def ensure_drive_book_folder(book_id, book_name):
    folder_name = f"{book_name} ({book_id})" if book_name else book_id
    q = f"'{DRIVE_AUDIO_ROOT}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '{folder_name}'"
    url = f"{FILES_URL}?q={urllib.parse.quote(q)}&fields=files(id,name)"
    body, _ = drive_fetch(url)
    if body:
        try:
            files = json.loads(body.decode("utf-8")).get("files", [])
            if files:
                return files[0]["id"]
        except Exception:
            pass
    meta = {
        "name": folder_name,
        "parents": [DRIVE_AUDIO_ROOT],
        "mimeType": "application/vnd.google-apps.folder",
        "appProperties": {"audioBookId": str(book_id)}
    }
    body, status, _ = http_drive_request(
        f"{FILES_URL}?fields=id",
        data=json.dumps(meta).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    return json.loads(body.decode("utf-8"))["id"]

def upload_audio_to_drive(file_path, book_id, book_name, chapter_num, duration_sec):
    folder_id = ensure_drive_book_folder(book_id, book_name)
    file_size = os.path.getsize(file_path)
    file_name = f"{book_id}-chapter-{int(chapter_num):04d}.mp3"

    # Kiểm tra xem file đã có trong folder chưa
    q = f"'{folder_id}' in parents and trashed = false and name = '{file_name}'"
    url = f"{FILES_URL}?q={urllib.parse.quote(q)}&fields=files(id,name,size)"
    body, _ = drive_fetch(url)
    if body:
        try:
            files = json.loads(body.decode("utf-8")).get("files", [])
            if files and int(files[0].get("size", 0)) > 10000:
                return files[0]["id"], f"https://drive.google.com/uc?export=download&id={files[0]['id']}"
        except Exception:
            pass

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
    _, status, init_headers = http_drive_request(
        f"{UPLOAD_URL}?uploadType=resumable&fields=id",
        data=json.dumps(meta).encode("utf-8"),
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-Upload-Content-Type": "audio/mpeg",
            "X-Upload-Content-Length": str(file_size)
        },
        method="POST"
    )
    upload_url = init_headers.get("Location")
    if not upload_url:
        raise RuntimeError("Không nhận được upload Location từ Drive resumable init")

    with open(file_path, "rb") as f:
        file_bytes = f.read()

    body, status, _ = http_drive_request(
        upload_url,
        data=file_bytes,
        headers={"Content-Type": "audio/mpeg", "Content-Length": str(file_size)},
        method="PUT",
        auth=False
    )
    file_id = json.loads(body.decode("utf-8"))["id"]

    # Cấp quyền public đọc (best effort)
    try:
        http_drive_request(
            f"{FILES_URL}/{file_id}/permissions",
            data=json.dumps({"type": "anyone", "role": "reader"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
    except Exception as e:
        print(f"Lưu ý cấp quyền public đọc file {file_id}: {e}")

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

def sync_job_to_index(job):
    try:
        idx_doc = drive_get_json("audio-jobs/index.json") or {"jobs": []}
        jobs_list = idx_doc.get("jobs", [])
        matched = False
        for item in jobs_list:
            if item.get("id") == job["id"]:
                item["status"] = job.get("status")
                item["progress"] = job.get("progress")
                item["completedChapters"] = job.get("completedChapters")
                item["currentChapter"] = job.get("currentChapter")
                item["stageMessage"] = job.get("stageMessage")
                item["updatedAt"] = job.get("updatedAt")
                matched = True
                break
        if not matched:
            jobs_list.append(job)
        idx_doc["jobs"] = jobs_list[:100]
        idx_doc["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        drive_put_json("audio-jobs/index.json", idx_doc)
    except Exception as e:
        print(f"Lưu ý: Không thể đồng bộ index.json ({e})")

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
    last_stage_update = 0
    total_chunks = len(chunks)
    for c_idx, chunk in enumerate(chunks, 1):
        # Tiết giảm tần suất cập nhật stageMessage (ít nhất 25s/lần) để tránh nghẽn Google Drive API
        now = time.time()
        if c_idx == 1 or c_idx == total_chunks or (now - last_stage_update >= 25):
            try:
                job["stageMessage"] = f"Kaggle GPU: Chương {chapter_num}/{job['totalChapters']} [Nguyễn Ngọc Ngạn] đoạn {c_idx}/{total_chunks}"
                job["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                drive_put_json(f"audio-jobs/jobs/{job['id']}.json", job)
                last_stage_update = now
            except Exception as e:
                print(f"Lưu ý: Bỏ qua ping tiến độ stageMessage ({e})")

        seed = SEEDS[(c_idx - 1) % len(SEEDS)]
        wav_path = os.path.join(work_dir, f"chunk_{c_idx:03d}.wav")
        audio = tts.infer(text=chunk, ref_audio=str(seed), temperature=0.7, top_p=0.9)
        tts.save(audio, wav_path)
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
        except Exception: pass
    try: os.remove(out_mp3)
    except Exception: pass

    return True

def main_loop():
    print(">>> Bắt đầu lắng nghe hàng đợi trên Google Drive...")
    while True:
        try:
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
            print(f"Xử lý Job: {job.get('bookTitle', job_id)} ({job['bookId']})")
            print(f"Tiến độ hiện tại: {job.get('completedChapters', 0)}/{job.get('totalChapters', 0)}")
            print(f"=======================================================")

            job["status"] = "running"
            job["attempts"] = int(job.get("attempts", 0)) + 1
            job["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            drive_put_json(f"audio-jobs/jobs/{job_id}.json", job)
            sync_job_to_index(job)

            start_ch = max(1, int(job.get("startChapter", 1)))
            total_ch = int(job.get("totalChapters", 1))

            with tempfile.TemporaryDirectory() as work_dir:
                for ch_num in range(start_ch, total_ch + 1):
                    # Kiểm tra cancel
                    try:
                        fresh = drive_get_json(f"audio-jobs/jobs/{job_id}.json")
                        if fresh and fresh.get("status") == "canceled":
                            print("Job đã bị người dùng hủy.")
                            break
                    except Exception:
                        pass

                    # Kiểm tra xem chương đã có audio chưa
                    try:
                        manifest = drive_get_json(f"audio-jobs/manifests/{job['bookId']}.json") or {}
                        aud_ch = manifest.get("audioChapters", {})
                        if str(ch_num) in aud_ch and aud_ch[str(ch_num)].get("ready"):
                            job["completedChapters"] = max(int(job.get("completedChapters", 0)), ch_num)
                            job["currentChapter"] = ch_num
                            continue
                    except Exception as e:
                        print(f"Lưu ý kiểm tra manifest chương {ch_num}: {e}")

                    # Xử lý chương với cơ chế thử lại nội bộ (lên tới 3 lần)
                    success = False
                    for ch_attempt in range(3):
                        t_ch_start = time.time()
                        try:
                            success = process_single_chapter(job, ch_num, work_dir)
                            if success:
                                ch_dur = time.time() - t_ch_start
                                job["completedChapters"] = max(int(job.get("completedChapters", 0)), ch_num)
                                job["currentChapter"] = ch_num
                                job["progress"] = int(round(ch_num / total_ch * 100))
                                job["stageMessage"] = f"Kaggle GPU: Đã tạo và đồng bộ chương {ch_num}/{total_ch} ({ch_dur:.1f}s)."
                                job["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                                drive_put_json(f"audio-jobs/jobs/{job_id}.json", job)
                                sync_job_to_index(job)
                                print(f"-> Hoàn tất chương {ch_num}/{total_ch} trong {ch_dur:.1f}s.")
                                break
                            else:
                                print(f"Chương {ch_num} chưa thành công (thử lại {ch_attempt + 1}/3)...")
                                time.sleep(3)
                        except Exception as ch_err:
                            print(f"[LỖI CHƯƠNG {ch_num}] Lần thử {ch_attempt + 1}/3: {ch_err}")
                            time.sleep(5)

                # Đánh dấu hoàn thành toàn bộ job nếu đủ số chương
                if job.get("completedChapters", 0) >= total_ch:
                    job["status"] = "completed"
                    job["progress"] = 100
                    job["stageMessage"] = "Kaggle GPU: Đã tạo và kiểm định toàn bộ audio thành công."
                    job["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                    drive_put_json(f"audio-jobs/jobs/{job_id}.json", job)
                    sync_job_to_index(job)
                    print(f">>> HOÀN THÀNH TOÀN BỘ SÁCH: {job.get('bookTitle', job_id)} <<<")

            time.sleep(5)
        except Exception as main_err:
            print(f"[CẢNH BÁO] Lỗi tạm thời trong vòng lặp hàng đợi: {main_err}")
            time.sleep(15)

if __name__ == "__main__":
    while True:
        try:
            main_loop()
        except KeyboardInterrupt:
            print("\nDừng worker.")
            break
        except Exception as e:
            print(f"\n[WORKER AUTO-RECOVER] Bắt gặp ngoại lệ ngoài: {e}. Tự động khởi động lại sau 15 giây...")
            time.sleep(15)
