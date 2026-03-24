# ============================================================
# main.py — FastAPI backend connected to Ollama (local AI)
# PFE Project — AI Testing with Selenium
# ============================================================
#
# SETUP BEFORE RUNNING THIS FILE :
#
# 1. Install Ollama
#    → Download from https://ollama.com
#    → Open terminal : ollama pull llama3
#    → Ollama runs at : http://localhost:11434
#
# 2. Install Python dependencies
#    → pip install fastapi uvicorn python-dotenv
#
# 3. Run this file
#    → uvicorn main:app --reload
#    → API available at : http://localhost:8000
#
# ============================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import subprocess
import shutil
import json
import re
import os
from pydantic import BaseModel, Field
from typing import List, Optional

# ✅ Lire les variables depuis le fichier .env
from dotenv import load_dotenv
load_dotenv()

# ============================================================
# Variables lues depuis .env
# ============================================================

# Modèle Ollama à utiliser (défaut : llama3)
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

# Mode mock : si true → retourne des données statiques sans appeler Ollama
# Utile pour tester l'interface sans attendre l'IA
USE_MOCK = os.getenv("USE_MOCK", "false").lower() in ("1", "true", "yes")

# ============================================================
# App initialization
# ============================================================

app = FastAPI(
    title="Ollama AI API",
    description="FastAPI backend that communicates with Ollama local AI",
    version="1.0.0"
)

# ============================================================
# CORS Middleware
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# Helper : trouver le chemin d'Ollama automatiquement
# Fonctionne sur Windows, Mac, Linux
# ============================================================

def get_ollama_path() -> str:
    # Cherche ollama dans le PATH système (Mac/Linux)
    ollama_path = shutil.which("ollama")
    if ollama_path:
        return ollama_path
    # Fallback Windows si pas dans le PATH
    fallback = r"C:\Users\MSI\AppData\Local\Programs\Ollama\ollama.exe"
    return fallback

# ============================================================
# Helpers : parser la réponse d'Ollama
# ============================================================

def _strip_code_fences(text: str) -> str:
    trimmed = (text or "").strip()
    if not trimmed.startswith("```"):
        return trimmed
    trimmed = trimmed.replace("```json", "```").replace("```JSON", "```")
    lines = trimmed.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _extract_steps_from_text(text: str) -> List[str]:
    raw = _strip_code_fences(text)

    # Essai 1 : JSON array strict ["step1", "step2"]
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except Exception:
        pass

    # Essai 2 : trouver un array JSON dans le texte
    left = raw.find("[")
    right = raw.rfind("]")
    if left != -1 and right != -1 and right > left:
        candidate = raw[left: right + 1]
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass

    # Essai 3 : parser ligne par ligne (liste à puces ou numérotée)
    steps: List[str] = []
    for line in raw.splitlines():
        l = line.strip()
        if not l:
            continue
        l = l.lstrip("-*•").strip()
        l = re.sub(r"^\s*\d+\s*[\).\:\-]\s*", "", l).strip()
        if l:
            steps.append(l)
    return steps

# ============================================================
# Helper : appeler Ollama via subprocess
# ============================================================

def _run_ollama(prompt: str) -> str:
    ollama_path = get_ollama_path()

    result = subprocess.run(
        [ollama_path, "run", OLLAMA_MODEL],  # ✅ lit OLLAMA_MODEL depuis .env
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
    )

    stdout = (result.stdout or "").strip()
    if stdout:
        return stdout

    stderr = (result.stderr or "").strip()
    if stderr:
        raise RuntimeError(stderr)
    raise RuntimeError("Ollama returned an empty response.")

# ============================================================
# Données mock — retournées quand USE_MOCK=true dans .env
# Permet de tester l'interface sans lancer Ollama
# ============================================================

MOCK_STEPS = [
    "Navigate to the target URL and verify the page loads correctly",
    "Verify the login form displays email and password fields",
    "Enter an email without @ and verify the error message appears",
    "Enter an empty email and verify the required field error",
    "Enter a password shorter than 8 characters and verify rejection",
    "Enter valid credentials and verify redirect to inbox",
    "Verify the inbox displays a list of received emails",
    "Click on an email and verify it opens correctly",
    "Verify each email shows sender, subject and date",
    "Enter wrong password and verify the error message is displayed",
]

