# ================================================================================
# MAIN.PY — FastAPI Application Entry Point
# ================================================================================
#
# PURPOSE:
# This file is the main entry point for the Python FastAPI backend.
# It initializes the FastAPI application, configures CORS, and registers
# all route modules (routers) for handling API requests.
#
# SETUP INSTRUCTIONS:
# 1. Install dependencies: pip install fastapi uvicorn python-dotenv python-docx python-multipart requests
# 2. Start the server: uvicorn main:app --reload
# 3. Server runs at http://localhost:8000
#
# ================================================================================
# API ENDPOINTS:
# ================================================================================
#   GET  /                      → Health check - returns server status
#   POST /chat                  → Free chat with Ollama AI model
#   POST /upload-spec           → Upload Word document → extracts spec_text
#   POST /generate-plan         → Generate Test Plans (TP-1, TP-2, ...)
#   POST /generate-test-cases  → Generate Test Cases (TC-1.1, TC-1.2, ...)
# ================================================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import subprocess
import os
from dotenv import load_dotenv

load_dotenv()

# Import utils first to ensure it's loaded before routers
from utils.ollama import run_ollama, get_ollama_model  # noqa: E402

OLLAMA_MODEL = get_ollama_model()
USE_MOCK     = os.getenv("USE_MOCK", "false").lower() in ("1", "true", "yes")


def _chat_timeout() -> int:
    raw = os.getenv("OLLAMA_CHAT_TIMEOUT", os.getenv("OLLAMA_TIMEOUT", "300"))
    try:
        return int(raw)
    except ValueError:
        return 300


app = FastAPI(
    title="Ollama AI API",
    description="Test Plan & Test Cases generation with Ollama",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy import routers to avoid StatReload partial-clean issues on Windows
from routers import test_plans, test_cases  # noqa: E402

app.include_router(test_plans.router)
app.include_router(test_cases.router)


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


@app.post("/chat")
def chat(data: dict):
    message = data.get("message", "")

    if not message.strip():
        return JSONResponse(status_code=400, content={"reply": "Message is empty."})

    if USE_MOCK:
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