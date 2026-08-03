"""Task-manifest contract tests (Phase 4-b)."""

from services.ingestion.manifest import TASK_MANIFEST
from services.ingestion.items import Item
from services.ingestion.manifest import filter_items
from services.plan_service import requirements_from_items


def test_task_manifest_has_the_agreed_role_buckets() -> None:
    assert TASK_MANIFEST == {
        "generate-plan": {"CONTEXT", "FEATURE", "ACTOR"},
        "generate-test-cases": {"FEATURE", "REQUIREMENT", "ACCEPTANCE"},
    }


def test_requirement_prompt_records_keep_item_traceability() -> None:
    requirement = Item(
        id="ITEM-00042",
        source_chunk_id="CHUNK-007",
        heading_path=["Requirements", "Playback"],
        text="The player must support offline downloads.",
        role="REQUIREMENT",
        requirement_id="REQ-00042",
    )
    non_requirement = Item(
        id="ITEM-00043",
        source_chunk_id="CHUNK-007",
        heading_path=["Requirements"],
        text="A short context statement.",
        role="CONTEXT",
    )

    assert requirements_from_items([requirement, non_requirement]) == [
        {
            "id": "REQ-00042",
            "title": "Playback",
            "description": "The player must support offline downloads.",
            "source": "CHUNK-007",
            "priority": "",
        }
    ]


def test_plan_filter_excludes_untagged_and_reports_it_for_review() -> None:
    feature = Item("ITEM-00001", "CHUNK-001", [], "Search tracks.", role="FEATURE", role_method="heading")
    pending = Item("ITEM-00002", "CHUNK-001", [], "Ambiguous text.")
    requirement = Item("ITEM-00003", "CHUNK-001", [], "Must retain history.", role="REQUIREMENT", role_method="regex")

    selected, pending_count = filter_items([feature, pending, requirement], "generate-plan", budget_chars=100)

    assert selected == [feature]
    assert pending_count == 1


def test_plan_filter_preserves_document_order_within_budget() -> None:
    first = Item("ITEM-00001", "CHUNK-001", [], "A" * 40, role="CONTEXT", role_method="heading")
    second = Item("ITEM-00002", "CHUNK-001", [], "B" * 40, role="FEATURE", role_method="regex")

    selected, _ = filter_items([first, second], "generate-plan", budget_chars=50)

    assert selected == [first]
