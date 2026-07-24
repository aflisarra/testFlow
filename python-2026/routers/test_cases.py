"""
FastAPI route for:
- POST /generate-test-cases

This module intentionally contains no business logic.
"""

from __future__ import annotations

import subprocess
import time
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.config import get_settings
from schemas.test_case_schema import GenerateTestCasesRequest, TestCasesResponse
from services.cancellation_service import is_cancelled
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

    if is_cancelled(
        test_suite_id=payload.test_suite_id,
        plan_id=plan_id,
        scope=payload.generation_scope or "cases",
        request_id=payload.generation_request_id,
    ):
        return JSONResponse(status_code=409, content={"error": "Generation cancelled by user."})

    t_start = time.monotonic()
    print(f"\n⏱ [generate-test-cases] plan_id={plan_id!r}  plan_title={plan_title!r}")
    print(f"⏱ [generate-test-cases] spec_chars={len(spec_text)}")

    try:
        t_ai_start = time.monotonic()
        cases = generate_test_cases(
            plan_id=plan_id,
            plan_title=plan_title,
            plan_description=plan_description,
            spec_text=spec_text,
            style_config=style_config,
            project_title=project_title,
        )
        t_ai_ms = int((time.monotonic() - t_ai_start) * 1000)
        t_total_ms = int((time.monotonic() - t_start) * 1000)
        print(f"⏱ [generate-test-cases] ai_ms={t_ai_ms}  total_ms={t_total_ms}  cases={len(cases)}")

        if is_cancelled(
            test_suite_id=payload.test_suite_id,
            plan_id=plan_id,
            scope=payload.generation_scope or "cases",
            request_id=payload.generation_request_id,
        ):
            return JSONResponse(status_code=409, content={"error": "Generation cancelled by user."})
        return {"plan_id": plan_id, "plan_title": plan_title, "test_cases": cases}
    except FileNotFoundError:
        t_total_ms = int((time.monotonic() - t_start) * 1000)
        print(f"⏱ [generate-test-cases] FAILED FileNotFoundError  total_ms={t_total_ms}")
        return JSONResponse(status_code=500, content=_error_payload("xAI client error. Check XAI_API_KEY."))
    except subprocess.TimeoutExpired:
        t_total_ms = int((time.monotonic() - t_start) * 1000)
        print(f"⏱ [generate-test-cases] TIMEOUT  total_ms={t_total_ms}")
        return JSONResponse(status_code=504, content=_error_payload("xAI took too long."))
    except ValueError as exc:
        t_total_ms = int((time.monotonic() - t_start) * 1000)
        print(f"⏱ [generate-test-cases] INVALID JSON  total_ms={t_total_ms}")
        return JSONResponse(status_code=502, content=_error_payload("AI returned invalid JSON.", str(exc)))
    except RuntimeError as exc:
        t_total_ms = int((time.monotonic() - t_start) * 1000)
        print(f"⏱ [generate-test-cases] RUNTIME ERROR  total_ms={t_total_ms}")
        return JSONResponse(status_code=502, content=_error_payload("xAI error.", str(exc)))
    except Exception as exc:
        t_total_ms = int((time.monotonic() - t_start) * 1000)
        print(f"⏱ [generate-test-cases] EXCEPTION  total_ms={t_total_ms}  error={exc}")
        return JSONResponse(status_code=500, content=_error_payload("Internal error.", str(exc)))
