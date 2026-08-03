from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class GeneratePlanRequest(BaseModel):
    """
    Keep backward compatibility with the existing Node.js backend payload.
    """

    spec_text: str = Field(..., description="Text extracted from the Word document")
    style_config: Optional[str] = Field(default=None, description="UI style config (colors, shapes, fonts...)")
    project_title: Optional[str] = Field(default=None, description="Optional project name/title (context only)")
    project_id: Optional[str] = Field(default=None, description="Optional project id (context only)")
    test_suite_id: Optional[str] = Field(default=None, description="Optional test suite id used for cancellation scope")
    spec_hash: Optional[str] = Field(default=None, description="Uploaded specification hash")
    generation_scope: Optional[str] = Field(default="plans", description="Optional generation scope for cancellation")
    generation_request_id: Optional[str] = Field(default=None, description="Optional generation request id used for cancellation")


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
    module: Optional[str] = None
    requirements: List[Requirement] = Field(default_factory=list)
    

class GeneratePlanResponse(BaseModel):
    test_plans: List[TestPlan]
    pending_review_count: int = 0
