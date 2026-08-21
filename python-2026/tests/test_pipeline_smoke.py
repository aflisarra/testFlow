"""Pytest-collected smoke coverage for the Phase 1-3 ingestion pipeline."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from services.ingestion import ingest as ingestion_module
from services.ingestion.ingest import ingest_spec
from services.ingestion.items import ROLE_LABELS
from utils.chunker import chunk_spec_recursive


def _paragraph(text: str, style_name: str = "Normal") -> SimpleNamespace:
    return SimpleNamespace(
        text=text,
        style=SimpleNamespace(name=style_name),
        _p=SimpleNamespace(pPr=None),
    )


def _headed_document() -> SimpleNamespace:
    return SimpleNamespace(
        paragraphs=[
            _paragraph("SonicWave", "Heading 1"),
            _paragraph("Streaming platform for music discovery."),
            _paragraph("Users", "Heading 2"),
            _paragraph("Free user: listens with advertising."),
            _paragraph("Premium user: downloads tracks for offline listening."),
            _paragraph("Search", "Heading 2"),
            _paragraph("- The system must suggest results after two characters."),
            _paragraph("- The search history must retain the last 20 searches."),
        ]
    )


def test_pipeline_preserves_heading_paths_and_character_counts() -> None:
    chunks = chunk_spec_recursive(_headed_document())
    paths = [chunk.heading_path for chunk in chunks]

    assert ["SonicWave"] in paths
    assert ["SonicWave", "Users"] in paths
    assert ["SonicWave", "Search"] in paths
    assert all(chunk.char_count == len(chunk.text) for chunk in chunks)
    assert all(chunk.char_count <= 2200 for chunk in chunks)


def test_plain_text_fallback_recognizes_srs_section_headings() -> None:
    text = """Requirements:
The system must retain audit records.

Acceptance:
An administrator can export the audit trail.
"""

    chunks = chunk_spec_recursive(text)

    assert chunks
    assert [chunk.heading_path for chunk in chunks] == [
        ["Requirements"],
        ["Acceptance"],
    ]


def test_ingestion_smoke_is_persisted_and_idempotent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    file_bytes = b"pipeline-smoke-sonicwave-v2"
    persisted: dict[str, tuple[list, list]] = {}

    def get_persisted_items(spec_hash: str):
        return list(persisted.get(spec_hash, ([], []))[0])

    def persist(spec_hash: str, items: list, modules: list) -> None:
        persisted[spec_hash] = (list(items), list(modules))

    monkeypatch.setattr(ingestion_module, "get_items", get_persisted_items)
    monkeypatch.setattr(ingestion_module, "store_ingestion", persist)

    spec_hash, items = ingest_spec(_headed_document(), file_bytes)

    assert len(spec_hash) == 64
    assert items
    assert persisted[spec_hash] == (items, [])
    assert all(item.module == "UNTAGGED" for item in items)
    assert all(item.role in {*ROLE_LABELS, "UNTAGGED"} for item in items)
    assert all(item.source_chunk_id.startswith("CHUNK-") for item in items)
    assert all(item.heading_path for item in items)
    assert any(item.role == "REQUIREMENT" for item in items)
    assert any("suggest results" in item.text for item in items)

    cached_hash, cached_items = ingest_spec(_headed_document(), file_bytes)

    assert cached_hash == spec_hash
    assert [item.id for item in cached_items] == [item.id for item in items]
