"""Tests for utils.chunker — recursive heading-aware chunking.

Fixtures use ``types.SimpleNamespace`` mocks so no real .docx file is needed.
The helper ``_para()`` optionally accepts a ``_p`` attribute to simulate the
XML outline-level fallback path.
"""

from types import SimpleNamespace

import pytest

from utils.chunker import (
    SpecChunk,
    build_heading_tree,
    chunk_spec_recursive,
)


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

def _para(text: str, style_name: str, outline_lvl: int | None = None) -> SimpleNamespace:
    """Create a mock paragraph.

    *outline_lvl* (0-based OOXML value) attaches a minimal ``_p.pPr.outlineLvl``
    so the XML fallback in ``_heading_level_of()`` can fire.
    """
    p_elem = None
    if outline_lvl is not None:
        outline_node = SimpleNamespace(val=outline_lvl)
        pPr = SimpleNamespace(outlineLvl=outline_node)
        p_elem = SimpleNamespace(pPr=pPr)
    else:
        # Provide a _p with pPr=None so the fallback code path can run safely
        p_elem = SimpleNamespace(pPr=None)

    return SimpleNamespace(
        text=text,
        style=SimpleNamespace(name=style_name),
        _p=p_elem,
    )


def _doc(paragraphs: list) -> SimpleNamespace:
    return SimpleNamespace(paragraphs=paragraphs)


# ---------------------------------------------------------------------------
# Existing tests (must remain unchanged and passing)
# ---------------------------------------------------------------------------

