# ============================================================
# routers/test_cases.py
#
# POST /generate-test-cases → Test Cases détaillés d'un plan confirmé
#
# FLOW :
#   User confirme ✅ un Test Plan (ex: TP-1 Authentication)
#   → Frontend envoie : plan_id, plan_title, plan_description, spec_text, style_config
#   → Retourne :
#      {
#        plan_id:    "TP-1",
#        plan_title: "Authentication",
#        test_cases: [
#          { id: "TC-1.1", title: "...", steps: [...], expected_result: "..." },
#          { id: "TC-1.2", ... },
#          ...
#        ]
#      }
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

# ── Mock data ───────────────────────────────────────────────
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
            "expected_result": "Error message: 'Please enter a valid email address'",
        },
        {
            "id": "TC-1.3",
            "title": "Empty fields show required errors",
            "steps": [
                "Leave the email field empty",
                "Leave the password field empty",
                "Click the submit button",
            ],
            "expected_result": "Both fields display required field error messages",
        },
        {
            "id": "TC-1.4",
            "title": "Valid credentials redirect to dashboard",
            "steps": [
                "Enter a valid registered email",
                "Enter the correct password",
                "Click the submit button",
                "Verify redirect to dashboard page",
            ],
            "expected_result": "User is redirected to the dashboard",
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


@router.post("/generate-test-cases", response_model=TestCasesResponse)
def generate_test_cases(payload: GenerateTestCasesRequest):
    """Generate detailed test cases for a confirmed test plan."""

    plan_id = (payload.plan_id or "").strip()
    plan_title = (payload.plan_title or "").strip()
    plan_description = (payload.plan_description or "").strip()
    spec_text = (payload.spec_text or "").strip()
    style_config = (payload.style_config or "").strip()

    if not plan_id:
        return JSONResponse(status_code=400, content={"error": "plan_id is required"})
    if not plan_title:
        return JSONResponse(status_code=400, content={"error": "plan_title is required"})
    if not spec_text:
        return JSONResponse(status_code=400, content={"error": "spec_text is required"})

    if _use_mock():
        mock = dict(MOCK_TEST_CASES)
        mock["plan_id"] = plan_id
        mock["plan_title"] = plan_title
        return mock

    plan_number = re.search(r"\d+", plan_id)
    tc_prefix = f"TC-{plan_number.group()}" if plan_number else "TC"

    prompt = "\n".join(
        [
            "You are a senior QA engineer.",
            f"Generate detailed test cases for this test plan: {plan_title}",
            f"Plan description: {plan_description}",
            "",
            "Return ONLY a raw JSON array of objects — no markdown, no explanation.",
            "Each object must have exactly:",
            f'  "id"              : {tc_prefix}.1, {tc_prefix}.2 ...',
            '  "title"           : short description of what is tested',
            '  "steps"           : array of strings — one action per step',
            '  "expected_result" : string — what should happen',
            "",
            "Rules:",
            "- Between 4 and 10 test cases",
            "- Each test case must be independent",
            "- Steps use imperative verbs (Click, Enter, Verify, Navigate...)",
            "- Include edge cases and error scenarios",
            "- Add visual checks if style_config is provided",
            "",
            f"UI Design Config:\n{style_config}" if style_config else "UI Design Config: (none)",
            "",
            "Specification (for context):",
            spec_text,
        ]
    )

    try:
        reply = run_ollama(prompt)
        parsed = parse_json_from_ollama(reply)

        if not isinstance(parsed, list) or not parsed:
            return JSONResponse(status_code=502, content={"error": "AI returned empty test cases"})

        test_cases = []
        for i, item in enumerate(parsed):
            if isinstance(item, dict):
                steps = item.get("steps", [])
                if isinstance(steps, str):
                    steps = [steps]
                test_cases.append(
                    {
                        "id": str(item.get("id", f"{tc_prefix}.{i+1}")),
                        "title": item.get("title", f"Test Case {i+1}"),
                        "steps": [str(s).strip() for s in steps if str(s).strip()],
                        "expected_result": item.get("expected_result", ""),
                    }
                )
            else:
                # Fallback if the model returns a list of strings.
                test_cases.append(
                    {
                        "id": f"{tc_prefix}.{i+1}",
                        "title": str(item).strip() or f"Test Case {i+1}",
                        "steps": [],
                        "expected_result": "",
                    }
                )

        return {
            "plan_id": plan_id,
            "plan_title": plan_title,
            "test_cases": test_cases,
        }

    except FileNotFoundError:
        return JSONResponse(status_code=500, content=_error_payload("Ollama not found. Install from https://ollama.com"))
    except subprocess.TimeoutExpired:
        return JSONResponse(status_code=504, content=_error_payload("Ollama took too long."))
    except ValueError as e:
        return JSONResponse(status_code=502, content=_error_payload("AI returned invalid JSON.", str(e)))
    except RuntimeError as e:
        return JSONResponse(status_code=502, content=_error_payload("Ollama error.", str(e)))
    except Exception as e:
        return JSONResponse(status_code=500, content=_error_payload("Internal error.", str(e)))
