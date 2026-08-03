"""Human review queue for deterministic-role misses (Phase 5a)."""

from __future__ import annotations

from services.ingestion.items import (
    ROLE_LABELS,
    Item,
    get_items,
    requirement_id_from_item_id,
    store_items,
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
    return [
        item for item in get_items(spec_hash)
        if item.role == "UNTAGGED" and not item.reviewed
    ]


def resolve_review(
    spec_hash: str,
    item_id: str,
    role: str,
    reviewer: str | None = None,
) -> Item:
    """Persist a human-assigned role through the configured item-store API."""
    del reviewer  # Reserved for durable-store audit metadata.
    role = role.strip().upper()
    if role not in ROLE_LABELS:
        raise ValueError(f"Invalid role {role!r}; expected one of: {', '.join(ROLE_LABELS)}")

    items = get_items(spec_hash)
    for item in items:
        if item.id != item_id:
            continue
        item.role = role
        item.role_method = "human"
        item.role_score = None
        item.reviewed = True
        item.suggested_role = None
        item.requirement_id = requirement_id_from_item_id(item.id) if role == "REQUIREMENT" else None
        store_items(spec_hash, items)
        return item

    raise ValueError(f"Item {item_id!r} was not found for spec {spec_hash!r}")
