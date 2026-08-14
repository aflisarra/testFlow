"""Task-manifest contract tests (Phase 4-b)."""

from services.ingestion.manifest import TASK_MANIFEST
from services.ingestion.items import Item
from services.ingestion.manifest import filter_items
from services.plan_service import requirements_from_items


def test_task_manifest_has_the_agreed_role_buckets() -> None:
    assert TASK_MANIFEST == {
        "generate-test-cases": {"FEATURE", "REQUIREMENT", "ACCEPTANCE", "NON_FUNCTIONAL"},
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


def test_case_filter_excludes_untagged_and_reports_it_for_review() -> None:
    feature = Item("ITEM-00001", "CHUNK-001", [], "Search tracks.", role="FEATURE", role_method="heading")
    pending = Item("ITEM-00002", "CHUNK-001", [], "Ambiguous text.")
    requirement = Item("ITEM-00003", "CHUNK-001", [], "Must retain history.", role="REQUIREMENT", role_method="regex")

    selected, pending_count = filter_items([feature, pending, requirement], "generate-test-cases", budget_chars=100)

    assert selected == [feature, requirement]
    assert pending_count == 1


def test_case_filter_preserves_document_order_within_budget() -> None:
    first = Item("ITEM-00001", "CHUNK-001", [], "A" * 40, role="FEATURE", role_method="heading")
    second = Item("ITEM-00002", "CHUNK-001", [], "B" * 40, role="REQUIREMENT", role_method="regex")

    selected, _ = filter_items([first, second], "generate-test-cases", budget_chars=50)

    assert selected == [first]


def test_case_filter_retains_non_functional_evidence() -> None:
    item = Item(
        "ITEM-00004",
        "CHUNK-002",
        ["Performance"],
        "Search results must appear within two seconds.",
        role="NON_FUNCTIONAL",
        role_method="regex",
    )

    selected, _ = filter_items([item], "generate-test-cases")

    assert selected == [item]


def test_case_filter_uses_stable_module_id_when_available() -> None:
    search = Item(
        "ITEM-00005", "CHUNK-002", ["Search"], "Search must respond quickly.",
        role="NON_FUNCTIONAL", role_method="regex", module="Renamed Search",
        module_ids=["MOD-001"], primary_module_id="MOD-001", module_disposition="assigned",
    )
    payment = Item(
        "ITEM-00006", "CHUNK-003", ["Payment"], "Payment must respond quickly.",
        role="NON_FUNCTIONAL", role_method="regex", module="Payment",
        module_ids=["MOD-002"], primary_module_id="MOD-002", module_disposition="assigned",
    )

    selected, _ = filter_items(
        [search, payment],
        "generate-test-cases",
        module_id="MOD-001",
    )

    assert selected == [search]


def test_case_filter_retains_cross_cutting_nfr_for_quality_plan() -> None:
    item = Item(
        "ITEM-00007", "CHUNK-004", ["Availability"], "The service must remain available.",
        role="NON_FUNCTIONAL", role_method="regex", module="CROSS_CUTTING",
        module_ids=["MOD-001", "MOD-002"], module_disposition="cross_cutting",
    )

    selected, _ = filter_items(
        [item],
        "generate-test-cases",
        module="Cross-cutting quality",
    )

    assert selected == [item]
