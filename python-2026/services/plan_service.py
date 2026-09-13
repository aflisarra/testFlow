from __future__ import annotations

import re
import os
from typing import Any, Dict, List

from core.config import get_settings
from core.constants import DEFAULT_TEST_PLANS_MIN, DEFAULT_TEST_PLANS_MAX
from prompts.test_plan_prompt import build_test_plan_prompt
from services.ai_service import get_ai_service
from services.spec_service import (
    SRS_PLAN_SECTIONS,
    extract_features_and_rules,
    extract_requirements,
    get_srs_sections,
)
from utils.logger import get_logger, log_event, log_error


logger = get_logger("services.plan_service")

MAX_GENERATION_ATTEMPTS = 2
DEFAULT_AI_SEED_PLAN_COUNT = 10
DEFAULT_AI_SEED_TIMEOUT = 180


def rephrase_test_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Rewrite one existing plan for clarity without generating a new plan."""
    source = {
        "title": str(plan.get("title") or ""),
        "description": str(plan.get("description") or ""),
        "objective": str(plan.get("objective") or ""),
        "scope": str(plan.get("scope") or ""),
        "priority": str(plan.get("priority") or "Medium"),
        "requirements": plan.get("requirements") or [],
    }
    prompt = f"""
Rephrase this single software test plan in clear, concise professional English.
You MUST change the wording of title, description, objective, and scope while
preserving the exact same functionality, priority, and requirements. Do not
generate a different test plan. Do not invent features, steps, data, or
requirements. Return ONLY valid JSON with this shape:
{{"title":"", "description":"", "objective":"", "scope":"", "priority":"",
"requirements":[]}}.

