"""
FastAPI route for:
- POST /translate-test-case

Transforms natural-language test cases into execution-model/v1.
The model is runner-neutral and can later be adapted to Selenium, API clients,
or another executor.
"""

from __future__ import annotations

import subprocess
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.config import get_settings
from schemas.execution_model_schema import TranslateTestCaseRequest
from services.test_case_translator_service import translate_test_case_to_execution_model


router = APIRouter()


def _error_payload(message: str, detail: Optional[str] = None) -> dict:
    settings = get_settings()
    if detail and settings.debug_errors:
        return {"error": message, "detail": detail}
    return {"error": message}


@router.post("/translate-test-case")
def translate_test_case_route(payload: TranslateTestCaseRequest):
    test_case_id = (payload.test_case_id or "").strip()
    title = (payload.title or "").strip()
    steps = [str(step or "").strip() for step in (payload.steps or []) if str(step or "").strip()]
    expected_result = (payload.expected_result or "").strip()

    if not steps:
        return JSONResponse(status_code=400, content={"error": "steps is required"})

    try:
        execution_model = translate_test_case_to_execution_model(
            test_case_id=test_case_id,
            title=title,
            steps=steps,
            expected_result=expected_result,
            context=payload.context or {},
        )
        return {"execution_model": execution_model, "executionModel": execution_model}
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
