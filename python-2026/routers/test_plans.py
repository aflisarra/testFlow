"""
FastAPI routes for:
- POST /upload-spec
- POST /generate-plan

This module intentionally contains no business logic.
"""

from __future__ import annotations

import subprocess
from typing import Optional

from fastapi import APIRouter, File, UploadFile, Request
from fastapi.responses import JSONResponse

from core.config import get_settings
from schemas.test_plan_schema import GeneratePlanRequest, GeneratePlanResponse
from services.cancellation_service import is_cancelled
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


from fastapi import Form, UploadFile, File, Request
from typing import Optional
import json as json_module

@router.post("/generate-plan", response_model=GeneratePlanResponse)
async def generate_plan(request: Request):
    """
    Accept generate-plan request in TWO formats:
    1. multipart/form-data with optional file upload (from Angular/Web)
    2. application/json body (from Node.js backend)
    """
    
    content_type = request.headers.get("content-type", "").lower()
    spec_text_final = None
    style_config = None
    url_cible = None
    test_suite_id = None
    generation_request_id = None
    generation_scope = "plans"
    project_title = None
    plan_id = ""
    regenerate = False
    
    try:
        if "multipart/form-data" in content_type:
            # ✅ MULTIPART FORM DATA (file upload)
            form_data = await request.form()
            
            file = form_data.get("file")
            if file and isinstance(file, UploadFile):
                file_bytes = await file.read()
                if file_bytes:
                    spec_text_final = extract_spec_text_from_docx_bytes(file_bytes)
            
            # Get form fields
            spec_text_final = spec_text_final or (form_data.get("spec_text") or "").strip()
            style_config = (form_data.get("styleConfig") or form_data.get("style_config") or "").strip()
            url_cible = (form_data.get("applicationUrl") or form_data.get("url_cible") or "").strip()
            test_suite_id = (form_data.get("test_suite_id") or "").strip()
            generation_request_id = (form_data.get("generation_request_id") or "").strip()
            generation_scope = (form_data.get("generation_scope") or "plans").strip()
            project_title = (form_data.get("project_title") or "").strip()
            plan_id = (form_data.get("plan_id") or form_data.get("planId") or "").strip()
            regenerate = str(form_data.get("regenerate") or "").lower() == "true"
            
        elif "application/json" in content_type:
            # ✅ JSON BODY (from Node.js axios.post)
            body = await request.json()
            
            spec_text_final = (body.get("spec_text") or "").strip()
            style_config = (body.get("style_config") or body.get("styleConfig") or "").strip()
            url_cible = (body.get("url_cible") or body.get("applicationUrl") or "").strip()
            test_suite_id = (body.get("test_suite_id") or "").strip()
            generation_request_id = (body.get("generation_request_id") or "").strip()
            generation_scope = (body.get("generation_scope") or "plans").strip()
            project_title = (body.get("project_title") or "").strip()
            plan_id = (body.get("plan_id") or body.get("planId") or "").strip()
            regenerate = bool(body.get("regenerate"))
            
        else:
            return JSONResponse(
                status_code=415,
                content={"error": f"Unsupported content-type: {content_type}. Use multipart/form-data or application/json"}
            )
        
        # ✅ Validate spec_text is not empty
        if not spec_text_final or not spec_text_final.strip():
            return JSONResponse(
                status_code=400,
                content={"error": "spec_text or file is required"}
            )

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

        # ✅ Call AI service to generate plans
        plans = generate_test_plans(
            spec_text=spec_text_final,
            style_config=style_config,
            project_title=project_title or url_cible,
            target_count=1 if plan_id and regenerate else 10,
        )
        if plan_id and regenerate and plans:
            plans[0]["id"] = plan_id

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