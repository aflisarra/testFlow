"""Deterministic test-plan assembly from durable ingestion data (Phase 5b)."""

from __future__ import annotations

from typing import Any

from services.ingestion.items import Item, get_items
from services.ingestion.module_generation import (
    flag_tiny_modules,
    get_or_generate_module_list,
)
from utils.logger import get_logger, log_event


logger = get_logger("services.plan_service")


def _requirement_record(item: Item) -> dict[str, str]:
    return {
        "id": item.requirement_id or "",
        "title": item.heading_path[-1] if item.heading_path else "Requirement",
        "description": item.text,
        "source": item.source_chunk_id,
        "priority": "",
    }


def requirements_from_items(items: list[Item]) -> list[dict[str, str]]:
    """Return traceable requirement records in document order."""
    return [
        _requirement_record(item)
        for item in items
        if item.role == "REQUIREMENT" and item.requirement_id
    ]


def build_test_plans_deterministic(
    module_list: list[dict[str, Any]],
    items: list[Item],
) -> list[dict[str, Any]]:
    """Build one human-editable TP per non-tiny, requirement-backed module.

    Module-card descriptions are generated once during ingestion. Plan wording
    is intentionally simple and deterministic; it does not introduce another
    model call or inferred priority.
    """
    tiny_modules = set(flag_tiny_modules(module_list, items))
    plans: list[dict[str, Any]] = []
    for module in module_list:
        name = str(module.get("name") or "").strip()
        description = str(module.get("description") or "").strip()
        if not name or name in tiny_modules:
            continue
        requirements = [
            _requirement_record(item)
            for item in items
            if item.role == "REQUIREMENT"
            and item.requirement_id
            and item.module == name
        ]
        if not requirements:
            logger.info("Skipping module without requirement links: %s", name)
            continue
        plan_number = len(plans) + 1
        plans.append(
            {
                "id": f"TP-{plan_number}",
                "title": name,
                "description": f"Test coverage for {name}.",
                "objective": f"Verify {name} behavior.",
                "scope": description,
                "priority": "Medium",
                "module": name,
                "requirements": requirements,
            }
        )
    return plans


def generate_test_plans(*, spec_hash: str) -> tuple[list[dict[str, Any]], int]:
    """Assemble plans from persisted items and cached/generated module cards."""
    if not spec_hash:
        raise ValueError("spec_hash is required for deterministic plan generation")
    items = get_items(spec_hash)
    if not items:
        raise ValueError("No stored ingestion items found for spec_hash")
    modules = get_or_generate_module_list(spec_hash, items)
    plans = build_test_plans_deterministic(modules, items)
    pending_review_count = sum(item.role == "UNTAGGED" and not item.reviewed for item in items)
    log_event(
        logger,
        "generate_plans_deterministic",
        spec_hash=spec_hash,
        item_count=len(items),
        module_count=len(modules),
        plan_count=len(plans),
        pending_review_count=pending_review_count,
    )
    return plans, pending_review_count
