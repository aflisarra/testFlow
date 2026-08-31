"""Unit tests for test-case generation from durable specification evidence."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from services import case_service
from services.ingestion.items import Item


def _item(
    item_id: str,
    role: str,
    *,
    module_id: str = "MOD-001",
    text: str | None = None,
) -> Item:
    item = Item(
        id=item_id,
        source_chunk_id="CHUNK-001",
        heading_path=["Quality" if role == "NON_FUNCTIONAL" else "Checkout"],
        text=text or f"{role.title()} evidence for checkout.",
        role=role,
        role_method="regex",
        requirement_id=(f"REQ-{item_id.removeprefix('ITEM-')}" if role == "REQUIREMENT" else None),
    )
    item.module = "Checkout"
    item.module_ids = [module_id]
    item.primary_module_id = module_id
    item.module_disposition = "assigned"
    return item


def _raw_case(index: int, **overrides: Any) -> dict[str, Any]:
    value: dict[str, Any] = {
        "title": f"Generated case {index}",
        "objective": f"Verify generated case {index}",
        "preconditions": ["A configured account"],
        "test_data": {"account": f"user-{index}"},
        "steps": ["Submit the request"],
        "expected_result": "The request succeeds",
        "priority": "high",
        "severity": "medium",
        "type": "error-handling",
        "requirements": ["REQ-00001"],
    }
    value.update(overrides)
    return value


def _configure_generation(
    monkeypatch: pytest.MonkeyPatch,
    *,
    payload: Any,
    filtered_items: list[Item] | None = None,
    pending_count: int = 0,
    stored_items_found: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]]:
    captured_filter: dict[str, Any] = {}
    captured_prompt: dict[str, Any] = {}

    def filter_items(
        spec_hash: str,
        task: str,
        *,
        module: str | None,
        module_id: str | None,
    ) -> tuple[list[Item], int, bool]:
        captured_filter.update(
            {
                "spec_hash": spec_hash,
                "task": task,
                "module": module,
                "module_id": module_id,
            }
        )
        return list(filtered_items or []), pending_count, stored_items_found

    monkeypatch.setattr(case_service, "get_filtered_items_for_task", filter_items)
    monkeypatch.setattr(
        case_service,
        "get_settings",
        lambda: SimpleNamespace(use_mock=False, openrouter_test_cases_timeout=47),
    )
    monkeypatch.setattr(
        case_service,
        "build_test_case_prompt",
        lambda **kwargs: captured_prompt.update(kwargs) or "test-case prompt",
    )
    monkeypatch.setattr(
        case_service,
        "get_ai_service",
        lambda: SimpleNamespace(
            generate_json=lambda *, prompt, timeout: (
                payload
                if (prompt, timeout) == ("test-case prompt", 47)
                else pytest.fail("Unexpected AI invocation")
            )
        ),
    )
    return captured_filter, captured_prompt


def _generate(**overrides: Any) -> tuple[list[dict[str, Any]], int]:
    arguments: dict[str, Any] = {
        "plan_id": "TP-12",
        "plan_title": "Checkout",
        "plan_description": "Checkout coverage",
        "spec_text": "Legacy specification text",
        "style_config": "concise",
        "project_title": "Shop",
        "plan_module": "Checkout",
        "plan_module_id": "MOD-001",
        "spec_hash": "a" * 64,
    }
    arguments.update(overrides)
    return case_service.generate_test_cases(**arguments)


def test_generation_uses_module_scoped_evidence_and_propagates_nfr(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requirement = _item("ITEM-00001", "REQUIREMENT")
    nfr = _item(
        "ITEM-00002",
        "NON_FUNCTIONAL",
        text="Checkout must finish within two seconds.",
    )
    payload = {
        "testCases": [
            _raw_case(
                1,
                preconditions="A configured account",
                priority="critical",
                severity="high",
                type="permissions",
                requirements=["REQ-00001", "UNKNOWN", {"id": "REQ-00001"}],
            ),
            _raw_case(2),
            _raw_case(3),
        ]
    }
    captured_filter, captured_prompt = _configure_generation(
        monkeypatch,
        payload=payload,
        filtered_items=[requirement, nfr],
        pending_count=4,
    )

    cases, pending_count = _generate()

    assert captured_filter == {
        "spec_hash": "a" * 64,
        "task": "generate-test-cases",
        "module": "Checkout",
        "module_id": "MOD-001",
    }
    assert captured_prompt["filtered_items"] == [requirement, nfr]
    assert captured_prompt["linked_requirements"][1]["id"] == "NFR-00002"
    assert pending_count == 4
    assert [case["id"] for case in cases] == ["TC-12.1", "TC-12.2", "TC-12.3"]
    assert cases[0]["preconditions"] == ["A configured account"]
    assert cases[0]["priority"] == "Critical"
    assert cases[0]["severity"] == "Critical"
    assert cases[0]["type"] == "Permission"
    assert [value["id"] for value in cases[0]["requirements"]] == ["REQ-00001"]
    assert cases[0]["stepDetails"] == [
        {"step": "Submit the request", "expected_result": "The request succeeds"}
    ]


def test_generation_rejects_stored_snapshot_without_eligible_items(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_generation(monkeypatch, payload={}, filtered_items=[], stored_items_found=True)

    with pytest.raises(ValueError, match="No reviewed/tagged items"):
        _generate()


def test_generation_rejects_stored_items_without_testable_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    feature = _item("ITEM-00001", "FEATURE")
    _configure_generation(monkeypatch, payload={}, filtered_items=[feature])

    with pytest.raises(ValueError, match="No retained testable evidence"):
        _generate()


def test_generation_uses_legacy_extraction_when_snapshot_is_unknown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requirements = [
        {
            "id": "REQ-LEGACY",
            "title": "Legacy",
            "description": "Legacy requirement",
            "source": "spec",
            "priority": "Medium",
        }
    ]
    chunks = [{"id": "CHUNK-001", "title": "Rules", "text": "Legacy rule"}]
    _, captured_prompt = _configure_generation(
        monkeypatch,
        payload={"cases": [_raw_case(1), _raw_case(2), _raw_case(3)]},
        filtered_items=[],
        pending_count=2,
        stored_items_found=False,
    )
    monkeypatch.setattr(case_service, "extract_requirements", lambda text: requirements)
    monkeypatch.setattr(case_service, "get_srs_sections", lambda text, allowed: chunks)

    cases, pending_count = _generate(spec_hash="")

    assert len(cases) == 3
    assert pending_count == 2
    assert captured_prompt["linked_requirements"] == requirements
    assert captured_prompt["spec_chunks"] == chunks
    assert captured_prompt["filtered_items"] is None


@pytest.mark.parametrize("shape", ["list", "test_cases", "testCases", "cases", "data"])
def test_generation_accepts_supported_ai_payload_shapes(
    monkeypatch: pytest.MonkeyPatch,
    shape: str,
) -> None:
    raw_cases = [_raw_case(1), _raw_case(2), _raw_case(3)]
    payload: Any = raw_cases if shape == "list" else {shape: raw_cases}
    _configure_generation(
        monkeypatch,
        payload=payload,
        filtered_items=[_item("ITEM-00001", "REQUIREMENT")],
    )

    cases, _ = _generate()

    assert len(cases) == 3


def test_generation_rejects_unsupported_ai_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_generation(
        monkeypatch,
        payload={"result": "not a case list"},
        filtered_items=[_item("ITEM-00001", "REQUIREMENT")],
    )

    with pytest.raises(ValueError, match="AI did not return a list"):
        _generate()


def test_generation_rejects_non_object_test_data(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_generation(
        monkeypatch,
        payload=[_raw_case(1, test_data="invalid"), _raw_case(2), _raw_case(3)],
        filtered_items=[_item("ITEM-00001", "REQUIREMENT")],
    )

    with pytest.raises(ValueError, match="test_data must be a JSON object"):
        _generate()


def test_generation_requires_expected_result_for_every_step(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_generation(
        monkeypatch,
        payload=[_raw_case(1, expected_result=""), _raw_case(2), _raw_case(3)],
        filtered_items=[_item("ITEM-00001", "REQUIREMENT")],
    )

    with pytest.raises(ValueError, match="expected_result.*Missing at steps"):
        _generate()


def test_generation_enforces_minimum_and_caps_maximum_case_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = _item("ITEM-00001", "REQUIREMENT")
    _configure_generation(monkeypatch, payload=[_raw_case(1), _raw_case(2)], filtered_items=[item])
    with pytest.raises(ValueError, match="minimum required"):
        _generate()

    _configure_generation(
        monkeypatch,
        payload=[_raw_case(index) for index in range(1, 8)],
        filtered_items=[item],
    )
    cases, _ = _generate(plan_id="PLAN")

    assert len(cases) == 5
    assert [case["id"] for case in cases] == [f"TC.{index}" for index in range(1, 6)]


def test_generation_propagates_ai_failures(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_generation(
        monkeypatch,
        payload=[],
        filtered_items=[_item("ITEM-00001", "REQUIREMENT")],
    )
    monkeypatch.setattr(
        case_service,
        "get_ai_service",
        lambda: SimpleNamespace(
            generate_json=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("AI offline"))
        ),
    )

    with pytest.raises(RuntimeError, match="AI offline"):
        _generate()
