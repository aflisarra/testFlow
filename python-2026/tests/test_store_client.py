"""FastAPI adapter tests for the Node-owned ingestion store."""

from typing import Any

import pytest
import requests

from services.ingestion.items import Item
from services.ingestion.store_client import (
    IngestionStoreError,
    claim_module_generation,
    commit_module_generation,
    fail_module_generation,
    get_ingestion_snapshot,
    get_items,
    get_items_with_status,
    get_module_list,
    get_pending_review,
    resolve_review,
    store_ingestion,
)


class _Response:
    def __init__(self, status_code: int, payload: Any = None) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = "error"

    def json(self) -> Any:
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def test_unknown_hash_returns_empty_items(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(404))
    assert get_items("missing") == []
    assert get_items_with_status("missing") == ([], False)


def test_store_serializes_every_item_field(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    captured: dict[str, Any] = {}

    def request(method: str, url: str, **kwargs: Any) -> _Response:
        captured.update({"method": method, "url": url, **kwargs})
        return _Response(204)

    monkeypatch.setattr(requests, "request", request)
    item = Item(
        "ITEM-00042",
        "CHUNK-007",
        ["Requirements"],
        "The player must work offline.",
        role="REQUIREMENT",
        role_method="human",
        reviewed=True,
        reviewed_by="alice",
        requirement_id="REQ-00042",
    )

    store_ingestion("a" * 64, [item], [])

    assert captured["method"] == "PUT"
    assert captured["json"]["items"][0]["requirement_id"] == "REQ-00042"
    assert captured["json"]["items"][0]["role_method"] == "human"
    assert captured["json"]["items"][0]["reviewed_by"] == "alice"


def test_connection_failure_is_not_treated_as_an_unknown_hash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")

    def request(*args: Any, **kwargs: Any) -> _Response:
        raise requests.ConnectionError("offline")

    monkeypatch.setattr(requests, "request", request)
    with pytest.raises(IngestionStoreError, match="request failed"):
        get_items("a" * 64)


def test_claim_module_generation_serializes_version_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    captured: dict[str, Any] = {}

    def request(method: str, url: str, **kwargs: Any) -> _Response:
        captured.update({"method": method, "url": url, **kwargs})
        return _Response(200, {"claimed": True, "lease": "lease-1"})

    monkeypatch.setattr(requests, "request", request)

    result = claim_module_generation(
        "a" * 64,
        fingerprint="fingerprint",
        algorithm_version="module-v2",
        force=True,
    )

    assert result["lease"] == "lease-1"
    assert captured["method"] == "POST"
    assert captured["json"] == {
        "fingerprint": "fingerprint",
        "algorithm_version": "module-v2",
        "force": True,
    }


def test_commit_module_generation_sends_module_only_assignments(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    captured: dict[str, Any] = {}

    def request(method: str, url: str, **kwargs: Any) -> _Response:
        captured.update({"method": method, "url": url, **kwargs})
        return _Response(200, {"module_status": "ready", "module_version": 1})

    monkeypatch.setattr(requests, "request", request)
    item = Item(
        "ITEM-00042",
        "CHUNK-007",
        ["Search"],
        "The system must search tracks.",
        role="REQUIREMENT",
        role_method="human",
        reviewed=True,
        reviewed_by="alice",
        requirement_id="REQ-00042",
        module="Search",
        module_ids=["MOD-001"],
        primary_module_id="MOD-001",
        module_method="source",
        module_score=1.0,
        module_margin=1.0,
        module_disposition="assigned",
    )
    modules = [
        {
            "id": "MOD-001",
            "name": "Search",
            "description": "Search workflows.",
            "kind": "functional",
            "source_item_ids": ["ITEM-00042"],
        }
    ]

    commit_module_generation(
        "a" * 64,
        "lease-1",
        modules=modules,
        items=[item],
        fingerprint="fingerprint",
        algorithm_version="module-v2",
        coverage={"assigned_item_count": 1},
        module_status="ready",
    )

    assignment = captured["json"]["assignments"][0]
    assert assignment["item_id"] == "ITEM-00042"
    assert assignment["module_ids"] == ["MOD-001"]
    assert "role" not in assignment
    assert "reviewed_by" not in assignment


def test_item_deserialization_round_trips_module_and_review_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    payload = {
        "items": [
            {
                "id": "ITEM-00042",
                "source_chunk_id": "CHUNK-007",
                "heading_path": ["Requirements", "Search"],
                "text": "Search must respond within two seconds.",
                "role": "NON_FUNCTIONAL",
                "role_method": "human",
                "role_score": 0.91,
                "module": "Search",
                "module_ids": ["MOD-001"],
                "primary_module_id": "MOD-001",
                "module_method": "hybrid",
                "module_score": "0.88",
                "module_margin": "0.24",
                "module_disposition": "assigned",
                "module_algorithm_version": "module-v2",
                "reviewed": True,
                "reviewed_by": "alice",
                "suggested_role": None,
                "requirement_id": "NFR-00042",
            }
        ]
    }
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(200, payload))

    items, found = get_items_with_status("a" * 64)

    assert found is True
    assert len(items) == 1
    item = items[0]
    assert item.heading_path == ["Requirements", "Search"]
    assert item.role == "NON_FUNCTIONAL"
    assert item.role_method == "human"
    assert item.module_ids == ["MOD-001"]
    assert item.module_score == 0.88
    assert item.module_margin == 0.24
    assert item.reviewed_by == "alice"


def test_store_requires_internal_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("INTERNAL_API_TOKEN", raising=False)
    monkeypatch.delenv("FASTAPI_SECRET", raising=False)

    with pytest.raises(IngestionStoreError, match="INTERNAL_API_TOKEN"):
        get_items("a" * 64)


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"error": "database offline"}, "database offline"),
        (ValueError("invalid json"), "error"),
    ],
)
def test_non_404_store_errors_include_backend_detail(
    monkeypatch: pytest.MonkeyPatch,
    payload: Any,
    expected: str,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(500, payload))

    with pytest.raises(IngestionStoreError, match=expected):
        get_items("a" * 64)


