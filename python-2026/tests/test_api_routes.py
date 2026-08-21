"""Contract tests for the implementation-plan FastAPI routes."""

from __future__ import annotations

import hashlib
import subprocess
from dataclasses import asdict
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import review, test_cases, test_plans
from services.ingestion.items import Item
from services.ingestion.module_orchestration import (
    ModuleGenerationCancelled,
    ModuleGenerationInProgress,
)
from services.ingestion.store_client import IngestionStoreError
from services.plan_service import PlanGenerationResult


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(test_plans.router)
    app.include_router(test_cases.router)
    app.include_router(review.router)
    return TestClient(app)


def _case_request(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "planId": "TP-1",
        "planTitle": "Checkout",
        "planDescription": "Checkout coverage",
        "planModule": "Checkout",
        "planModuleId": "MOD-001",
        "specText": "The system must support checkout.",
        "specHash": "a" * 64,
        "styleConfig": "concise",
        "projectTitle": "Shop",
        "testSuiteId": "suite-1",
        "generationScope": "cases",
        "generationRequestId": "request-1",
    }
    payload.update(overrides)
    return payload


def _generated_case() -> dict[str, Any]:
    return {
        "id": "TC-1.1",
        "title": "Checkout succeeds",
        "objective": "Verify checkout",
        "preconditions": [],
        "test_data": {},
        "steps": ["Submit checkout"],
        "stepDetails": [{"step": "Submit checkout", "expected_result": "Checkout succeeds"}],
        "expected_result": "Checkout succeeds",
        "priority": "High",
        "severity": "Major",
        "type": "Functional",
        "requirements": [],
    }


def _plan_result() -> PlanGenerationResult:
    module = {
        "id": "MOD-001",
        "name": "Checkout",
        "description": "Checkout workflows",
        "kind": "functional",
        "source_item_ids": ["ITEM-00001"],
    }
    plan = {
        "id": "TP-1",
        "title": "Checkout",
        "description": "Checkout coverage",
        "objective": "Verify checkout",
        "scope": "Checkout workflows",
        "priority": "Medium",
        "module": "Checkout",
        "module_id": "MOD-001",
        "plan_kind": "functional",
        "coverage_status": "ready",
        "requirements": [],
        "evidence": [],
    }
    return PlanGenerationResult(
        plans=[plan],
        pending_review_count=2,
        modules=[module],
        module_status="needs_review",
        module_version=3,
        module_coverage={"assigned_item_count": 1},
        skipped_modules=[],
    )


def test_upload_rejects_non_docx_file(client: TestClient) -> None:
    response = client.post("/upload-spec", files={"file": ("spec.txt", b"text", "text/plain")})

    assert response.status_code == 400
    assert response.json() == {"error": "Only .docx files are supported."}


