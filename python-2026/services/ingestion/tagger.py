"""Role-tagging cascade for ingestion (Phase 3, deterministic stages)."""

from __future__ import annotations

from services.ingestion.items import Item
from services.ingestion.role_heading_prior import match_heading
from services.ingestion.role_rules import match_regex


def tag_role(items: list[Item]) -> list[Item]:
    """Apply lexical then nearest-heading role tagging in place.

    The embedding fallback is added in the next Phase 3 slice after the
    validated SonicWave gold examples are ported out of the notebook. Items
    not resolved by these deterministic stages remain diagnostic UNTAGGED
    values with ``role_method == 'none'``.
    """
    for item in items:
        role = match_regex(item.text)
        if role is not None:
            item.role = role
            item.role_method = "regex"
            item.role_score = None
            continue

        nearest_heading = item.heading_path[-1] if item.heading_path else ""
        role = match_heading(nearest_heading)
        if role is not None:
            item.role = role
            item.role_method = "heading"
            item.role_score = None
            continue

        item.role = "UNTAGGED"
        item.role_method = "none"
        item.role_score = None

    return items
