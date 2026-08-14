"""Upload ingestion must remain deterministic and module-free."""

from services.ingestion import ingest as ingestion_module
from services.ingestion.ingest import ingest_spec
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
