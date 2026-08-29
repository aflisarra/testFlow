# ============================================================
# main.py — Point d'entrée principal
# ============================================================
#
# SETUP :
#   pip install fastapi uvicorn python-dotenv python-docx python-multipart requests
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
from routers import test_plans, test_cases
import subprocess
import os
from dotenv import load_dotenv
from routers.ai_decision import router as ai_router
from routers.ai_fix import router as ai_fix_router
from routers.test_runner import router as runner_router
load_dotenv(override=True)  # Must run before importing modules that read env vars.

from core.config import get_settings  # noqa: E402
#from routers import test_plans, test_cases, test_case_translator  # noqa: E402
from routers.cancellation import router as cancellation_router  # noqa: E402
from routers.health import router as health_router  # noqa: E402
from utils.ollama import run_ollama  # noqa: E402
from utils.logger import get_logger, log_event  # noqa: E402


settings = get_settings()
logger = get_logger("main")


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
#app.include_router(test_case_translator.router)
app.include_router(ai_router)        
app.include_router(ai_fix_router)
app.include_router(runner_router)
app.include_router(cancellation_router)
app.include_router(health_router)


# ── GET / — Health check ───────────────────────────────────
@app.get("/")
def root():
    log_event(logger, "health_root_called")
    logger.info(f"✅ FINAL test_data: {resolved_test_case.get('test_data')}")
    return {
        "status":    "running",
        "version":   "2.0.0",
        "model":     settings.model_name,
        "mock_mode": settings.use_mock,
        "endpoints": {
            "upload_spec":         "POST /upload-spec",
            "generate_test_plans": "POST /generate-plan",
            "generate_test_cases": "POST /generate-test-cases",
            "translate_test_case": "POST /translate-test-case",
            "cancel_generation": "POST /cancel-generation",
            "chat":                "POST /chat",
            "health":              "GET /health",
        }
    }


# ── POST /chat — Chat libre ────────────────────────────────
@app.post("/chat")
def chat(data: dict):
    message = data.get("message", "")

    if not message.strip():
        return JSONResponse(status_code=400, content={"reply": "Message is empty."})

    if settings.use_mock:
        return JSONResponse({"reply": f"[MOCK] Received: {message[:100]}..."})

    try:
        reply = run_ollama(message, timeout=_chat_timeout())
        return JSONResponse({"reply": reply})

    except FileNotFoundError as e:
        return JSONResponse(status_code=500, content={"reply": str(e)})
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=504, content={"reply": "Ollama took too long."})
    except RuntimeError as e:
        return JSONResponse(status_code=500, content={"reply": str(e)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"reply": str(e)})
