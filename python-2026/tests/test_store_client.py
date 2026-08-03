"""FastAPI adapter tests for the Node-owned ingestion store."""

from typing import Any

import pytest
import requests

from services.ingestion.items import Item
from services.ingestion.store_client import IngestionStoreError, get_items, get_items_with_status, store_ingestion


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
