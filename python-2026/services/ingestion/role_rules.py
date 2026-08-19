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
            r"^\s*(?:UC-\d+|CA-\d+|sc(?:\u00e9|e)nario\b|"
            r"(?:pre|post)[-\s]?condition\b|pr(?:\u00e9|e)condition\b|"
            r"condition\s+pr(?:\u00e9|e)alable\b|given\b|when\b|then\b|"
            r"(?:\u00e9|e)tant\s+donn(?:\u00e9|e)|"
            r"(?:acceptance\s+criteri(?:on|a)|crit(?:\u00e8|e)res?\s+d(?:['\u2019]|\s+)acceptation|"
            r"expected\s+results?|r(?:\u00e9|e)sultats?\s+attendus?)\s*:)",
            re.IGNORECASE,
        ),
    ),
    # Keep exclusion language ahead of generic requirement modals.
    (
        "OUT_OF_SCOPE",
        re.compile(
            r"\b(?:hors[-\s]p(?:\u00e9|e)rim(?:\u00e8|e)tre|out\s+of\s+scope|"
            r"non\s+couver(?:t|te|ts|tes)|not\s+covered|not\s+included|"
            r"explicitement\s+exclu(?:e|es|s)?|explicitly\s+excluded)\b",
            re.IGNORECASE,
        ),
    ),
    # Keep explicit quality labels and constraints ahead of generic obligation
    # modals ("must", "doit", etc.) and ``Term: definition`` glossary rows.
    (
        "NON_FUNCTIONAL",
        re.compile(
            r"^\s*(?:NFR(?:-\d+)?|non[-\s]fonctionnel(?:le|les)?|"
            r"non[-\s]functional(?:\s+requirements?)?|quality\s+attribute|"
            r"attribut\s+de\s+qualit(?:\u00e9|e)|performance|security|"
            r"s(?:\u00e9|e)curit(?:\u00e9|e)|availability|disponibilit(?:\u00e9|e)|"
            r"accessibility|accessibilit(?:\u00e9|e)|reliability|"
            r"fiabilit(?:\u00e9|e))\s*:|"
            r"(?:\b(?:temps(?:\s+de\s+r(?:\u00e9|e)ponse)?|latence|"
            r"d(?:\u00e9|e)lai|disponibilit(?:\u00e9|e)|availability|uptime|"
            r"performance|d(?:\u00e9|e)bit|throughput|capacit(?:\u00e9|e)|"
            r"capacity|contraste)\b[^\n]{0,70}"
            r"(?:<=|>=|<|>|=|\b(?:moins\s+de|plus\s+de|au\s+moins|au\s+plus|"
            r"maximum(?:\s+de)?|minimum(?:\s+de)?|within|under|over|"
            r"at\s+least|at\s+most|no\s+more\s+than)\b)\s*\d)|"
            r"(?:\b(?:SLA|WCAG|TLS\s*1\.\d|AES(?:-\d+)?|ISO\s*27001|"
            r"SOC\s*2|PCI[-\s]DSS|RGPD|GDPR|bcrypt|chiffr(?:\u00e9|e)e?s?|"
            r"hash(?:\u00e9|e)s?|scaling\s+horizontal|failover)\b)",
            re.IGNORECASE,
        ),
    ),
    (
        "REQUIREMENT",
        # 2026-08-07 — extended: devront, French obligation forms, English
        # soft-but-clear modals ("will support", "il faut que", "est requis").
        # Deliberately excludes bare "should" (too broad).
        re.compile(
            r"^\s*(?:REQ-\d+\b|(?:requirement|exigence|business\s+rule|"
            r"r(?:\u00e8|e)gle\s+m(?:\u00e9|e)tier)\s*:)|"
            r"\b(?:shall|must|doit|doivent|devra|devront|"
            r"will\s+(?:be|support|allow|provide|enable)|"
            r"(?:il\s+)?faut(?:\s+que)?|"
            r"(?:est|sont)\s+(?:requis(?:e|es)?|obligatoires?)|"
            r"(?:est|sont)\s+tenu(?:e|s|es)?\s+de|"
            r"(?:is|are)\s+required\s+to|needs?\s+to)\b",
            re.IGNORECASE,
        ),
    ),
    # Actor labels are table/list entries, not every mention of a user.
    (
        "ACTOR",
        re.compile(
            r"^\s*(?:(?:actor|acteur|r[o\u00f4]le|persona|stakeholder|"
            r"user\s+role|partie\s+prenante|profil\s+utilisateur)\s*:\s*\S+|"
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
            r"^\s*(?:(?:features?|fonctionnalit(?:\u00e9|e)s?|capabilit(?:y|ies)|"
            r"capacit(?:\u00e9|e)\s+fonctionnelle)\s*:)|"
            r"\b(?:permet(?:tre)?(?:\s+(?:\u00e0|a|de|aux))?|"
            r"offre(?:r)?|affiche(?:r)?|g(?:\u00e8|e)re(?:r)?|"
            r"the\s+system\s+(?:shall\s+)?(?:provide|support|allow|enable)|"
            r"(?:le|la|les|l['\u2019])\s*(?:syst(?:\u00e8|e)me|application|"
            r"plateforme|service|utilisateurs?)\s+peu(?:t|vent)|"
            r"(?:the\s+)?(?:system|application|platform|service|users?)\s+can|"
            r"en\s+tant\s+qu[e\u2019]|as\s+a\s+user)\b",
            re.IGNORECASE,
        ),
    ),
    # Labelled overview/context rows would otherwise look like glossary terms.
    (
        "CONTEXT",
        re.compile(
            r"^\s*(?:context|contexte|purpose|objectif|objectifs|scope|"
            r"p(?:\u00e9|e)rim(?:\u00e8|e)tre|background|overview|"
            r"pr(?:\u00e9|e)sentation|assumptions?|hypoth(?:\u00e8|e)ses?)\s*:\s*\S+",
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
]


def match_regex(text: str) -> str | None:
    """Return the first deterministic role match, if any."""
    for role, pattern in ROLE_REGEX_RULES:
        if pattern.search(text or ""):
            return role
    return None
