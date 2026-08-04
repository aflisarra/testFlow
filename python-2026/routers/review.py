"""Endpoints for human resolution of UNTAGGED ingestion items (Phase 5a)."""

from __future__ import annotations

import secrets
from dataclasses import asdict

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from core.config import get_settings
from services.ingestion.review_queue import get_pending_review, resolve_review


router = APIRouter()


def _require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Keep the former FastAPI review facade worker-only after Node R2."""
    expected = get_settings().internal_api_token
    if not expected or not x_internal_token or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


class ReviewResolution(BaseModel):
    role: str = Field(..., description="Human-confirmed role label")
    reviewer: str | None = Field(default=None, description="Optional reviewer identity")


def _review_item(item: object) -> dict:
    data = asdict(item)
    return {
        "item_id": data["id"],
        "text": data["text"],
        "heading_path": data["heading_path"],
        "nearest_heading": data["heading_path"][-1] if data["heading_path"] else None,
        "suggested_role": data["suggested_role"],
    }


@router.get("/review-queue/{spec_hash}")
def review_queue(spec_hash: str, _: str | None = Header(default=None, alias="X-Internal-Token")) -> list[dict]:
    _require_internal_token(_)
    return [_review_item(item) for item in get_pending_review(spec_hash)]


@router.post("/review-queue/{spec_hash}/{item_id}")
def resolve_review_item(
    spec_hash: str,
    item_id: str,
    payload: ReviewResolution,
    _: str | None = Header(default=None, alias="X-Internal-Token"),
) -> dict:
    _require_internal_token(_)
    try:
        return asdict(resolve_review(spec_hash, item_id, payload.role, payload.reviewer))
    except ValueError as exc:
        message = str(exc)
        status_code = 404 if "was not found" in message else 422
        raise HTTPException(status_code=status_code, detail=message) from exc
