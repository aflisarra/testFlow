"""
services/ingestion/ingest.py
─────────────────────────────
Phase 2: full ingestion pipeline (itemisation only — no tagging yet).
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from services.ingestion.items import (
    ROLE_LABELS,
    Item,
    compute_spec_hash,
    expand_section_to_items,
    get_items,
    store_ingestion,
)
from services.ingestion.review_queue import enqueue_for_review
from services.ingestion.tagger import tag_role
from utils.chunker import SpecChunk, chunk_spec_recursive
from utils.logger import get_logger, log_event

logger = get_logger(__name__)


def ingest_spec(
    doc_or_text: Any,  # python-docx Document or plain str
    file_bytes: bytes,
    *,
    storage_hash: str | None = None,
) -> tuple[str, list[Item]]:
    """
    Deterministic ingestion pipeline: itemisation and role classification.

    Steps
    -----
    1. Compute sha256 hash of *file_bytes*.
    2. Idempotency check: if already stored, return immediately.
    3. chunk_spec_recursive(doc_or_text) → list[SpecChunk]
    4. expand_section_to_items(chunk) for each chunk → flat list[Item]
    5. tag_role(items) using deterministic cascade stages
    6. store items with module generation pending through the Node/Mongo adapter

    Returns
    -------
    (spec_hash, items)
        *spec_hash* is the sha256 hex digest; *items* is the full list.

    Notes
    -----
    - Idempotent: calling again with the same bytes returns the cached result
      without re-chunking.
    - Module generation and embedding-based tagging are deliberately owned by
      POST /generate-plan, never by upload ingestion.
    """
    h = (storage_hash or compute_spec_hash(file_bytes)).strip().lower()

    # Idempotency: skip if already ingested. A legacy snapshot whose items all
    # have empty heading paths is refreshed when the current chunker can now
    # recover structural paths (for example, Markdown headings in a DOCX whose
    # paragraphs all use the Word "Normal" style).
    existing = get_items(h)
    chunks: list[SpecChunk] | None = None
    if existing:
        if any(item.heading_path for item in existing):
            logger.debug("ingest_spec: cache hit for hash %s (%d items)", h[:8], len(existing))
            return h, existing

        candidate_chunks = chunk_spec_recursive(doc_or_text)
        if not any(chunk.heading_path for chunk in candidate_chunks):
            logger.debug("ingest_spec: cache hit without recoverable headings for hash %s", h[:8])
            return h, existing

        chunks = candidate_chunks
        logger.info("ingest_spec: refreshing legacy empty heading paths for hash %s", h[:8])

    # Chunk the document
    if chunks is None:
        chunks = chunk_spec_recursive(doc_or_text)
    logger.info("ingest_spec: %d chunks from document", len(chunks))

    # Expand each chunk into atomic items
    all_items: list[Item] = []
    for chunk in chunks:
        new_items = expand_section_to_items(chunk, start_index=len(all_items))
        all_items.extend(new_items)

    tag_role(all_items)
    pending_review_count = enqueue_for_review(h, all_items)

    role_counts = Counter(item.role for item in all_items)
    method_counts = Counter(item.role_method for item in all_items)
    log_event(
        logger,
        "spec_ingestion_role_ready",
        spec_hash=h,
        item_count=len(all_items),
        chunk_count=len(chunks),
        role_dist={role: role_counts.get(role, 0) for role in [*ROLE_LABELS, "UNTAGGED"]},
        method_dist={
            method: method_counts.get(method, 0) for method in ("regex", "heading", "human", "none")
        },
        pending_review_count=pending_review_count,
        module_status="pending",
    )

    store_ingestion(h, all_items, [])
    return h, all_items
