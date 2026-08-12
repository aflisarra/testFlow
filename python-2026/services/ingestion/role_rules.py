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
        # 2026-08-07 — extended: devront, French obligation forms, English
        # soft-but-clear modals ("will support", "il faut que", "est requis").
        # Deliberately excludes bare "should" (too broad).
        re.compile(
            r"\b(?:shall|must|doit|devra|devront|"
            r"will\s+(?:be|support|allow|provide|enable)|"
            r"(?:il\s+)?faut\s+que|est\s+(?:requis|obligatoire))\b",
            re.IGNORECASE,
        ),
    ),
    # Actor labels are table/list entries, not every mention of a user.
    (
        "ACTOR",
        re.compile(
            r"^\s*(?:(?:actor|acteur|r[o\u00f4]le)\s*:\s*\S+|"
            r"(?:utilisateur|administrateur|(?:\u00e9|e)quipe|visiteur|"
            r"artiste(?:\s*/\s*label)?|support\s+client)\b[^\n:]{0,80}:"
            r"\s*\S+)",
            re.IGNORECASE,
        ),
    ),
    # Feature / capability verbs — softer than shall/must but structurally
    # describing what the system does.  Placed after REQUIREMENT so items
    # carrying both a modal AND a capability verb resolve to REQUIREMENT first.
    # 2026-08-07 — added: no FEATURE coverage existed before this change.
    (
        "FEATURE",
        re.compile(
            r"\b(?:permet(?:tre)?(?:\s+(?:\u00e0|de|aux))?|"
            r"offre(?:r)?|affiche(?:r)?|g(?:\u00e8|e)re(?:r)?|"
            r"the\s+system\s+(?:shall\s+)?(?:provide|support|allow|enable)|"
            r"en\s+tant\s+qu[e\u2019]|as\s+a\s+user)\b",
            re.IGNORECASE,
        ),
    ),
    # A short term followed by a definition; actor and feature rows handled first.
    # 2026-08-07 — tightened: was r"^\s*[^\n:]{2,60}:\s+\S+" which matched any
    # colon-separated line (config key-value pairs, module descriptions, etc.).
    # Now requires the definition part to be substantive (≥5 chars after colon).
    (
        "GLOSSARY",
        re.compile(
            r"^\s*(?:[A-Z\u00c0-\u017ea-z\u00e0-\u017e][A-Z\u00c0-\u017ea-z\u00e0-\u017e\s\-]{1,50})"
            r"(?:\s*\([^)]{0,30}\))?"
            r":\s+(?:[A-Z\u00c0-\u017ea-z\u00e0-\u017e\d].{4,})",
            re.IGNORECASE,
        ),
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
