from __future__ import annotations

import re
from typing import Any, Dict, List

from core.config import get_settings
from core.constants import DEFAULT_TEST_CASES_MIN, DEFAULT_TEST_CASES_MAX, PRIORITIES, SEVERITIES, TEST_CASE_TYPES
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


def _normalize_severity(value: str | None) -> str:
    raw = (value or "").strip().lower()
    mapping = {
        "blocker": "Blocker",
        "critical": "Critical",
        "high": "Critical",
        "major": "Major",
        "medium": "Major",
        "minor": "Minor",
        "low": "Minor",
        "trivial": "Trivial",
    }
    normalized = mapping.get(raw, raw.capitalize())
    return normalized if normalized in SEVERITIES else "Major"


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


def _string_list(value: Any) -> List[str]:
    values = value if isinstance(value, list) else ([value] if value else [])
    return [str(item).strip() for item in values if str(item).strip()]


def _format_requirement(req: Dict[str, Any]) -> Dict[str, str]:
    return {
        "id": str(req.get("id") or req.get("requirementId") or req.get("reqId") or "").strip(),
        "title": str(req.get("title") or req.get("module") or "").strip(),
        "description": str(req.get("description") or req.get("text") or req.get("requirement") or "").strip(),
        "source": str(req.get("source") or req.get("module") or "").strip(),
        "priority": _normalize_priority(str(req.get("priority") or "")) if req.get("priority") else "",
    }


def _normalize_requirements(raw: Any, fallback: List[Dict[str, str]] | None = None) -> List[Dict[str, str]]:
    fallback = fallback or []
    lookup = {str(req.get("id") or "").strip().lower(): _format_requirement(req) for req in fallback if req.get("id")}
    values = raw if isinstance(raw, list) else ([raw] if raw else [])
    normalized: List[Dict[str, str]] = []

    for item in values:
        if isinstance(item, str):
            key = item.strip().lower()
            req = lookup.get(key) or {"id": item.strip(), "title": "", "description": "", "source": "", "priority": ""}
        elif isinstance(item, dict):
            req = _format_requirement(item)
            if req["id"] and req["id"].lower() in lookup and not req["description"]:
                req = lookup[req["id"].lower()]
        else:
            continue

        if req["id"] or req["title"] or req["description"]:
            normalized.append(req)

    if not normalized:
        normalized = [_format_requirement(req) for req in fallback[:5]]

    seen: set[str] = set()
    deduped: List[Dict[str, str]] = []
    for req in normalized:
        key = "|".join([req["id"], req["title"], req["description"], req["source"]]).lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(req)
    return deduped


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


def _mock_cases(plan_id: str) -> List[Dict[str, Any]]:
    prefix = _tc_prefix(plan_id)
    return [
        {
            "id": f"{prefix}.1",
            "title": "Happy path works as expected",
            "objective": "Verify the main user flow succeeds with valid data",
            "preconditions": ["Application is reachable", "User has access to the feature"],
            "test_data": {"input": "valid data"},
            "steps": ["Open the feature page", "Provide valid input", "Submit the action"],
            "expected_result": "Operation succeeds and user sees success confirmation",
            "priority": "High",
            "severity": "Critical",
            "type": "Positive",
            "requirements": [],
        },
        {
            "id": f"{prefix}.2",
            "title": "Invalid input is rejected",
            "objective": "Verify invalid data is rejected with a clear validation message",
            "preconditions": ["Application is reachable", "User has access to the feature"],
            "test_data": {"input": "invalid data"},
            "steps": ["Open the feature page", "Provide invalid input", "Submit the action"],
            "expected_result": "User sees a validation error and no data is saved",
            "priority": "High",
            "severity": "Major",
            "type": "Validation",
            "requirements": [],
        },
        {
            "id": f"{prefix}.3",
            "title": "Boundary values are handled safely",
            "objective": "Verify boundary values are processed without incorrect behavior",
            "preconditions": ["Application is reachable", "Boundary values are known"],
            "test_data": {"input": "boundary value"},
            "steps": ["Open the feature page", "Enter boundary value", "Submit the action"],
            "expected_result": "System handles boundary without crash and shows correct result",
            "priority": "Medium",
            "severity": "Major",
            "type": "Boundary",
            "requirements": [],
        },
        {
            "id": f"{prefix}.4",
            "title": "System shows error on failure",
            "objective": "Verify failures produce recoverable and understandable feedback",
            "preconditions": ["Application is reachable", "A failure condition can be triggered"],
            "test_data": {"condition": "forced failure"},
            "steps": ["Trigger an error condition", "Retry the action"],
            "expected_result": "User sees an error message and can recover",
            "priority": "Medium",
            "severity": "Major",
            "type": "Error handling",
            "requirements": [],
        },
    ][:DEFAULT_TEST_CASES_MAX]