# ============================================================
# Models Pydantic
# ============================================================

class GeneratePlanRequest(BaseModel):
    spec_text: str = Field(..., description="Text extracted from the specification document")
    url_cible: str = Field(..., description="Target URL of the application to test")
    description: Optional[str] = Field(default=None)


class GeneratePlanResponse(BaseModel):
    steps: List[str]

# ============================================================
# GET / — Health check
# ============================================================

@app.get("/")
def root():
    return {
        "status": "running",
        "message": "Ollama FastAPI is live. POST to /chat to use it.",
        "model": OLLAMA_MODEL,           # ✅ affiche le modèle utilisé
        "mock_mode": USE_MOCK            # ✅ affiche si mock activé
    }

# ============================================================
# POST /chat — Chat avec Ollama
# Body : { "message": "..." }
# ============================================================

@app.post("/chat")
def chat(data: dict):
    message = data.get("message", "")

    if not message.strip():
        return JSONResponse(
            status_code=400,
            content={"reply": "Message is empty."}
        )

    # ✅ Mode mock — retourne une réponse statique sans appeler Ollama
    if USE_MOCK:
        return JSONResponse({
            "reply": f"[MOCK] Received: {message[:100]}... (Ollama not called)"
        })

    try:
        ollama_path = get_ollama_path()
        result = subprocess.run(
            [ollama_path, "run", OLLAMA_MODEL],
            input=message,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120
        )

        reply = result.stdout.strip()

        if not reply:
            return JSONResponse(
                status_code=500,
                content={"reply": f"Ollama returned empty. Is {OLLAMA_MODEL} installed? Run: ollama pull {OLLAMA_MODEL}"}
            )

        return JSONResponse({"reply": reply})

    except FileNotFoundError:
        return JSONResponse(
            status_code=500,
            content={"reply": "Ollama not found. Install it from https://ollama.com"}
        )
    except subprocess.TimeoutExpired:
        return JSONResponse(
            status_code=504,
            content={"reply": "Ollama took too long. Try a shorter message."}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"reply": f"Erreur Ollama : {str(e)}"}
        )

# ============================================================
# POST /generate-plan — Générer le plan de test
# Body : { spec_text, url_cible, description }
# ============================================================

@app.post("/generate-plan", response_model=GeneratePlanResponse)
def generate_plan(payload: GeneratePlanRequest):
    spec_text = (payload.spec_text or "").strip()
    url_cible = (payload.url_cible or "").strip()
    description = (payload.description or "").strip()

    if not spec_text:
        return JSONResponse(status_code=400, content={"error": "spec_text is required"})
    if not url_cible:
        return JSONResponse(status_code=400, content={"error": "url_cible is required"})

    # ✅ Mode mock — retourne des steps statiques sans appeler Ollama
    if USE_MOCK:
        return {"steps": MOCK_STEPS}

    # Construire le prompt pour Ollama
    prompt = "\n".join([
        "You are a senior QA engineer.",
        "Your job is to generate an E2E test plan from a specification.",
        "Return ONLY a valid JSON array of strings (no markdown, no explanations).",
        "Each string must be one actionable test step (max 1 sentence).",
        "Between 6 and 25 steps. Use imperative verbs.",
        "Include steps for authentication, navigation, data validation, and error handling.",
        "",
        f"Target URL: {url_cible}",
        f"Testing scope: {description}" if description else "Testing scope: (none)",
        "",
        "Specification text:",
        spec_text,
    ])

    try:
        reply = _run_ollama(prompt)
        steps = _extract_steps_from_text(reply)
        steps = [s for s in (steps or []) if s][:50]

        if not steps:
            return JSONResponse(
                status_code=502,
                content={"error": "AI returned empty plan"},
            )

        return {"steps": steps}

    except FileNotFoundError:
        return JSONResponse(
            status_code=500,
            content={"error": "Ollama not found. Install it from https://ollama.com"},
        )
    except subprocess.TimeoutExpired:
        return JSONResponse(
            status_code=504,
            content={"error": "Ollama took too long. Try a smaller spec."},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Erreur Ollama : {str(e)}"}
        )