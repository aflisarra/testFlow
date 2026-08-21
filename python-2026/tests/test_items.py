"""Atomic ingestion-item model and itemization tests."""

from __future__ import annotations

import hashlib

from services.ingestion.items import (
    compute_spec_hash,
    expand_section_to_items,
    requirement_id_from_item_id,
)
from utils.chunker import SpecChunk


def _chunk(text: str) -> SpecChunk:
    return SpecChunk(
        id="CHUNK-007",
        title="Checkout",
        heading_path=["Features", "Checkout"],
        text=text,
    )


def test_itemization_preserves_document_order_across_prose_and_bullets() -> None:
    chunk = _chunk(
        "Checkout starts after the customer confirms the basket.\n"
        "- The system must validate the available stock.\n"
        "Checkout ends after payment confirmation is stored."
    )

    items = expand_section_to_items(chunk)

    assert [item.text for item in items] == [
        "Checkout starts after the customer confirms the basket.",
        "The system must validate the available stock.",
        "Checkout ends after payment confirmation is stored.",
    ]


def test_itemization_supports_bullet_and_numbered_records_with_provenance() -> None:
    chunk = _chunk(
        "- The system must validate stock before payment.\n"
        "2. The system must retain a payment audit record."
    )

    items = expand_section_to_items(chunk, start_index=42)

    assert [item.id for item in items] == ["ITEM-00042", "ITEM-00043"]
    assert all(item.source_chunk_id == "CHUNK-007" for item in items)
    assert all(item.heading_path == ["Features", "Checkout"] for item in items)
    assert all(item.role == "UNTAGGED" and item.module == "UNTAGGED" for item in items)


def test_itemization_splits_prose_sentences_and_drops_short_candidates() -> None:
    chunk = _chunk(
        "A long checkout sentence is retained. Tiny. "
        "A second sufficiently detailed sentence is retained too.\n"
        "- short\n"
        "- This bullet is long enough to become an atomic item."
    )

    items = expand_section_to_items(chunk, start_index=5)

    assert [item.id for item in items] == ["ITEM-00005", "ITEM-00006", "ITEM-00007"]
    assert "short" not in [item.text for item in items]
    assert all(len(item.text) >= 10 for item in items)


def test_empty_or_short_section_produces_no_items() -> None:
    assert expand_section_to_items(_chunk("")) == []
    assert expand_section_to_items(_chunk("Too short")) == []


def test_spec_hash_and_requirement_ids_are_stable() -> None:
    content = b"same uploaded specification"

    assert compute_spec_hash(content) == hashlib.sha256(content).hexdigest()
    assert compute_spec_hash(content) == compute_spec_hash(content)
    assert requirement_id_from_item_id("ITEM-00042") == "REQ-00042"
    assert requirement_id_from_item_id("external-id") == "REQ-external-id"
    assert requirement_id_from_item_id("ITEM-") == "ITEM-"
