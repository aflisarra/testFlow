# ============================================================
# main.py — Point d'entrée principal
# ============================================================
#
# SETUP :
#   pip install fastapi uvicorn python-dotenv python-docx python-multipart
#   uvicorn main:app --reload
#
# ENDPOINTS :
#   GET  /                      → Health check
#   POST /chat                  → Chat libre avec Ollama
#   POST /upload-spec           → Upload Word → extrait spec_text
#   POST /generate-plan         → Génère les Test Plans  (TP-1, TP-2 ...)
#   POST /generate-test-cases   → Génère les Test Cases  (TC-1.1, TC-1.2 ...)
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import subprocess
import os
from dotenv import load_dotenv

load_dotenv()  # Must run before importing modules that read env vars.

from routers import test_plans, test_cases  # noqa: E402
from utils.ollama import get_ollama_path, get_ollama_model  # noqa: E402

OLLAMA_MODEL = get_ollama_model()
USE_MOCK     = os.getenv("USE_MOCK", "false").lower() in ("1", "true", "yes")


def _chat_timeout() -> int:
    """
    Timeout dédié au endpoint /chat.
    Priorité:
      1) OLLAMA_CHAT_TIMEOUT
      2) OLLAMA_TIMEOUT
      3) 300s
    """
    raw = os.getenv("OLLAMA_CHAT_TIMEOUT", os.getenv("OLLAMA_TIMEOUT", "300"))
    try:
        return int(raw)
    except ValueError:
        return 300

# ── App ────────────────────────────────────────────────────
app = FastAPI(
    title="Ollama AI API",
    description="Test Plan & Test Cases generation with Ollama",
    version="2.0.0"
)

# ── CORS ───────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────
app.include_router(test_plans.router)
app.include_router(test_cases.router)

# ── GET / — Health check ───────────────────────────────────
@app.get("/")
def root():
    return {
        "status":    "running",
        "version":   "2.0.0",
        "model":     OLLAMA_MODEL,
        "mock_mode": USE_MOCK,
        "endpoints": {
            "upload_spec":         "POST /upload-spec",
            "generate_test_plans": "POST /generate-plan",
            "generate_test_cases": "POST /generate-test-cases",
            "chat":                "POST /chat",
        }
    }

# ── POST /chat — Chat libre ────────────────────────────────
@app.post("/chat")
def chat(data: dict):
    message = data.get("message", "")

    if not message.strip():
        return JSONResponse(status_code=400, content={"reply": "Message is empty."})

    if USE_MOCK:
        return JSONResponse({"reply": f"[MOCK] Received: {message[:100]}..."})

    try:
        ollama_path = get_ollama_path()
        result = subprocess.run(
            [ollama_path, "run", OLLAMA_MODEL],
            input=message,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=_chat_timeout()
        )
        reply = result.stdout.strip()
        if not reply:
            return JSONResponse(status_code=500, content={"reply": f"Ollama returned empty. Run: ollama pull {OLLAMA_MODEL}"})
        return JSONResponse({"reply": reply})

    except FileNotFoundError:
        return JSONResponse(status_code=500, content={"reply": "Ollama not found. Install from https://ollama.com"})
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=504, content={"reply": "Ollama took too long."})
    except Exception as e:
        return JSONResponse(status_code=500, content={"reply": str(e)})
