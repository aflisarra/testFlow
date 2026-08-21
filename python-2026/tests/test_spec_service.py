"""Tests for specification adapters and durable task filtering."""

from __future__ import annotations

import pytest

from services import spec_service
from services.ingestion.items import Item
from utils.chunker import SpecChunk


def _chunk(title: str, text: str) -> SpecChunk:
    return SpecChunk(
        id="CHUNK-001",
        title=title,
        heading_path=[title],
        text=text,
    )


def test_docx_and_plain_text_adapters_delegate_to_canonical_chunker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chunk = _chunk("Requirements", "The system must retain history.")
    calls: list[object] = []
    monkeypatch.setattr(spec_service, "extract_text_from_docx", lambda value: "extracted text")
    monkeypatch.setattr(spec_service, "extract_doc_from_bytes", lambda value: "document")
    monkeypatch.setattr(
        spec_service,
        "chunk_spec_recursive",
        lambda value: calls.append(value) or [chunk],
    )

    assert spec_service.extract_spec_text_from_docx_bytes(b"docx") == "extracted text"
    assert spec_service.chunk_docx_bytes(b"docx") == [chunk]
    assert spec_service.chunk_spec("plain text") == [chunk]
    assert calls == ["document", "plain text"]


def test_section_filter_normalizes_numbering_and_punctuation() -> None:
    requirements = _chunk("3.1. Business Rules", "The system must retain history.")
    overview = _chunk("Overview", "Product context.")

    assert spec_service.filter_srs_sections([requirements, overview]) == [requirements, overview]
    assert spec_service.filter_srs_sections(
        [requirements, overview],
        {"business rules"},
    ) == [requirements]


def test_get_srs_sections_filters_chunks_from_plain_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requirements = _chunk("Requirements", "The system must retain history.")
    overview = _chunk("Overview", "Product context.")
    monkeypatch.setattr(spec_service, "chunk_spec", lambda text: [requirements, overview])

    assert spec_service.get_srs_sections("spec", {"requirements"}) == [requirements]


def test_filtered_items_distinguishes_missing_hash_unknown_snapshot_and_stored_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = Item(
        "ITEM-00001",
        "CHUNK-001",
        ["Search"],
        "Search must respond quickly.",
        role="NON_FUNCTIONAL",
        role_method="regex",
        module="Search",
        module_ids=["MOD-001"],
        primary_module_id="MOD-001",
        module_disposition="assigned",
    )
    calls: dict[str, object] = {}
    monkeypatch.setattr(
        spec_service,
        "get_items_with_status",
        lambda spec_hash: ([], False) if spec_hash == "missing" else ([item], True),
    )

    def filter_items(items, task, **kwargs):
        calls.update({"items": items, "task": task, **kwargs})
        return [item], 3

    monkeypatch.setattr(spec_service, "filter_items", filter_items)

    assert spec_service.get_filtered_items_for_task("", "generate-test-cases") == ([], 0, False)
    assert spec_service.get_filtered_items_for_task("missing", "generate-test-cases") == (
        [],
        0,
        False,
    )
    assert spec_service.get_filtered_items_for_task(
        "stored",
        "generate-test-cases",
        module="Search",
        module_id="MOD-001",
        budget_chars=500,
    ) == ([item], 3, True)
    assert calls == {
        "items": [item],
        "task": "generate-test-cases",
        "module": "Search",
        "module_id": "MOD-001",
        "budget_chars": 500,
    }


def test_extract_requirements_supports_bullets_plain_text_modals_and_user_stories(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chunk = _chunk(
        "Project Description",
        "- The system shall export audit records.\n"
        "Checkout confirmation displays the final transaction summary.\n"
        "The platform must encrypt every stored payment token.\n"
        "As an administrator, I can download the audit history.",
    )
    monkeypatch.setattr(
        spec_service,
        "get_srs_sections",
        lambda text, allowed: [chunk],
    )

    requirements = spec_service.extract_requirements("spec")

    assert [value["id"] for value in requirements] == [
        f"REQ-{index:03d}" for index in range(1, 5)
    ]
    descriptions = [value["text"] for value in requirements]
    assert "The system shall export audit records." in descriptions
    assert "Checkout confirmation displays the final transaction summary." in descriptions
    assert "The platform must encrypt every stored payment token." in descriptions
    assert "As an administrator, I can download the audit history." in descriptions
    assert all(value["priority"] == "Medium" for value in requirements)


def test_extract_requirements_falls_back_to_all_chunks_and_deduplicates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chunk = _chunk(
        "Other",
        "The system must retain records. The system must retain records.",
    )
    monkeypatch.setattr(spec_service, "get_srs_sections", lambda text, allowed: [])
    monkeypatch.setattr(spec_service, "chunk_spec", lambda text: [chunk])

    requirements = spec_service.extract_requirements("spec")

    assert [value["text"] for value in requirements] == ["The system must retain records."]
