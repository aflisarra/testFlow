"""Phase 5a review-queue behavior tests."""

import pytest

from services.ingestion.items import Item, store_items
from services.ingestion.review_queue import enqueue_for_review, get_pending_review, resolve_review


def test_pending_items_are_exposed_without_a_suggestion() -> None:
    spec_hash = "review-queue-pending"
    pending = Item("ITEM-00042", "CHUNK-001", ["Requirements"], "Needs a human decision.")
    tagged = Item("ITEM-00043", "CHUNK-001", [], "A feature.", role="FEATURE")
    assert enqueue_for_review(spec_hash, [pending, tagged]) == 1
    store_items(spec_hash, [pending, tagged])

    queue = get_pending_review(spec_hash)
    assert queue == [pending]
    assert queue[0].suggested_role is None


def test_resolution_updates_store_and_requirement_identity() -> None:
    spec_hash = "review-queue-resolution"
    item = Item("ITEM-00042", "CHUNK-001", ["Requirements"], "Needs a human decision.")
    store_items(spec_hash, [item])

    resolved = resolve_review(spec_hash, "ITEM-00042", "requirement", reviewer="alice")

    assert resolved.role == "REQUIREMENT"
    assert resolved.role_method == "human"
    assert resolved.reviewed is True
    assert resolved.requirement_id == "REQ-00042"
    assert get_pending_review(spec_hash) == []


def test_resolution_rejects_unknown_roles() -> None:
    with pytest.raises(ValueError, match="Invalid role"):
        resolve_review("missing", "ITEM-00001", "UNTAGGED")
