import os
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1"
import sys
import tempfile
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
import uvicorn
import soundfile as sf
import numpy as np

app = FastAPI(title="Nguyen Ngoc Ngan AI Voice Engine (VieNeu-TTS v3 Turbo)")

print("Đang nạp mô hình VieNeu-TTS v3 Turbo...")
from vieneu import Vieneu
tts = Vieneu(mode="v3turbo")
print("-> VieNeu-TTS v3 Turbo (Giọng Nguyễn Ngọc Ngạn) đã sẵn sàng phục vụ toàn hệ thống!")

REPO_VOICES = Path(__file__).parent / "voices"
FALLBACK_VOICES = Path(r"D:\F5_TTS_Space\voices")
REF_DIR = REPO_VOICES if REPO_VOICES.exists() and any(REPO_VOICES.glob("*.wav")) else FALLBACK_VOICES

# Tập seed mẫu chuẩn chất giọng Chú Nguyễn Ngọc Ngạn
NGAN_SEEDS = [
    REF_DIR / "nguyen_ngoc_ngan_seed_00.wav",
    REF_DIR / "nguyen_ngoc_ngan_seed_01.wav",
    REF_DIR / "nguyen_ngoc_ngan_seed_02.wav",
    REF_DIR / "nguyen_ngoc_ngan_seed_03.wav",
    REF_DIR / "nguyen_ngoc_ngan_seed_04.wav"
]
DEFAULT_NGAN = NGAN_SEEDS[0] if NGAN_SEEDS[0].exists() else REF_DIR / "nguyen_ngoc_ngan.wav"

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": "VieNeu-TTS-v3-Turbo",
        "voice": "Nguyễn Ngọc Ngạn (Độc quyền toàn hệ thống)",
        "seeds_count": len(NGAN_SEEDS) if NGAN_SEEDS and NGAN_SEEDS[0].exists() else (1 if DEFAULT_NGAN.exists() else 0)
    }

@app.post("/synthesize")
async def synthesize_endpoint(request: Request):
    data = await request.json()
    text = data.get("text", "").strip()
    
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    try:
        # Toàn bộ hệ thống sử dụng duy nhất mô hình Voice Cloning Chú Nguyễn Ngọc Ngạn
        ref_idx = int(data.get("seed_index", 0))
        ref_file = NGAN_SEEDS[ref_idx % len(NGAN_SEEDS)] if NGAN_SEEDS and NGAN_SEEDS[0].exists() else DEFAULT_NGAN
        
        # Inference giọng đọc với nhiệt độ tự nhiên và giàu cảm xúc
        audio = tts.infer(text=text, ref_audio=str(ref_file), temperature=0.7, top_p=0.9)

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp.close()
        tts.save(audio, tmp.name)
        return FileResponse(tmp.name, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8989, log_level="info")
