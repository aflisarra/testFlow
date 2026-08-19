from __future__ import annotations

from core.config import get_settings
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    settings = get_settings()
    return {"status": "ok", "model": settings.model_name, "mock_mode": settings.use_mock}

