from __future__ import annotations

import re
from typing import Dict, List

from utils.chunker import split_by_headings, detect_modules_from_chunks, normalize_spec_text
from utils.docx_reader import extract_text_from_docx


def extract_spec_text_from_docx_bytes(file_bytes: bytes) -> str:
    return extract_text_from_docx(file_bytes)


def chunk_spec(spec_text: str) -> List[Dict[str, str]]:
    return split_by_headings(spec_text)


def detect_modules(spec_text: str) -> List[str]:
    chunks = chunk_spec(spec_text)
    return detect_modules_from_chunks(chunks)


def classify_priority(text: str) -> str:
    """
    Heuristic priority classification based on requirement text signals.
    """
    t = (text or "").lower()
    high_signals = ("must", "required", "shall", "critical", "security", "payment", "billing", "auth", "permission")
    low_signals = ("nice to have", "optional", "may", "could")
    if any(s in t for s in high_signals):
        return "High"
    if any(s in t for s in low_signals):
        return "Low"
    if "should" in t:
        return "Medium"
    return "Medium"


def _guess_module(text: str, modules: List[str]) -> str:
    t = (text or "").lower()
    for m in modules:
        if m.lower() in t:
            return m
    # keyword mapping
    if any(k in t for k in ("login", "logout", "password", "jwt", "session", "role", "permission")):
        return "Authentication"
    if any(k in t for k in ("search", "filter", "sort", "pagination")):
        return "Search & Filtering"
    if any(k in t for k in ("create", "update", "delete", "edit", "save")):
        return "CRUD Operations"
    if any(k in t for k in ("export", "report", "dashboard")):
        return "Reporting"
    if any(k in t for k in ("performance", "latency", "timeout", "load")):
        return "Performance"
    if any(k in t for k in ("accessibility", "keyboard", "aria", "contrast")):
        return "Accessibility"
    return modules[0] if modules else "Core Functionality"


def extract_requirements(spec_text: str) -> List[Dict[str, str]]:
    """
    Extract requirements as small, atomic statements while preserving semantic context.

    Output format (required):
    [
      {"id":"REQ-001","module":"Authentication","text":"...","priority":"High"}
    ]
    """
    normalized = normalize_spec_text(spec_text)
    # Clean noisy DOCX XML leftovers that can leak into extracted requirements.
    normalized = re.sub(r"<\/?w:[^>]+>", " ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<\/?[^>]+>", " ", normalized)
    modules = detect_modules(spec_text)

    lines = [ln.strip() for ln in normalized.split("\n") if ln.strip()]

    reqs: List[str] = []

    # bullets / numbered items
    bullet_re = re.compile(r"^(\-|\*|•|\d+[\.\)])\s+(.*)$")
    for ln in lines:
        m = bullet_re.match(ln)
        if m:
            item = m.group(2).strip()
            if len(item) >= 8:
                reqs.append(item)

    # modal verbs / requirement-like sentences
    sentence_candidates = re.split(r"(?<=[\.\!\?])\s+", normalized)
    modal_re = re.compile(r"\b(must|required|shall|should|may|can)\b", re.IGNORECASE)
    for s in sentence_candidates:
        st = s.strip()
        if len(st) < 20 or len(st) > 260:
            continue
        if modal_re.search(st):
            reqs.append(st)

    # user stories
    for s in sentence_candidates:
        st = s.strip()
        if re.match(r"^(as a|as an)\s+", st, re.IGNORECASE):
            reqs.append(st)

    # de-duplicate while preserving order
    seen: set[str] = set()
    uniq: List[str] = []
    for r in reqs:
        key = re.sub(r"\s+", " ", r).strip().lower()
        if key and key not in seen:
            seen.add(key)
            uniq.append(r.strip())

    out: List[Dict[str, str]] = []
    for i, text in enumerate(uniq, start=1):
        cleaned_text = re.sub(r"<\/?w:[^>]+>", " ", text, flags=re.IGNORECASE)
        cleaned_text = re.sub(r"<\/?[^>]+>", " ", cleaned_text)
        cleaned_text = re.sub(r"\s+", " ", cleaned_text).strip()
        module = _guess_module(text, modules)
        out.append(
            {
                "id": f"REQ-{i:03d}",
                "module": module,
                "text": cleaned_text,
                "priority": classify_priority(text),
            }
        )
    return out
