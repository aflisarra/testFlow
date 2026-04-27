# ============================================================
# routers/test_plans.py
#
# FIX 502 : l'IA retourne souvent du texte AUTOUR du JSON
# FIX ANSI : suppression des séquences d'échappement terminal
# MODEL    : phi3:mini (optimisé pour 8GB RAM)
# ============================================================

import subprocess
import os
import re
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


def _test_plans_timeout() -> int:
    """
    Timeout dedie a la generation des test plans.
    Priorite:
      1) OLLAMA_TEST_PLANS_TIMEOUT
      2) OLLAMA_TIMEOUT
      3) 300s
    """
    raw = os.getenv("OLLAMA_TEST_PLANS_TIMEOUT", os.getenv("OLLAMA_TIMEOUT", "300"))
    try:
        return int(raw)
    except ValueError:
        return 300


def _truncate_spec(text: str, max_chars: int = 2400) -> str:
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_period = truncated.rfind(".")
    if last_period > max_chars // 2:
        return truncated[: last_period + 1]
    return truncated + "..."


# ── Prompt optimisé pour phi3:mini ───────────────────────────
def _build_prompt(spec_text: str, style_config: str) -> str:
    spec_short = _truncate_spec(spec_text, max_chars=2400)

    style_block = (
        f"UI Design Config:\n{style_config}"
        if style_config
        else "UI Design Config: (none — skip Visual/UI plan)"
    )

    # Example output format
    example = (
        '[\n'
        '  {"id": "TP-1", "title": "Authentication", "description": "Login logout and session expiry"},\n'
        '  {"id": "TP-2", "title": "Form Validation", "description": "Required fields format and error messages"}\n'
        ']'
    )

    # Phi-3 format: <|user|> ... <|end|><|assistant|>
    return (
        "<|user|>\n"
        "You are a senior QA engineer. Your only task is to output a JSON array of test plan objects.\n\n"
        "### Output format\n"
        "- A raw JSON array. No markdown, no backticks, no prose before or after.\n"
        "- Each object has exactly 3 keys: \"id\", \"title\", \"description\".\n"
        "- \"id\": string, format TP-N (e.g. TP-1, TP-2 ...)\n"
        "- \"title\": string, max 6 words, names a distinct test area\n"
        "- \"description\": string, maximum 10 words, no punctuation at the end\n"
        "- Between 4 and 10 objects total.\n"
        "- Include a Visual/UI plan only if UI Design Config is provided.\n\n"
        "### Example output\n"
        f"{example}\n\n"
        f"### {style_block}\n\n"
        "### Specification\n"
        f"{spec_short}\n"
        "<|end|>\n"
        "<|assistant|>\n"
    )


def _normalize_plan_id(value: object, index: int) -> str:
    text = str(value).strip() if value is not None else ""
    if re.fullmatch(r"TP-\d+", text):
        return text
    digits = re.search(r"\d+", text)
    if digits:
        return f"TP-{digits.group()}"
    return f"TP-{index + 1}"


def _extract_plans_from_text(reply: str) -> List[dict]:
    """
    Fallback when the model does not return valid JSON.
    Try to recover plans from plain text bullets/numbered lines.
    """
    text = (reply or "").strip()
    if not text:
        return []

    plans: List[dict] = []
    seen_titles = set()

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(("{", "}", "[", "]", "```")):
            continue
        if len(line) < 3:
            continue

        m = re.match(
            r"^(?:[-*]\s+|\d+[.)]\s+)?(?P<title>[^:-]{3,90}?)(?:\s*[:\-]\s*(?P<desc>.+))?$",
            line,
        )
        if not m:
            continue

        title = (m.group("title") or "").strip(" .:-")
        desc = (m.group("desc") or "").strip()

        lowered = title.lower()
        if lowered in {"json", "test plans", "output", "rules", "specification"}:
            continue
        if title.lower().startswith(("here are", "below are", "i can", "sure")):
            continue
        if title in seen_titles:
            continue

        seen_titles.add(title)
        plans.append(
            {
                "id": f"TP-{len(plans) + 1}",
                "title": title,
                "description": desc,
            }
        )

        if len(plans) >= 10:
            break

    return plans if len(plans) >= 3 else []


# ── Mock data ───────────────────────────────────────────────
MOCK_TEST_PLANS = [
    {"id": "TP-1", "title": "Authentication",       "description": "Login logout and session management"},
    {"id": "TP-2", "title": "Form Validation",      "description": "Required fields formats and error messages"},
    {"id": "TP-3", "title": "Navigation & Routing", "description": "Page transitions redirects and breadcrumbs"},
    {"id": "TP-4", "title": "Visual & UI",          "description": "Colors fonts button shapes and spacing"},
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

    prompt = _build_prompt(spec_text, style_config)

    try:
        reply = run_ollama(prompt, timeout=_test_plans_timeout())
        try:
            parsed = parse_json_from_ollama(reply)
        except ValueError as parse_error:
            recovered = _extract_plans_from_text(reply)
            if recovered:
                return {"test_plans": recovered}
            raise parse_error

        # Some models wrap the array in an object, accept both.
        if isinstance(parsed, dict):
            for key in ("test_plans", "plans", "items", "results"):
                if isinstance(parsed.get(key), list):
                    parsed = parsed[key]
                    break

        if not isinstance(parsed, list) or not parsed:
            return JSONResponse(status_code=502, content={"error": "AI returned empty test plans"})

        test_plans = []
        for i, item in enumerate(parsed):
            if isinstance(item, dict):
                test_plans.append(
                    {
                        "id": _normalize_plan_id(item.get("id"), i),
                        "title": str(item.get("title") or item.get("name") or f"Test Plan {i+1}").strip(),
                        "description": str(
                            item.get("description")
                            or item.get("scope")
                            or item.get("summary")
                            or ""
                        ).strip(),
                    }
                )
            else:
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
        return JSONResponse(status_code=504, content=_error_payload("Ollama took too long. Check OLLAMA_TEST_PLANS_TIMEOUT / OLLAMA_TIMEOUT."))
    except ValueError as e:
        return JSONResponse(status_code=502, content=_error_payload("AI returned invalid JSON.", str(e)))
    except RuntimeError as e:
        return JSONResponse(status_code=502, content=_error_payload("Ollama error.", str(e)))
    except Exception as e:
        return JSONResponse(status_code=500, content=_error_payload("Internal error.", str(e)))