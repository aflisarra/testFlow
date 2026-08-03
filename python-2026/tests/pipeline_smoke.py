"""Runnable smoke test for the Phase 1-2 ingestion pipeline.

Run from ``python-2026``:

    python tests/pipeline_smoke.py

It uses lightweight paragraph doubles, so it does not need a fixture .docx.
The checks cover the pieces implemented through Phase 2:

* heading-aware chunking and inherited ``heading_path``;
* plain-text fallback when no Word heading styles are present;
* itemisation, item provenance, and initial UNTAGGED state;
* hash-keyed, idempotent in-process ingestion.
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace


# Allow ``python tests/pipeline_smoke.py`` without installing the project.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.ingestion import ingest as ingestion_module
from services.ingestion.ingest import ingest_spec
from utils.chunker import chunk_spec_recursive


def paragraph(text: str, style_name: str = "Normal") -> SimpleNamespace:
    """Build the minimal paragraph shape consumed by the chunker."""
    return SimpleNamespace(
        text=text,
        style=SimpleNamespace(name=style_name),
        _p=SimpleNamespace(pPr=None),
    )


def headed_document() -> SimpleNamespace:
    return SimpleNamespace(
        paragraphs=[
            paragraph("SonicWave", "Heading 1"),
            paragraph("Streaming platform for music discovery."),
            paragraph("Users", "Heading 2"),
            paragraph("Free user: listens with advertising."),
            paragraph("Premium user: downloads tracks for offline listening."),
            paragraph("Search", "Heading 2"),
            paragraph("- The system suggests results after two characters."),
            paragraph("- The search history retains the last 20 searches."),
        ]
    )


def assert_heading_chunking(document: SimpleNamespace) -> None:
    chunks = chunk_spec_recursive(document)
    paths = [chunk.heading_path for chunk in chunks]

    assert ["SonicWave"] in paths, paths
    assert ["SonicWave", "Users"] in paths, paths
    assert ["SonicWave", "Search"] in paths, paths
    assert all(chunk.char_count == len(chunk.text) for chunk in chunks)


def assert_plain_text_fallback() -> None:
    text = """Requirements:
The system must retain audit records.

Acceptance:
An administrator can export the audit trail.
"""
    chunks = chunk_spec_recursive(text)
    assert chunks, "Plain text must produce at least one chunk"
    assert all(chunk.heading_path == [] for chunk in chunks)


def assert_ingestion(document: SimpleNamespace) -> None:
    file_bytes = b"pipeline-smoke-sonicwave-v1"
    persisted: dict[str, tuple[list, list]] = {}

    def get_persisted_items(spec_hash: str):
        return list(persisted.get(spec_hash, ([], []))[0])

    def persist(spec_hash: str, items: list, modules: list) -> None:
        persisted[spec_hash] = (list(items), list(modules))

    # This smoke test exercises chunking/itemisation without requiring a
    # running Node/Mongo integration; adapter behavior has its own tests.
    ingestion_module.get_items = get_persisted_items
    ingestion_module.store_ingestion = persist
    spec_hash, items = ingest_spec(document, file_bytes)

    assert len(spec_hash) == 64
    assert items, "The headed document must yield atomic items"
    assert persisted[spec_hash][0] == items
    assert all(item.role == "UNTAGGED" and item.module == "UNTAGGED" for item in items)
    assert all(item.source_chunk_id.startswith("CHUNK-") for item in items)
    assert all(item.heading_path for item in items)
    assert any(item.heading_path[-1] == "Search" for item in items)
    assert any("suggests results" in item.text for item in items)

    # Same bytes are a cache hit: no duplicate items and the same item IDs.
    cached_hash, cached_items = ingest_spec(document, file_bytes)
    assert cached_hash == spec_hash
    assert [item.id for item in cached_items] == [item.id for item in items]


def main() -> None:
    document = headed_document()
    assert_heading_chunking(document)
    assert_plain_text_fallback()
    assert_ingestion(document)
    print("PASS: Phase 1-2 pipeline smoke test")
    print("  heading paths: preserved")
    print("  plain-text fallback: preserved")
    print("  ingestion: itemised and idempotent")


if __name__ == "__main__":
    main()
