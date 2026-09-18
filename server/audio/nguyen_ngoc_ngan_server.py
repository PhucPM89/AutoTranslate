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

app = FastAPI(title="Multi-Genre AI Voice Engine (VieNeu-TTS v3 Turbo)")

print("Đang nạp mô hình VieNeu-TTS v3 Turbo...")
from vieneu import Vieneu
tts = Vieneu(mode="v3turbo")
print("-> VieNeu-TTS v3 Turbo đã sẵn sàng phục vụ tất cả các thể loại!")

REPO_VOICES = Path(__file__).parent / "voices"
FALLBACK_VOICES = Path(r"D:\F5_TTS_Space\voices")
REF_DIR = REPO_VOICES if REPO_VOICES.exists() and any(REPO_VOICES.glob("*.wav")) else FALLBACK_VOICES

# Tập seed mẫu của Chú Nguyễn Ngọc Ngạn
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
        "supported_genres": [
            "linh-di (Nguyễn Ngọc Ngạn Voice Clone)",
            "tien-hiep (Thái Sơn / Thiền Tâm Đức)",
            "do-thi (Quỳnh Anh / Mỹ Duyên / Trúc Ly)",
            "mat-the (Mạnh Dũng)",
            "trinh-tham (Anh Khôi / Thanh Bình)"
        ]
    }

@app.post("/synthesize")
async def synthesize_endpoint(request: Request):
    data = await request.json()
    text = data.get("text", "").strip()
    genre_key = data.get("genre_key", "linh-di")
    preset_voice = data.get("preset_voice", None)
    
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    try:
        # 1. Thể loại Linh dị / Kinh dị: Dùng mô hình Voice Cloning Chú Nguyễn Ngọc Ngạn
        if genre_key == "linh-di" or data.get("engine") == "nguyen-ngoc-ngan-ai":
            ref_idx = int(data.get("seed_index", 0))
            ref_file = NGAN_SEEDS[ref_idx % len(NGAN_SEEDS)] if NGAN_SEEDS and NGAN_SEEDS[0].exists() else DEFAULT_NGAN
            audio = tts.infer(text=text, ref_audio=str(ref_file), temperature=0.7, top_p=0.9)
            
        # 2. Các thể loại khác: Dùng giọng AI Neural chuẩn studio theo từng thể loại
        else:
            target_voice = preset_voice or "Quỳnh Anh"
            audio = tts.infer(text=text, voice=target_voice, temperature=0.75, top_p=0.9)

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        tmp.close()
        tts.save(audio, tmp.name)
        return FileResponse(tmp.name, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8989, log_level="info")
