"""Human review queue for deterministic-role misses (Phase 5a)."""

from __future__ import annotations

from services.ingestion.items import (
    ROLE_LABELS,
    Item,
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
    from services.ingestion.store_client import (
        get_pending_review as _get_pending_review,
    )

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

    # Node marks an existing module snapshot stale when this role can change
    # module evidence. The next POST /generate-plan owns regeneration and
    # assignment; review resolution must not invoke embeddings or rewrite the
    # complete ingestion snapshot.
    return _resolve_review(spec_hash, item_id, role, reviewer)
