"""Module generation ownership, persistence, and reuse tests."""

from services.ingestion import module_orchestration as orchestration
from services.ingestion.items import Item


def _requirement() -> Item:
    return Item(
        "ITEM-00001",
        "CHUNK-001",
        ["Search"],
        "The system must search tracks.",
        role="REQUIREMENT",
        role_method="regex",
        requirement_id="REQ-00001",
    )


def test_first_ensure_generates_tags_and_commits_once(monkeypatch) -> None:
    item = _requirement()
    calls = {"generate": 0, "commit": 0}
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {"claimed": True, "lease": "lease-1", "module_version": 0},
    )

    def generate(evidence):
        calls["generate"] += 1
        return [{
            "id": "MOD-001",
            "name": "Search",
            "description": "Search workflows.",
            "kind": "functional",
            "source_item_ids": ["ITEM-00001"],
        }]

    def tag(items, modules):
        items[0].module = "Search"
        items[0].module_ids = ["MOD-001"]
        items[0].primary_module_id = "MOD-001"
        items[0].module_method = "source"
        items[0].module_score = 1.0
        items[0].module_margin = 1.0
        items[0].module_disposition = "assigned"
        return items

    def commit(*args, **kwargs):
        calls["commit"] += 1
        return {
            "modules": kwargs["modules"],
            "module_status": "ready",
            "module_version": 1,
        }

    monkeypatch.setattr(orchestration, "generate_module_list", generate)
    monkeypatch.setattr(orchestration, "tag_module", tag)
    monkeypatch.setattr(orchestration, "commit_module_generation", commit)
    monkeypatch.setattr(orchestration, "fail_module_generation", lambda *args, **kwargs: None)

    result = orchestration.ensure_modules_for_plan("a" * 64, [item])

    assert calls == {"generate": 1, "commit": 1}
    assert result.module_version == 1
    assert result.coverage["assigned_item_count"] == 1
    assert result.reused is False


def test_matching_ready_snapshot_is_reused_without_generation(monkeypatch) -> None:
    item = _requirement()
    item.module = "Search"
    item.module_ids = ["MOD-001"]
    item.primary_module_id = "MOD-001"
    item.module_disposition = "assigned"
    modules = [{
        "id": "MOD-001",
        "name": "Search",
        "description": "Search workflows.",
        "kind": "functional",
        "source_item_ids": ["ITEM-00001"],
    }]
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {
            "claimed": False,
            "reused": True,
            "module_status": "ready",
            "module_version": 2,
            "modules": modules,
            "module_coverage": {"assigned_item_count": 1},
        },
    )
    monkeypatch.setattr(
        orchestration,
        "generate_module_list",
        lambda evidence: (_ for _ in ()).throw(AssertionError("generator must not run")),
    )

    result = orchestration.ensure_modules_for_plan("a" * 64, [item])

    assert result.reused is True
    assert result.module_version == 2
    assert result.modules == modules


def test_regeneration_preserves_unambiguous_module_ids_and_allocates_new_ids() -> None:
    previous = [
        {"id": "MOD-002", "name": "Search", "description": "Old search.", "source_item_ids": ["ITEM-00001"]},
        {"id": "MOD-005", "name": "Payment", "description": "Old payment.", "source_item_ids": ["ITEM-00002"]},
    ]
    generated = [
        {"id": "MOD-001", "name": "Search", "description": "New search.", "source_item_ids": ["ITEM-00001"]},
        {"id": "MOD-002", "name": "Recommendations", "description": "New recommendations.", "source_item_ids": ["ITEM-00003"]},
    ]

    aligned = orchestration.preserve_module_ids(generated, previous)

    assert aligned[0]["id"] == "MOD-002"
    assert aligned[1]["id"] == "MOD-006"


def test_cancellation_before_generation_releases_lease_as_failed(monkeypatch) -> None:
    item = _requirement()
    failures = []
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {"claimed": True, "lease": "lease-1", "module_version": 0},
    )
    monkeypatch.setattr(
        orchestration,
        "fail_module_generation",
        lambda spec_hash, lease, error: failures.append((spec_hash, lease, error)),
    )
    monkeypatch.setattr(
        orchestration,
        "generate_module_list",
        lambda evidence: (_ for _ in ()).throw(AssertionError("generator must not run")),
    )

    try:
        orchestration.ensure_modules_for_plan(
            "a" * 64,
            [item],
            cancellation_check=lambda: True,
        )
    except orchestration.ModuleGenerationCancelled:
        pass
    else:
        raise AssertionError("Expected module generation cancellation")

    assert failures == [("a" * 64, "lease-1", "Module generation cancelled by user")]
