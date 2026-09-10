from __future__ import annotations

import re
import os
from typing import Any, Dict, List

from core.config import get_settings
from core.constants import DEFAULT_TEST_PLANS_MIN, DEFAULT_TEST_PLANS_MAX
from prompts.test_plan_prompt import build_test_plan_prompt
from services.ai_service import get_ai_service
from services.spec_service import SRS_PLAN_SECTIONS, extract_requirements, get_srs_sections
from utils.logger import get_logger, log_event, log_error


logger = get_logger("services.plan_service")

MAX_GENERATION_ATTEMPTS = 1
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


def _get_ai_seed_plan_count(requested_count: int) -> int:
    seed_limit = _get_int_env(
        "OLLAMA_TEST_PLANS_SEED_COUNT",
        DEFAULT_AI_SEED_PLAN_COUNT,
        1,
        DEFAULT_TEST_PLANS_MIN,
    )
    return max(1, min(requested_count, seed_limit))


def _get_ai_attempt_count() -> int:
    return _get_int_env("OLLAMA_TEST_PLANS_ATTEMPTS", MAX_GENERATION_ATTEMPTS, 1, 5)


def _get_ai_seed_timeout(configured_timeout: int) -> int:
    max_timeout = max(1, configured_timeout)
    default_timeout = min(DEFAULT_AI_SEED_TIMEOUT, max_timeout)
    return _get_int_env("OLLAMA_TEST_PLANS_SEED_TIMEOUT", default_timeout, 30, max_timeout)


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


def _fill_missing_plans(
    plans: List[Dict[str, Any]],
    requirements: List[Dict[str, str]],
    target_count: int,
) -> List[Dict[str, Any]]:
    """Complete an under-filled batch with traceable QA scenarios.

    Small local models often return fewer plans than requested. The generated
    additions remain linked to extracted requirements and cover different QA
    angles instead of silently returning an invalid batch.
    """
    if len(plans) >= target_count:
        return plans[:target_count]

    valid_requirements = [req for req in requirements if req.get("id")]
    if not valid_requirements:
        return plans

    scenarios = (
        ("Positive Flow", "happy-path behavior and expected business outcome"),
        ("Validation", "required fields, invalid values, and validation feedback"),
        ("Negative Flow", "rejected input and safe error handling"),
        ("Boundary", "minimum, maximum, and boundary values"),
        ("Permission", "authorized and unauthorized user behavior"),
        ("Recovery", "retry, recovery, and state preservation after failure"),
        ("Regression", "related behavior that must remain stable"),
    )
    existing_titles = {str(plan.get("title") or "").strip().lower() for plan in plans}
    requirement_index = 0
    scenario_index = 0

    while len(plans) < target_count:
        requirement = valid_requirements[requirement_index % len(valid_requirements)]
        scenario_name, scenario_scope = scenarios[scenario_index % len(scenarios)]
        requirement_title = str(requirement.get("title") or requirement.get("id") or "Requirement").strip()
        title = f"{requirement_title} - {scenario_name}"
        suffix = 2
        unique_title = title
        while unique_title.lower() in existing_titles:
            unique_title = f"{title} {suffix}"
            suffix += 1

        plans.append(
            {
                "id": f"TP-{len(plans) + 1}",
                "title": unique_title,
                "description": f"Verify {scenario_name.lower()} behavior for {requirement_title}.",
                "objective": f"Ensure {requirement_title.lower()} works for the selected QA scenario.",
                "scope": scenario_scope,
                "priority": _normalize_priority(str(requirement.get("priority") or "Medium")),
                "requirements": [_format_requirement(requirement)],
            }
        )
        existing_titles.add(unique_title.lower())
        requirement_index += 1
        scenario_index += 1

    logger.warning(
        "Completed under-filled test plan batch with deterministic QA scenarios: %s/%s",
        len(plans),
        target_count,
    )
    return plans[:target_count]


# How many QA scenario variations (positive flow, validation, negative
# flow, boundary...) a single extracted requirement is typically worth as
# distinct test plans. Used only to size an auto-derived plan count — it is
# not a hard rule about how many plans get generated per requirement.
_SCENARIOS_PER_REQUIREMENT = 3


def _derive_plan_count_from_spec(requirements: List[Dict[str, str]]) -> int:
    """
    Size the number of test plans to generate off the spec's own content
    (how many distinct requirements it actually contains) instead of a
    fixed number — a two-requirement spec shouldn't be padded up to a fixed
    default, and a fifty-requirement spec shouldn't be capped down to it
    either. Still always clamped to the mandatory 10..1000 range.
    """
    requirement_count = len(requirements) or 1
    derived = requirement_count * _SCENARIOS_PER_REQUIREMENT
    return max(DEFAULT_TEST_PLANS_MIN, min(derived, DEFAULT_TEST_PLANS_MAX))


def generate_test_plans(
    *,
    spec_text: str,
    style_config: str,
    project_title: str,
    target_count: int | None = None,
) -> List[Dict[str, Any]]:
    settings = get_settings()
    log_event(logger, "generate_plans_request_received", mock=settings.use_mock)

    requirements = extract_requirements(spec_text)
    chunks = get_srs_sections(spec_text, SRS_PLAN_SECTIONS)

    if target_count is None:
        # No explicit count requested: derive it from the spec itself.
        requested_count = _derive_plan_count_from_spec(requirements)
        log_event(
            logger,
            "generate_plans_count_auto_derived",
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
        )
        prompt = re.sub(
            r"Generate between 10 and 1000 test plans maximum\.",
            f"Generate between {remaining_needed} and {remaining_needed} test plan(s) maximum.",
            prompt,
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
        normalized = _fill_missing_plans(normalized, requirements, requested_count)

    if len(normalized) < requested_count:
        raise ValueError(
            f"AI generated only {len(normalized)} plan(s) after {MAX_GENERATION_ATTEMPTS} attempt(s), "
            f"minimum required is {requested_count}"
        )

    # Re-number sequentially to avoid gaps after dedupe
    for i, p in enumerate(normalized[:requested_count], start=1):
        p["id"] = f"TP-{i}"

    return normalized[:requested_count]
