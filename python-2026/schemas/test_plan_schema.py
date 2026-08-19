from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GeneratePlanRequest(BaseModel):
    """
    Keep backward compatibility with the existing Node.js backend payload.
    """

    spec_text: str = Field(..., description="Text extracted from the Word document")
    style_config: str | None = Field(default=None, description="UI style config (colors, shapes, fonts...)")
    project_title: str | None = Field(default=None, description="Optional project name/title (context only)")
    project_id: str | None = Field(default=None, description="Optional project id (context only)")
    test_suite_id: str | None = Field(default=None, description="Optional test suite id used for cancellation scope")
    spec_hash: str | None = Field(default=None, description="Uploaded specification hash")
    generation_scope: str | None = Field(default="plans", description="Optional generation scope for cancellation")
    generation_request_id: str | None = Field(default=None, description="Optional generation request id used for cancellation")
    module_mode: Literal["ensure", "regenerate"] = Field(
        default="ensure",
        description="Reuse current modules or explicitly generate a new module version",
    )


class Requirement(BaseModel):
    id: str = ""
    title: str = ""
    description: str = ""
    source: str = ""
    priority: str = ""


class TestPlan(BaseModel):
    id: str
    title: str
    description: str
    objective: str = ""
    scope: str = ""
    priority: str = "Medium"
    module: str | None = None
    module_id: str | None = None
    plan_kind: str = "functional"
    coverage_status: str = "ready"
    requirements: list[Requirement] = Field(default_factory=list)
    evidence: list[dict[str, str]] = Field(default_factory=list)
    

class GeneratePlanResponse(BaseModel):
    test_plans: list[TestPlan]
    pending_review_count: int = 0
    modules: list[dict[str, Any]] = Field(default_factory=list)
    module_status: str = "pending"
    module_version: int = 0
    module_coverage: dict[str, Any] = Field(default_factory=dict)
    skipped_modules: list[dict[str, str]] = Field(default_factory=list)
