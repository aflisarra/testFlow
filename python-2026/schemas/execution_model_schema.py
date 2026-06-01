from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

try:  # Pydantic v2
    from pydantic import ConfigDict  # type: ignore

    _MODEL_CONFIG = ConfigDict(populate_by_name=True)
except Exception:  # pragma: no cover
    _MODEL_CONFIG = None


class ExecutionTarget(BaseModel):
    kind: str = Field(default="unknown", description="page, field, button, endpoint, text, url, or unknown")
    name: str = Field(default="", description="Human semantic name, never Selenium-specific")
    role: Optional[str] = Field(default=None, description="button, textbox, link, heading, api, etc.")
    url: Optional[str] = Field(default=None, description="Absolute URL when the step targets a URL")
    path: Optional[str] = Field(default=None, description="Relative API or route path")
    method: Optional[str] = Field(default=None, description="HTTP method for API steps")

    if _MODEL_CONFIG is not None:  # type: ignore[truthy-bool]
        model_config = _MODEL_CONFIG  # type: ignore[misc]
    else:  # pragma: no cover
        class Config:
            allow_population_by_field_name = True


class ExecutionValue(BaseModel):
    source: str = Field(default="none", description="none, literal, credential, context, generated")
    key: Optional[str] = Field(default=None, description="email, username, password, apiToken, baseUrl, etc.")
    text: Optional[str] = Field(default=None, description="Literal value when safe to expose")

    if _MODEL_CONFIG is not None:  # type: ignore[truthy-bool]
        model_config = _MODEL_CONFIG  # type: ignore[misc]
    else:  # pragma: no cover
        class Config:
            allow_population_by_field_name = True


class ExecutionAssertion(BaseModel):
    kind: str = Field(default="none", description="none, url_contains, visible, text_contains, status_code, redirected")
    expected: Optional[Any] = Field(default=None)

    if _MODEL_CONFIG is not None:  # type: ignore[truthy-bool]
        model_config = _MODEL_CONFIG  # type: ignore[misc]
    else:  # pragma: no cover
        class Config:
            allow_population_by_field_name = True


class ExecutionStep(BaseModel):
    id: str
    raw: str
    channel: str = Field(default="ui", description="ui, api, assertion, data, or unknown")
    action: str = Field(default="unknown")
    target: ExecutionTarget = Field(default_factory=ExecutionTarget)
    value: Optional[ExecutionValue] = None
    assertion: Optional[ExecutionAssertion] = None
    requires: List[str] = Field(default_factory=list)

    if _MODEL_CONFIG is not None:  # type: ignore[truthy-bool]
        model_config = _MODEL_CONFIG  # type: ignore[misc]
    else:  # pragma: no cover
        class Config:
            allow_population_by_field_name = True


class ExecutionModel(BaseModel):
    version: str = Field(default="execution-model/v1")
    source: Dict[str, Any] = Field(default_factory=dict)
    preconditions: List[str] = Field(default_factory=list)
    steps: List[ExecutionStep] = Field(default_factory=list)
    expected_result: str = Field(default="")
    confidence: str = Field(default="medium")

    if _MODEL_CONFIG is not None:  # type: ignore[truthy-bool]
        model_config = _MODEL_CONFIG  # type: ignore[misc]
    else:  # pragma: no cover
        class Config:
            allow_population_by_field_name = True


class TranslateTestCaseRequest(BaseModel):
    test_case_id: Optional[str] = Field(default=None, alias="testCaseId")
    title: Optional[str] = Field(default=None)
    steps: List[str] = Field(default_factory=list)
    expected_result: Optional[str] = Field(default=None, alias="expectedResult")
    context: Dict[str, Any] = Field(default_factory=dict)

    if _MODEL_CONFIG is not None:  # type: ignore[truthy-bool]
        model_config = _MODEL_CONFIG  # type: ignore[misc]
    else:  # pragma: no cover
        class Config:
            allow_population_by_field_name = True


class TranslateTestCaseResponse(BaseModel):
    execution_model: ExecutionModel = Field(alias="executionModel")

    if _MODEL_CONFIG is not None:  # type: ignore[truthy-bool]
        model_config = _MODEL_CONFIG  # type: ignore[misc]
    else:  # pragma: no cover
        class Config:
            allow_population_by_field_name = True
