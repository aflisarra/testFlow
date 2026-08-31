"""Role-tagging cascade for ingestion (Phase 3, deterministic stages)."""

from __future__ import annotations

from services.ingestion.items import Item, requirement_id_from_item_id
from services.ingestion.role_heading_prior import match_heading
from services.ingestion.role_rules import match_regex


def tag_role(items: list[Item]) -> list[Item]:
    """Tag every item against the deterministic role cascade.
    no embedding usage because sentences having the same role are often very different in wording, so embeddings are not useful for this task.
    """
    for item in items:
        role = match_regex(item.text)
        if role is not None:
            item.role = role
            item.role_method = "regex"
            item.role_score = None
        else:
            # Every ancestor heading contributes context.  Search from the
            # closest (most specific) heading outward, so it wins when both
            # it and a parent imply a role.
            for heading in reversed(item.heading_path):
                role = match_heading(heading)
                if role is not None:
                    item.role = role
                    item.role_method = "heading"
                    item.role_score = None
                    break
            else:
                item.role = "UNTAGGED"
                item.role_method = "none"
                item.role_score = None

        item.requirement_id = (
            requirement_id_from_item_id(item.id) if item.role == "REQUIREMENT" else None
        )

    return items
