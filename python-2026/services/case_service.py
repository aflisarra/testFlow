from __future__ import annotations

import re
from typing import Dict, List

from core.config import get_settings
from core.constants import DEFAULT_TEST_CASES_MIN, DEFAULT_TEST_CASES_MAX, PRIORITIES, TEST_CASE_TYPES
from prompts.test_case_prompt import build_test_case_prompt
from services.ai_service import get_ai_service
from services.spec_service import chunk_spec, extract_requirements
from utils.logger import get_logger, log_event, log_error


logger = get_logger("services.case_service")


def _tc_prefix(plan_id: str) -> str:
    m = re.search(r"\d+", plan_id or "")
    return f"TC-{m.group()}" if m else "TC"


def _normalize_priority(value: str | None) -> str:
    raw = (value or "").strip().capitalize()
    return raw if raw in PRIORITIES else "Medium"


def _normalize_type(value: str | None) -> str:
    raw = (value or "").strip()
    # normalize common variants
    mapping = {
        "error": "Error handling",
        "error-handling": "Error handling",
        "permission": "Permission",
        "permissions": "Permission",
        "boundary": "Boundary",
        "validation": "Validation",
        "positive": "Positive",
        "negative": "Negative",
    }
    key = raw.lower()
    normalized = mapping.get(key, raw.title())
    return normalized if normalized in TEST_CASE_TYPES else "Validation"


def _link_requirements(plan_title: str, plan_description: str, reqs: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Lightweight relevance matching based on keywords and module name.
    """
    hay = f"{plan_title} {plan_description}".lower()
    keywords = set(re.findall(r"[a-z0-9]+", hay))
    if not keywords:
        return reqs[:12]

    linked = []
    for r in reqs:
        text = f"{r.get('module','')} {r.get('text','')}".lower()
        score = sum(1 for k in keywords if k in text)
        if score > 0:
            linked.append((score, r))
    linked.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in linked[:18]] or reqs[:18]


def _mock_cases(plan_id: str) -> List[Dict[str, str]]:
    prefix = _tc_prefix(plan_id)
    return [
        {
            "id": f"{prefix}.1",
            "title": "Happy path works as expected",
            "steps": ["Open the feature page", "Provide valid input", "Submit the action"],
            "expected_result": "Operation succeeds and user sees success confirmation",
            "priority": "High",
            "type": "Positive",
        },
        {
            "id": f"{prefix}.2",
            "title": "Invalid input is rejected",
            "steps": ["Open the feature page", "Provide invalid input", "Submit the action"],
            "expected_result": "User sees a validation error and no data is saved",
            "priority": "High",
            "type": "Validation",
        },
        {
            "id": f"{prefix}.3",
            "title": "Boundary values are handled safely",
            "steps": ["Open the feature page", "Enter boundary value", "Submit the action"],
            "expected_result": "System handles boundary without crash and shows correct result",
            "priority": "Medium",
            "type": "Boundary",
        },
        {
            "id": f"{prefix}.4",
            "title": "System shows error on failure",
            "steps": ["Trigger an error condition", "Retry the action"],
            "expected_result": "User sees an error message and can recover",
            "priority": "Medium",
            "type": "Error handling",
        },
    ][:DEFAULT_TEST_CASES_MAX]


def generate_test_cases(
    *,
    plan_id: str,
    plan_title: str,
    plan_description: str,
    spec_text: str,
    style_config: str,
    project_title: str,
) -> List[Dict[str, str]]:
    settings = get_settings()
    log_event(logger, "generate_cases_request_received", plan_id=plan_id, mock=settings.use_mock)

    reqs = extract_requirements(spec_text)
    linked = _link_requirements(plan_title, plan_description, reqs)
    chunks = chunk_spec(spec_text)

    if settings.use_mock:
        return _mock_cases(plan_id)

    prompt = build_test_case_prompt(
        plan_id=plan_id,
        plan_title=plan_title,
        plan_description=plan_description,
        project_title=project_title,
        style_config=style_config,
        linked_requirements=linked,
        spec_chunks=chunks,
    )

    ai = get_ai_service()
    try:
        data = ai.generate_json(prompt=prompt, timeout=settings.ollama_test_cases_timeout)
    except Exception as exc:
        log_error(logger, "generate_cases_ai_failed", error=str(exc))
        raise

    cases_raw = data.get("test_cases") if isinstance(data, dict) else data
    if not isinstance(cases_raw, list):
        raise ValueError("AI did not return a list of test cases")

    prefix = _tc_prefix(plan_id)
    normalized: List[Dict[str, str]] = []
    for i, item in enumerate(cases_raw, start=1):
        if not isinstance(item, dict):
            continue
        steps = item.get("steps") or []
        if isinstance(steps, str):
            steps = [steps]
        normalized.append(
            {
                "id": str(item.get("id") or f"{prefix}.{i}").strip() or f"{prefix}.{i}",
                "title": str(item.get("title") or f"Test Case {i}").strip(),
                "steps": [str(s).strip() for s in steps if str(s).strip()],
                "expected_result": str(item.get("expected_result") or "").strip(),
                "priority": _normalize_priority(str(item.get("priority") or "Medium")),
                "type": _normalize_type(str(item.get("type") or "Validation")),
            }
        )

    # Ensure we always return at least DEFAULT_TEST_CASES_MIN cases
    if len(normalized) < DEFAULT_TEST_CASES_MIN:
        normalized.extend(_mock_cases(plan_id)[len(normalized) : DEFAULT_TEST_CASES_MIN])

    # Re-number sequentially (stable ids) and cap count
    normalized = normalized[:DEFAULT_TEST_CASES_MAX]
    for i, tc in enumerate(normalized, start=1):
        tc["id"] = f"{prefix}.{i}"
    return normalized

