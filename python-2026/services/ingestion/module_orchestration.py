"""Own module generation, assignment, validation, and persistence for plans."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import hashlib
import json
import re
from typing import Any, Callable, Literal

from services.ingestion.items import Item
from services.ingestion.module_generation import generate_module_list, select_module_evidence
from services.ingestion.module_tagger import MODULE_ASSIGNMENT_ROLES, tag_module
from services.ingestion.store_client import (
    claim_module_generation,
    commit_module_generation,
    fail_module_generation,
)
from utils.logger import get_logger, log_event


logger = get_logger(__name__)

MODULE_ALGORITHM_VERSION = "module-v2-generate-plan-1"
PLAN_EVIDENCE_ROLES = frozenset({"REQUIREMENT", "ACCEPTANCE", "NON_FUNCTIONAL"})


class ModuleGenerationInProgress(RuntimeError):
    """Another request currently owns the module-generation lease."""


class ModuleGenerationCancelled(RuntimeError):
    """Cancellation was observed before a module version was committed."""


@dataclass(frozen=True)
class ModuleGenerationResult:
    modules: list[dict[str, Any]]
    items: list[Item]
    module_status: str
    module_version: int
    coverage: dict[str, Any]
    reused: bool


def module_evidence_fingerprint(items: list[Item]) -> str:
    """Hash the trusted evidence and algorithm contract used by generation."""
    evidence = select_module_evidence(items)
    payload = {
        "algorithm_version": MODULE_ALGORITHM_VERSION,
        "items": [
            {
                "id": item.id,
                "role": item.role,
                "role_method": item.role_method,
                "heading_path": item.heading_path,
                "text": item.text,
                "reviewed": item.reviewed,
            }
            for item in evidence
        ],
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def module_coverage(items: list[Item]) -> dict[str, Any]:
    """Summarize plan-relevant assignment outcomes without excluded-role noise."""
    eligible = [item for item in items if item.role in PLAN_EVIDENCE_ROLES]
    assigned = [item for item in eligible if item.module_disposition == "assigned"]
    unassigned = [item for item in eligible if item.module_disposition == "unassigned"]
    cross_cutting = [item for item in eligible if item.module_disposition == "cross_cutting"]
    excluded_count = sum(item.role not in MODULE_ASSIGNMENT_ROLES for item in items)
    by_role: dict[str, dict[str, int]] = {}
    for role in sorted(PLAN_EVIDENCE_ROLES):
        role_items = [item for item in eligible if item.role == role]
        dispositions = Counter(item.module_disposition for item in role_items)
        by_role[role] = {
            "eligible": len(role_items),
            "assigned": dispositions.get("assigned", 0),
            "unassigned": dispositions.get("unassigned", 0),
            "cross_cutting": dispositions.get("cross_cutting", 0),
        }
    return {
        "eligible_item_count": len(eligible),
        "assigned_item_count": len(assigned),
        "unassigned_item_ids": [item.id for item in unassigned],
        "cross_cutting_item_ids": [item.id for item in cross_cutting],
        "excluded_item_count": excluded_count,
        "low_confidence_count": len(unassigned),
        "by_role": by_role,
    }


def _set_algorithm_version(items: list[Item]) -> None:
    for item in items:
        item.module_algorithm_version = MODULE_ALGORITHM_VERSION


def _normalise_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").casefold()).strip()


def _numeric_module_id(value: str) -> int:
    match = re.fullmatch(r"MOD-(\d+)", str(value or ""))
    return int(match.group(1)) if match else 0


def preserve_module_ids(
    modules: list[dict[str, Any]],
    previous_modules: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Preserve IDs for unambiguous name/source matches across regeneration."""
    previous = [dict(module) for module in previous_modules if isinstance(module, dict)]
    previous_ids = {str(module.get("id") or "") for module in previous if module.get("id")}
    used_ids: set[str] = set()
    next_number = max((_numeric_module_id(str(module.get("id") or "")) for module in previous), default=0) + 1
    result: list[dict[str, Any]] = []
    for module in modules:
        card = dict(module)
        name = _normalise_name(str(card.get("name") or ""))
        source_ids = set(str(value) for value in card.get("source_item_ids") or [])
        candidates: list[tuple[int, int, dict[str, Any]]] = []
        for index, old in enumerate(previous):
            old_id = str(old.get("id") or "")
            if not old_id or old_id in used_ids:
                continue
            old_name = _normalise_name(str(old.get("name") or ""))
            old_sources = set(str(value) for value in old.get("source_item_ids") or [])
            exact_name = int(bool(name) and name == old_name)
            overlap = len(source_ids & old_sources)
            if exact_name or overlap:
                candidates.append((exact_name, overlap, old))
        candidates.sort(key=lambda value: (value[0], value[1]), reverse=True)
        matched_id: str | None = None
        if candidates:
            best = candidates[0]
            tied = len(candidates) > 1 and best[:2] == candidates[1][:2]
            if not tied:
                matched_id = str(best[2]["id"])
        proposed_id = str(card.get("id") or "")
        if matched_id:
            card["id"] = matched_id
        elif not previous and proposed_id and proposed_id not in used_ids:
            card["id"] = proposed_id
        else:
            while f"MOD-{next_number:03d}" in used_ids or f"MOD-{next_number:03d}" in previous_ids:
                next_number += 1
            card["id"] = f"MOD-{next_number:03d}"
            next_number += 1
        used_ids.add(str(card["id"]))
        result.append(card)
    return result


