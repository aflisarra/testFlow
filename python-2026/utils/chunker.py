from __future__ import annotations

import re
from typing import Iterable, List, Dict


_HEADING_RE = re.compile(
    r"^\s*(?:#{1,6}\s+.+|[A-Z][A-Z0-9 _-]{5,}|(?:\d+\.)+\s+\S.+|.+:\s*)\s*$"
)


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


def split_by_headings(text: str, max_chunk_chars: int = 2200) -> List[Dict[str, str]]:
    """
    Split spec text into semantically meaningful chunks:
    - Detect headings
    - Group subsequent paragraphs under the last heading
    - Enforce a soft max size without brutal truncation
    """
    normalized = normalize_spec_text(text)
    lines = [ln.rstrip() for ln in normalized.split("\n")]

    chunks: List[Dict[str, str]] = []
    current_title = "General"
    current_lines: List[str] = []

    def flush() -> None:
        nonlocal current_lines
        body = "\n".join([l for l in current_lines if l.strip()]).strip()
        if body:
            chunks.append({"title": current_title.strip() or "General", "text": body})
        current_lines = []

    for line in lines:
        if _HEADING_RE.match(line) and len(line.strip()) <= 120:
            flush()
            current_title = line.strip().strip("#").strip(":").strip()
            continue
        current_lines.append(line)

        if sum(len(l) + 1 for l in current_lines) >= max_chunk_chars:
            flush()
            current_title = current_title  # keep heading context

    flush()

    # Final pass: ensure no empty titles
    for i, ch in enumerate(chunks, start=1):
        ch["id"] = f"CHUNK-{i:03d}"
    return chunks


def detect_modules_from_chunks(chunks):
    return ["Core Functionality"]

