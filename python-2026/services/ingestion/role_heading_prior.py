"""Nearest-heading role priors used after lexical matching.

All keywords must be accent-stripped (NFKD-normalised) strings — the
``match_heading`` function normalises the heading text before comparison,
so accented forms (é → e, è → e, etc.) are covered automatically.
"""

from __future__ import annotations

import unicodedata

# 2026-08-07 — Phase 7 tuning: expanded from 3 roles to 8.  Each list
# covers common section-title variants found in real SRS/SDD documents
# (English + French).  New entries are promoted from human-resolved items
# that the regex tier consistently missed.
HEADING_KEYWORDS: dict[str, list[str]] = {
    "ACTOR": [
        "utilisateur", "utilisateurs", "acteur", "acteurs",
        "persona", "stakeholder",
    ],
    "GLOSSARY": [
        "glossaire", "definition", "definitions",
        "terminologie", "glossary",
    ],
    "CONTEXT": [
        "contexte", "presentation", "apercu", "overview",
        "introduction", "objectif", "objectifs", "perimetre",
        "scope", "vision", "cadre", "background",
    ],
    "REQUIREMENT": [
        "exigence", "exigences", "requirement", "requirements",
        "besoin", "besoins", "specification", "specifications",
    ],
    "FEATURE": [
        "fonctionnalite", "fonctionnalites", "feature", "features",
        "fonction", "fonctions",
    ],
    "ACCEPTANCE": [
        # "cas d'utilisation" — apostrophe variant handled by partial match
        # on "utilisation" (avoids Unicode apostrophe normalisation issues).
        "utilisation", "use case", "use cases",
        "scenario", "scenarios",
        "critere", "acceptance", "bdd",
    ],
    "NON_FUNCTIONAL": [
        "contrainte", "contraintes",
        "non fonctionnel", "non-fonctionnel",
        "performance", "securite", "qualite",
        "accessibilite", "disponibilite", "fiabilite", "nfr",
    ],
    "OUT_OF_SCOPE": [
        "hors perimetre", "hors-perimetre",
        "exclusion", "exclusions",
        "out of scope", "non couvert",
    ],
}


def match_heading(heading: str) -> str | None:
    """Return a role inferred from the nearest heading whose text matches a keyword.

    """
    heading = (heading or "").casefold()
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
