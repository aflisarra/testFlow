from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.cancellation_service import request_cancel


router = APIRouter()


class CancelGenerationRequest(BaseModel):
    test_suite_id: Optional[str] = Field(default=None, alias="testSuiteId")
    plan_id: Optional[str] = Field(default=None, alias="planId")
    scope: Optional[str] = Field(default="all")
    request_id: Optional[str] = Field(default=None, alias="requestId")


@router.post("/cancel-generation")
def cancel_generation(payload: CancelGenerationRequest):
    data = request_cancel(
        test_suite_id=payload.test_suite_id,
        plan_id=payload.plan_id,
        scope=payload.scope,
        request_id=payload.request_id,
    )
    return {"message": "Cancellation requested.", **data}
