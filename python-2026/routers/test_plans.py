# ============================================================
# routers/test_plans.py
#
# POST /upload-spec         → Upload Word → retourne spec_text
# POST /generate-plan       → spec_text + style_config → Test Plans
#
# FLOW :
#   1. User uploade un fichier .docx
#   2. /upload-spec extrait le texte → spec_text
#   3. User entre style_config (couleurs, formes, fonts...)
#   4. /generate-plan retourne :
#      [
#        { id: "TP-1", title: "Authentication",   description: "..." },
#        { id: "TP-2", title: "Form Validation",  description: "..." },
#        ...
#      ]
#   5. User confirme ✅ un plan → appel /generate-test-cases
# ============================================================

import subprocess
import os
from typing import List, Optional

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from utils.ollama import run_ollama, parse_json_from_ollama
from utils.docx_reader import extract_text_from_docx

router = APIRouter()

def _use_mock() -> bool:
    return os.getenv("USE_MOCK", "false").lower() in ("1", "true", "yes")


def _debug_errors() -> bool:
    return os.getenv("DEBUG_ERRORS", "false").lower() in ("1", "true", "yes")


def _error_payload(message: str, detail: Optional[str] = None):
    if detail and _debug_errors():
        return {"error": message, "detail": detail}
    return {"error": message}

# ── Mock data ───────────────────────────────────────────────
MOCK_TEST_PLANS = [
    {"id": "TP-1", "title": "Authentication",       "description": "Login, logout and session management"},
    {"id": "TP-2", "title": "Form Validation",      "description": "Required fields, formats and error messages"},
    {"id": "TP-3", "title": "Navigation & Routing", "description": "Page transitions, redirects and breadcrumbs"},
    {"id": "TP-4", "title": "Visual & UI",          "description": "Colors, fonts, button shapes and spacing"},
]


class GeneratePlanRequest(BaseModel):
    spec_text: str = Field(..., description="Text extracted from the Word document")
    style_config: Optional[str] = Field(default=None, description="UI style config (colors, shapes, fonts...)")


class TestPlan(BaseModel):
    id: str
    title: str
    description: str


class GeneratePlanResponse(BaseModel):
    test_plans: List[TestPlan]


@router.post("/upload-spec")
async def upload_spec(file: UploadFile = File(...)):
    """Upload a .docx file and extract its text content."""

    if not (file.filename or "").lower().endswith(".docx"):
        return JSONResponse(
            status_code=400,
            content={"error": "Only .docx files are supported."},
        )
    try:
        file_bytes = await file.read()
        spec_text = extract_text_from_docx(file_bytes)

        if not spec_text.strip():
            return JSONResponse(
                status_code=422,
                content={"error": "Document is empty or has no readable text."},
            )

        return {
            "filename": file.filename,
            "spec_text": spec_text,
            "char_count": len(spec_text),
        }
    except RuntimeError as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Upload failed: {str(e)}"})


@router.post("/generate-plan", response_model=GeneratePlanResponse)
def generate_plan(payload: GeneratePlanRequest):
    """Generate high-level test plans from spec + style config."""

    spec_text = (payload.spec_text or "").strip()
    style_config = (payload.style_config or "").strip()

    if not spec_text:
        return JSONResponse(status_code=400, content={"error": "spec_text is required"})

    if _use_mock():
        return {"test_plans": MOCK_TEST_PLANS}

    prompt = "\n".join(
        [
            "You are a senior QA engineer.",
            "Read the specification and UI design config below.",
            "Generate a high-level test plan as a JSON array of objects.",
            "",
            "Each object must have exactly:",
            '  "id"          : TP-1, TP-2 ...',
            '  "title"       : short test area name',
            '  "description" : one sentence of what this plan covers',
            "",
            "Rules:",
            "- Between 4 and 10 test plans",
            "- Cover all major areas from the spec",
            "- Add a Visual/UI plan if style config is provided",
            "- Return ONLY the raw JSON array, no markdown, no explanation",
            "",
            f"UI Design Config:\n{style_config}" if style_config else "UI Design Config: (none)",
            "",
            "Specification:",
            spec_text,
        ]
    )

    try:
        reply = run_ollama(prompt)
        parsed = parse_json_from_ollama(reply)

        # Some models wrap the array in an object, accept both.
        if isinstance(parsed, dict) and isinstance(parsed.get("test_plans"), list):
            parsed = parsed["test_plans"]

        if not isinstance(parsed, list) or not parsed:
            return JSONResponse(status_code=502, content={"error": "AI returned empty test plans"})

        test_plans = []
        for i, item in enumerate(parsed):
            if isinstance(item, dict):
                test_plans.append(
                    {
                        "id": str(item.get("id", f"TP-{i+1}")),
                        "title": item.get("title", f"Test Plan {i+1}"),
                        "description": item.get("description", ""),
                    }
                )
            else:
                # Fallback if the model returns a list of strings.
                test_plans.append(
                    {
                        "id": f"TP-{i+1}",
                        "title": str(item).strip() or f"Test Plan {i+1}",
                        "description": "",
                    }
                )

        return {"test_plans": test_plans}

    except FileNotFoundError:
        return JSONResponse(status_code=500, content=_error_payload("Ollama not found. Install from https://ollama.com"))
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=504, content=_error_payload("Ollama took too long. Try a smaller spec."))
    except ValueError as e:
        return JSONResponse(status_code=502, content=_error_payload("AI returned invalid JSON.", str(e)))
    except RuntimeError as e:
        return JSONResponse(status_code=502, content=_error_payload("Ollama error.", str(e)))
    except Exception as e:
        return JSONResponse(status_code=500, content=_error_payload("Internal error.", str(e)))
