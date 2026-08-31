"""Task-to-role contract used by the generation pipeline."""

from __future__ import annotations

from services.ingestion.items import Item

TASK_MANIFEST: dict[str, set[str]] = {
    "generate-test-cases": {"FEATURE", "REQUIREMENT", "ACCEPTANCE", "NON_FUNCTIONAL"},
}


def filter_items(
    items: list[Item],
    task: str,
    module: str | None = None,
    module_id: str | None = None,
    budget_chars: int | None = None,
) -> tuple[list[Item], int]:
    """Return task-relevant items in document order plus pending review count.

    UNTAGGED items are never candidates. They remain observable through the
    second return value and become eligible only after human resolution.
    """
    allowed_roles = TASK_MANIFEST[task]
    pending_review_count = sum(item.role == "UNTAGGED" and not item.reviewed for item in items)
    candidates = [item for item in items if item.role in allowed_roles]
    if module_id:
        candidates = [item for item in candidates if module_id in item.module_ids]
    elif module:
        candidates = [
            item
            for item in candidates
            if item.module == module
            or (module == "Cross-cutting quality" and item.module_disposition == "cross_cutting")
            or item.role in {"CONTEXT", "ACTOR"}
        ]
    if budget_chars is None:
        return candidates, pending_review_count

    selected: list[Item] = []
    chars = 0
    for item in candidates:
        item_chars = len(item.text)
        if selected and chars + item_chars > budget_chars:
            continue
        if not selected and item_chars > budget_chars:
            # Keep one oversize atomic item rather than mutate its text.
            selected.append(item)
            break
        selected.append(item)
        chars += item_chars
    return selected, pending_review_count
