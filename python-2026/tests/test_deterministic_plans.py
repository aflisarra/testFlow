"""Phase 5b deterministic test-plan assembly tests."""

import pytest

from services import plan_service
from services.ingestion.items import Item
from services.ingestion.module_orchestration import ModuleGenerationResult
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


def test_repeated_deterministic_generation_returns_stable_plan_ids() -> None:
    modules = [
        {"id": "MOD-002", "name": "Search", "description": "Search workflows"},
        {"id": "MOD-005", "name": "Checkout", "description": "Checkout workflows"},
    ]
    search = _item("ITEM-00001", "Search")
    search.module_ids = ["MOD-002"]
    search.primary_module_id = "MOD-002"
    search.module_disposition = "assigned"
    checkout = _item("ITEM-00002", "Checkout")
    checkout.module_ids = ["MOD-005"]
    checkout.primary_module_id = "MOD-005"
    checkout.module_disposition = "assigned"

    first = build_test_plans_deterministic(modules, [search, checkout])
    second = build_test_plans_deterministic(modules, [search, checkout])

    assert [value["id"] for value in first] == ["TP-1", "TP-2"]
    assert first == second


@pytest.mark.parametrize(
    ("spec_hash", "items", "message"),
    [
        ("", [], "spec_hash is required"),
        ("a" * 64, [], "No stored ingestion items"),
    ],
)
def test_plan_generation_requires_hash_and_stored_items(
    monkeypatch: pytest.MonkeyPatch,
    spec_hash: str,
    items: list[Item],
    message: str,
) -> None:
    monkeypatch.setattr(plan_service, "get_items", lambda value: items)

    with pytest.raises(ValueError, match=message):
        plan_service.generate_test_plans(spec_hash=spec_hash)


def test_plan_generation_reports_pending_and_skipped_module_diagnostics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requirement = _item("ITEM-00001", "Search")
    requirement.module_ids = ["MOD-001"]
    requirement.primary_module_id = "MOD-001"
    requirement.module_disposition = "assigned"
    supporting_feature = _item("ITEM-00002", "Checkout", role="FEATURE")
    supporting_feature.module_ids = ["MOD-002"]
    supporting_feature.primary_module_id = "MOD-002"
    supporting_feature.module_disposition = "assigned"
    pending = _item("ITEM-00003", "Unknown", role="UNTAGGED")
    pending.role_method = "none"
    modules = [
        {"id": "MOD-001", "name": "Search", "description": "Search workflows"},
        {"id": "MOD-002", "name": "Checkout", "description": "Checkout workflows"},
        {"id": "MOD-003", "name": "Profile", "description": "Profile workflows"},
    ]
    items = [requirement, supporting_feature, pending]
    captured: dict = {}
    monkeypatch.setattr(plan_service, "get_items", lambda value: items)

    def ensure(spec_hash, values, **kwargs):
        captured.update({"spec_hash": spec_hash, "items": values, **kwargs})
        return ModuleGenerationResult(
            modules=modules,
            items=items,
            module_status="needs_review",
            module_version=2,
            coverage={"assigned_item_count": 2},
            reused=True,
        )

    monkeypatch.setattr(plan_service, "ensure_modules_for_plan", ensure)
    cancellation_check = lambda: False

    result = plan_service.generate_test_plans(
        spec_hash="a" * 64,
        module_mode="regenerate",
        cancellation_check=cancellation_check,
    )

    assert [plan["module"] for plan in result.plans] == ["Search"]
    assert result.pending_review_count == 1
    assert result.module_status == "needs_review"
    assert result.module_version == 2
    assert result.skipped_modules == [
        {
            "module_id": "MOD-002",
            "module": "Checkout",
            "reason": "insufficient_traceability",
        },
        {
            "module_id": "MOD-003",
            "module": "Profile",
            "reason": "no_testable_evidence",
        },
    ]
    assert captured["module_mode"] == "regenerate"
    assert captured["cancellation_check"] is cancellation_check