def _normalize_step_details(steps: List[str], step_details: Any, fallback_expected: str = "") -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    raw_details = step_details if isinstance(step_details, list) else []

    if raw_details:
        for idx, step in enumerate(steps, start=0):
            detail = raw_details[idx] if idx < len(raw_details) and isinstance(raw_details[idx], dict) else {}
            normalized.append(
                {
                    "step": str(detail.get("step") or step or f"Step {idx + 1}").strip(),
                    "expected_result": str(
                        detail.get("expected_result")
                        or detail.get("expectedResult")
                        or detail.get("expected")
                        or fallback_expected
                        or ""
                    ).strip(),
                }
            )
        return normalized

    for idx, step in enumerate(steps, start=1):
        normalized.append(
            {
                "step": str(step or f"Step {idx}").strip(),
                "expected_result": str(fallback_expected or "").strip(),
            }
        )
    return normalized


def _ensure_step_details_expected(step_details: List[Dict[str, Any]]) -> None:
    missing = [
        idx + 1
        for idx, detail in enumerate(step_details)
        if not str(detail.get("expected_result") or "").strip()
    ]
    if missing:
        raise ValueError(
            "AI must provide a non-empty expected_result for every stepDetails item. "
            f"Missing at steps: {missing}"
        )


def _extract_cases_payload(data: Any) -> List[Dict[str, Any]] | None:
    """
    Accept common JSON shapes produced by LLMs and remain backward compatible.
    """
    if isinstance(data, list):
        return data

    if not isinstance(data, dict):
        return None

    for key in ("test_cases", "testCases", "cases", "data"):
        value = data.get(key)
        if isinstance(value, list):
            return value

    return None


def generate_test_cases(
    *,
    plan_id: str,
    plan_title: str,
    plan_description: str,
    spec_text: str,
    style_config: str,
    project_title: str,
) -> List[Dict[str, Any]]:
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
        data = ai.generate_json(prompt=prompt, timeout=settings.openrouter_test_cases_timeout)
    except Exception as exc:
        log_error(logger, "generate_cases_ai_failed", error=str(exc))
        raise

    cases_raw = _extract_cases_payload(data)
    if not isinstance(cases_raw, list):
        raise ValueError(
            "AI did not return a list of test cases (expected test_cases/testCases/cases/data array)"
        )

    prefix = _tc_prefix(plan_id)
    normalized: List[Dict[str, Any]] = []
    for i, item in enumerate(cases_raw, start=1):
        if not isinstance(item, dict):
            continue
        steps = item.get("steps") or []
        if isinstance(steps, str):
            steps = [steps]
        clean_steps = [str(s).strip() for s in steps if str(s).strip()]
        step_details = _normalize_step_details(
            clean_steps,
            item.get("stepDetails", item.get("step_details", [])),
            str(item.get("expected_result") or "").strip(),
        )
        _ensure_step_details_expected(step_details)
        test_data = item.get(
    "test_data",
    item.get("testData", {})
)

    if not isinstance(test_data, dict):
        raise ValueError(
        "test_data must be a JSON object"
    )

    normalized.append(
            {
                "id": str(item.get("id") or f"{prefix}.{i}").strip() or f"{prefix}.{i}",
                "title": str(item.get("title") or f"Test Case {i}").strip(),
                "objective": str(item.get("objective") or f"Verify {item.get('title') or f'Test Case {i}'}").strip(),
                "preconditions": _string_list(item.get("preconditions")),
                "test_data": test_data,
                "steps": clean_steps,
                "stepDetails": step_details,
                "expected_result": str(item.get("expected_result") or "").strip(),
                "priority": _normalize_priority(str(item.get("priority") or "Medium")),
                "severity": _normalize_severity(str(item.get("severity") or "Major")),
                "type": _normalize_type(str(item.get("type") or "Validation")),
                "requirements": _normalize_requirements(item.get("requirements"), linked[:5]),
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
