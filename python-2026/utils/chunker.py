from __future__ import annotations

import logging
import re
import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from utils.docx_reader import iter_document_paragraphs

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Plain-text regex helpers (retained for the semantic fallback path)
# ---------------------------------------------------------------------------

_MARKDOWN_HEADING_RE = re.compile(r"^\s*(#{1,6})\s+(.+?)\s*$")
_NUMBERED_HEADING_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)(?:\.)?\s+(.+?)\s*$")

# Retained for the heading-count guard; heading detection inside the tree
# builder uses _heading_level_of() exclusively.
_DOCX_HEADING_RE = re.compile(r"^Heading\s+([1-6])$", re.IGNORECASE)

# French locale heading style names: "Titre 1" … "Titre 6"
_DOCX_TITRE_RE = re.compile(r"^Titre\s+([1-6])$", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Public data structures (SpecChunk wire shape — unchanged)
# ---------------------------------------------------------------------------

@dataclass
class SpecChunk:
    """A chunk with traceable document-heading context.

    The mapping-style accessors intentionally keep existing consumers, which
    still call ``chunk.get('title')`` and ``chunk.get('text')``, compatible.
    """

    id: str
    title: str
    heading_path: list[str]
    text: str
    char_count: int = field(init=False)

    def __post_init__(self) -> None:
        self.char_count = len(self.text)

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)

    def __getitem__(self, key: str) -> Any:
        return getattr(self, key)


# ---------------------------------------------------------------------------
# Internal tree dataclasses — NOT part of the public / wire interface
# ---------------------------------------------------------------------------

@dataclass
class ParagraphRef:
    """Lightweight wrapper preserving a paragraph's original position."""
    text: str
    doc_index: int      # position in original document, for stable ordering
    style_name: str     # raw paragraph style, kept for debugging


@dataclass
class HeadingNode:
    """A node in the document heading tree.

    ``own_paragraphs`` captures text that falls *between* this heading and
    its first child heading — i.e. the "intro text between a title and its
    subtitle" that was previously lost or misattributed.
    """
    heading_text: str
    level: int                          # 1 = top-level, 0 = synthetic root
    heading_path: list[str]             # ancestor texts root→self (root excluded)
    own_paragraphs: list[ParagraphRef]
    children: list[HeadingNode]
    node_id: str


# ---------------------------------------------------------------------------
# Heading-level detection (English + French + XML outline fallback)
# ---------------------------------------------------------------------------

def _heading_level_of(paragraph: Any) -> int | None:
    """Return the heading level (1–6) of *paragraph*, or None if it is body text.

    Checks, in order:
    1. English Word style name "Heading N"
    2. French Word style name "Titre N"
    3. ``<w:outlineLvl>`` XML attribute (covers manual formatting that uses
       outline levels without applying a named heading style)

    Returns None for any paragraph that is not a structural heading.
    """
    style_name = str(getattr(getattr(paragraph, "style", None), "name", "") or "")

    m = _DOCX_HEADING_RE.match(style_name)
    if m:
        return int(m.group(1))

    m = _DOCX_TITRE_RE.match(style_name)
    if m:
        return int(m.group(1))

    # XML outline-level fallback (0 = top level in OOXML, maps to Heading 1)
    try:
        p_elem = getattr(paragraph, "_p", None)
        if p_elem is not None:
            pPr = p_elem.pPr
            if pPr is not None:
                outline = pPr.outlineLvl
                if outline is not None:
                    val = int(outline.val)
                    if 0 <= val <= 5:           # OOXML levels 0–5 → headings 1–6
                        return val + 1
    except Exception:
        pass  # XML inspection is best-effort; fall through to None

    return None


def _count_headings(paragraphs: Any) -> int:
    """Count heading paragraphs (any locale) with non-empty text."""
    return sum(
        1
        for p in paragraphs
        if _heading_level_of(p) is not None
        and str(getattr(p, "text", "")).strip()
    )


# ---------------------------------------------------------------------------
# Tree builder — single pass, O(n) in paragraph count
# ---------------------------------------------------------------------------

def _new_node_id() -> str:
    return str(uuid.uuid4())