def test_upload_persists_scoped_snapshot_without_generating_modules(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    file_bytes = b"docx bytes"
    captured: dict[str, Any] = {}
    monkeypatch.setattr(test_plans, "extract_spec_text_from_docx_bytes", lambda value: "Spec text")
    monkeypatch.setattr(test_plans, "extract_doc_from_bytes", lambda value: "document")

    def ingest(document: Any, value: bytes, *, storage_hash: str) -> tuple[str, list[Item]]:
        captured.update({"document": document, "bytes": value, "storage_hash": storage_hash})
        return storage_hash, [Item("ITEM-00001", "CHUNK-001", ["Spec"], "Requirement")]

    monkeypatch.setattr(test_plans, "ingest_spec", ingest)

    response = client.post(
        "/upload-spec",
        files={
            "file": (
                "spec.DOCX",
                file_bytes,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"ingestion_scope": "suite-1"},
    )

    source_hash = hashlib.sha256(file_bytes).hexdigest()
    storage_hash = hashlib.sha256(f"{source_hash}:suite-1".encode()).hexdigest()
    assert response.status_code == 200
    assert response.json() == {
        "filename": "spec.DOCX",
        "spec_text": "Spec text",
        "char_count": 9,
        "item_count": 1,
        "spec_hash": storage_hash,
        "source_spec_hash": source_hash,
        "module_status": "pending",
    }
    assert captured == {
        "document": "document",
        "bytes": file_bytes,
        "storage_hash": storage_hash,
    }


def test_upload_rejects_document_without_readable_text(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(test_plans, "extract_spec_text_from_docx_bytes", lambda value: "  ")

    response = client.post("/upload-spec", files={"file": ("spec.docx", b"doc", "text/plain")})

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [
        (IngestionStoreError("store offline"), 503),
        (RuntimeError("extract failed"), 500),
        (OSError("unexpected"), 500),
    ],
)
def test_upload_maps_pipeline_failures(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    expected_status: int,
) -> None:
    monkeypatch.setattr(test_plans, "extract_spec_text_from_docx_bytes", lambda value: "Spec")
    monkeypatch.setattr(test_plans, "extract_doc_from_bytes", lambda value: "document")
    monkeypatch.setattr(
        test_plans,
        "ingest_spec",
        lambda *args, **kwargs: (_ for _ in ()).throw(error),
    )

    response = client.post("/upload-spec", files={"file": ("spec.docx", b"doc", "text/plain")})

    assert response.status_code == expected_status


def test_generate_plan_from_hash_returns_complete_lifecycle_contract(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr(test_plans, "is_cancelled", lambda **kwargs: False)
    monkeypatch.setattr(
        test_plans,
        "generate_test_plans",
        lambda **kwargs: captured.update(kwargs) or _plan_result(),
    )

    response = client.post(
        "/generate-plan",
        data={"spec_hash": "a" * 64, "module_mode": "regenerate"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["pending_review_count"] == 2
    assert body["module_status"] == "needs_review"
    assert body["module_version"] == 3
    assert body["module_coverage"] == {"assigned_item_count": 1}
    assert body["test_plans"][0]["module_id"] == "MOD-001"
    assert captured["spec_hash"] == "a" * 64
    assert captured["module_mode"] == "regenerate"
    assert callable(captured["cancellation_check"])


@pytest.mark.parametrize(
    ("data", "expected_error"),
    [
        ({}, "spec_hash, spec_text, or file is required"),
        ({"spec_text": "   "}, "Document empty"),
    ],
)
def test_generate_plan_validates_specification_input(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    data: dict[str, str],
    expected_error: str,
) -> None:
    monkeypatch.setattr(test_plans, "is_cancelled", lambda **kwargs: False)

    response = client.post("/generate-plan", data=data)

    assert response.status_code in {400, 422}
    assert response.json()["error"] == expected_error


def test_generate_plan_honors_cancellation_before_service_call(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(test_plans, "is_cancelled", lambda **kwargs: True)
    monkeypatch.setattr(
        test_plans,
        "generate_test_plans",
        lambda **kwargs: pytest.fail("Plan service must not run"),
    )

    response = client.post("/generate-plan", data={"spec_hash": "a" * 64})

    assert response.status_code == 409


def test_generate_plan_honors_cancellation_after_processing(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cancellations = iter([False, True])
    monkeypatch.setattr(test_plans, "is_cancelled", lambda **kwargs: next(cancellations))
    monkeypatch.setattr(test_plans, "generate_test_plans", lambda **kwargs: _plan_result())

    response = client.post("/generate-plan", data={"spec_hash": "a" * 64})

    assert response.status_code == 409
    assert "after processing" in response.json()["error"]


@pytest.mark.parametrize(
    ("error", "expected_status", "expected_code"),
    [
        (ModuleGenerationInProgress("busy"), 409, "MODULE_GENERATION_IN_PROGRESS"),
        (ModuleGenerationCancelled("cancelled"), 409, None),
        (IngestionStoreError("offline"), 503, None),
        (ValueError("bad evidence"), 422, None),
        (RuntimeError("dependency failed"), 503, None),
        (OSError("unexpected"), 500, None),
    ],
)
def test_generate_plan_maps_service_failures(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    expected_status: int,
    expected_code: str | None,
) -> None:
    monkeypatch.setattr(test_plans, "is_cancelled", lambda **kwargs: False)
    monkeypatch.setattr(
        test_plans,
        "generate_test_plans",
        lambda **kwargs: (_ for _ in ()).throw(error),
    )

    response = client.post("/generate-plan", data={"spec_hash": "a" * 64})

    assert response.status_code == expected_status
    if expected_code:
        assert response.json()["code"] == expected_code


def test_generate_test_cases_returns_pending_review_count(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cancellations: list[dict[str, Any]] = []
    monkeypatch.setattr(
        test_cases,
        "is_cancelled",
        lambda **kwargs: cancellations.append(kwargs) or False,
    )
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        test_cases,
        "generate_test_cases",
        lambda **kwargs: captured.update(kwargs) or ([_generated_case()], 3),
    )

    response = client.post("/generate-test-cases", json=_case_request())

    assert response.status_code == 200
    assert response.json()["pending_review_count"] == 3
    assert response.json()["test_cases"][0]["id"] == "TC-1.1"
    assert captured["plan_module_id"] == "MOD-001"
    assert len(cancellations) == 2


@pytest.mark.parametrize(
    "override",
    [
        {"planId": " "},
        {"planTitle": " "},
        {"specText": " "},
    ],
)
def test_generate_test_cases_validates_required_text_fields(
    client: TestClient,
    override: dict[str, str],
) -> None:
    response = client.post("/generate-test-cases", json=_case_request(**override))

    assert response.status_code == 400


def test_generate_test_cases_honors_cancellation(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(test_cases, "is_cancelled", lambda **kwargs: True)
    monkeypatch.setattr(
        test_cases,
        "generate_test_cases",
        lambda **kwargs: pytest.fail("Case service must not run"),
    )

    response = client.post("/generate-test-cases", json=_case_request())

    assert response.status_code == 409


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [
        (FileNotFoundError("missing client"), 500),
        (subprocess.TimeoutExpired("client", 1), 504),
        (ValueError("bad JSON"), 502),
        (RuntimeError("AI failed"), 502),
        (OSError("unexpected"), 500),
    ],
)
def test_generate_test_cases_maps_service_failures(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    expected_status: int,
) -> None:
    monkeypatch.setattr(test_cases, "is_cancelled", lambda **kwargs: False)
    monkeypatch.setattr(
        test_cases,
        "generate_test_cases",
        lambda **kwargs: (_ for _ in ()).throw(error),
    )
    monkeypatch.setattr(
        test_cases,
        "get_settings",
        lambda: SimpleNamespace(debug_errors=True),
    )

    response = client.post("/generate-test-cases", json=_case_request())

    assert response.status_code == expected_status
    if isinstance(error, (ValueError, RuntimeError)) or type(error) is OSError:
        assert response.json()["detail"] == str(error)


def test_review_queue_requires_internal_token(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "secret")

    response = client.get("/review-queue/spec-1")

    assert response.status_code == 401


def test_review_queue_returns_heading_context_without_suggestion(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "secret")
    item = Item(
        "ITEM-00001",
        "CHUNK-001",
        ["Requirements", "Checkout"],
        "Ambiguous checkout statement",
    )
    monkeypatch.setattr(review, "get_pending_review", lambda spec_hash: [item])

    response = client.get(
        "/review-queue/spec-1",
        headers={"X-Internal-Token": "secret"},
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "item_id": "ITEM-00001",
            "text": "Ambiguous checkout statement",
            "heading_path": ["Requirements", "Checkout"],
            "nearest_heading": "Checkout",
            "suggested_role": None,
        }
    ]


def test_review_resolution_returns_durable_item(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "secret")
    item = Item(
        "ITEM-00001",
        "CHUNK-001",
        ["Requirements"],
        "Checkout requirement",
        role="REQUIREMENT",
        role_method="human",
        reviewed=True,
        reviewed_by="alice",
    )
    monkeypatch.setattr(review, "resolve_review", lambda *args: item)

    response = client.post(
        "/review-queue/spec-1/ITEM-00001",
        headers={"X-Internal-Token": "secret"},
        json={"role": "REQUIREMENT", "reviewer": "alice"},
    )

    assert response.status_code == 200
    assert response.json() == asdict(item)


@pytest.mark.parametrize(
    ("message", "expected_status"),
    [
        ("Item 'missing' was not found", 404),
        ("Invalid role", 422),
    ],
)
def test_review_resolution_maps_validation_errors(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    message: str,
    expected_status: int,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "secret")
    monkeypatch.setattr(
        review,
        "resolve_review",
        lambda *args: (_ for _ in ()).throw(ValueError(message)),
    )

    response = client.post(
        "/review-queue/spec-1/ITEM-00001",
        headers={"X-Internal-Token": "secret"},
        json={"role": "REQUIREMENT"},
    )

    assert response.status_code == expected_status
    assert response.json()["detail"] == message
