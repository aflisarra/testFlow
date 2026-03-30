# ============================================================
# routers/test_cases.py
#
# FIX : mistral retourne expected_result comme objet
#       {"pass": "...", "fail": "..."} au lieu d'une string
#       → _normalize_expected_result() aplatit ça en string
# ============================================================

import subprocess
import re
import os
from typing import List, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from utils.ollama import run_ollama, parse_json_from_ollama

router = APIRouter()


def _use_mock() -> bool:
    return os.getenv("USE_MOCK", "false").lower() in ("1", "true", "yes")


def _debug_errors() -> bool:
    return os.getenv("DEBUG_ERRORS", "false").lower() in ("1", "true", "yes")


def _error_payload(message: str, detail: Optional[str] = None):
    if detail and _debug_errors():
        return {"error": message, "detail": detail}
    return {"error": message}


# ── Mock data ────────────────────────────────────────────────
MOCK_TEST_CASES = {
    "plan_id": "TP-1",
    "plan_title": "Authentication",
    "test_cases": [
        {
            "id": "TC-1.1",
            "title": "Login form is displayed correctly",
            "steps": [
                "Open the application",
                "Navigate to the login page",
                "Verify the email field is visible",
                "Verify the password field is visible",
                "Verify the submit button is present",
            ],
            "expected_result": "Login form displays all required fields",
        },
        {
            "id": "TC-1.2",
            "title": "Invalid email format is rejected",
            "steps": [
                "Enter 'notanemail' in the email field",
                "Enter a valid password",
                "Click the submit button",
            ],
            "expected_result": "Error message shown for invalid email",
        },
        {
            "id": "TC-1.3",
            "title": "Empty fields show required errors",
            "steps": ["Leave all fields empty", "Click the submit button"],
            "expected_result": "Required field errors displayed",
        },
        {
            "id": "TC-1.4",
            "title": "Valid credentials redirect to dashboard",
            "steps": ["Enter valid email and password", "Click the submit button"],
            "expected_result": "User redirected to dashboard",
        },
    ],
}


class GenerateTestCasesRequest(BaseModel):
    plan_id: str = Field(..., description="ID of the confirmed plan (e.g. TP-1)")
    plan_title: str = Field(..., description="Title of the confirmed plan")
    plan_description: str = Field(..., description="Description of the confirmed plan")
    spec_text: str = Field(..., description="Original spec text")
    style_config: Optional[str] = Field(default=None, description="UI style config")


class TestCase(BaseModel):
    id: str
    title: str
    steps: List[str]
    expected_result: str


class TestCasesResponse(BaseModel):
    plan_id: str
    plan_title: str
    test_cases: List[TestCase]


def _normalize_expected_result(value) -> str:
    """
    Mistral retourne parfois expected_result comme :
      - string normale       → "User is redirected"          ✅ OK
      - objet pass/fail      → {"pass": "...", "fail": "..."}  ← FIX
      - objet result/outcome → {"result": "...", ...}           ← FIX
      - liste                → ["step1", "step2"]               ← FIX
      - None / autre         → ""                               ← FIX
    """
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        # Cas {"pass": "...", "fail": "..."}  ← ce qu'on voit dans l'erreur
        if "pass" in value and "fail" in value:
            return f"Pass: {value['pass']} | Fail: {value['fail']}"

        # Cas {"result": "..."} ou {"expected": "..."}
        for key in ("result", "expected", "expected_result", "outcome", "description"):
            if isinstance(value.get(key), str):
                return value[key].strip()

        # Fallback : joindre toutes les valeurs string du dict
        parts = [str(v) for v in value.values() if v and isinstance(v, str)]
        return " | ".join(parts) if parts else str(value)

    if isinstance(value, list):
        return " | ".join(str(item).strip() for item in value if item)

    return str(value).strip() if value is not None else ""


def _truncate_spec(text: str, max_chars: int = 800) -> str:
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_period = truncated.rfind(".")
    if last_period > max_chars // 2:
        return truncated[: last_period + 1]
    return truncated + "..."


