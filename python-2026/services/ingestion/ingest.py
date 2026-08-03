"""
services/ingestion/ingest.py
─────────────────────────────
Phase 2: full ingestion pipeline (itemisation only — no tagging yet).
"""

from __future__ import annotations

from collections import Counter
import os
from typing import Any

from services.ingestion.items import (
    Item,
    ROLE_LABELS,
    compute_spec_hash,
    expand_section_to_items,
    get_items,
    store_items,
)
from services.ingestion.tagger import tag_role
from services.ingestion.review_queue import enqueue_for_review
from services.ingestion.module_generation import (
    flag_tiny_modules,
    generate_module_list,
    select_module_evidence,
    store_module_list,
)
from services.ingestion.module_tagger import tag_module
from services.ingestion.module_validation import compare_module_detection, score_against_gold
from utils.chunker import SpecChunk, chunk_spec_recursive, detect_modules_from_chunks
from utils.logger import get_logger, log_event

logger = get_logger(__name__)


def ingest_spec(
    doc_or_text: Any,        # python-docx Document or plain str
    file_bytes: bytes,
) -> tuple[str, list[Item]]:
    """
    Full ingestion pipeline (Phase 4: itemisation, roles, and spec-local modules).

    Steps
    -----
    1. Compute sha256 hash of *file_bytes*.
    2. Idempotency check: if already stored, return immediately.
    3. chunk_spec_recursive(doc_or_text) → list[SpecChunk]
    4. expand_section_to_items(chunk) for each chunk → flat list[Item]
    5. tag_role(items) using deterministic cascade stages
    6. generate spec-local module cards and tag items when dependencies exist
    7. store_items(hash, items)

    Returns
    -------
    (spec_hash, items)
        *spec_hash* is the sha256 hex digest; *items* is the full list.

    Notes
    -----
    - Idempotent: calling again with the same bytes returns the cached result
      without re-chunking.
    - Module tagging is observational: no prompt filters on it in this phase.
    - The existing generation path (generate_test_plans) is unchanged.
    """
    h = compute_spec_hash(file_bytes)

    # Idempotency: skip if already ingested
    existing = get_items(h)
    if existing:
        logger.debug("ingest_spec: cache hit for hash %s (%d items)", h[:8], len(existing))
        return h, existing

    # Chunk the document
    chunks: list[SpecChunk] = chunk_spec_recursive(doc_or_text)
    logger.info("ingest_spec: %d chunks from document", len(chunks))

    # Expand each chunk into atomic items
    all_items: list[Item] = []
    for chunk in chunks:
        new_items = expand_section_to_items(chunk, start_index=len(all_items))
        all_items.extend(new_items)

    tag_role(all_items)
    pending_review_count = enqueue_for_review(h, all_items)

    modules: list[dict[str, Any]] = []
    module_error: str | None = None
    try:
        evidence = select_module_evidence(all_items)
        modules = generate_module_list(evidence)
        if modules:
            tag_module(all_items, modules)
            store_module_list(h, modules)
    except Exception as exc:
        # Upload/item ingestion remains usable when OpenRouter, the model, or
        # a first-download dependency is unavailable.
        module_error = str(exc)
        logger.warning("module_generation_unavailable hash=%s error=%s", h[:8], module_error)

    role_counts = Counter(item.role for item in all_items)
    method_counts = Counter(item.role_method for item in all_items)
    module_counts = Counter(item.module for item in all_items)
    legacy_modules = detect_modules_from_chunks(chunks)
    comparison = compare_module_detection(legacy_modules, modules)
    gold_score = None
    fixture = os.getenv("MODULE_GOLD_FIXTURE", "").strip()
    if fixture and modules:
        try:
            gold_score = score_against_gold(fixture, modules)
        except Exception as exc:
            logger.warning("module_gold_scoring_unavailable fixture=%s error=%s", fixture, exc)
    log_event(
        logger,
        "ingestion_complete",
        spec_hash=h,
        item_count=len(all_items),
        chunk_count=len(chunks),
        role_dist={role: role_counts.get(role, 0) for role in [*ROLE_LABELS, "UNTAGGED"]},
        method_dist={method: method_counts.get(method, 0) for method in ("regex", "heading", "human", "none")},
        pending_review_count=pending_review_count,
        module_count=len(modules),
        module_dist=dict(module_counts),
        tiny_modules=flag_tiny_modules(modules, all_items),
        module_comparison=comparison,
        module_gold_score=gold_score,
        module_error=module_error,
    )

    store_items(h, all_items)
    return h, all_items
