from __future__ import annotations

import re
from typing import Any, Dict, List

from core.config import get_settings
from core.constants import DEFAULT_TEST_PLANS_MIN, DEFAULT_TEST_PLANS_MAX
from prompts.test_plan_prompt import build_test_plan_prompt
from services.ai_service import get_ai_service
from services.spec_service import chunk_spec, detect_modules, extract_requirements
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


def _normalize_requirements(raw: object, fallback: List[Dict[str, str]] | None = None) -> List[Dict[str, str]]:
    fallback = fallback or []
    lookup = {str(r.get("id") or "").strip().lower(): _format_requirement(r) for r in fallback if r.get("id")}
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
        normalized = [_format_requirement(r) for r in fallback[:5]]

    seen: set[str] = set()
    deduped: List[Dict[str, str]] = []
    for req in normalized:
        key = "|".join([req["id"], req["title"], req["description"], req["source"]]).lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(req)
    return deduped


def _link_requirements(title: str, description: str, reqs: List[Dict[str, str]]) -> List[Dict[str, str]]:
    hay = f"{title} {description}".lower()
    keywords = set(re.findall(r"[a-z0-9]+", hay))
    if not keywords:
        return reqs[:5]

    linked = []
    for req in reqs:
        text = f"{req.get('module','')} {req.get('text','')} {req.get('id','')}".lower()
        score = sum(1 for keyword in keywords if keyword in text)
        if score > 0:
            linked.append((score, req))
    linked.sort(key=lambda item: item[0], reverse=True)
    return [req for _, req in linked[:5]] or reqs[:5]


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


def _mock_plans(modules: List[str]) -> List[Dict[str, Any]]:
    base = modules[: max(DEFAULT_TEST_PLANS_MIN, min(len(modules), DEFAULT_TEST_PLANS_MAX))]
    if len(base) < DEFAULT_TEST_PLANS_MIN:
        base = (base + ["Error Handling", "Security", "Performance"])[:DEFAULT_TEST_PLANS_MIN]

    plans: List[Dict[str, Any]] = []
    for i, m in enumerate(base, start=1):
        plans.append(
            {
                "id": f"TP-{i}",
                "title": m if len(m.split()) <= 5 else " ".join(m.split()[:5]),
                "description": f"Coverage for {m} based on specification scope",
                "objective": f"Verify {m} behaves according to the specification",
                "scope": f"{m} functional flows, validations, and expected outcomes",
                "priority": "High" if i == 1 else "Medium",
                "requirements": [],
            }
        )
    return plans[:DEFAULT_TEST_PLANS_MAX]


def generate_test_plans(*, spec_text: str, style_config: str, project_title: str) -> List[Dict[str, Any]]:
    settings = get_settings()
    log_event(logger, "generate_plans_request_received", mock=settings.use_mock)

    modules = detect_modules(spec_text)
    requirements = extract_requirements(spec_text)
    chunks = chunk_spec(spec_text)

    if settings.use_mock:
        return _mock_plans(modules)

    prompt = build_test_plan_prompt(
        project_title=project_title,
        style_config=style_config,
        modules=modules,
        requirements=requirements,
        spec_chunks=chunks,
    )

    ai = get_ai_service()
    try:
        data = ai.generate_json(prompt=prompt, timeout=settings.ollama_test_plans_timeout)
    except Exception as exc:
        log_error(logger, "generate_plans_ai_failed", error=str(exc))
        raise

    # Accept the canonical payload and a few legacy/LLM variants.
    plans_raw = _extract_plans_payload(data)
    if not isinstance(plans_raw, list):
        raise ValueError(
            "AI did not return a list of test plans (expected test_plans/plans/data array)"
        )

    normalized: List[Dict[str, Any]] = []
    for i, item in enumerate(plans_raw, start=1):
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "id": _normalize_plan_id(item.get("id"), i),
                "title": str(item.get("title") or "").strip() or f"Test Plan {i}",
                "description": str(item.get("description") or "").strip(),
                "objective": str(item.get("objective") or "").strip(),
                "scope": str(item.get("scope") or "").strip(),
                "priority": _normalize_priority(str(item.get("priority") or "Medium")),
                "requirements": _normalize_requirements(
                    item.get("requirements"),
                    _link_requirements(
                        str(item.get("title") or "").strip(),
                        str(item.get("description") or "").strip(),
                        requirements,
                    ),
                ),
            }
        )

    normalized = _dedupe_plans(normalized)
    if len(normalized) < DEFAULT_TEST_PLANS_MIN:
        normalized.extend(_mock_plans(modules)[len(normalized) : DEFAULT_TEST_PLANS_MIN])

    # Re-number sequentially to avoid gaps after dedupe
    for i, p in enumerate(normalized[:DEFAULT_TEST_PLANS_MAX], start=1):
        p["id"] = f"TP-{i}"
    return normalized[:DEFAULT_TEST_PLANS_MAX]
