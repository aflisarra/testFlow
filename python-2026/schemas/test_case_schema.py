from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

try:  # Pydantic v2
    from pydantic import ConfigDict  # type: ignore

    _MODEL_CONFIG = ConfigDict(populate_by_name=True)
except Exception:  # pragma: no cover
    _MODEL_CONFIG = None


class GenerateTestCasesRequest(BaseModel):
    """
    Keep backward compatibility with existing payload keys.

    Some Node clients may send camelCase; accept both.
    """

    plan_id: str = Field(..., alias="planId", description="ID of the confirmed plan (e.g. TP-1)")
    plan_title: str = Field(..., alias="planTitle", description="Title of the confirmed plan")
    plan_description: str = Field(..., alias="planDescription", description="Description of the confirmed plan")
    spec_text: str = Field(..., alias="specText", description="Original spec text")
    style_config: Optional[str] = Field(default=None, alias="styleConfig", description="UI style config")
    project_title: Optional[str] = Field(default=None, alias="projectTitle", description="Optional project name/title (context only)")
    project_id: Optional[str] = Field(default=None, alias="projectId", description="Optional project id (context only)")

    # Pydantic v2 uses `model_config`; v1 uses inner `Config`.
    if _MODEL_CONFIG is not None:  # type: ignore[truthy-bool]
        model_config = _MODEL_CONFIG  # type: ignore[misc]
    else:  # pragma: no cover
        class Config:
            allow_population_by_field_name = True


class TestCase(BaseModel):
    id: str
    title: str
    steps: List[str]
    expected_result: str
    priority: str
    type: str


class TestCasesResponse(BaseModel):
    plan_id: str
    plan_title: str
    test_cases: List[TestCase]
