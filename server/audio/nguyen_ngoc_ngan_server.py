import os
import sys
import tempfile
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
import uvicorn
import soundfile as sf
import numpy as np

app = FastAPI(title="Nguyen Ngoc Ngan Real AI Voice Engine (VieNeu-TTS Turbo)")

# Nạp model VieNeu-TTS v3 Turbo ONNX (Chạy CPU siêu nhanh, chuẩn giọng clone)
print("Đang nạp mô hình VieNeu-TTS v3 Turbo...")
from vieneu import Vieneu
tts = Vieneu(mode="v3turbo")
print("-> VieNeu-TTS v3 Turbo đã sẵn sàng!")

# Thư mục chứa voice sample của Chú Nguyễn Ngọc Ngạn
REPO_VOICES = Path(__file__).parent / "voices"
FALLBACK_VOICES = Path(r"D:\F5_TTS_Space\voices")
REF_DIR = REPO_VOICES if REPO_VOICES.exists() and any(REPO_VOICES.glob("*.wav")) else FALLBACK_VOICES

SEEDS = [
    REF_DIR / "nguyen_ngoc_ngan_seed_00.wav",
    REF_DIR / "nguyen_ngoc_ngan_seed_01.wav",
    REF_DIR / "nguyen_ngoc_ngan_seed_02.wav",
    REF_DIR / "nguyen_ngoc_ngan_seed_03.wav",
    REF_DIR / "nguyen_ngoc_ngan_seed_04.wav"
]
DEFAULT_REF = SEEDS[0] if SEEDS[0].exists() else REF_DIR / "nguyen_ngoc_ngan.wav"

@app.get("/health")
def health():
    return {"status": "ok", "model": "VieNeu-TTS-v3-Turbo", "voice": "Nguyen Ngoc Ngan Clone"}

@app.post("/synthesize")
async def synthesize_endpoint(request: Request):
    data = await request.json()
    text = data.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
        
    ref_idx = int(data.get("seed_index", 0))
    ref_file = SEEDS[ref_idx % len(SEEDS)] if SEEDS and SEEDS[0].exists() else DEFAULT_REF
    
    # Render audio qua VieNeu-TTS với giọng chú Nguyễn Ngọc Ngạn
    try:
        audio = tts.infer(text=text, ref_audio=str(ref_file), temperature=0.7, top_p=0.9)
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp.close()
        tts.save(audio, tmp.name)
        return FileResponse(tmp.name, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8989, log_level="info")
