from __future__ import annotations

import re
from typing import Dict, List

from utils.chunker import split_by_headings, detect_modules_from_chunks, normalize_spec_text
from utils.docx_reader import extract_text_from_docx


SRS_PLAN_SECTIONS = {"project description", "objectives", "features", "ui components", "business rules", "validation rules", "pass criteria"}
SRS_CASE_SECTIONS = {
    "ui components",
    "ui component",
    "user interface",
    "interface utilisateur",
    "composants ui",
    "composant ui",
    "composants interface",
    "ecrans",
    "screens",
    "features",
    "feature",
    "forms",
    "formulaires",
    "page",
    "pages",
    "login",
    "connexion",
    "authentication",
    "authentification",
    "business rules",
    "business rule",
    "regles metier",
    "regle metier",
    "validation rules",
    "validation rule",
    "regles de validation",
    "regle de validation",
    "pass criteria",
    "success criteria",
    "criteres de succes",
    "critere de succes",
    "fail criteria",
    "failure criteria",
    "criteres d echec",
    "critere d echec",
}


def extract_spec_text_from_docx_bytes(file_bytes: bytes) -> str:
    return extract_text_from_docx(file_bytes)


def chunk_spec(spec_text: str) -> List[Dict[str, str]]:
    return split_by_headings(spec_text)


def detect_modules(spec_text: str) -> List[str]:
    chunks = chunk_spec(spec_text)
    return detect_modules_from_chunks(chunks)


def classify_priority(text: str) -> str:
    return "Medium"


def _section_key(title: str) -> str:
    title = re.sub(r"^\s*(?:\d+\.)+\s*", "", title or "")
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def _section_matches(title: str, allowed_sections: set[str]) -> bool:
    key = _section_key(title)
    if key in allowed_sections:
        return True
    return any(section in key or key in section for section in allowed_sections)


def get_srs_sections(spec_text: str, allowed_sections: set[str] | None = None) -> List[Dict[str, str]]:
    chunks = chunk_spec(spec_text)
    if not allowed_sections:
        return chunks
    selected: List[Dict[str, str]] = []
    active_parent_prefix = ""
    for chunk in chunks:
        title = str(chunk.get("title") or "")
        title_prefix_match = re.match(r"^\s*((?:\d+\.)*\d+)", title)
        title_prefix = title_prefix_match.group(1) if title_prefix_match else ""
        if _section_matches(title, allowed_sections):
            selected.append(chunk)
            active_parent_prefix = title_prefix
            continue
        if active_parent_prefix and title_prefix.startswith(f"{active_parent_prefix}."):
            selected.append(chunk)
            continue
        if title_prefix and active_parent_prefix and not title_prefix.startswith(f"{active_parent_prefix}."):
            active_parent_prefix = ""
    return selected


def extract_requirements(spec_text: str) -> List[Dict[str, str]]:
    """
    Extract requirements as small, atomic statements while preserving semantic context.

    Output format (required):
    [
      {"id":"REQ-001","module":"SRS Requirement","text":"...","priority":"Medium"}
    ]
    """
    source_chunks = get_srs_sections(spec_text, SRS_PLAN_SECTIONS)
    if not source_chunks:
        source_chunks = chunk_spec(spec_text)
    source_text = "\n\n".join(f"# {chunk.get('title')}\n{chunk.get('text')}" for chunk in source_chunks)
    normalized = normalize_spec_text(source_text)
    normalized = re.sub(r"<\/?w:[^>]+>", " ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"<\/?[^>]+>", " ", normalized)
    content_for_sentences = re.sub(r"(?m)^#{1,3}\s+[^\n]*(?:\n|$)", "", normalized)

    lines = [ln.strip() for ln in normalized.split("\n") if ln.strip()]

    reqs: List[str] = []

    modal_re = re.compile(r"\b(must|required|shall|should|may|can)\b", re.IGNORECASE)

    # Bullets / numbered items.
    bullet_re = re.compile(r"^(\-|\*|•|\d+[\.\)])\s+(.*)$")
    for ln in lines:
        m = bullet_re.match(ln)
        if m:
            item = m.group(2).strip()
            if len(item) >= 8:
                reqs.append(item)

    # DOCX sections often contain functional requirements as plain paragraphs
    # below a heading, without bullets or modal verbs. Keep those statements
    # as requirements instead of losing the whole section.
    for ln in lines:
        if re.match(r"^#{1,3}\s+", ln):
            continue
        if bullet_re.match(ln) or len(ln) < 20 or len(ln) > 260:
            continue
        # Modal-verb sentences are already collected above; avoid adding the
        # heading-prefixed version a second time.
        if modal_re.search(ln):
            continue
        reqs.append(ln)

    # modal verbs / requirement-like sentences
    sentence_candidates = re.split(r"(?<=[\.\!\?])\s+", content_for_sentences)
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
        out.append(
            {
                "id": f"REQ-{i:03d}",
                "module": "SRS Requirement",
                "text": cleaned_text,
                "priority": classify_priority(text),
            }
        )
    return out