def test_store_rejects_unexpected_success_status(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(200, {}))

    with pytest.raises(IngestionStoreError, match="Unexpected store response"):
        store_ingestion("a" * 64, [], [])


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (ValueError("invalid json"), "invalid JSON"),
        ([], "invalid snapshot"),
        ({"items": {}}, "invalid items"),
    ],
)
def test_snapshot_rejects_invalid_payloads(
    monkeypatch: pytest.MonkeyPatch,
    payload: Any,
    expected: str,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(200, payload))

    operation = get_items_with_status if isinstance(payload, dict) else get_ingestion_snapshot
    with pytest.raises(IngestionStoreError, match=expected):
        operation("a" * 64)


def test_module_list_handles_found_missing_and_invalid_snapshots(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    responses = iter(
        [
            _Response(200, {"modules": [{"id": "MOD-001", "name": "Search"}, "invalid"]}),
            _Response(404),
            _Response(200, {"modules": {}}),
        ]
    )
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: next(responses))

    assert get_module_list("found") == [{"id": "MOD-001", "name": "Search"}]
    assert get_module_list("missing") == []
    with pytest.raises(IngestionStoreError, match="invalid modules"):
        get_module_list("invalid")


@pytest.mark.parametrize(
    ("operation", "payload", "expected"),
    [
        ("claim", ValueError("invalid"), "claim returned invalid JSON"),
        ("claim", [], "claim returned an invalid payload"),
        ("commit", ValueError("invalid"), "commit returned invalid JSON"),
        ("commit", [], "commit returned an invalid payload"),
    ],
)
def test_module_lifecycle_rejects_invalid_responses(
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
    payload: Any,
    expected: str,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(200, payload))

    with pytest.raises(IngestionStoreError, match=expected):
        if operation == "claim":
            claim_module_generation(
                "a" * 64,
                fingerprint="fingerprint",
                algorithm_version="module-v2",
            )
        else:
            commit_module_generation(
                "a" * 64,
                "lease",
                modules=[],
                items=[],
                fingerprint="fingerprint",
                algorithm_version="module-v2",
                coverage={},
                module_status="ready",
            )


