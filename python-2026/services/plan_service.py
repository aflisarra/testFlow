"""Deterministic test-plan assembly from durable, module-tagged ingestion data."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from utils.logger import get_logger, log_event

from services.ingestion.items import Item, get_items
from services.ingestion.module_orchestration import (
    PLAN_EVIDENCE_ROLES,
    ModuleGenerationResult,
    ensure_modules_for_plan,
)

logger = get_logger("services.plan_service")


@dataclass(frozen=True)
class PlanGenerationResult:
    plans: list[dict[str, Any]]
    pending_review_count: int
    modules: list[dict[str, Any]]
    module_status: str
    module_version: int
    module_coverage: dict[str, Any]
    skipped_modules: list[dict[str, str]]


def _external_evidence_id(item: Item) -> str:
    suffix = item.id.removeprefix("ITEM-")
    if item.role == "REQUIREMENT":
        return item.requirement_id or f"REQ-{suffix}"
    if item.role == "ACCEPTANCE":
        return f"AC-{suffix}"
    if item.role == "NON_FUNCTIONAL":
        return f"NFR-{suffix}"
    return item.id


def _evidence_record(item: Item) -> dict[str, str]:
    return {
        "item_id": item.id,
        "external_id": _external_evidence_id(item),
        "role": item.role,
        "title": item.heading_path[-1] if item.heading_path else item.role.replace("_", " ").title(),
        "description": item.text,
        "source": item.source_chunk_id,
    }


def _requirement_record(item: Item) -> dict[str, str]:
    return {
        "id": _external_evidence_id(item),
        "title": item.heading_path[-1] if item.heading_path else "Requirement",
        "description": item.text,
        "source": item.source_chunk_id,
        "priority": "",
    }


def requirements_from_items(items: list[Item]) -> list[dict[str, str]]:
    """Return backward-compatible formal requirement records in document order."""
    return [_requirement_record(item) for item in items if item.role == "REQUIREMENT"]


def _belongs_to_module(item: Item, module_id: str, module_name: str) -> bool:
    if item.module_ids:
        return module_id in item.module_ids and item.module_disposition == "assigned"
    # Compatibility for unit fixtures and legacy snapshots. New persisted
    # snapshots use module IDs exclusively.
    return item.module == module_name and item.module_disposition != "cross_cutting"


def build_test_plans_deterministic(
    module_list: list[dict[str, Any]],
    items: list[Item],
) -> list[dict[str, Any]]:
    """Build plans from requirement, acceptance, and NFR evidence.

    Formal requirements remain in the legacy ``requirements`` field. The
    canonical ``evidence`` field retains the role of every plan-eligibility
    item so acceptance-only and NFR-only modules are not discarded.
    """
    plans: list[dict[str, Any]] = []
    for module_index, module in enumerate(module_list):
        module_id = str(module.get("id") or f"MOD-{module_index + 1:03d}")
        name = str(module.get("name") or "").strip()
        description = str(module.get("description") or "").strip()
        if not name:
            continue
        evidence_items = [
            item
            for item in items
            if item.role in PLAN_EVIDENCE_ROLES and _belongs_to_module(item, module_id, name)
        ]
        if not evidence_items:
            logger.info("Skipping module without testable evidence: %s", name)
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
                "module_id": module_id,
                "plan_kind": str(module.get("kind") or "functional"),
                "coverage_status": "ready",
                "requirements": requirements_from_items(evidence_items),
                "evidence": [_evidence_record(item) for item in evidence_items],
            }
        )

    cross_cutting = [
        item
        for item in items
        if item.role == "NON_FUNCTIONAL" and item.module_disposition == "cross_cutting"
    ]
    if cross_cutting:
        plan_number = len(plans) + 1
        plans.append(
            {
                "id": f"TP-{plan_number}",
                "title": "Cross-cutting quality requirements",
                "description": "Test coverage for system-wide quality requirements.",
                "objective": "Verify cross-cutting non-functional behavior.",
                "scope": "Security, performance, accessibility, availability, and other system-wide constraints.",
                "priority": "Medium",
                "module": "Cross-cutting quality",
                "module_id": None,
                "plan_kind": "quality",
                "coverage_status": "ready",
                "requirements": [],
                "evidence": [_evidence_record(item) for item in cross_cutting],
            }
        )
    return plans


def _skipped_modules(modules: list[dict[str, Any]], items: list[Item]) -> list[dict[str, str]]:
    skipped: list[dict[str, str]] = []
    for index, module in enumerate(modules):
        module_id = str(module.get("id") or f"MOD-{index + 1:03d}")
        name = str(module.get("name") or "").strip()
        testable = [
            item for item in items
            if item.role in PLAN_EVIDENCE_ROLES and _belongs_to_module(item, module_id, name)
        ]
        if testable:
            continue
        supporting = [
            item for item in items
            if item.role == "FEATURE" and _belongs_to_module(item, module_id, name)
        ]
        skipped.append(
            {
                "module_id": module_id,
                "module": name,
                "reason": "insufficient_traceability" if supporting else "no_testable_evidence",
            }
        )
    return skipped


def generate_test_plans(
    *,
    spec_hash: str,
    module_mode: Literal["ensure", "regenerate"] = "ensure",
    cancellation_check: Callable[[], bool] | None = None,
) -> PlanGenerationResult:
    """Ensure a current module snapshot, then assemble deterministic plans."""
    if not spec_hash:
        raise ValueError("spec_hash is required for deterministic plan generation")
    items = get_items(spec_hash)
    if not items:
        raise ValueError("No stored ingestion items found for spec_hash")
    module_result: ModuleGenerationResult = ensure_modules_for_plan(
        spec_hash,
        items,
        module_mode=module_mode,
        cancellation_check=cancellation_check,
    )
    plans = build_test_plans_deterministic(module_result.modules, module_result.items)
    pending_review_count = sum(
        item.role == "UNTAGGED" and not item.reviewed for item in module_result.items
    )
    skipped_modules = _skipped_modules(module_result.modules, module_result.items)
    log_event(
        logger,
        "plan_assembly_completed",
        spec_hash=spec_hash,
        item_count=len(module_result.items),
        module_count=len(module_result.modules),
        module_version=module_result.module_version,
        module_reused=module_result.reused,
        plan_count=len(plans),
        skipped_module_count=len(skipped_modules),
        pending_review_count=pending_review_count,
    )
    return PlanGenerationResult(
        plans=plans,
        pending_review_count=pending_review_count,
        modules=module_result.modules,
        module_status=module_result.module_status,
        module_version=module_result.module_version,
        module_coverage=module_result.coverage,
        skipped_modules=skipped_modules,
    )
