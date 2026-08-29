"""
HachimiMT Google Colab Server
Translates Chinese web novel text to Vietnamese using the HachimiMT model series from Hugging Face.
Supports CTranslate2 for ultra-fast GPU/CPU inference + FastAPI + Cloudflare Tunnel.
"""

import os
import sys
import time
import subprocess
import threading
import re
from typing import List, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from hachimi_text import split_text_by_token_budget

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_MODEL_ID = os.environ.get("MODEL_ID", "ngocdang83/HachimiMT-60-QT")
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8000"))

app = FastAPI(
    title="HachimiMT Translation Server",
    description="High-performance Chinese -> Vietnamese translation API powered by HachimiMT",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Translation Engine Wrapper (CTranslate2 + Transformers Tokenizer)
# ---------------------------------------------------------------------------
class HachimiEngine:
    def __init__(self, model_id: str = DEFAULT_MODEL_ID):
        self.model_id = model_id
        self.translator = None
        self.tokenizer = None
        self.device = "cpu"
        self.compute_type = "int8"
        self.is_ready = False
        self._init_model()

    def _init_model(self):
        import torch
        import ctranslate2
        from transformers import AutoTokenizer
        from huggingface_hub import snapshot_download

        print(f"[HachimiMT] Loading model: {self.model_id}...")
        
        # Check GPU availability
        if torch.cuda.is_available():
            self.device = "cuda"
            self.compute_type = "int8_float16" # Fast & low VRAM on Colab T4
            print(f"[HachimiMT] GPU Detected: {torch.cuda.get_device_name(0)} (Using CUDA + {self.compute_type})")
        else:
            self.device = "cpu"
            self.compute_type = "int8"
            print(f"[HachimiMT] No GPU detected. Using CPU + {self.compute_type}")

        # Download model repo from Hugging Face
        model_path = snapshot_download(repo_id=self.model_id)
        
        # Load Tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)

        # Check if CTranslate2 converted weights exist in repo, otherwise load from ct2 directory or root
        ct2_dir = os.path.join(model_path, "ct2-int8_float32")
        if not os.path.exists(ct2_dir):
            ct2_dir = os.path.join(model_path, "ct2")
        if not os.path.exists(ct2_dir):
            ct2_dir = model_path # Root might be ct2 format directly

        try:
            print(f"[HachimiMT] Loading CTranslate2 model from {ct2_dir}...")
            self.translator = ctranslate2.Translator(
                ct2_dir,
                device=self.device,
                compute_type=self.compute_type,
                intra_threads=4,
                inter_threads=2
            )
            print("[HachimiMT] CTranslate2 Translator initialized successfully.")
        except Exception as e:
            print(f"[HachimiMT] CTranslate2 direct load failed ({e}). Falling back to Transformers pipeline...")
            from transformers import AutoModelForSeq2SeqLM, pipeline
            model = AutoModelForSeq2SeqLM.from_pretrained(model_path)
            if self.device == "cuda":
                model = model.half().to("cuda")
            self.pipe = pipeline(
                "translation",
                model=model,
                tokenizer=self.tokenizer,
                device=0 if self.device == "cuda" else -1
            )
            self.translator = None

        self.is_ready = True
        print(f"[HachimiMT] Model {self.model_id} is READY for translation!")

    def translate_batch(self, texts: List[str], max_length: int = 512, beam_size: int = 4) -> List[str]:
        if not texts:
            return []
        
        # Filter empty texts
        cleaned_indices = []
        cleaned_texts = []
        for i, t in enumerate(texts):
            s = str(t or "").strip()
            if s:
                for piece in split_text_by_token_budget(s, self.tokenizer, max_tokens=min(440, max_length - 32)):
                    cleaned_indices.append(i)
                    cleaned_texts.append(piece)
        
        if not cleaned_texts:
            return [""] * len(texts)

        results = [""] * len(texts)

        if self.translator is not None:
            # Tokenize using Transformers
            # MarianTokenizer tokenization
            source_tokens = [self.tokenizer.convert_ids_to_tokens(self.tokenizer.encode(t, truncation=False)) for t in cleaned_texts]
            
            # CTranslate2 translate_batch
            translations = self.translator.translate_batch(
                source_tokens,
                beam_size=beam_size,
                max_input_length=max_length,
                max_decoding_length=max_length,
                repetition_penalty=1.2,
                no_repeat_ngram_size=2
            )
            
            for idx, trans in zip(cleaned_indices, translations):
                output_tokens = trans.hypotheses[0]
                output_ids = self.tokenizer.convert_tokens_to_ids(output_tokens)
                decoded = self.tokenizer.decode(output_ids, skip_special_tokens=True)
                results[idx] = " ".join(part for part in (results[idx], decoded.strip()) if part)
        else:
            # Transformers pipeline fallback
            pipe_outs = self.pipe(
                cleaned_texts,
                max_length=max_length,
                num_beams=beam_size,
                repetition_penalty=1.2,
                no_repeat_ngram_size=2,
                batch_size=min(32, len(cleaned_texts))
            )
            for idx, out in zip(cleaned_indices, pipe_outs):
                decoded = out.get("translation_text", "").strip()
                results[idx] = " ".join(part for part in (results[idx], decoded) if part)

        return results

    def translate_paragraph(self, text: str, max_chunk_size: int = 400) -> str:
        """
        Translates a full text preserving multi-paragraph structure (\n\n).
        """
        if not text or not text.strip():
            return ""

        # Split into lines/paragraphs
        lines = text.split("\n")
        non_empty_indices = []
        batch_lines = []

        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped:
                non_empty_indices.append(i)
                batch_lines.append(stripped)

        if not batch_lines:
            return text

        # Translate in batches of 16-32 paragraphs
        BATCH_SIZE = 32
        translated_lines_map = {}

        for b_start in range(0, len(batch_lines), BATCH_SIZE):
            chunk = batch_lines[b_start : b_start + BATCH_SIZE]
            translated_chunk = self.translate_batch(chunk)
            for idx_in_batch, trans_text in enumerate(translated_chunk):
                original_line_idx = non_empty_indices[b_start + idx_in_batch]
                translated_lines_map[original_line_idx] = trans_text

        # Reconstruct original line structure
        output_lines = []
        for i, line in enumerate(lines):
            if i in translated_lines_map:
                output_lines.append(translated_lines_map[i])
            else:
                output_lines.append("")

        return "\n".join(output_lines)

# Global engine instance
engine: Optional[HachimiEngine] = None

# ---------------------------------------------------------------------------
# API Models
# ---------------------------------------------------------------------------
class TranslateRequest(BaseModel):
    text: str
    max_length: Optional[int] = 512
    beam_size: Optional[int] = 4

class BatchTranslateRequest(BaseModel):
    texts: List[str]
    max_length: Optional[int] = 512
    beam_size: Optional[int] = 4

# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------
@app.on_event("startup")
def startup_event():
    global engine
    engine = HachimiEngine()

@app.get("/")
@app.get("/health")
def health_check():
    global engine
    if not engine or not engine.is_ready:
        return {"status": "loading", "ready": False}
    return {
        "status": "ok",
        "ready": True,
        "model": engine.model_id,
        "device": engine.device,
        "compute_type": engine.compute_type
    }

@app.post("/translate")
def translate(req: TranslateRequest):
    global engine
    if not engine or not engine.is_ready:
        raise HTTPException(status_code=503, detail="Model is still initializing.")
    
    t0 = time.time()
    translation = engine.translate_paragraph(req.text)
    latency_ms = round((time.time() - t0) * 1000, 2)
    
    return {
        "translation": translation,
        "latency_ms": latency_ms,
        "model": engine.model_id
    }

@app.post("/translate-batch")
def translate_batch(req: BatchTranslateRequest):
    global engine
    if not engine or not engine.is_ready:
        raise HTTPException(status_code=503, detail="Model is still initializing.")
    
    t0 = time.time()
    translations = engine.translate_batch(
        req.texts,
        max_length=req.max_length or 512,
        beam_size=req.beam_size or 4
    )
    latency_ms = round((time.time() - t0) * 1000, 2)

    return {
        "translations": translations,
        "count": len(translations),
        "latency_ms": latency_ms,
        "model": engine.model_id
    }

# ---------------------------------------------------------------------------
# Tunnel Helper (Cloudflare Tunnel) & R2 Auto-Sync
# ---------------------------------------------------------------------------
def sync_url_to_r2(url: str):
    """Tự động ghi URL mới lên Cloudflare R2 để backend tự động kết nối mà không cần copy dán thủ công"""
    try:
        import boto3
        import json
        
        r2_endpoint = os.environ.get("R2_ENDPOINT", "https://aa644d98f2377007f0fa98abcafe3d21.r2.cloudflarestorage.com")
        r2_access_key = os.environ.get("R2_ACCESS_KEY_ID", "")
        r2_secret_key = os.environ.get("R2_SECRET_ACCESS_KEY", "")
        r2_bucket = os.environ.get("R2_BUCKET", "novel-storage")

        s3 = boto3.client(
            "s3",
            endpoint_url=r2_endpoint,
            aws_access_key_id=r2_access_key,
            aws_secret_access_key=r2_secret_key,
            region_name="auto"
        )
        
        payload = json.dumps({
            "url": url,
            "updated_at": time.time(),
            "model": DEFAULT_MODEL_ID
        }).encode("utf-8")
        
        s3.put_object(
            Bucket=r2_bucket,
            Key="config/hachimi_url.json",
            Body=payload,
            ContentType="application/json"
        )
        print(f"✓ [Auto-Sync] Đã tự động cập nhật Public URL lên R2 Storage: {url}")
        print("✓ Backend / Script dịch sẽ tự động kết nối mà bạn KHÔNG cần copy-paste URL!")
    except Exception as e:
        print(f"[Auto-Sync Notice]: {e}")

def start_cloudflare_tunnel(port: int = PORT):
    print("\n[Tunnel] Starting Cloudflare Tunnel...")
    
    # Download cloudflared if not present
    if not os.path.exists("./cloudflared"):
        print("[Tunnel] Downloading cloudflared binary...")
        subprocess.run(
            ["wget", "-q", "-nc", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "-O", "cloudflared"],
            check=True
        )
        subprocess.run(["chmod", "+x", "cloudflared"], check=True)
    
    process = subprocess.Popen(
        ["./cloudflared", "tunnel", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    
    tunnel_url = None
    for line in iter(process.stdout.readline, ''):
        if not line:
            break
        match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
        if match:
            tunnel_url = match.group(0)
            print("\n" + "=" * 65)
            print("🚀 HACHIMI-MT TRANSLATION API IS LIVE!")
            print(f"👉 PUBLIC API URL: {tunnel_url}")
            print("=" * 65)
            # Tự động đồng bộ lên R2
            sync_url_to_r2(tunnel_url)
            print("=" * 65 + "\n")
            break

if __name__ == "__main__":
    # Start tunnel in background thread
    tunnel_thread = threading.Thread(target=start_cloudflare_tunnel, args=(PORT,), daemon=True)
    tunnel_thread.start()

    # Start FastAPI server
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
