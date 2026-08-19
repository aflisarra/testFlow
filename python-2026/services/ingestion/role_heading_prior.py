"""Nearest-heading role priors used after lexical matching.

Headings and keywords are accent- and punctuation-normalised before matching.
Matches use complete words rather than raw substrings, and the most specific
matching phrase wins.  This keeps, for example, ``Non-functional requirements``
from being reduced to the generic ``REQUIREMENT`` role.
"""

from __future__ import annotations

import re
import unicodedata

# 2026-08-07 — Phase 7 tuning: expanded from 3 roles to 8.  Each list
# covers common section-title variants found in real SRS/SDD documents
# (English + French).  New entries are promoted from human-resolved items
# that the regex tier consistently missed.
HEADING_KEYWORDS: dict[str, list[str]] = {
    "ACTOR": [
        "utilisateur", "utilisateurs", "acteur", "acteurs",
        "persona", "personas", "stakeholder", "stakeholders",
        "partie prenante", "parties prenantes",
        "profil utilisateur", "profils utilisateurs",
        "type d utilisateur", "types d utilisateurs",
        "user profile", "user profiles", "user type", "user types",
        "user role", "user roles", "roles and responsibilities",
        "roles et responsabilites", "roles et permissions",
        "intervenant", "intervenants", "audience cible", "target audience",
    ],
    "GLOSSARY": [
        "glossaire", "definition", "definitions",
        "terminologie", "glossary", "vocabulaire", "nomenclature",
        "termes et definitions", "terms and definitions",
        "acronyme", "acronymes", "abbreviation", "abbreviations",
        "abreviation", "abreviations", "sigle", "sigles",
    ],
    "CONTEXT": [
        "contexte", "presentation", "apercu", "overview",
        "introduction", "objectif", "objectifs", "perimetre",
        "scope", "vision", "cadre", "background", "purpose", "finalite",
        "vue d ensemble", "description generale", "general description",
        "product overview", "document purpose", "project background",
        "hypothese", "hypotheses", "assumption", "assumptions",
        "dependance", "dependances", "dependency", "dependencies",
    ],
    "REQUIREMENT": [
        "exigence", "exigences", "requirement", "requirements",
        "besoin", "besoins", "specification", "specifications",
        "exigence fonctionnelle", "exigences fonctionnelles",
        "functional requirement", "functional requirements",
        "exigence metier", "exigences metier",
        "business requirement", "business requirements",
        "exigence systeme", "exigences systeme",
        "system requirement", "system requirements",
        "exigence utilisateur", "exigences utilisateurs",
        "user requirement", "user requirements",
        "besoin metier", "besoins metier",
        "besoin utilisateur", "besoins utilisateurs",
        "regle metier", "regles metier", "business rule", "business rules",
    ],
    "FEATURE": [
        "fonctionnalite", "fonctionnalites", "feature", "features",
        "fonction", "fonctions", "capability", "capabilities",
        "capacite fonctionnelle", "capacites fonctionnelles",
        "fonctionnalite principale", "fonctionnalites principales",
        "key feature", "key features", "product feature", "product features",
        "system capability", "system capabilities",
        "user story", "user stories", "recit utilisateur",
        "recits utilisateurs", "epic", "epics",
    ],
    "ACCEPTANCE": [
        "cas d utilisation", "cas d usage",
        "use case", "use cases", "scenario", "scenarios",
        "scenario de test", "scenarios de test", "test scenario",
        "test scenarios", "critere d acceptation",
        "criteres d acceptation", "acceptance criterion",
        "acceptance criteria", "conditions d acceptation",
        "success criteria", "pass criteria", "fail criteria",
        "resultat attendu", "resultats attendus", "expected result",
        "expected results", "precondition", "preconditions",
        "postcondition", "postconditions", "condition prealable",
        "conditions prealables", "regle de validation",
        "regles de validation", "validation rule", "validation rules",
        "bdd",
    ],
    "NON_FUNCTIONAL": [
        "contrainte", "contraintes",
        "non fonctionnel", "non-fonctionnel",
        "exigence non fonctionnelle", "exigences non fonctionnelles",
        "non functional requirement", "non functional requirements",
        "quality attribute", "quality attributes", "attribut de qualite",
        "attributs de qualite", "operational requirement",
        "operational requirements", "exigence operationnelle",
        "exigences operationnelles", "security requirement",
        "security requirements", "exigence de securite",
        "exigences de securite", "performance requirement",
        "performance requirements", "exigence de performance",
        "exigences de performance",
        "performance", "securite", "qualite",
        "accessibilite", "disponibilite", "fiabilite", "nfr",
        "confidentialite", "confidentiality", "integrite", "integrity",
        "vie privee", "privacy", "protection des donnees", "data protection",
        "scalabilite", "scalability", "passage a l echelle",
        "maintenabilite", "maintainability", "utilisabilite", "usability",
        "ergonomie", "compatibilite", "compatibility",
        "interoperabilite", "interoperability", "portabilite", "portability",
        "conformite", "compliance", "resilience", "robustesse",
        "supervision", "monitoring", "journalisation", "logging",
    ],
    "OUT_OF_SCOPE": [
        "hors perimetre", "hors-perimetre",
        "exclusion", "exclusions",
        "out of scope", "scope exclusion", "scope exclusions",
        "non couvert", "non couverts", "not covered",
        "non inclus", "non incluse", "non incluses", "not included",
        "excluded", "limitation", "limitations",
    ],
}


def _normalize(value: str) -> str:
    """Return a lowercase ASCII-ish phrase with separators collapsed."""
    decomposed = unicodedata.normalize("NFKD", (value or "").casefold())
    accentless = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", accentless).strip()


_NORMALIZED_KEYWORDS = tuple(
    (
        role,
        normalized_keyword,
        (len(normalized_keyword.split()), len(normalized_keyword)),
    )
    for role, keywords in HEADING_KEYWORDS.items()
    for keyword in keywords
    if (normalized_keyword := _normalize(keyword))
)


def match_heading(heading: str) -> str | None:
    """Return the role associated with the most specific heading phrase."""
    normalized = _normalize(heading)
    if not normalized:
        return None

    padded_heading = f" {normalized} "
    best_role: str | None = None
    best_specificity = (0, 0)

    for role, normalized_keyword, specificity in _NORMALIZED_KEYWORDS:
        if f" {normalized_keyword} " not in padded_heading:
            continue

        # Prefer multi-word and then longer phrases over generic tokens.
        # Dict/list order remains the deterministic tie-breaker.
        if specificity > best_specificity:
            best_role = role
            best_specificity = specificity

    return best_role