def test_recursive_docx_chunking_preserves_parent_heading_path() -> None:
    document = _doc([
        _para("Accounts", "Heading 1"),
        _para("Registration", "Heading 2"),
        _para("A visitor can create an account.", "Normal"),
        _para("Login", "Heading 2"),
        _para("A user can sign in.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)

    assert [chunk.heading_path for chunk in chunks] == [
        ["Accounts", "Registration"],
        ["Accounts", "Login"],
    ]
    assert [chunk.title for chunk in chunks] == ["Registration", "Login"]
    assert chunks[0].get("text") == "A visitor can create an account."


def test_recursive_docx_chunking_falls_back_when_heading_styles_are_absent() -> None:
    document = _doc([
        _para("Requirement:", "Normal"),
        _para("The system must retain audit records.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)

    assert len(chunks) == 1
    assert chunks[0].title == "Requirement"
    assert chunks[0].heading_path == ["Requirement"]


def test_unstyled_docx_markdown_headings_preserve_hierarchy() -> None:
    document = _doc([
        _para("# Product Specification", "Normal"),
        _para("Overview of the product.", "Normal"),
        _para("## 3. Requirements", "Normal"),
        _para("### 3.1 Data Export", "Normal"),
        _para("1. **JSON export**: The system must export data.", "Normal"),
        _para("2. **JSON import**: The system must import data.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)

    assert [chunk.heading_path for chunk in chunks] == [
        ["Product Specification"],
        ["Product Specification", "3. Requirements", "3.1 Data Export"],
    ]
    assert chunks[1].text.splitlines() == [
        "1. **JSON export**: The system must export data.",
        "2. **JSON import**: The system must import data.",
    ]


def test_fallback_keeps_sentence_that_introduces_a_list_as_body_text() -> None:
    document = _doc([
        _para("# Product Specification", "Normal"),
        _para("## Context", "Normal"),
        _para("This specification covers the following modules:", "Normal"),
        _para("1. **Export**: Export data.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)

    assert len(chunks) == 1
    assert chunks[0].heading_path == ["Product Specification", "Context"]
    assert chunks[0].text.splitlines() == [
        "This specification covers the following modules:",
        "1. **Export**: Export data.",
    ]


# ---------------------------------------------------------------------------
# New fixture 1: own_paragraphs attributed to parent, not child
# ---------------------------------------------------------------------------

def test_own_paragraphs_attached_to_parent_not_child() -> None:
    """Text between a parent heading and its first child must belong to the parent."""
    document = _doc([
        _para("Platform Overview", "Heading 1"),
        _para("This platform provides audio streaming services.", "Normal"),
        _para("Licensing constraints apply to all stored audio.", "Normal"),
        _para("Storage Module", "Heading 2"),
        _para("Audio files are stored in object storage.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)

    # Find chunks by heading path
    parent_chunks = [c for c in chunks if c.heading_path == ["Platform Overview"]]
    child_chunks = [c for c in chunks if c.heading_path == ["Platform Overview", "Storage Module"]]

    assert parent_chunks, "Expected chunk(s) attributed to 'Platform Overview'"
    assert child_chunks, "Expected chunk(s) attributed to 'Storage Module'"

    parent_text = " ".join(c.text for c in parent_chunks)
    assert "audio streaming" in parent_text.lower(), (
        "Intro text under Platform Overview must be attributed to the parent heading"
    )
    assert "object storage" not in parent_text.lower(), (
        "Child paragraph must not leak into the parent chunk"
    )

    child_text = " ".join(c.text for c in child_chunks)
    assert "object storage" in child_text.lower()
    assert "audio streaming" not in child_text.lower()


# ---------------------------------------------------------------------------
# New fixture 2: French "Titre N" style names are detected correctly
# ---------------------------------------------------------------------------

def test_french_titre_styles_detected() -> None:
    """French 'Titre 1' / 'Titre 2' heading styles must produce a proper tree."""
    document = _doc([
        _para("Présentation", "Titre 1"),
        _para("Contexte général de la plateforme.", "Normal"),
        _para("Utilisateurs", "Titre 2"),
        _para("Utilisateur Free : accès limité.", "Normal"),
        _para("Utilisateur Premium : accès complet.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)

    paths = [c.heading_path for c in chunks]

    # Intro text under "Présentation" belongs to that heading
    assert ["Présentation"] in paths, f"Expected ['Présentation'] in {paths}"
    # Actor text under "Utilisateurs" belongs to that heading
    assert ["Présentation", "Utilisateurs"] in paths, (
        f"Expected ['Présentation', 'Utilisateurs'] in {paths}"
    )

    # The intro text must appear under the parent, not the child
    parent_chunks = [c for c in chunks if c.heading_path == ["Présentation"]]
    parent_text = " ".join(c.text for c in parent_chunks)
    assert "contexte" in parent_text.lower()


# ---------------------------------------------------------------------------
# New fixture 3: skipped heading levels (H1 → H3, no H2)
# ---------------------------------------------------------------------------

def test_skipped_heading_levels() -> None:
    """H1 immediately followed by H3 (no H2) must not raise and must parent correctly."""
    document = _doc([
        _para("Top Section", "Heading 1"),
        _para("General intro.", "Normal"),
        _para("Deep Sub-section", "Heading 3"),
        _para("Nested content here.", "Normal"),
    ])

    # Must not raise
    chunks = chunk_spec_recursive(document)

    paths = [c.heading_path for c in chunks]
    # H3 should be parented under H1 (H2 is absent)
    assert ["Top Section", "Deep Sub-section"] in paths, (
        f"H3 should be a direct child of H1 when H2 is absent; paths={paths}"
    )
    assert ["Top Section"] in paths


# ---------------------------------------------------------------------------
# New fixture 4: no headings → semantic fallback, heading_path == []
# ---------------------------------------------------------------------------

def test_no_headings_fallback() -> None:
    """A document with no heading styles must fall through to the regex fallback."""
    document = _doc([
        _para("The system shall support user registration.", "Normal"),
        _para("The system shall allow password recovery.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)

    assert len(chunks) >= 1
    for chunk in chunks:
        assert chunk.heading_path == [], (
            f"Regex-fallback chunks must have empty heading_path, got {chunk.heading_path}"
        )


# ---------------------------------------------------------------------------
# New fixture 5: heading immediately followed by another heading (no intro text)
# ---------------------------------------------------------------------------

def test_heading_with_no_intro_text() -> None:
    """A heading directly followed by a child heading must produce no parent chunk."""
    document = _doc([
        _para("Authentication", "Heading 1"),
        _para("Login", "Heading 2"),
        _para("Users can sign in with email and password.", "Normal"),
        _para("Registration", "Heading 2"),
        _para("Users can create a new account.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)
    paths = [c.heading_path for c in chunks]

    # There must be no chunk with path ["Authentication"] — no intro text was present
    assert ["Authentication"] not in paths, (
        "Empty own_paragraphs must not produce a chunk"
    )
    assert ["Authentication", "Login"] in paths
    assert ["Authentication", "Registration"] in paths


# ---------------------------------------------------------------------------
# New fixture 6: blank paragraphs are silently skipped, not itemized
# ---------------------------------------------------------------------------

def test_blank_paragraphs_not_itemized() -> None:
    """Blank (whitespace-only) paragraphs must never appear as chunks."""
    document = _doc([
        _para("Features", "Heading 1"),
        _para("", "Normal"),          # blank — must be skipped
        _para("   ", "Normal"),       # whitespace — must be skipped
        _para("Payments", "Heading 2"),
        _para("The system processes payments.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)

    for chunk in chunks:
        assert chunk.text.strip(), "A chunk must never have empty/blank text"

    # "Features" heading had no real content, so no chunk for it
    feature_only_chunks = [c for c in chunks if c.heading_path == ["Features"]]
    assert not feature_only_chunks, (
        "Blank paragraphs under 'Features' must not produce a chunk"
    )


# ---------------------------------------------------------------------------
# New fixture 7: XML outline-level fallback (manual formatting, no style name)
# ---------------------------------------------------------------------------

def test_xml_outline_level_fallback() -> None:
    """Paragraphs styled via outline level (not named heading styles) must be detected."""
    document = _doc([
        _para("Manual Heading", "Normal", outline_lvl=0),   # outline 0 → Heading 1
        _para("Body content under manual heading.", "Normal"),
        _para("Sub Heading", "Normal", outline_lvl=1),      # outline 1 → Heading 2
        _para("Sub content.", "Normal"),
    ])

    chunks = chunk_spec_recursive(document)

    paths = [c.heading_path for c in chunks]
    assert ["Manual Heading"] in paths or ["Manual Heading", "Sub Heading"] in paths, (
        f"XML outline fallback must produce heading nodes; paths={paths}"
    )