def ensure_modules_for_plan(
    spec_hash: str,
    items: list[Item],
    *,
    module_mode: Literal["ensure", "regenerate"] = "ensure",
    cancellation_check: Callable[[], bool] | None = None,
) -> ModuleGenerationResult:
    """Generate modules only on miss/staleness, then atomically persist assignments."""
    if module_mode not in {"ensure", "regenerate"}:
        raise ValueError("module_mode must be 'ensure' or 'regenerate'")
    fingerprint = module_evidence_fingerprint(items)
    claim = claim_module_generation(
        spec_hash,
        fingerprint=fingerprint,
        algorithm_version=MODULE_ALGORITHM_VERSION,
        force=module_mode == "regenerate",
    )
    if claim.get("reused"):
        coverage = claim.get("module_coverage")
        return ModuleGenerationResult(
            modules=[dict(module) for module in claim.get("modules") or []],
            items=items,
            module_status=str(claim.get("module_status") or "ready"),
            module_version=int(claim.get("module_version") or 0),
            coverage=dict(coverage) if isinstance(coverage, dict) else module_coverage(items),
            reused=True,
        )
    if claim.get("in_progress") or not claim.get("claimed"):
        raise ModuleGenerationInProgress("Module generation is already in progress for this specification")

    lease = str(claim.get("lease") or "")
    if not lease:
        raise RuntimeError("Module store did not return a generation lease")
    try:
        if cancellation_check and cancellation_check():
            raise ModuleGenerationCancelled("Module generation cancelled by user")
        evidence = select_module_evidence(items)
        if not evidence:
            raise ValueError("No trusted items are available for module generation")
        modules = preserve_module_ids(
            generate_module_list(evidence),
            [dict(module) for module in claim.get("previous_modules") or []],
        )
        if not modules:
            raise ValueError("Module generation returned no valid modules")
        tag_module(items, modules)
        _set_algorithm_version(items)
        coverage = module_coverage(items)
        module_status = "needs_review" if coverage["unassigned_item_ids"] else "ready"
        if cancellation_check and cancellation_check():
            raise ModuleGenerationCancelled("Module generation cancelled before persistence")
        committed = commit_module_generation(
            spec_hash,
            lease,
            modules=modules,
            items=items,
            fingerprint=fingerprint,
            algorithm_version=MODULE_ALGORITHM_VERSION,
            coverage=coverage,
            module_status=module_status,
        )
        log_event(
            logger,
            "module_generation_committed",
            spec_hash=spec_hash,
            module_count=len(modules),
            module_version=int(committed.get("module_version") or 0),
            module_status=str(committed.get("module_status") or module_status),
            coverage=coverage,
        )
        return ModuleGenerationResult(
            modules=[dict(module) for module in committed.get("modules") or modules],
            items=items,
            module_status=str(committed.get("module_status") or module_status),
            module_version=int(committed.get("module_version") or 0),
            coverage=coverage,
            reused=False,
        )
    except Exception as exc:
        try:
            fail_module_generation(spec_hash, lease, str(exc))
        except Exception:
            logger.exception("Unable to persist module-generation failure for %s", spec_hash)
        raise
