"""Task-manifest contract tests (Phase 4-b)."""

from services.ingestion.manifest import TASK_MANIFEST
from services.ingestion.items import Item
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