def build_heading_tree(doc_paragraphs: Any) -> HeadingNode:
    """Walk *doc_paragraphs* once and return a ``HeadingNode`` tree.

    The synthetic root (level 0) collects any paragraphs that precede the
    first real heading.  Every non-heading paragraph is attached to the
    ``own_paragraphs`` of the *nearest enclosing heading* — never to the
    heading that comes next.

    Edge cases handled:
    - No headings → single root node; triggers semantic fallback in caller.
    - Skipped levels (H1 → H3) → stack pop handles silently.
    - Heading immediately followed by another heading → ``own_paragraphs``
      is legitimately empty.
    - Blank paragraphs → skipped; never emitted as items.
    - Non-paragraph content (tables etc.) → counted and logged at DEBUG.
    """
    root = HeadingNode(
        heading_text="__ROOT__",
        level=0,
        heading_path=[],
        own_paragraphs=[],
        children=[],
        node_id=_new_node_id(),
    )
    stack: list[HeadingNode] = [root]
    skipped_non_paragraph = 0

    for idx, para in enumerate(doc_paragraphs):
        # Guard: paragraph objects may not always have a .text attribute
        # (e.g. table rows passed through an iterator that includes them).
        raw_text = getattr(para, "text", None)
        if raw_text is None:
            skipped_non_paragraph += 1
            continue

        text = str(raw_text).strip()
        level = _heading_level_of(para)

        if level is not None:
            if not text:
                # Empty heading — skip; don't create a node for it
                continue

            # Pop until the parent level is strictly less than the new level.
            # This correctly handles skipped heading levels (H1 → H3).
            while stack[-1].level >= level:
                stack.pop()

            path = [n.heading_text for n in stack[1:]] + [text]  # exclude root
            node = HeadingNode(
                heading_text=text,
                level=level,
                heading_path=path,
                own_paragraphs=[],
                children=[],
                node_id=_new_node_id(),
            )
            stack[-1].children.append(node)
            stack.append(node)

        else:
            # Body paragraph — attach to the nearest enclosing heading.
            if text:
                style_name = str(
                    getattr(getattr(para, "style", None), "name", "") or ""
                )
                stack[-1].own_paragraphs.append(
                    ParagraphRef(text=text, doc_index=idx, style_name=style_name)
                )
            # else: blank paragraph — silently skip

    if skipped_non_paragraph:
        logger.debug(
            "build_heading_tree: skipped %d non-paragraph element(s) "
            "(tables, images, or embedded objects)",
            skipped_non_paragraph,
        )

    return root


# ---------------------------------------------------------------------------
# Tree → SpecChunk emitter (pre-order DFS)
# ---------------------------------------------------------------------------

def _walk_tree(
    node: HeadingNode,
    chunks: list[SpecChunk],
    max_chunk_chars: int,
) -> None:
    """Pre-order DFS: emit ``SpecChunk``s for *node*'s own paragraphs, then recurse."""
    if node.own_paragraphs:
        title = node.heading_text if node.level > 0 else "General"
        heading_path = list(node.heading_path)

        current: list[str] = []
        current_len = 0

        def flush() -> None:
            nonlocal current, current_len
            text = "\n".join(current).strip()
            if text:
                chunks.append(
                    SpecChunk(
                        id=f"CHUNK-{len(chunks) + 1:03d}",
                        title=title,
                        heading_path=heading_path,
                        text=text,
                    )
                )
            current, current_len = [], 0

        for pref in node.own_paragraphs:
            paragraph = pref.text.strip()
            if not paragraph:
                continue
            extra = len(paragraph) + (1 if current else 0)
            if current and current_len + extra > max_chunk_chars:
                flush()
            current.append(paragraph)
            current_len += extra

        flush()

    for child in node.children:
        _walk_tree(child, chunks, max_chunk_chars)


# ---------------------------------------------------------------------------
# Plain-text helpers (semantic fallback path — unchanged)
# ---------------------------------------------------------------------------

def normalize_spec_text(text: str) -> str:
    s = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def iter_paragraphs(text: str) -> Iterable[str]:
    normalized = normalize_spec_text(text)
    for para in normalized.split("\n\n"):
        p = para.strip()
        if p:
            yield p


def _fallback_heading(line: str) -> tuple[int, str] | None:
    """Return a best-effort ``(level, title)`` for unstyled/plain text.

    Markdown heading markers provide the most reliable hierarchy. Numbered
    headings are supported as a secondary convention, while numbered bold
    list entries with a description (``1. **Name**: details``) remain body
    content rather than becoming false section boundaries.
    """
    stripped = line.strip()
    if not stripped or len(stripped) > 120:
        return None

    markdown = _MARKDOWN_HEADING_RE.match(stripped)
    if markdown:
        return len(markdown.group(1)), markdown.group(2).strip().strip(":").strip()

    if re.fullmatch(r"[A-Z][A-Z0-9 _-]{5,}", stripped):
        return 1, stripped

    numbered = _NUMBERED_HEADING_RE.match(stripped)
    if numbered:
        title = numbered.group(2).strip()
        if "**" not in title and ": " not in title:
            return numbered.group(1).count(".") + 1, stripped.strip(":").strip()

    # A short label such as ``Requirement:`` is a useful fallback heading.
    # A full sentence ending in a colon usually introduces a list and must
    # remain body content.
    if stripped.endswith(":") and len(stripped[:-1].split()) <= 4:
        return 1, stripped[:-1].strip()

    return None


