"""Spec-local module-card generation and storage (Phase 4)."""

from __future__ import annotations

import json
from collections import Counter
from typing import Any, Callable

from core.config import get_settings
from services.ingestion.items import Item
from services.ai_service import get_ai_service


MODULE_EVIDENCE_ROLES = frozenset({"CONTEXT", "FEATURE", "REQUIREMENT", "NON_FUNCTIONAL"})
TRUSTED_METHODS_FOR_EVIDENCE = frozenset({"regex", "heading", "human"})
MAX_EVIDENCE_ITEMS = 80
MAX_EVIDENCE_CHARS = 16_000


def select_module_evidence(items: list[Item]) -> list[Item]:
    """Select bounded, heading-diverse evidence without using full spec text."""
    eligible = [
        item for item in items
        if item.role in MODULE_EVIDENCE_ROLES
        and item.role_method in TRUSTED_METHODS_FOR_EVIDENCE
    ]
    selected: list[Item] = []
    chars = 0
    # First pass ensures that a long section cannot crowd out every other path.
    seen_paths: set[tuple[str, ...]] = set()
    for item in eligible:
        path = tuple(item.heading_path)
        if path in seen_paths:
            continue
        if chars + len(item.text) > MAX_EVIDENCE_CHARS:
            continue
        selected.append(item)
        seen_paths.add(path)
        chars += len(item.text)
    for item in eligible:
        if item in selected or len(selected) >= MAX_EVIDENCE_ITEMS:
            continue
        if chars + len(item.text) > MAX_EVIDENCE_CHARS:
            continue
        selected.append(item)
        chars += len(item.text)
    return selected


def _module_prompt(items: list[Item]) -> str:
    evidence = [
        {
            "id": item.id,
            "role": item.role,
            "heading_path": item.heading_path,
            "text": item.text,
        }
        for item in items
    ]
    return (
        "You identify the functional modules of a software specification.\n"
        "Return only JSON in the shape {\"modules\":[{\"name\":str,\"description\":str,"
        "\"source_item_ids\":[str]}]}.\n"
        "Use only the supplied evidence. Produce 1 to 12 distinct modules; produce fewer "
        "when the evidence supports fewer. Do not invent generic modules. Each module must "
        "cite one or more source item IDs. Merge overlapping areas rather than splitting them.\n"
        f"Evidence:\n{json.dumps(evidence, ensure_ascii=False)}"
    )


def _normalise_module_cards(payload: Any, allowed_ids: set[str]) -> list[dict[str, Any]]:
    raw = payload.get("modules") if isinstance(payload, dict) else payload
    if not isinstance(raw, list):
        raise ValueError("Module generation returned no modules array")
    cards: list[dict[str, Any]] = []
    seen: set[str] = set()
    for value in raw[:12]:
        if not isinstance(value, dict):
            continue
        name = str(value.get("name") or "").strip()
        description = str(value.get("description") or "").strip()
        source_ids = value.get("source_item_ids") or []
        source_ids = [str(source_id) for source_id in source_ids if str(source_id) in allowed_ids]
        key = name.casefold()
        if not name or not description or not source_ids or key in seen:
            continue
        seen.add(key)
        cards.append({"name": name, "description": description, "source_item_ids": source_ids})
    if not cards:
        raise ValueError("Module generation returned no valid evidence-backed module cards")
    return cards


def generate_module_list(
    module_evidence_items: list[Item],
    *,
    generate_json: Callable[..., Any] | None = None,
) -> list[dict[str, Any]]:
    """Generate 1–12 evidence-backed, spec-local module cards."""
    if not module_evidence_items:
        return []
    caller = generate_json or get_ai_service().generate_json
    payload = caller(prompt=_module_prompt(module_evidence_items), timeout=get_settings().openrouter_timeout)
    return _normalise_module_cards(payload, {item.id for item in module_evidence_items})


def get_module_list(spec_hash: str) -> list[dict[str, Any]]:
    from services.ingestion.store_client import get_module_list as _get_module_list
    return _get_module_list(spec_hash)


def flag_tiny_modules(modules: list[dict[str, Any]], items: list[Item], min_items: int = 2) -> list[str]:
    """Return module names with fewer than ``min_items`` assigned items."""
    counts = Counter(item.module for item in items if item.module != "UNTAGGED")
    return [module["name"] for module in modules if counts.get(module["name"], 0) < min_items]
