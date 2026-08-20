"""Phase 5b deterministic test-plan assembly tests."""

from services.ingestion.items import Item
from services.plan_service import build_test_plans_deterministic


def _item(id_: str, module: str, role: str = "REQUIREMENT") -> Item:
    return Item(
        id=id_,
        source_chunk_id="CHUNK-001",
        heading_path=[module],
        text=f"{module} must work.",
        role=role,
        role_method="regex",
        module=module,
        requirement_id=f"REQ-{id_.removeprefix('ITEM-')}" if role == "REQUIREMENT" else None,
    )


def test_builds_one_medium_priority_plan_per_requirement_backed_module() -> None:
    modules = [
        {
            "name": "Search",
            "description": "Search and filtering.",
            "source_item_ids": ["ITEM-00001"],
        },
        {"name": "Playback", "description": "Audio playback.", "source_item_ids": ["ITEM-00003"]},
    ]
    items = [
        _item("ITEM-00001", "Search"),
        _item("ITEM-00002", "Search"),
        _item("ITEM-00003", "Playback"),
        _item("ITEM-00004", "Playback"),
    ]

    plans = build_test_plans_deterministic(modules, items)

    assert [plan["id"] for plan in plans] == ["TP-1", "TP-2"]
    assert [plan["module"] for plan in plans] == ["Search", "Playback"]
    assert all(plan["priority"] == "Medium" for plan in plans)
    assert plans[0]["requirements"][0]["id"] == "REQ-00001"


def test_keeps_single_testable_item_and_skips_unlinked_modules() -> None:
    modules = [
        {"name": "Tiny", "description": "Only one item.", "source_item_ids": ["ITEM-00001"]},
        {"name": "Unlinked", "description": "No requirement.", "source_item_ids": ["ITEM-00002"]},
    ]
    items = [
        _item("ITEM-00001", "Tiny"),
        _item("ITEM-00002", "Unlinked", role="FEATURE"),
        _item("ITEM-00003", "Unlinked", role="FEATURE"),
    ]

    plans = build_test_plans_deterministic(modules, items)

    assert [plan["module"] for plan in plans] == ["Tiny"]


def test_acceptance_only_module_creates_a_plan() -> None:
    modules = [
        {
            "id": "MOD-001",
            "name": "Checkout",
            "description": "Checkout flow.",
            "source_item_ids": ["ITEM-00001"],
        },
    ]
    acceptance = _item("ITEM-00001", "Checkout", role="ACCEPTANCE")
    acceptance.module_ids = ["MOD-001"]
    acceptance.primary_module_id = "MOD-001"
    acceptance.module_disposition = "assigned"

    plans = build_test_plans_deterministic(modules, [acceptance])

    assert len(plans) == 1
    assert plans[0]["requirements"] == []
    assert plans[0]["evidence"][0]["role"] == "ACCEPTANCE"
    assert plans[0]["evidence"][0]["external_id"] == "AC-00001"


def test_module_specific_nfr_only_module_creates_a_plan() -> None:
    modules = [
        {
            "id": "MOD-001",
            "name": "Search",
            "description": "Search flow.",
            "source_item_ids": ["ITEM-00001"],
        },
    ]
    nfr = _item("ITEM-00001", "Search", role="NON_FUNCTIONAL")
    nfr.module_ids = ["MOD-001"]
    nfr.primary_module_id = "MOD-001"
    nfr.module_disposition = "assigned"

    plans = build_test_plans_deterministic(modules, [nfr])

    assert len(plans) == 1
    assert plans[0]["evidence"][0]["role"] == "NON_FUNCTIONAL"
    assert plans[0]["evidence"][0]["external_id"] == "NFR-00001"


def test_cross_cutting_nfr_creates_a_quality_plan() -> None:
    modules = [
        {
            "id": "MOD-001",
            "name": "Search",
            "description": "Search.",
            "source_item_ids": ["ITEM-00002"],
        },
        {
            "id": "MOD-002",
            "name": "Payment",
            "description": "Payment.",
            "source_item_ids": ["ITEM-00003"],
        },
    ]
    nfr = _item("ITEM-00001", "CROSS_CUTTING", role="NON_FUNCTIONAL")
    nfr.module_ids = ["MOD-001", "MOD-002"]
    nfr.module_disposition = "cross_cutting"

    plans = build_test_plans_deterministic(modules, [nfr])

    assert len(plans) == 1
    assert plans[0]["plan_kind"] == "quality"
    assert plans[0]["evidence"][0]["external_id"] == "NFR-00001"
