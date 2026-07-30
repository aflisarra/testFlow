"""Nearest-heading role priors used after lexical matching."""

from __future__ import annotations

import unicodedata


HEADING_KEYWORDS: dict[str, list[str]] = {
    "ACTOR": ["utilisateur", "utilisateurs", "acteur", "acteurs", "persona", "stakeholder"],
    "GLOSSARY": ["glossaire", "definition", "definitions", "terminologie", "glossary"],
    "CONTEXT": ["contexte", "presentation", "apercu", "overview"],
}


def match_heading(nearest_heading_text: str) -> str | None:
    """Return a role inferred from the nearest heading only.

    ``nearest_heading_text`` is the final element of ``Item.heading_path``;
    ancestors are deliberately ignored to avoid a broad parent overriding a
    specific nested section.
    """
    heading = (nearest_heading_text or "").casefold()
    if not heading:
        return None

    # Normalize accents only; this remains a deterministic keyword check, not
    # fuzzy matching.
    normalized = "".join(
        char for char in unicodedata.normalize("NFKD", heading)
        if not unicodedata.combining(char)
    )
    for role, keywords in HEADING_KEYWORDS.items():
        if any(keyword in normalized for keyword in keywords):
            return role
    return None