def _build_prompt(plan_id: str, plan_title: str, plan_description: str,
                  spec_text: str, style_config: str) -> str:
    plan_number = re.search(r"\d+", plan_id)
    tc_prefix   = f"TC-{plan_number.group()}" if plan_number else "TC"
    spec_short  = _truncate_spec(spec_text, max_chars=800)

    # ✅ On force explicitement expected_result en STRING dans l'exemple
    lines = [
        "QA engineer. Return ONLY a JSON array, no text around it.",
        f"Generate EXACTLY 4 test cases for: {plan_title}",
        f"Context: {plan_description}",
        "",
        "Each item must follow this exact structure:",
        '{',
        f'  "id": "{tc_prefix}.1",',
        '  "title": "short description",',
        '  "steps": ["Step 1", "Step 2", "Step 3"],',
        '  "expected_result": "one plain sentence describing the expected outcome"',
        '}',
        "",
        # Règle explicite pour éviter l'objet pass/fail
        'IMPORTANT: "expected_result" must be a plain string, NOT an object.',
        "Rules: imperative steps, independent cases, include 1 error scenario.",
        "",
        f"Spec:\n{spec_short}",
    ]

    if style_config:
        lines.append(f"\nUI style: {style_config[:200]}")

    return "\n".join(lines)


@router.post("/generate-test-cases", response_model=TestCasesResponse)
def generate_test_cases(payload: GenerateTestCasesRequest):
    """Generate detailed test cases for a confirmed test plan."""

    plan_id          = (payload.plan_id or "").strip()
    plan_title       = (payload.plan_title or "").strip()
    plan_description = (payload.plan_description or "").strip()
    spec_text        = (payload.spec_text or "").strip()
    style_config     = (payload.style_config or "").strip()

    if not plan_id:
        return JSONResponse(status_code=400, content={"error": "plan_id is required"})
    if not plan_title:
        return JSONResponse(status_code=400, content={"error": "plan_title is required"})
    if not spec_text:
        return JSONResponse(status_code=400, content={"error": "spec_text is required"})

    if _use_mock():
        mock = dict(MOCK_TEST_CASES)
        mock["plan_id"]    = plan_id
        mock["plan_title"] = plan_title
        return mock

    prompt = _build_prompt(plan_id, plan_title, plan_description, spec_text, style_config)

    try:
        reply  = run_ollama(prompt, timeout=120)
        parsed = parse_json_from_ollama(reply)

        if not isinstance(parsed, list) or not parsed:
            return JSONResponse(status_code=502, content={"error": "AI returned empty test cases"})

        plan_number = re.search(r"\d+", plan_id)
        tc_prefix   = f"TC-{plan_number.group()}" if plan_number else "TC"

        test_cases = []
        for i, item in enumerate(parsed):
            if isinstance(item, dict):
                steps = item.get("steps", [])
                if isinstance(steps, str):
                    steps = [steps]

                test_cases.append({
                    "id":    str(item.get("id", f"{tc_prefix}.{i+1}")),
                    "title": item.get("title", f"Test Case {i+1}"),
                    "steps": [str(s).strip() for s in steps if str(s).strip()],
                    # ✅ FIX : normalise expected_result quelle que soit sa forme
                    "expected_result": _normalize_expected_result(
                        item.get("expected_result") or item.get("expectedResult") or ""
                    ),
                })
            else:
                test_cases.append({
                    "id":              f"{tc_prefix}.{i+1}",
                    "title":           str(item).strip() or f"Test Case {i+1}",
                    "steps":           [],
                    "expected_result": "",
                })

        return {
            "plan_id":    plan_id,
            "plan_title": plan_title,
            "test_cases": test_cases,
        }

    except FileNotFoundError:
        return JSONResponse(status_code=500, content=_error_payload(
            "Ollama not found. Install from https://ollama.com"))
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=504, content=_error_payload(
            "Ollama took too long. Check: ollama run mistral"))
    except ValueError as e:
        return JSONResponse(status_code=502, content=_error_payload(
            "AI returned invalid JSON.", str(e)))
    except RuntimeError as e:
        return JSONResponse(status_code=502, content=_error_payload(
            "Ollama error.", str(e)))
    except Exception as e:
        return JSONResponse(status_code=500, content=_error_payload(
            "Internal error.", str(e)))