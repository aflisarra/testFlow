"""
FastAPI routes for:
- POST /upload-spec
- POST /generate-plan

This module intentionally contains no business logic.
"""

from __future__ import annotations

import subprocess
import time
from typing import Optional

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from core.config import get_settings
from schemas.test_plan_schema import GeneratePlanRequest, GeneratePlanResponse
from services.cancellation_service import is_cancelled
from services.plan_service import generate_test_plans
from services.spec_service import chunk_docx_bytes, extract_spec_text_from_docx_bytes


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


from fastapi import Form, UploadFile, File
from typing import Optional

from fastapi import Form, UploadFile, File
from typing import Optional

@router.post("/generate-plan", response_model=GeneratePlanResponse)
async def generate_plan(
    file: UploadFile = File(None),
    styleConfig: Optional[str] = Form(None),
    applicationUrl: Optional[str] = Form(None),

    # ✅ IMPORTANT POUR ANNULATION
    test_suite_id: Optional[str] = Form(None),
    generation_request_id: Optional[str] = Form(None),
    generation_scope: Optional[str] = Form("plans"),

    spec_text: Optional[str] = Form(None),
):
    try:
        t_start = time.monotonic()

        # ── spec extraction ────────────────────────────────────────────────
        t_spec_start = time.monotonic()
        if file:
            file_bytes = await file.read()

            if not file_bytes:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Empty file"}
                )

            spec_text_final = extract_spec_text_from_docx_bytes(file_bytes)
            spec_chunks_final = chunk_docx_bytes(file_bytes)

        elif spec_text:
            spec_text_final = spec_text.strip()
            spec_chunks_final = None

        else:
            return JSONResponse(
                status_code=400,
                content={"error": "spec_text or file is required"}
            )

        if not spec_text_final.strip():
            return JSONResponse(
                status_code=422,
                content={"error": "Document empty"}
            )
        t_spec_ms = int((time.monotonic() - t_spec_start) * 1000)
        print(f"\n⏱ [generate-plan] spec_extraction_ms={t_spec_ms}  spec_chars={len(spec_text_final)}")

        # ✅ ANNULATION AVANT AI
        if is_cancelled(
            test_suite_id=test_suite_id,
            plan_id="",
            scope=generation_scope,
            request_id=generation_request_id,
        ):
            return JSONResponse(
                status_code=409,
                content={"error": "Generation cancelled by user"}
            )

        # ── AI generation ───────────────────────────────────────────────────
        t_ai_start = time.monotonic()
        plans = generate_test_plans(
            spec_text=spec_text_final,
            style_config=(styleConfig or "").strip(),
            project_title=(applicationUrl or "").strip(),
            spec_chunks=spec_chunks_final,
        )
        t_ai_ms = int((time.monotonic() - t_ai_start) * 1000)
        t_total_ms = int((time.monotonic() - t_start) * 1000)
        print(f"⏱ [generate-plan] ai_ms={t_ai_ms}  total_ms={t_total_ms}  plans={len(plans)}")

        # ✅ ANNULATION APRES AI
        if is_cancelled(
            test_suite_id=test_suite_id,
            plan_id="",
            scope=generation_scope,
            request_id=generation_request_id,
        ):
            return JSONResponse(
                status_code=409,
                content={"error": "Generation cancelled after processing"}
            )

        return {"test_plans": plans}

    except Exception as exc:
        import traceback
        traceback.print_exc()

        return JSONResponse(
            status_code=500,
            content={"error": str(exc)}
        )
