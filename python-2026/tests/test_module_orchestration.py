"""Module generation ownership, persistence, and reuse tests."""

import pytest

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
        return [
            {
                "id": "MOD-001",
                "name": "Search",
                "description": "Search workflows.",
                "kind": "functional",
                "source_item_ids": ["ITEM-00001"],
            }
        ]

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
    modules = [
        {
            "id": "MOD-001",
            "name": "Search",
            "description": "Search workflows.",
            "kind": "functional",
            "source_item_ids": ["ITEM-00001"],
        }
    ]
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
        {
            "id": "MOD-002",
            "name": "Search",
            "description": "Old search.",
            "source_item_ids": ["ITEM-00001"],
        },
        {
            "id": "MOD-005",
            "name": "Payment",
            "description": "Old payment.",
            "source_item_ids": ["ITEM-00002"],
        },
    ]
    generated = [
        {
            "id": "MOD-001",
            "name": "Search",
            "description": "New search.",
            "source_item_ids": ["ITEM-00001"],
        },
        {
            "id": "MOD-002",
            "name": "Recommendations",
            "description": "New recommendations.",
            "source_item_ids": ["ITEM-00003"],
        },
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


def test_invalid_module_mode_is_rejected_before_claim(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: pytest.fail("Invalid modes must not claim a lease"),
    )

    with pytest.raises(ValueError, match="module_mode"):
        orchestration.ensure_modules_for_plan(
            "a" * 64,
            [_requirement()],
            module_mode="invalid",  # type: ignore[arg-type]
        )


@pytest.mark.parametrize(
    "claim",
    [
        {"claimed": False, "in_progress": True},
        {"claimed": False, "in_progress": False},
    ],
)
def test_concurrent_or_unclaimed_generation_does_not_call_llm(
    monkeypatch: pytest.MonkeyPatch,
    claim: dict,
) -> None:
    monkeypatch.setattr(orchestration, "claim_module_generation", lambda *args, **kwargs: claim)
    monkeypatch.setattr(
        orchestration,
        "generate_module_list",
        lambda evidence: pytest.fail("A request without a lease must not call the LLM"),
    )

    with pytest.raises(orchestration.ModuleGenerationInProgress):
        orchestration.ensure_modules_for_plan("a" * 64, [_requirement()])


def test_claim_without_lease_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {"claimed": True},
    )

    with pytest.raises(RuntimeError, match="did not return a generation lease"):
        orchestration.ensure_modules_for_plan("a" * 64, [_requirement()])


def test_claimed_generation_without_trusted_evidence_records_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = _requirement()
    item.role_method = "none"
    failures: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {"claimed": True, "lease": "lease-1"},
    )
    monkeypatch.setattr(
        orchestration,
        "fail_module_generation",
        lambda spec_hash, lease, error: failures.append((spec_hash, lease, error)),
    )
    monkeypatch.setattr(
        orchestration,
        "generate_module_list",
        lambda evidence: pytest.fail("No evidence means no LLM call"),
    )

    with pytest.raises(ValueError, match="No trusted items"):
        orchestration.ensure_modules_for_plan("a" * 64, [item])

    assert failures == [("a" * 64, "lease-1", "No trusted items are available for module generation")]


def test_empty_generation_result_records_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    failures: list[str] = []
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {"claimed": True, "lease": "lease-1"},
    )
    monkeypatch.setattr(orchestration, "generate_module_list", lambda evidence: [])
    monkeypatch.setattr(
        orchestration,
        "fail_module_generation",
        lambda spec_hash, lease, error: failures.append(error),
    )

    with pytest.raises(ValueError, match="returned no valid modules"):
        orchestration.ensure_modules_for_plan("a" * 64, [_requirement()])

    assert failures == ["Module generation returned no valid modules"]


def test_cancellation_after_tagging_prevents_commit(monkeypatch: pytest.MonkeyPatch) -> None:
    failures: list[str] = []
    checks = iter([False, True])
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {"claimed": True, "lease": "lease-1"},
    )
    monkeypatch.setattr(
        orchestration,
        "generate_module_list",
        lambda evidence: [
            {
                "id": "MOD-001",
                "name": "Search",
                "description": "Search workflows",
                "source_item_ids": ["ITEM-00001"],
            }
        ],
    )
    monkeypatch.setattr(orchestration, "tag_module", lambda items, modules: items)
    monkeypatch.setattr(
        orchestration,
        "commit_module_generation",
        lambda *args, **kwargs: pytest.fail("Cancelled work must not commit"),
    )
    monkeypatch.setattr(
        orchestration,
        "fail_module_generation",
        lambda spec_hash, lease, error: failures.append(error),
    )

    with pytest.raises(orchestration.ModuleGenerationCancelled, match="before persistence"):
        orchestration.ensure_modules_for_plan(
            "a" * 64,
            [_requirement()],
            cancellation_check=lambda: next(checks),
        )

    assert failures == ["Module generation cancelled before persistence"]


def test_commit_failure_is_recorded_and_original_error_propagates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    failures: list[str] = []
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {"claimed": True, "lease": "lease-1"},
    )
    monkeypatch.setattr(
        orchestration,
        "generate_module_list",
        lambda evidence: [
            {
                "id": "MOD-001",
                "name": "Search",
                "description": "Search workflows",
                "source_item_ids": ["ITEM-00001"],
            }
        ],
    )
    monkeypatch.setattr(orchestration, "tag_module", lambda items, modules: items)
    monkeypatch.setattr(
        orchestration,
        "commit_module_generation",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("commit offline")),
    )
    monkeypatch.setattr(
        orchestration,
        "fail_module_generation",
        lambda spec_hash, lease, error: failures.append(error),
    )

    with pytest.raises(RuntimeError, match="commit offline"):
        orchestration.ensure_modules_for_plan("a" * 64, [_requirement()])

    assert failures == ["commit offline"]


def test_failure_reporting_error_does_not_hide_generation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {"claimed": True, "lease": "lease-1"},
    )
    monkeypatch.setattr(
        orchestration,
        "generate_module_list",
        lambda evidence: (_ for _ in ()).throw(ValueError("invalid modules")),
    )
    monkeypatch.setattr(
        orchestration,
        "fail_module_generation",
        lambda *args: (_ for _ in ()).throw(RuntimeError("store offline")),
    )

    with pytest.raises(ValueError, match="invalid modules"):
        orchestration.ensure_modules_for_plan("a" * 64, [_requirement()])


def test_reused_snapshot_recomputes_coverage_when_store_omits_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = _requirement()
    item.module_disposition = "unassigned"
    monkeypatch.setattr(
        orchestration,
        "claim_module_generation",
        lambda *args, **kwargs: {
            "reused": True,
            "module_status": "needs_review",
            "module_version": 4,
            "modules": [],
            "module_coverage": None,
        },
    )

    result = orchestration.ensure_modules_for_plan("a" * 64, [item])

    assert result.reused is True
    assert result.coverage["unassigned_item_ids"] == ["ITEM-00001"]


def test_module_fingerprint_is_stable_and_sensitive_to_evidence() -> None:
    first = _requirement()
    duplicate = _requirement()

    assert orchestration.module_evidence_fingerprint([first]) == (
        orchestration.module_evidence_fingerprint([duplicate])
    )

    duplicate.text = "The system must search artists."
    assert orchestration.module_evidence_fingerprint([first]) != (
        orchestration.module_evidence_fingerprint([duplicate])
    )
