"""
services/ingestion/items.py
────────────────────────────
Phase 2: Item data model, in-process store, and expand_section_to_items.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from utils.chunker import SpecChunk


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ROLE_LABELS = [
    "CONTEXT",
    "ACTOR",
    "FEATURE",
    "REQUIREMENT",
    "ACCEPTANCE",
    "NON_FUNCTIONAL",
    "OUT_OF_SCOPE",
    "GLOSSARY",
]

ROLE_METHODS = ("regex", "heading", "human", "none")

MIN_ITEM_CHARS = 10  # items shorter than this are discarded

# Compiled once at import time
_BULLET_RE = re.compile(
    r"^\s*(?:[-*•]|\d+[.):])\s+(.+)$",
    re.MULTILINE,
)
_SENTENCE_END_RE = re.compile(r"(?<=[.!?])\s+")


# ---------------------------------------------------------------------------
# Item data model
# ---------------------------------------------------------------------------

@dataclass
class Item:
    id: str                     # "ITEM-00042"
    source_chunk_id: str        # "CHUNK-007"
    heading_path: list[str]     # inherited from SpecChunk
    text: str
    role: str = "UNTAGGED"      # one of ROLE_LABELS or "UNTAGGED"
    module: str = "UNTAGGED"    # e.g. "Authentication"
    role_score: float | None = None  # keeping this but it's not used at this time
    role_method: Literal["regex", "heading", "human", "none"] = "none"
    reviewed: bool = False
    reviewed_by: str | None = None
    suggested_role: str | None = None
    requirement_id: str | None = None
    module_score: float = 0.0


# ---------------------------------------------------------------------------
# Durable store facade (implemented by Node/Mongo through store_client)
# ---------------------------------------------------------------------------

def store_ingestion(spec_hash: str, items: list[Item], modules: list[dict]) -> None:
    """Persist one complete item/module snapshot in the Node-owned store."""
    from services.ingestion.store_client import store_ingestion as _store_ingestion
    _store_ingestion(spec_hash, items, modules)


def get_items(hash_: str) -> list[Item]:
    """Return persisted items for *hash_*, or [] if the hash is unknown."""
    from services.ingestion.store_client import get_items as _get_items
    return _get_items(hash_)


def get_items_with_status(hash_: str) -> tuple[list[Item], bool]:
    """Return persisted items plus whether the specification hash exists."""
    from services.ingestion.store_client import get_items_with_status as _get_items_with_status
    return _get_items_with_status(hash_)


def compute_spec_hash(file_bytes: bytes) -> str:
    """sha256 hex digest of raw file bytes."""
    return hashlib.sha256(file_bytes).hexdigest()


def requirement_id_from_item_id(item_id: str) -> str:
    """Derive the stable external requirement ID from an immutable item ID."""
    suffix = item_id.removeprefix("ITEM-")
    return f"REQ-{suffix}" if suffix else item_id


# ---------------------------------------------------------------------------
# Core itemisation logic
# ---------------------------------------------------------------------------

def expand_section_to_items(
    chunk: "SpecChunk",
    *,
    start_index: int = 0,
) -> list[Item]:
    """
    Split a SpecChunk into atomic Items at bullet/sentence granularity.

    Strategy (in order):
    1. Split on bullet markers (-, *, •, digits followed by . ) or :).
       Each match becomes one candidate item (the captured group after the marker).
    2. Any remaining prose (non-bullet text blocks) is split on sentence
       boundaries ('.' / '!' / '?' followed by whitespace) provided the
       candidate has >= 20 chars.
    3. Drop items shorter than MIN_ITEM_CHARS (10).

    Each Item inherits ``source_chunk_id`` and ``heading_path`` from its chunk.
    Returns items in document order; IDs are globally unique across a spec when
    *start_index* is passed by the caller.
    """
    chunk_id = str(chunk.get("id") or chunk.id)
    heading_path = list(chunk.get("heading_path") or [])
    raw_text: str = str(chunk.get("text") or chunk.text)

    candidates: list[str] = []

    # ── Pass 1: extract bullet lines ────────────────────────────────────────
    bullet_texts: set[int] = set()  # character offsets already consumed
    for m in _BULLET_RE.finditer(raw_text):
        item_text = m.group(1).strip()
        if item_text:
            candidates.append(item_text)
            # Mark the span so we can subtract it in pass 2
            bullet_texts.add(m.start())

    # ── Pass 2: sentence-split the non-bullet remainder ─────────────────────
    # Remove bullet lines from raw_text to get the prose remainder
    prose = _BULLET_RE.sub("", raw_text).strip()
    if prose:
        for sentence in _SENTENCE_END_RE.split(prose):
            s = sentence.strip()
            if len(s) >= 20:
                candidates.append(s)

    # ── Pass 3: filter short items and build Item objects ───────────────────
    items: list[Item] = []
    for i, text in enumerate(candidates):
        text = text.strip()
        if len(text) < MIN_ITEM_CHARS:
            continue
        idx = start_index + len(items)
        items.append(
            Item(
                id=f"ITEM-{idx:05d}",
                source_chunk_id=chunk_id,
                heading_path=heading_path,
                text=text,
            )
        )

    return items
