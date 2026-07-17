"""
Kokoro TTS microservice for Rive LipSync Previewer.
Runs on http://127.0.0.1:3922
"""

from __future__ import annotations

import io
import traceback
from typing import Optional

import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

PORT = 3922
SAMPLE_RATE = 24000

# Common Kokoro voices (lang_code first letter matches voice prefix)
VOICES = [
    {"id": "af_heart", "label": "Heart（女声，美式英文）", "lang": "a"},
    {"id": "af_bella", "label": "Bella（女声，美式英文）", "lang": "a"},
    {"id": "af_sarah", "label": "Sarah（女声，美式英文）", "lang": "a"},
    {"id": "am_adam", "label": "Adam（男声，美式英文）", "lang": "a"},
    {"id": "am_michael", "label": "Michael（男声，美式英文）", "lang": "a"},
    {"id": "bf_emma", "label": "Emma（女声，英式英文）", "lang": "b"},
    {"id": "bm_george", "label": "George（男声，英式英文）", "lang": "b"},
    {"id": "zf_xiaobei", "label": "晓蓓（女声，中文）", "lang": "z"},
    {"id": "zf_xiaoni", "label": "晓妮（女声，中文）", "lang": "z"},
    {"id": "zf_xiaoxiao", "label": "晓晓（女声，中文）", "lang": "z"},
    {"id": "zf_xiaoyi", "label": "晓伊（女声，中文）", "lang": "z"},
    {"id": "zm_yunjian", "label": "云健（男声，中文）", "lang": "z"},
    {"id": "zm_yunxi", "label": "云希（男声，中文）", "lang": "z"},
    {"id": "zm_yunxia", "label": "云夏（男声，中文）", "lang": "z"},
    {"id": "zm_yunyang", "label": "云扬（男声，中文）", "lang": "z"},
]

VOICE_LANG = {v["id"]: v["lang"] for v in VOICES}

app = FastAPI(title="Kokoro TTS for Rive LipSync")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_pipelines: dict[str, object] = {}
_ready = False
_init_error = ""


class SynthRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: str = "af_heart"
    speed: float = 1.0
    lang: Optional[str] = None


def ensure_pipeline(lang: str):
    global _ready, _init_error
    if lang in _pipelines:
        return _pipelines[lang]
    try:
        from kokoro import KPipeline

        pipeline = KPipeline(lang_code=lang)
        _pipelines[lang] = pipeline
        _ready = True
        _init_error = ""
        return pipeline
    except Exception as exc:  # noqa: BLE001
        _init_error = str(exc)
        raise


@app.on_event("startup")
def warmup() -> None:
    """Preload English pipeline so first request is faster."""
    try:
        ensure_pipeline("a")
        print("Kokoro English pipeline ready.")
    except Exception as exc:  # noqa: BLE001
        print(f"Kokoro warmup deferred: {exc}")


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "kokoro",
        "ready": _ready or bool(_pipelines),
        "error": _init_error,
        "port": PORT,
        "voices": len(VOICES),
    }


@app.get("/voices")
def voices():
    return {"voices": VOICES}


@app.post("/tts")
def synthesize(req: SynthRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "缺少文本。")

    voice = req.voice.strip() or "af_heart"
    lang = (req.lang or VOICE_LANG.get(voice) or "a").strip() or "a"
    speed = float(req.speed) if req.speed else 1.0
    speed = max(0.5, min(2.0, speed))

    try:
        pipeline = ensure_pipeline(lang)
        chunks = []
        for _gs, _ps, audio in pipeline(text, voice=voice, speed=speed):
            if audio is None:
                continue
            arr = np.asarray(audio, dtype=np.float32)
            if arr.size:
                chunks.append(arr)

        if not chunks:
            raise HTTPException(500, "Kokoro 没有返回音频数据。")

        audio = np.concatenate(chunks)
        buffer = io.BytesIO()
        sf.write(buffer, audio, SAMPLE_RATE, format="WAV")
        return Response(content=buffer.getvalue(), media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        raise HTTPException(500, f"Kokoro 合成失败：{exc}") from exc


if __name__ == "__main__":
    host = "0.0.0.0"
    print(f"Kokoro TTS listening on http://{host}:{PORT}")
    uvicorn.run(app, host=host, port=PORT, log_level="info")
