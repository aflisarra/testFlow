from __future__ import annotations

import re
from typing import Any, Dict, List

from core.config import get_settings
from core.constants import DEFAULT_TEST_CASES_MIN, DEFAULT_TEST_CASES_MAX, PRIORITIES, SEVERITIES, TEST_CASE_TYPES
from prompts.test_case_prompt import build_test_case_prompt
from services.ai_service import get_ai_service
from services.spec_service import SRS_CASE_SECTIONS, extract_requirements, get_srs_sections
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


def _validated_requirements(raw: Any, requirements: List[Dict[str, str]]) -> List[Dict[str, str]]:
    valid_requirement_ids = {
        str(req.get("id")).strip().lower(): _format_requirement(req)
        for req in requirements if req.get("id")
    }
    values = raw if isinstance(raw, list) else ([raw] if raw else [])
    linked: List[Dict[str, str]] = []
    seen: set[str] = set()
    for item in values:
        candidate = item.get("id") if isinstance(item, dict) else item
        key = str(candidate or "").strip().lower()
        if key in valid_requirement_ids and key not in seen:
            linked.append(valid_requirement_ids[key])
            seen.add(key)
    return linked


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
    chunks = get_srs_sections(spec_text, SRS_CASE_SECTIONS)

    if settings.use_mock:
        raise ValueError("Mock test case generation is disabled for the SRS pipeline")

    prompt = build_test_case_prompt(
        plan_id=plan_id,
        plan_title=plan_title,
        plan_description=plan_description,
        project_title=project_title,
        style_config=style_config,
        linked_requirements=reqs,
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
            item.get("testData", {}),
        )
        if not isinstance(test_data, dict):
            raise ValueError("test_data must be a JSON object")
        expected_result = str(item.get("expected_result") or "").strip()
        if not expected_result:
            logger.warning("Rejected test case without expected_result: %s", item.get("title"))
            continue

        normalized.append(
            {
                "id": str(item.get("id") or f"{prefix}.{i}").strip() or f"{prefix}.{i}",
                "title": str(item.get("title") or f"Test Case {i}").strip(),
                "objective": str(item.get("objective") or f"Verify {item.get('title') or f'Test Case {i}'}").strip(),
                "preconditions": _string_list(item.get("preconditions")),
                "test_data": test_data,
                "steps": clean_steps,
                "stepDetails": step_details,
                "expected_result": expected_result,
                "priority": _normalize_priority(str(item.get("priority") or "Medium")),
                "severity": _normalize_severity(str(item.get("severity") or "Major")),
                "type": _normalize_type(str(item.get("type") or "Validation")),
                "requirements": _validated_requirements(item.get("requirements"), reqs),
            }
        )

    if len(normalized) < DEFAULT_TEST_CASES_MIN:
        raise ValueError(
            f"AI generated only {len(normalized)} test case(s), "
            f"minimum required is {DEFAULT_TEST_CASES_MIN}"
        )

    # Re-number sequentially (stable ids) and cap count
    normalized = normalized[:DEFAULT_TEST_CASES_MAX]
    for i, tc in enumerate(normalized, start=1):
        tc["id"] = f"{prefix}.{i}"
    return normalized
