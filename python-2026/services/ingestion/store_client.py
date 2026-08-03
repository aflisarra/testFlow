"""Synchronous FastAPI client for Node-owned spec-ingestion persistence."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import requests

from core.config import get_settings
from services.ingestion.items import Item


class IngestionStoreError(RuntimeError):
    """The Node/Mongo ingestion store could not satisfy a request."""


def _base_url() -> str:
    settings = get_settings()
    if not settings.internal_api_token:
        raise IngestionStoreError("INTERNAL_API_TOKEN (or FASTAPI_SECRET) must be configured")
    return f"{settings.backend_api_base_url}/api/internal/spec-ingestions"


def _headers() -> dict[str, str]:
    return {"X-Internal-Token": get_settings().internal_api_token}


def _request(method: str, path: str, **kwargs: Any) -> requests.Response:
    try:
        response = requests.request(method, f"{_base_url()}{path}", headers=_headers(), timeout=20, **kwargs)
    except requests.RequestException as exc:
        raise IngestionStoreError(f"Node ingestion store request failed: {exc}") from exc
    if response.status_code >= 400 and response.status_code != 404:
        try:
            detail = response.json().get("error")
        except ValueError:
            detail = response.text
        raise IngestionStoreError(f"Node ingestion store returned {response.status_code}: {detail}")
    return response


def _serialize_item(item: Item) -> dict[str, Any]:
    return {
        "id": item.id,
        "source_chunk_id": item.source_chunk_id,
        "heading_path": item.heading_path,
        "text": item.text,
        "role": item.role,
        "role_method": item.role_method,
        "role_score": item.role_score,
        "module": item.module,
        "module_score": item.module_score,
        "reviewed": item.reviewed,
        "reviewed_by": item.reviewed_by,
        "suggested_role": item.suggested_role,
        "requirement_id": item.requirement_id,
    }


def _deserialize_item(data: dict[str, Any]) -> Item:
    return Item(
        id=str(data["id"]),
        source_chunk_id=str(data["source_chunk_id"]),
        heading_path=[str(value) for value in data.get("heading_path") or []],
        text=str(data["text"]),
        role=str(data.get("role") or "UNTAGGED"),
        module=str(data.get("module") or "UNTAGGED"),
        role_score=data.get("role_score"),
        role_method=str(data.get("role_method") or "none"),  # type: ignore[arg-type]
        reviewed=bool(data.get("reviewed")),
        reviewed_by=data.get("reviewed_by"),
        suggested_role=data.get("suggested_role"),
        requirement_id=data.get("requirement_id"),
        module_score=float(data.get("module_score") or 0.0),
    )


def store_ingestion(spec_hash: str, items: list[Item], modules: list[dict[str, Any]]) -> None:
    response = _request(
        "PUT",
        f"/{quote(spec_hash, safe='')}",
        json={"items": [_serialize_item(item) for item in items], "modules": modules},
    )
    if response.status_code != 204:
        raise IngestionStoreError(f"Unexpected store response: {response.status_code}")


def _get_snapshot(spec_hash: str) -> dict[str, Any] | None:
    response = _request("GET", f"/{quote(spec_hash, safe='')}")
    if response.status_code == 404:
        return None
    try:
        payload = response.json()
    except ValueError as exc:
        raise IngestionStoreError("Node ingestion store returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise IngestionStoreError("Node ingestion store returned an invalid snapshot")
    return payload


def get_items(spec_hash: str) -> list[Item]:
    items, _ = get_items_with_status(spec_hash)
    return items


def get_items_with_status(spec_hash: str) -> tuple[list[Item], bool]:
    """Return persisted items plus whether the hash exists in the store."""
    payload = _get_snapshot(spec_hash)
    if payload is None:
        return [], False
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        raise IngestionStoreError("Node ingestion snapshot has invalid items")
    return [_deserialize_item(item) for item in raw_items if isinstance(item, dict)], True


def get_module_list(spec_hash: str) -> list[dict[str, Any]]:
    payload = _get_snapshot(spec_hash)
    if payload is None:
        return []
    modules = payload.get("modules")
    if not isinstance(modules, list):
        raise IngestionStoreError("Node ingestion snapshot has invalid modules")
    return [dict(module) for module in modules if isinstance(module, dict)]


def get_pending_review(spec_hash: str) -> list[Item]:
    response = _request("GET", f"/{quote(spec_hash, safe='')}/review-queue")
    if response.status_code == 404:
        return []
    try:
        payload = response.json()
    except ValueError as exc:
        raise IngestionStoreError("Node review queue returned invalid JSON") from exc
    raw_items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(raw_items, list):
        raise IngestionStoreError("Node review queue has invalid items")
    return [_deserialize_item(item) for item in raw_items if isinstance(item, dict)]


def resolve_review(spec_hash: str, item_id: str, role: str, reviewer: str | None = None) -> Item:
    response = _request(
        "PATCH",
        f"/{quote(spec_hash, safe='')}/items/{quote(item_id, safe='')}/review",
        json={"role": role, "reviewer": reviewer},
    )
    if response.status_code == 404:
        raise ValueError(f"Item {item_id!r} was not found for spec {spec_hash!r}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise IngestionStoreError("Node review resolution returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise IngestionStoreError("Node review resolution returned an invalid item")
    return _deserialize_item(payload)
