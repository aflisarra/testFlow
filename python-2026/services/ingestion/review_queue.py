"""Human review queue for deterministic-role misses (Phase 5a)."""

from __future__ import annotations

from services.ingestion.items import (
    ROLE_LABELS,
    Item,
    get_items,
    store_ingestion,
)


def enqueue_for_review(spec_hash: str, items: list[Item]) -> int:
    """Return the number of unresolved items created by the role cascade.

    Pending state is represented directly on an Item rather than duplicated in
    another queue: ``role == 'UNTAGGED' and not reviewed``.  No suggestion is
    generated in this phase.
    """
    del spec_hash  # Queue ownership is supplied by the item's eventual store.
    for item in items:
        if item.role == "UNTAGGED" and not item.reviewed:
            item.suggested_role = None
    return sum(item.role == "UNTAGGED" and not item.reviewed for item in items)


def get_pending_review(spec_hash: str) -> list[Item]:
    """Return unresolved review items for one uploaded specification."""
    from services.ingestion.store_client import get_pending_review as _get_pending_review
    return _get_pending_review(spec_hash)


def resolve_review(
    spec_hash: str,
    item_id: str,
    role: str,
    reviewer: str | None = None,
) -> Item:
    """Persist a human-assigned role through the configured item-store API."""
    role = role.strip().upper()
    if role not in ROLE_LABELS:
        raise ValueError(f"Invalid role {role!r}; expected one of: {', '.join(ROLE_LABELS)}")
    from services.ingestion.store_client import resolve_review as _resolve_review
    resolved = _resolve_review(spec_hash, item_id, role, reviewer)

    # A human-resolved item is eligible for the existing spec-local module
    # vocabulary. Re-tag only this item; never regenerate the module list.
    from services.ingestion.module_generation import get_module_list
    from services.ingestion.module_tagger import tag_module

    modules = get_module_list(spec_hash)
    if not modules:
        return resolved
    try:
        tag_module([resolved], modules)
        items = get_items(spec_hash)
        for index, item in enumerate(items):
            if item.id == resolved.id:
                items[index] = resolved
                store_ingestion(spec_hash, items, modules)
                break
    except Exception:
        # The role decision is already durable. Module re-tagging is
        # observational and must not roll back a human classification.
        pass
    return resolved
