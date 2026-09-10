"""
FastAPI route for:
- POST /generate-test-cases

This module intentionally contains no business logic.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.config import get_settings
from schemas.test_case_schema import GenerateTestCasesRequest, TestCasesResponse
from services.cancellation_service import is_cancelled
from services.case_service import SrsExtractionError, generate_test_cases
from utils.logger import get_logger, log_error


router = APIRouter()
logger = get_logger("routers.test_cases")


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

    try:
        cases = generate_test_cases(
            plan_id=plan_id,
            plan_title=plan_title,
            plan_description=plan_description,
            spec_text=spec_text,
            style_config=style_config,
            project_title=project_title,
        )
        if is_cancelled(
            test_suite_id=payload.test_suite_id,
            plan_id=plan_id,
            scope=payload.generation_scope or "cases",
            request_id=payload.generation_request_id,
        ):
            return JSONResponse(status_code=409, content={"error": "Generation cancelled by user."})
        return TestCasesResponse(plan_id=plan_id, plan_title=plan_title, test_cases=cases)
    except SrsExtractionError as exc:
        # A genuine SRS-data problem (no usable "4. UI Components" section,
        # no matching subsection, or zero components in it). This is not an
        # AI/timeout failure — generate_test_cases already tried AI, retry,
        # and the deterministic fallback before raising this, so returning
        # 502/503/504 here would be misleading. 422 = the request/document
        # itself cannot be processed as given.
        message = str(exc)
        log_error(logger, "generate_cases_srs_extraction_error", error=message)
        return JSONResponse(status_code=422, content=_error_payload("Unable to extract UI Components from the SRS.", message))
    except FileNotFoundError:
        # Ollama binary/infra missing entirely — an environment problem,
        # not a transient AI failure, so it is not retried inside
        # generate_test_cases and still surfaces here.
        return JSONResponse(status_code=500, content=_error_payload("Ollama not found. Install from https://ollama.com"))
    except Exception as exc:
        # generate_test_cases already retries the AI once and falls back to
        # a deterministic generator internally, so an AI timeout, a
        # malformed/incomplete JSON response, or a connection error never
        # reaches here as an exception — they are caught, logged, and
        # replaced by a fallback response inside the service. Anything that
        # still lands here is a genuine, unexpected server-side bug, so it
        # is reported as 500, never as 502/503/504.
        log_error(logger, "generate_cases_unexpected_error", error=str(exc), exc_type=type(exc).__name__)
        return JSONResponse(status_code=500, content=_error_payload("Internal error.", str(exc)))
