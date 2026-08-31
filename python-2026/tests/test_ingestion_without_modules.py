"""Upload ingestion must remain deterministic and module-free."""

from typing import Any

import pytest

from services.ingestion import ingest as ingestion_module
from services.ingestion.ingest import ingest_spec
from services.ingestion.items import Item
from utils.chunker import SpecChunk


def test_ingestion_persists_pending_module_snapshot_without_generation(monkeypatch) -> None:
    persisted = {}
    chunk = SpecChunk(
        id="CHUNK-001",
        title="Search",
        heading_path=["Features", "Search"],
        text="The system must return matching tracks.",
    )
    monkeypatch.setattr(ingestion_module, "get_items", lambda spec_hash: [])
    monkeypatch.setattr(ingestion_module, "chunk_spec_recursive", lambda document: [chunk])
    monkeypatch.setattr(
        ingestion_module,
        "store_ingestion",
        lambda spec_hash, items, modules: persisted.update(
            {"spec_hash": spec_hash, "items": list(items), "modules": list(modules)}
        ),
    )

    spec_hash, items = ingest_spec("document", b"document-bytes")

    assert persisted["spec_hash"] == spec_hash
    assert persisted["items"] == items
    assert persisted["modules"] == []
    assert all(item.module == "UNTAGGED" for item in items)


def test_ingestion_reuses_structured_cached_items_without_rechunking(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = Item(
        "ITEM-00001",
        "CHUNK-001",
        ["Requirements"],
        "The system must preserve audit records.",
        role="REQUIREMENT",
        role_method="regex",
    )
    monkeypatch.setattr(ingestion_module, "get_items", lambda spec_hash: [existing])
    monkeypatch.setattr(
        ingestion_module,
        "chunk_spec_recursive",
        lambda document: pytest.fail("Structured cache hits must not be rechunked"),
    )
    monkeypatch.setattr(
        ingestion_module,
        "store_ingestion",
        lambda *args: pytest.fail("Structured cache hits must not be stored again"),
    )

    spec_hash, items = ingest_spec("document", b"cached document")

    assert len(spec_hash) == 64
    assert items == [existing]


def test_ingestion_keeps_legacy_snapshot_when_headings_cannot_be_recovered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = Item("ITEM-00001", "CHUNK-001", [], "Legacy requirement without a heading.")
    candidate = SpecChunk(
        id="CHUNK-001",
        title="Document",
        heading_path=[],
        text="Legacy requirement without a heading.",
    )
    monkeypatch.setattr(ingestion_module, "get_items", lambda spec_hash: [existing])
    monkeypatch.setattr(ingestion_module, "chunk_spec_recursive", lambda document: [candidate])
    monkeypatch.setattr(
        ingestion_module,
        "store_ingestion",
        lambda *args: pytest.fail("Unchanged legacy snapshots must not be stored again"),
    )

    _, items = ingest_spec("document", b"legacy document")

    assert items == [existing]


def test_ingestion_refreshes_legacy_snapshot_when_headings_are_recovered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = Item("ITEM-00001", "CHUNK-001", [], "Legacy requirement without a heading.")
    candidate = SpecChunk(
        id="CHUNK-001",
        title="Requirements",
        heading_path=["Requirements"],
        text="The system must preserve audit records.",
    )
    refreshed = Item(
        "ITEM-00000",
        "CHUNK-001",
        ["Requirements"],
        "The system must preserve audit records.",
    )
    calls: dict[str, Any] = {}
    monkeypatch.setattr(ingestion_module, "get_items", lambda spec_hash: [existing])
    monkeypatch.setattr(ingestion_module, "chunk_spec_recursive", lambda document: [candidate])
    monkeypatch.setattr(
        ingestion_module,
        "expand_section_to_items",
        lambda chunk, start_index: [refreshed],
    )

    def tag(items: list[Item]) -> list[Item]:
        calls["tagged"] = list(items)
        items[0].role = "REQUIREMENT"
        items[0].role_method = "regex"
        return items

    monkeypatch.setattr(ingestion_module, "tag_role", tag)
    monkeypatch.setattr(
        ingestion_module,
        "enqueue_for_review",
        lambda spec_hash, items: calls.update({"queue_hash": spec_hash}) or 0,
    )
    monkeypatch.setattr(
        ingestion_module,
        "store_ingestion",
        lambda spec_hash, items, modules: calls.update(
            {"store_hash": spec_hash, "stored_items": list(items), "modules": list(modules)}
        ),
    )

    spec_hash, items = ingest_spec(
        "document",
        b"legacy document",
        storage_hash="  CUSTOM-SCOPE-HASH  ",
    )

    assert spec_hash == "custom-scope-hash"
    assert items == [refreshed]
    assert calls["tagged"] == [refreshed]
    assert calls["queue_hash"] == spec_hash
    assert calls["store_hash"] == spec_hash
    assert calls["stored_items"] == [refreshed]
    assert calls["modules"] == []
