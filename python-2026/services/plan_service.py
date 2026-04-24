from __future__ import annotations

import re
from typing import Dict, List

from core.config import get_settings
from core.constants import DEFAULT_TEST_PLANS_MIN, DEFAULT_TEST_PLANS_MAX
from prompts.test_plan_prompt import build_test_plan_prompt
from services.ai_service import get_ai_service
from services.spec_service import chunk_spec, detect_modules, extract_requirements
from utils.logger import get_logger, log_event, log_error


logger = get_logger("services.plan_service")


def _normalize_plan_id(value: str | None, idx: int) -> str:
    raw = str(value or "").strip().upper()
    m = re.search(r"\d+", raw)
    return f"TP-{int(m.group())}" if m else f"TP-{idx}"


def _dedupe_plans(plans: List[Dict[str, str]]) -> List[Dict[str, str]]:
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


def _mock_plans(modules: List[str]) -> List[Dict[str, str]]:
    base = modules[: max(DEFAULT_TEST_PLANS_MIN, min(len(modules), DEFAULT_TEST_PLANS_MAX))]
    if len(base) < DEFAULT_TEST_PLANS_MIN:
        base = (base + ["Error Handling", "Security", "Performance"])[:DEFAULT_TEST_PLANS_MIN]

    plans: List[Dict[str, str]] = []
    for i, m in enumerate(base, start=1):
        plans.append(
            {
                "id": f"TP-{i}",
                "title": m if len(m.split()) <= 5 else " ".join(m.split()[:5]),
                "description": f"Coverage for {m} based on specification scope",
            }
        )
    return plans[:DEFAULT_TEST_PLANS_MAX]


def generate_test_plans(*, spec_text: str, style_config: str, project_title: str) -> List[Dict[str, str]]:
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

    # Accept both {"test_plans":[...]} and direct array (backward tolerance)
    plans_raw = data.get("test_plans") if isinstance(data, dict) else data
    if not isinstance(plans_raw, list):
        raise ValueError("AI did not return a list of test plans")

    normalized: List[Dict[str, str]] = []
    for i, item in enumerate(plans_raw, start=1):
        if not isinstance(item, dict):
            continue
        normalized.append(
            {
                "id": _normalize_plan_id(item.get("id"), i),
                "title": str(item.get("title") or "").strip() or f"Test Plan {i}",
                "description": str(item.get("description") or "").strip(),
            }
        )

    normalized = _dedupe_plans(normalized)
    if len(normalized) < DEFAULT_TEST_PLANS_MIN:
        normalized.extend(_mock_plans(modules)[len(normalized) : DEFAULT_TEST_PLANS_MIN])

    # Re-number sequentially to avoid gaps after dedupe
    for i, p in enumerate(normalized[:DEFAULT_TEST_PLANS_MAX], start=1):
        p["id"] = f"TP-{i}"
    return normalized[:DEFAULT_TEST_PLANS_MAX]

