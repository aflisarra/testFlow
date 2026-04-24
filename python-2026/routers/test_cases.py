"""
FastAPI route for:
- POST /generate-test-cases

This module intentionally contains no business logic.
"""

from __future__ import annotations

import subprocess
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.config import get_settings
from schemas.test_case_schema import GenerateTestCasesRequest, TestCasesResponse
from services.case_service import generate_test_cases


router = APIRouter()


def _error_payload(message: str, detail: Optional[str] = None) -> dict:
    settings = get_settings()
    if detail and settings.debug_errors:
        return {"error": message, "detail": detail}
    return {"error": message}


@router.post("/generate-test-cases", response_model=TestCasesResponse)
def generate_test_cases_route(payload: GenerateTestCasesRequest):
    """
    Generate detailed test cases for a confirmed plan.
    Compatibility: keeps the existing response shape:
    {"plan_id": "...", "plan_title": "...", "test_cases": [...]}
    """
    plan_id = (payload.plan_id or "").strip()
    plan_title = (payload.plan_title or "").strip()
    plan_description = (payload.plan_description or "").strip()
    spec_text = (payload.spec_text or "").strip()
    style_config = (payload.style_config or "").strip()
    project_title = (payload.project_title or "").strip()

    if not plan_id:
        return JSONResponse(status_code=400, content={"error": "plan_id is required"})
    if not plan_title:
        return JSONResponse(status_code=400, content={"error": "plan_title is required"})
    if not spec_text:
        return JSONResponse(status_code=400, content={"error": "spec_text is required"})

    try:
        cases = generate_test_cases(
            plan_id=plan_id,
            plan_title=plan_title,
            plan_description=plan_description,
            spec_text=spec_text,
            style_config=style_config,
            project_title=project_title,
        )
        return {"plan_id": plan_id, "plan_title": plan_title, "test_cases": cases}
    except FileNotFoundError:
        return JSONResponse(status_code=500, content=_error_payload("Ollama not found. Install from https://ollama.com"))
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=504, content=_error_payload("Ollama took too long."))
    except ValueError as exc:
        return JSONResponse(status_code=502, content=_error_payload("AI returned invalid JSON.", str(exc)))
    except RuntimeError as exc:
        return JSONResponse(status_code=502, content=_error_payload("Ollama error.", str(exc)))
    except Exception as exc:
        return JSONResponse(status_code=500, content=_error_payload("Internal error.", str(exc)))

