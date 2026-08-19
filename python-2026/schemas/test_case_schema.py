from __future__ import annotations

from typing import Any

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
    plan_module: str | None = Field(default=None, alias="planModule", description="Spec-local module assigned to the plan")
    plan_module_id: str | None = Field(default=None, alias="planModuleId", description="Stable spec-local module ID assigned to the plan")
    spec_text: str = Field(..., alias="specText", description="Original spec text")
    spec_hash: str | None = Field(default=None, alias="specHash", description="Uploaded specification hash")
    style_config: str | None = Field(default=None, alias="styleConfig", description="UI style config")
    project_title: str | None = Field(default=None, alias="projectTitle", description="Optional project name/title (context only)")
    project_id: str | None = Field(default=None, alias="projectId", description="Optional project id (context only)")
    test_suite_id: str | None = Field(default=None, alias="testSuiteId", description="Optional test suite id used for cancellation scope")
    generation_scope: str | None = Field(default="cases", alias="generationScope", description="Optional generation scope for cancellation")
    generation_request_id: str | None = Field(default=None, alias="generationRequestId", description="Optional generation request id used for cancellation")

    # Pydantic v2 uses `model_config`; v1 uses inner `Config`.
    if _MODEL_CONFIG is not None:  # type: ignore[truthy-bool]
        model_config = _MODEL_CONFIG  # type: ignore[misc]
    else:  # pragma: no cover
        class Config:
            allow_population_by_field_name = True


class Requirement(BaseModel):
    id: str = ""
    title: str = ""
    description: str = ""
    source: str = ""
    priority: str = ""


class StepDetail(BaseModel):
    step: str
    expected_result: str


class TestCase(BaseModel):
    id: str
    title: str
    objective: str = ""
    preconditions: list[str] = Field(default_factory=list)
    test_data: Any = None
    steps: list[str]

    # ✅ AJOUT CRITIQUE
    stepDetails: list[StepDetail] = Field(default_factory=list)

    expected_result: str
    priority: str
    severity: str = "Major"
    type: str
    requirements: list[Requirement] = Field(default_factory=list)


class TestCasesResponse(BaseModel):
    plan_id: str
    plan_title: str
    test_cases: list[TestCase]
    pending_review_count: int = 0
