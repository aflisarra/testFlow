from __future__ import annotations

import re
from typing import Any, Dict, List

from core.config import get_settings
from core.constants import DEFAULT_TEST_PLANS_MIN, DEFAULT_TEST_PLANS_MAX
from prompts.test_plan_prompt import build_test_plan_prompt
from services.ai_service import get_ai_service
from services.spec_service import SRS_PLAN_SECTIONS, extract_requirements, get_srs_sections
from utils.logger import get_logger, log_event, log_error


logger = get_logger("services.plan_service")


def _normalize_priority(value: str | None) -> str:
    raw = (value or "").strip().lower()
    mapping = {
        "p0": "Critical",
        "urgent": "Critical",
        "critical": "Critical",
        "p1": "High",
        "high": "High",
        "p2": "Medium",
        "medium": "Medium",
        "p3": "Low",
        "low": "Low",
    }
    return mapping.get(raw, "Medium")


def _format_requirement(req: Dict[str, str]) -> Dict[str, str]:
    return {
        "id": str(req.get("id") or req.get("requirementId") or req.get("reqId") or "").strip(),
        "title": str(req.get("title") or req.get("module") or "").strip(),
        "description": str(req.get("description") or req.get("text") or req.get("requirement") or "").strip(),
        "source": str(req.get("source") or req.get("module") or "").strip(),
        "priority": _normalize_priority(str(req.get("priority") or "")) if req.get("priority") else "",
    }


def _validated_plan_requirements(raw: object, requirements: List[Dict[str, str]]) -> List[Dict[str, str]]:
    valid_requirement_ids = {
        str(req.get("id")).strip().lower(): _format_requirement(req)
        for req in requirements if req.get("id")
    }
    linked, seen = [], set()
    values = raw if isinstance(raw, list) else ([raw] if raw else [])
    for item in values:
        candidate = item.get("id") if isinstance(item, dict) else item
        key = str(candidate or "").strip().lower()
        if key in valid_requirement_ids and key not in seen:
            linked.append(valid_requirement_ids[key])
            seen.add(key)
    return linked

def _normalize_plan_id(value: str | None, idx: int) -> str:
    raw = str(value or "").strip().upper()
    m = re.search(r"\d+", raw)
    return f"TP-{int(m.group())}" if m else f"TP-{idx}"


def _dedupe_plans(plans: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[str] = set()
    out: List[Dict[str, str]] = []
    for p in plans:
        title = (p.get("title") or "").strip()
        if not title:
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _extract_plans_payload(data: Any) -> List[Dict[str, Any]] | None:
    """
    Accept the most common JSON shapes produced by LLMs and keep backward
    compatibility with older payloads.
    """
    if isinstance(data, list):
        return data

    if not isinstance(data, dict):
        return None

    for key in ("test_plans", "testPlans", "plans", "data"):
        value = data.get(key)
        if isinstance(value, list):
            return value

    return None


def generate_test_plans(*, spec_text: str, style_config: str, project_title: str) -> List[Dict[str, Any]]:
    settings = get_settings()
    log_event(logger, "generate_plans_request_received", mock=settings.use_mock)

    requirements = extract_requirements(spec_text)
    chunks = get_srs_sections(spec_text, SRS_PLAN_SECTIONS)

    if settings.use_mock:
        raise ValueError("Mock test plan generation is disabled for the SRS pipeline")

    prompt = build_test_plan_prompt(
        project_title=project_title,
        style_config=style_config,
        modules=[],
        requirements=requirements,
        spec_chunks=chunks,
    )

    ai = get_ai_service()
    try:
        data = ai.generate_json(prompt=prompt, timeout=settings.openrouter_test_plans_timeout)
    except Exception as exc:
        log_error(logger, "generate_plans_ai_failed", error=str(exc))
        raise

    # Accept the canonical payload and a few legacy/LLM variants.
    plans_raw = _extract_plans_payload(data)

    if not isinstance(plans_raw, list):
        raise ValueError("AI returned invalid test plans")

    normalized: List[Dict[str, Any]] = []
    for i, item in enumerate(plans_raw, start=1):
        if not isinstance(item, dict):
            continue
        plan_requirements = _validated_plan_requirements(item.get("requirements"), requirements)
        if not plan_requirements:
            logger.warning("Rejected test plan without valid extracted requirement IDs: %s", item.get("title"))
            continue
        normalized.append(
            {
                "id": _normalize_plan_id(item.get("id"), i),
                "title": str(item.get("title") or "").strip() or f"Test Plan {i}",
                "description": str(item.get("description") or "").strip(),
                "objective": str(item.get("objective") or "").strip(),
                "scope": str(item.get("scope") or "").strip(),
                "priority": _normalize_priority(str(item.get("priority") or "Medium")),
                "requirements": plan_requirements,
            }
        )

    normalized = _dedupe_plans(normalized)

    if len(normalized) < DEFAULT_TEST_PLANS_MIN:
        raise ValueError(
            f"AI generated only {len(normalized)} plan(s), "
            f"minimum required is {DEFAULT_TEST_PLANS_MIN}"
        )

    # Re-number sequentially to avoid gaps after dedupe
    for i, p in enumerate(normalized[:DEFAULT_TEST_PLANS_MAX], start=1):
        p["id"] = f"TP-{i}"

    return normalized[:DEFAULT_TEST_PLANS_MAX]
