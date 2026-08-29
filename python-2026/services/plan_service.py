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

MAX_GENERATION_ATTEMPTS = 5


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


def _normalize_raw_plans(
    plans_raw: List[Dict[str, Any]],
    requirements: List[Dict[str, str]],
    start_index: int,
) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for i, item in enumerate(plans_raw, start=start_index):
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
    return normalized


def generate_test_plans(
    *,
    spec_text: str,
    style_config: str,
    project_title: str,
    target_count: int = DEFAULT_TEST_PLANS_MIN,
) -> List[Dict[str, Any]]:
    settings = get_settings()
    log_event(logger, "generate_plans_request_received", mock=settings.use_mock)

    requested_count = max(1, min(int(target_count), DEFAULT_TEST_PLANS_MAX))

    requirements = extract_requirements(spec_text)
    chunks = get_srs_sections(spec_text, SRS_PLAN_SECTIONS)

    if settings.use_mock:
        raise ValueError("Mock test plan generation is disabled for the SRS pipeline")

    ai = get_ai_service()
    normalized: List[Dict[str, Any]] = []
    existing_titles: set[str] = set()

    for attempt in range(1, MAX_GENERATION_ATTEMPTS + 1):
        remaining_needed = requested_count - len(normalized)
        if remaining_needed <= 0:
            break

        prompt = build_test_plan_prompt(
            project_title=project_title,
            style_config=style_config,
            modules=[],
            requirements=requirements,
            spec_chunks=chunks,
        )
        prompt = prompt.replace(
            "Generate between 10 and 10 test plans maximum.",
            f"Generate between {remaining_needed} and {remaining_needed} test plan(s) maximum.",
        )

        if attempt > 1:
            # Nudge the model to cover different ground than what it already produced,
            # since small models sometimes under-generate on the first pass.
            existing_list = "\n".join(f"- {t}" for t in sorted(existing_titles)) or "(none yet)"
            prompt = (
                f"{prompt}\n\n"
                f"IMPORTANT: You previously produced these test plan titles, which are "
                f"already accepted and must NOT be repeated:\n{existing_list}\n\n"
                f"Generate {remaining_needed} additional, DISTINCT test plan(s) covering "
                f"other requirements or aspects of the specification that are not yet covered above."
            )

        try:
            data = ai.generate_json(prompt=prompt, timeout=settings.ollama_test_plans_timeout)
        except Exception as exc:
            log_error(logger, "generate_plans_ai_failed", error=str(exc), attempt=attempt)
            if normalized:
                # Keep whatever we already validated rather than losing it on a later failure.
                break
            raise

        plans_raw = _extract_plans_payload(data)
        if not isinstance(plans_raw, list):
            log_event(logger, "generate_plans_invalid_payload", attempt=attempt)
            continue

        new_plans = _normalize_raw_plans(plans_raw, requirements, start_index=len(normalized) + 1)
        combined = _dedupe_plans(normalized + new_plans)

        gained = len(combined) - len(normalized)
        normalized = combined
        existing_titles = {p["title"].lower() for p in normalized}

        log_event(
            logger,
            "generate_plans_attempt_result",
            attempt=attempt,
            gained=gained,
            total=len(normalized),
        )

        if gained == 0 and attempt > 1:
            # The model isn't producing anything new; stop retrying early.
            break

    if len(normalized) < requested_count:
        raise ValueError(
            f"AI generated only {len(normalized)} plan(s) after {MAX_GENERATION_ATTEMPTS} attempt(s), "
            f"minimum required is {requested_count}"
        )

    # Re-number sequentially to avoid gaps after dedupe
    for i, p in enumerate(normalized[:requested_count], start=1):
        p["id"] = f"TP-{i}"

    return normalized[:requested_count]