def test_claim_reports_unknown_ingestion(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(404))

    with pytest.raises(ValueError, match="No stored ingestion"):
        claim_module_generation(
            "missing",
            fingerprint="fingerprint",
            algorithm_version="module-v2",
        )


def test_failed_generation_is_reported_with_bounded_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    captured: dict[str, Any] = {}

    def request(method: str, url: str, **kwargs: Any) -> _Response:
        captured.update({"method": method, "url": url, **kwargs})
        return _Response(204)

    monkeypatch.setattr(requests, "request", request)

    fail_module_generation("spec/hash", "lease/value", "x" * 1200)

    assert captured["method"] == "POST"
    assert "spec%2Fhash" in captured["url"]
    assert "lease%2Fvalue" in captured["url"]
    assert len(captured["json"]["error"]) == 1000


def test_failed_generation_ignores_missing_lease(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(404))

    fail_module_generation("missing", "expired", "failure")


def test_pending_review_deserializes_items_and_handles_missing_queue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    item = {
        "id": "ITEM-00001",
        "source_chunk_id": "CHUNK-001",
        "heading_path": ["Requirements"],
        "text": "Ambiguous requirement",
    }
    responses = iter([_Response(200, {"items": [item]}), _Response(404)])
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: next(responses))

    assert [value.id for value in get_pending_review("found")] == ["ITEM-00001"]
    assert get_pending_review("missing") == []


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (ValueError("invalid"), "review queue returned invalid JSON"),
        ({"items": {}}, "review queue has invalid items"),
    ],
)
def test_pending_review_rejects_invalid_payloads(
    monkeypatch: pytest.MonkeyPatch,
    payload: Any,
    expected: str,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(200, payload))

    with pytest.raises(IngestionStoreError, match=expected):
        get_pending_review("a" * 64)


def test_review_resolution_deserializes_durable_outcome(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    captured: dict[str, Any] = {}
    payload = {
        "id": "ITEM-00001",
        "source_chunk_id": "CHUNK-001",
        "heading_path": ["Requirements"],
        "text": "Confirmed requirement",
        "role": "REQUIREMENT",
        "role_method": "human",
        "reviewed": True,
        "reviewed_by": "alice",
    }

    def request(method: str, url: str, **kwargs: Any) -> _Response:
        captured.update({"method": method, "url": url, **kwargs})
        return _Response(200, payload)

    monkeypatch.setattr(requests, "request", request)

    item = resolve_review("spec/hash", "ITEM/1", "REQUIREMENT", "alice")

    assert item.role_method == "human"
    assert item.reviewed is True
    assert captured["method"] == "PATCH"
    assert "spec%2Fhash" in captured["url"]
    assert "ITEM%2F1" in captured["url"]
    assert captured["json"] == {"role": "REQUIREMENT", "reviewer": "alice"}


@pytest.mark.parametrize(
    ("status", "payload", "expected"),
    [
        (404, None, "was not found"),
        (200, ValueError("invalid"), "resolution returned invalid JSON"),
        (200, [], "resolution returned an invalid item"),
    ],
)
def test_review_resolution_rejects_missing_or_invalid_outcomes(
    monkeypatch: pytest.MonkeyPatch,
    status: int,
    payload: Any,
    expected: str,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    monkeypatch.setattr(requests, "request", lambda *args, **kwargs: _Response(status, payload))

    error_type = ValueError if status == 404 else IngestionStoreError
    with pytest.raises(error_type, match=expected):
        resolve_review("spec", "item", "REQUIREMENT")
