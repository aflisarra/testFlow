# ============================================================
# routers/test_cases.py
#
# FIX 502 : prompt réécrit pour Mistral (tokens [INST], few-shot)
# FIX     : expected_result normalisé si l'IA retourne un objet
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


def _test_cases_timeout() -> int:
    raw = os.getenv("OLLAMA_TEST_CASES_TIMEOUT", os.getenv("OLLAMA_TIMEOUT", "300"))
    try:
        return int(raw)
    except ValueError:
        return 300


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
    Normalise expected_result quelle que soit la forme retournée par Mistral.
      - string normale       → retournée telle quelle
      - objet pass/fail      → "Pass: ... | Fail: ..."
      - objet result/outcome → valeur extraite
      - liste                → jointure avec " | "
      - None / autre         → ""
    """
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        if "pass" in value and "fail" in value:
            return f"Pass: {value['pass']} | Fail: {value['fail']}"
        for key in ("result", "expected", "expected_result", "outcome", "description"):
            if isinstance(value.get(key), str):
                return value[key].strip()
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

    style_block = (
        f"UI Design Config:\n{style_config[:200]}"
        if style_config
        else "UI Design Config: (none)"
    )

    # Exemple few-shot avec le bon préfixe TC
    example = (
        '[\n'
        f'  {{"id": "{tc_prefix}.1", "title": "Valid login redirects to dashboard", '
        '"steps": ["Enter valid email", "Enter valid password", "Click Submit"], '
        '"expected_result": "User is redirected to the dashboard"}},\n'
        f'  {{"id": "{tc_prefix}.2", "title": "Empty fields show error messages", '
        '"steps": ["Leave email empty", "Leave password empty", "Click Submit"], '
        '"expected_result": "Required field errors are displayed"}}\n'
        ']'
    )

    return (
        "<s>[INST]\n"
        "You are a senior QA engineer. Your only task is to output a JSON array of test case objects.\n\n"
        "### Output format\n"
        "- A raw JSON array. No markdown, no backticks, no prose before or after.\n"
        "- Each object has exactly 4 keys: \"id\", \"title\", \"steps\", \"expected_result\".\n"
        f'- "id": string, format {tc_prefix}.N (e.g. {tc_prefix}.1, {tc_prefix}.2 ...)\n'
        '- "title": string, max 8 words, describes what is being tested\n'
        '- "steps": array of strings, each step starts with an imperative verb\n'
        '- "expected_result": a plain string, max 15 words. NEVER an object or array.\n'
        "- Generate exactly 4 test cases.\n"
        "- Include at least 1 error/negative scenario.\n\n"
        "### Example output\n"
        f"{example}\n\n"
        f"### Test Plan\n"
        f"ID: {plan_id}\n"
        f"Title: {plan_title}\n"
        f"Description: {plan_description}\n\n"
        f"### {style_block}\n\n"
        "### Specification\n"
        f"{spec_short}\n"
        "[/INST]"
    )


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
        reply  = run_ollama(prompt, timeout=_test_cases_timeout())
        parsed = parse_json_from_ollama(reply)

        if not isinstance(parsed, list) or not parsed:
            print(f"Error: AI returned empty test cases or not a list. Parsed payload: {parsed}")
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
        print(f"ValueError parsing JSON in test_cases: {e}")
        return JSONResponse(status_code=502, content=_error_payload(
            "AI returned invalid JSON.", str(e)))
    except RuntimeError as e:
        print(f"RuntimeError in run_ollama: {e}")
        return JSONResponse(status_code=502, content=_error_payload(
            "Ollama error.", str(e)))
    except Exception as e:
        print(f"Internal error in test_cases: {e}")
        return JSONResponse(status_code=500, content=_error_payload(
            "Internal error.", str(e)))