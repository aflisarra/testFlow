"""Deterministic, lexical-first role rules for Phase 3 ingestion.

The patterns intentionally prefer specific structural evidence over broad topic
keywords.  In particular, NON_FUNCTIONAL requires an explicit constraint or
quality attribute; a bare number/unit is not sufficient.
"""

from __future__ import annotations

import re


ROLE_REGEX_RULES: list[tuple[str, re.Pattern[str]]] = [
    # Scenario and BDD syntax are structurally acceptance material.
    (
        "ACCEPTANCE",
        re.compile(
            r"^\s*(?:UC-\d+|CA-\d+|sc(?:\u00e9|e)nario\b|post-condition\b|"
            r"given\b|when\b|then\b|(?:\u00e9|e)tant\s+donn(?:\u00e9|e))",
            re.IGNORECASE,
        ),
    ),
    # Keep exclusion language ahead of generic requirement modals.
    (
        "OUT_OF_SCOPE",
        re.compile(
            r"\b(?:hors[-\s]p(?:\u00e9|e)rim(?:\u00e8|e)tre|out\s+of\s+scope|"
            r"non\s+couver[ts]|explicitement\s+exclu[es]?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "REQUIREMENT",
        re.compile(r"\b(?:shall|must|doit|devra)\b", re.IGNORECASE),
    ),
    # Actor labels are table/list entries, not every mention of a user.
    (
        "ACTOR",
        re.compile(
            r"^\s*(?:utilisateur|administrateur|(?:\u00e9|e)quipe|visiteur|"
            r"artiste(?:\s*/\s*label)?|support\s+client)\b[^\n:]{0,80}:"
            r"\s*\S+",
            re.IGNORECASE,
        ),
    ),
    # A short term followed by a definition; actor rows are handled first.
    (
        "GLOSSARY",
        re.compile(r"^\s*[^\n:]{2,60}:\s+\S+", re.IGNORECASE),
    ),
    # Tightened: quality/constraint signals plus an explicit limit, or a
    # recognised non-functional standard/security property. Do not match a
    # requirement simply because it contains a duration or a number.
    (
        "NON_FUNCTIONAL",
        re.compile(
            r"(?:\b(?:temps|latence|d(?:\u00e9|e)lai|disponibilit(?:\u00e9|e)|performance|"
            r"capacit(?:\u00e9|e)|contraste)\b[^\n]{0,70}"
            r"(?:<=|>=|<|>|=|\b(?:moins|plus|maximum|minimum)\b)\s*\d)"
            r"|(?:\b(?:SLA|WCAG|TLS\s*1\.\d|bcrypt|chiffr(?:\u00e9|e)e?s?|"
            r"hash(?:\u00e9|e)s?|scaling\s+horizontal|failover)\b)",
            re.IGNORECASE,
        ),
    ),
]


def match_regex(text: str) -> str | None:
    """Return the first deterministic role match, if any."""
    for role, pattern in ROLE_REGEX_RULES:
        if pattern.search(text or ""):
            return role
    return None
