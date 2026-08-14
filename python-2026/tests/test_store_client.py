"""FastAPI adapter tests for the Node-owned ingestion store."""

from typing import Any

import pytest
import requests

from services.ingestion.items import Item
from services.ingestion.store_client import (
    IngestionStoreError,
    claim_module_generation,
    commit_module_generation,
    get_items,
    get_items_with_status,
    store_ingestion,
)


class _Response:
    def __init__(self, status_code: int, payload: Any = None) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = "error"

    def json(self) -> Any:
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
        "ITEM-00042", "CHUNK-007", ["Requirements"], "The player must work offline.",
        role="REQUIREMENT", role_method="human", reviewed=True, reviewed_by="alice", requirement_id="REQ-00042",
    )

    store_ingestion("a" * 64, [item], [])

    assert captured["method"] == "PUT"
    assert captured["json"]["items"][0]["requirement_id"] == "REQ-00042"
    assert captured["json"]["items"][0]["role_method"] == "human"
    assert captured["json"]["items"][0]["reviewed_by"] == "alice"


def test_connection_failure_is_not_treated_as_an_unknown_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")

    def request(*args: Any, **kwargs: Any) -> _Response:
        raise requests.ConnectionError("offline")

    monkeypatch.setattr(requests, "request", request)
    with pytest.raises(IngestionStoreError, match="request failed"):
        get_items("a" * 64)


def test_claim_module_generation_serializes_version_contract(monkeypatch: pytest.MonkeyPatch) -> None:
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


def test_commit_module_generation_sends_module_only_assignments(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-token")
    captured: dict[str, Any] = {}

    def request(method: str, url: str, **kwargs: Any) -> _Response:
        captured.update({"method": method, "url": url, **kwargs})
        return _Response(200, {"module_status": "ready", "module_version": 1})

    monkeypatch.setattr(requests, "request", request)
    item = Item(
        "ITEM-00042", "CHUNK-007", ["Search"], "The system must search tracks.",
        role="REQUIREMENT", role_method="human", reviewed=True, reviewed_by="alice",
        requirement_id="REQ-00042", module="Search", module_ids=["MOD-001"],
        primary_module_id="MOD-001", module_method="source", module_score=1.0,
        module_margin=1.0, module_disposition="assigned",
    )
    modules = [{
        "id": "MOD-001", "name": "Search", "description": "Search workflows.",
        "kind": "functional", "source_item_ids": ["ITEM-00042"],
    }]

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