Existing plan:
{source}
"""
    result = get_ai_service().generate_json(prompt=prompt, timeout=120)
    candidate = result
    if isinstance(result, dict):
        candidate = result.get("test_plan") or result.get("testPlan") or result
    if isinstance(candidate, list):
        candidate = candidate[0] if candidate else {}
    if not isinstance(candidate, dict):
        raise ValueError("AI returned an invalid rephrased test plan")

    rewritten = {
        **source,
        "title": str(candidate.get("title") or source["title"]).strip(),
        "description": str(candidate.get("description") or source["description"]).strip(),
        "objective": str(candidate.get("objective") or source["objective"]).strip(),
        "scope": str(candidate.get("scope") or source["scope"]).strip(),
        "priority": str(candidate.get("priority") or source["priority"]).strip(),
        "requirements": candidate.get("requirements") or source["requirements"],
    }

    comparable_fields = ("title", "description", "objective", "scope")
    if all(
        re.sub(r"\s+", " ", rewritten[field]).strip().lower()
        == re.sub(r"\s+", " ", source[field]).strip().lower()
        for field in comparable_fields
    ):
        rewritten["title"] = _fallback_rephrase_text(source["title"], "Rephrased")
        rewritten["description"] = _fallback_rephrase_text(
            source["description"],
            "This plan verifies the same behavior with clearer validation coverage.",
        )
        rewritten["objective"] = _fallback_rephrase_text(
            source["objective"],
            "Confirm the same expected outcome while keeping the original functional scope.",
        )
        rewritten["scope"] = _fallback_rephrase_text(
            source["scope"],
            "Equivalent scope, restated for clearer test planning.",
        )

    return rewritten


def _fallback_rephrase_text(value: str, fallback: str) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text:
        return fallback
    return f"{fallback}: {text}" if not text.lower().startswith(fallback.lower()) else text


def _get_int_env(name: str, default: int, min_value: int, max_value: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(min_value, min(value, max_value))


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
    # If no exact match found, link to the first valid requirement to avoid losing a good plan
    if not linked and valid_requirement_ids:
        valid_requirements_list = list(valid_requirement_ids.values())
        if valid_requirements_list:
            linked.append(valid_requirements_list[0])
    return linked


def _normalize_plan_id(value: str | None, idx: int) -> str:
    raw = str(value or "").strip().upper()
    m = re.search(r"\d+", raw)
    return f"TP-{int(m.group())}" if m else f"TP-{idx}"


def _dedupe_plans(plans: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[str] = set()
    out: List[Dict[str, Any]] = []
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
        title = str(item.get("title") or "").strip()
        if not title:
            title = f"Feature Test Plan {i}"

        desc = str(item.get("description") or "").strip()
        if not desc:
            desc = f"Verification of {title} functionality according to SRS."

        obj = str(item.get("objective") or "").strip()
        if not obj:
            obj = f"Ensure {title} satisfies functional requirements and business rules."

        scope = str(item.get("scope") or "").strip()
        if not scope:
            scope = f"Workflows, input validations, and business logic for {title}."

        normalized.append(
            {
                "id": _normalize_plan_id(item.get("id"), i),
                "title": title,
                "description": desc,
                "objective": obj,
                "scope": scope,
                "priority": _normalize_priority(str(item.get("priority") or "High" if i <= 2 else "Medium")),
                "requirements": plan_requirements,
            }
        )
    return normalized


def _fill_missing_plans(
    plans: List[Dict[str, Any]],
    requirements: List[Dict[str, str]],
    features: List[Dict[str, str]],
    target_count: int,
) -> List[Dict[str, Any]]:
    """Complete an under-filled batch with realistic, feature-based QA test plans."""
    if len(plans) >= target_count:
        return plans[:target_count]

    existing_titles = {str(plan.get("title") or "").strip().lower() for plan in plans}
    valid_requirements = [req for req in requirements if req.get("id")]

    # 1. Use detected Features (Section 5)
    for feat in features:
        if len(plans) >= target_count:
            break
        f_title = str(feat.get("title") or "").strip()
        if not f_title or f_title.lower() in existing_titles:
            continue

        matching_reqs = [
            _format_requirement(r)
            for r in valid_requirements
            if r.get("module", "").lower() == f_title.lower()
            or f_title.lower() in str(r.get("text", "")).lower()
        ]
        if not matching_reqs and valid_requirements:
            matching_reqs = [_format_requirement(valid_requirements[len(plans) % len(valid_requirements)])]

        plans.append(
            {
                "id": f"TP-{len(plans) + 1}",
                "title": f_title,
                "description": f"Verify {f_title} workflow, data validation, and business rules according to SRS.",
                "objective": f"Ensure {f_title} functions properly in nominal, edge, and error conditions.",
                "scope": f"User workflows, input constraints, UI components, and business rules for {f_title}.",
                "priority": "High" if len(plans) < 2 else "Medium",
                "requirements": matching_reqs,
            }
        )
        existing_titles.add(f_title.lower())

    # 2. Use requirements if still under target count
    req_idx = 0
    while len(plans) < target_count and valid_requirements:
        req = valid_requirements[req_idx % len(valid_requirements)]
        req_title = str(req.get("title") or req.get("module") or "Feature").strip()
        req_text = str(req.get("text") or "").strip()

        plan_title = f"{req_title} Workflow"
        suffix = 2
        while plan_title.lower() in existing_titles:
            plan_title = f"{req_title} - Part {suffix}"
            suffix += 1

        plans.append(
            {
                "id": f"TP-{len(plans) + 1}",
                "title": plan_title,
                "description": f"Validate {req_title} functionality: {req_text[:120]}",
                "objective": f"Verify compliance of {req_title} against specified business rules.",
                "scope": f"Functional workflows, input validations, and error handling for {req_title}.",
                "priority": _normalize_priority(str(req.get("priority") or "Medium")),
                "requirements": [_format_requirement(req)],
            }
        )
        existing_titles.add(plan_title.lower())
        req_idx += 1

    return plans[:target_count]


def _derive_plan_count_from_spec(features: List[Dict[str, str]], requirements: List[Dict[str, str]]) -> int:
    """
    Derive a realistic number of test plans from the spec.
    Uses a configurable multiplier and enforces a minimum of 10 and maximum of 1000.
    """
    # Configurable via environment variables (defaults: multiplier 5, min 10, max 1000)
    multiplier = int(os.getenv("PLAN_COUNT_MULTIPLIER", "5"))
    min_count = int(os.getenv("PLAN_COUNT_MIN", "10"))
    max_count = int(os.getenv("PLAN_COUNT_MAX", "1000"))

    if features:
        count = len(features) * multiplier
        return max(min_count, min(count, max_count))
    # Fallback to requirements if no features detected
    req_count = len(requirements)
    if req_count:
        count = req_count * multiplier
        return max(min_count, min(count, max_count))
    # Very small spec – return the configured minimum
    return min_count


def generate_test_plans(
    *,
    spec_text: str,
    style_config: str,
    project_title: str,
    target_count: int | None = None,
) -> List[Dict[str, Any]]:
    settings = get_settings()
    log_event(logger, "generate_plans_request_received", mock=settings.use_mock)

    extracted_data = extract_features_and_rules(spec_text)
    features = extracted_data.get("features") or []
    business_rules = extracted_data.get("business_rules") or []
    requirements = extract_requirements(spec_text)
    chunks = get_srs_sections(spec_text, SRS_PLAN_SECTIONS)

    if target_count is None:
        requested_count = _derive_plan_count_from_spec(features, requirements)
        log_event(
            logger,
            "generate_plans_count_auto_derived",
            feature_count=len(features),
            requirement_count=len(requirements),
            derived_count=requested_count,
        )
    else:
        requested_count = max(1, min(int(target_count), DEFAULT_TEST_PLANS_MAX))

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
            features=features,
            business_rules=business_rules,
            target_count=remaining_needed,
        )

        try:
            data = ai.generate_json(prompt=prompt, timeout=settings.ollama_test_plans_timeout)
        except Exception as exc:
            log_error(logger, "generate_plans_ai_failed", error=str(exc), attempt=attempt)
            if normalized:
                break
            break

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

        if gained >= remaining_needed:
            break

    if len(normalized) < requested_count:
        normalized = _fill_missing_plans(normalized, requirements, features, requested_count)

    # Re-number sequentially
    for i, p in enumerate(normalized[:requested_count], start=1):
        p["id"] = f"TP-{i}"

    return normalized[:requested_count]

