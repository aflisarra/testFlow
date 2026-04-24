"""
FastAPI routes for:
- POST /upload-spec
- POST /generate-plan

This module intentionally contains no business logic.
"""

from __future__ import annotations

import subprocess
from typing import Optional

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from core.config import get_settings
from schemas.test_plan_schema import GeneratePlanRequest, GeneratePlanResponse
from services.plan_service import generate_test_plans
from services.spec_service import extract_spec_text_from_docx_bytes


router = APIRouter()


def _error_payload(message: str, detail: Optional[str] = None) -> dict:
    settings = get_settings()
    if detail and settings.debug_errors:
        return {"error": message, "detail": detail}
    return {"error": message}


@router.post("/upload-spec")
async def upload_spec(file: UploadFile = File(...)):
    """Upload a .docx file and extract its text content."""
    if not (file.filename or "").lower().endswith(".docx"):
        return JSONResponse(status_code=400, content={"error": "Only .docx files are supported."})

    try:
        file_bytes = await file.read()
        spec_text = extract_spec_text_from_docx_bytes(file_bytes)

        if not spec_text.strip():
            return JSONResponse(status_code=422, content={"error": "Document is empty or has no readable text."})

        return {"filename": file.filename, "spec_text": spec_text, "char_count": len(spec_text)}
    except RuntimeError as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": f"Upload failed: {str(exc)}"})


@router.post("/generate-plan", response_model=GeneratePlanResponse)
def generate_plan(payload: GeneratePlanRequest):
    """
    Generate enterprise-grade, non-overlapping test plans from spec + style config.
    Compatibility: keeps the existing response shape: {"test_plans":[...]}.
    """
    spec_text = (payload.spec_text or "").strip()
    style_config = (payload.style_config or "").strip()
    project_title = (payload.project_title or "").strip()

    if not spec_text:
        return JSONResponse(status_code=400, content={"error": "spec_text is required"})

    try:
        plans = generate_test_plans(spec_text=spec_text, style_config=style_config, project_title=project_title)
        return {"test_plans": plans}
    except FileNotFoundError:
        return JSONResponse(status_code=500, content=_error_payload("Ollama not found. Install from https://ollama.com"))
    except subprocess.TimeoutExpired:
        return JSONResponse(
            status_code=504,
            content=_error_payload("Ollama took too long. Check OLLAMA_TEST_PLANS_TIMEOUT / OLLAMA_TIMEOUT."),
        )
    except ValueError as exc:
        return JSONResponse(status_code=502, content=_error_payload("AI returned invalid JSON.", str(exc)))
    except RuntimeError as exc:
        return JSONResponse(status_code=502, content=_error_payload("Ollama error.", str(exc)))
    except Exception as exc:
        return JSONResponse(status_code=500, content=_error_payload("Internal error.", str(exc)))