def split_by_headings(text: str, max_chunk_chars: int = 2200) -> list[dict[str, Any]]:
    """
    Split spec text into semantically meaningful chunks:
    - Detect headings
    - Group subsequent paragraphs under the last heading
    - Enforce a soft max size without brutal truncation
    """
    normalized = normalize_spec_text(text)
    lines = [ln.rstrip() for ln in normalized.split("\n")]

    chunks: list[dict[str, Any]] = []
    current_title = "General"
    current_heading_path: list[str] = []
    heading_stack: list[tuple[int, str]] = []
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_lines
        body = "\n".join([l for l in current_lines if l.strip()]).strip()
        if body:
            chunks.append({
                "title": current_title.strip() or "General",
                "heading_path": list(current_heading_path),
                "text": body,
            })
        current_lines = []

    for line in lines:
        heading = _fallback_heading(line)
        if heading is not None:
            flush()
            level, title = heading
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, title))
            current_heading_path = [heading_title for _, heading_title in heading_stack]
            current_title = title
            continue
        current_lines.append(line)

        if sum(len(l) + 1 for l in current_lines) >= max_chunk_chars:
            flush()
            current_title = current_title  # keep heading context

    flush()

    # Final pass: assign stable IDs
    for i, ch in enumerate(chunks, start=1):
        ch["id"] = f"CHUNK-{i:03d}"
    return chunks


def _chunks_from_paragraphs(
    sections: list[tuple[list[str], list[str]]], max_chunk_chars: int
) -> list[SpecChunk]:
    """Build bounded chunks from ``(heading_path, paragraph_lines)`` sections."""
    chunks: list[SpecChunk] = []
    for heading_path, paragraphs in sections:
        title = heading_path[-1] if heading_path else "General"
        current: list[str] = []
        current_len = 0

        def flush() -> None:
            nonlocal current, current_len
            text = "\n".join(current).strip()
            if text:
                chunks.append(
                    SpecChunk(
                        id=f"CHUNK-{len(chunks) + 1:03d}",
                        title=title,
                        heading_path=list(heading_path),
                        text=text,
                    )
                )
            current, current_len = [], 0

        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                continue
            extra = len(paragraph) + (1 if current else 0)
            if current and current_len + extra > max_chunk_chars:
                flush()
            current.append(paragraph)
            current_len += extra
        flush()
    return chunks


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def chunk_spec_recursive(doc_or_text: Any, max_chunk_chars: int = 2200) -> list[SpecChunk]:
    """Chunk a DOCX by native heading styles (English and French), preserving each
    heading path.  Paragraphs between a parent heading and its first child heading
    are attributed to the *parent* via ``HeadingNode.own_paragraphs``.

    Plain text (string input) or documents with fewer than two structural
    headings fall back to the regex-based ``split_by_headings()`` path.
    """
    if isinstance(doc_or_text, str):
        return [
            SpecChunk(
                id=str(chunk["id"]),
                title=str(chunk["title"]),
                heading_path=[str(value) for value in chunk.get("heading_path") or []],
                text=str(chunk["text"]),
            )
            for chunk in split_by_headings(doc_or_text, max_chunk_chars)
        ]

    if getattr(doc_or_text, "paragraphs", None) is None:
        raise TypeError("chunk_spec_recursive expects text or a python-docx Document")

    # ``Document.paragraphs`` omits tables. The shared iterator injects each
    # flattened logical table record at its true position in the document.
    paragraphs = list(iter_document_paragraphs(doc_or_text))

    # Use locale-aware count for the fallback threshold
    heading_count = _count_headings(paragraphs)
    if heading_count < 2:
        return chunk_spec_recursive(
            "\n\n".join(
                str(getattr(p, "text", "")).strip()
                for p in paragraphs
                if str(getattr(p, "text", "")).strip()
            ),
            max_chunk_chars,
        )

    # ── Tree-based path ────────────────────────────────────────────────────
    root = build_heading_tree(paragraphs)
    chunks: list[SpecChunk] = []
    _walk_tree(root, chunks, max_chunk_chars)
    return chunks


def detect_modules_from_chunks(chunks):
    return ["Core Functionality"]
