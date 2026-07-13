"""
AI Detector & Fix Router
========================
Analyzes failed test executions and provides failure diagnostics and fix recommendations.

Endpoints:
- POST /ai/detect-failure  → Analyze a failed test and provide insights
"""

import logging
from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from prompts.ai_detector_fix_prompt import build_ai_detector_fix_prompt
from services.ai_service import get_ai_service
from utils.logger import log_event, log_error


router = APIRouter()
logger = logging.getLogger("routers.ai_fix")


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _normalize_recommendations(analysis: dict[str, Any]) -> list[dict[str, str]]:
    recommendations = _as_list(analysis.get("recommendations"))
    normalized: list[dict[str, str]] = []

    for item in recommendations:
        if not isinstance(item, dict):
            continue
        normalized.append({
            "error": str(item.get("error") or item.get("title") or "Failure detected"),
            "rootCause": str(item.get("rootCause") or analysis.get("rootCause") or "unknown"),
            "fix": str(item.get("fix") or item.get("actionText") or item.get("recommendation") or ""),
        })

    if normalized:
        return normalized

    return [{
        "error": str(analysis.get("description") or "Failure detected"),
        "rootCause": str(analysis.get("rootCause") or "unknown"),
        "fix": str(analysis.get("actionText") or "Review logs and adjust selectors or timing"),
    }]


def _combined_text(payload: dict[str, Any]) -> str:
    parts = [
        payload.get("error_message") or "",
        payload.get("failed_step") or {},
        payload.get("logs") or [],
        payload.get("ai_actions") or [],
    ]
    try:
        return " ".join(str(part) for part in parts)
    except Exception:
        return str(parts)


def _fallback_analysis(payload: dict[str, Any], reason: str = "") -> dict[str, Any]:
    text = _combined_text(payload).lower()
    failed_step = payload.get("failed_step") or {}
    step_index = int(payload.get("step_index") or 0)
    failed_step_name = str(failed_step.get("name") or "")

    if "username" in text and "not available" in text:
        title = "Registration blocked by username"
        description = "The final assertion expected a successful registration, but the page reports that the username is not available."
        root = "data_mismatch"
        fix = "Generate a unique username or use one of the suggested available usernames, then submit the form again."
        tips = ["Check username availability before clicking Create account.", "Keep the selected country value, then retry with a unique username."]
    elif "country" in text or "region" in text or "dropdown" in text:
        title = "Country dropdown needs specific action"
        description = "The failure context points to the Country/Region dropdown, so the test should target its trigger and the Tunisia option explicitly."
        root = "ai_logic_error"
        fix = "Click the Country/Region dropdown trigger, type Tunisia in the filter if present, and click the visible Tunisia option before submitting."
        tips = ["Avoid Copilot and submit selectors during dropdown steps.", "Verify the dropdown value is Tunisia before Create account."]
    elif "expected success" in text or "failed_assertion" in text or "not detected" in text:
        title = "Expected success was not reached"
        description = "The execution completed the UI actions, but the expected success or redirect was not detected."
        root = "assertion_failed"
        fix = "Compare the expected result with the actual page state and fix the blocking validation message or adjust the assertion target."
        tips = ["Inspect actualResult for validation messages.", "Confirm the expected success condition is realistic for this test data."]
    else:
        title = "Failure analysis timed out"
        description = "The AI model timed out before producing a detailed diagnosis."
        root = "unknown"
        fix = "Review the failed step logs and retry AI analysis with a smaller log payload."
        tips = ["Keep only failure logs in the analysis payload.", "Check Ollama availability and model load time."]

    if reason:
        tips.append(f"AI fallback reason: {reason}")

    return {
        "title": title,
        "description": description,
        "rootCause": root,
        "confidence": 0.72,
        "failedStepIndex": step_index,
        "failedStepName": failed_step_name,
        "aiActionSummary": "Fallback analysis generated from logs because the model did not answer in time.",
        "actionLabel": "Recommended Fix",
        "actionText": fix,
        "recommendations": [{"error": description, "rootCause": root, "fix": fix}],
        "diagnosticTips": tips[:3],
        "suggestedSelectors": [],
    }


class FailureDetectionPayload(BaseModel):
    """Payload for failure detection request"""
    failed_step: Optional[dict[str, Any]] = None
    failedStep: Optional[dict[str, Any]] = None
    logs: Optional[list[Any]] = None
    ai_actions: Optional[list[Any]] = None
    aiActions: Optional[list[Any]] = None
    test_case: Optional[dict[str, Any]] = None
    testCase: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    errorMessage: Optional[str] = None
    error_type: Optional[str] = None
    errorType: Optional[str] = None
    step_index: Optional[int] = None
    stepIndex: Optional[int] = None
    dom_state: Optional[dict[str, Any]] = None
    domState: Optional[dict[str, Any]] = None
    screenshot_url: Optional[str] = None
    screenshotUrl: Optional[str] = None
    execution_id: Optional[str] = None
    executionId: Optional[str] = None


@router.post("/ai/detect-failure")
async def detect_failure(payload: FailureDetectionPayload) -> dict[str, Any]:
    """
    Analyze a failed test execution and provide failure diagnostics and fix recommendations.
    
    Args:
        payload: FailureDetectionPayload containing:
            - failed_step: Details of the step that failed
            - logs: Execution logs
            - ai_actions: AI decisions/actions taken
            - test_case: Test case definition
            - error_message: Error message from execution
            - error_type: Type of error (timeout, assertion, etc.)
            - step_index: Index of the failed step
            - dom_state: DOM state at time of failure
            - screenshot_url: URL to screenshot of failure
            - execution_id: ID of the execution (for tracking)
    
    Returns:
        dict with AI analysis:
            - title: Brief summary of failure
            - description: Explanation of why test failed
            - rootCause: Category of root cause
            - confidence: Confidence level (0-1)
            - actionText: Recommended fix
            - diagnosticTips: Debugging tips
            - suggestedSelectors: Alternative selectors to try
    
    Raises:
        HTTPException: If analysis fails or required fields missing
    """
    try:
        # Normalize payload keys (support both snake_case and camelCase)
        normalized_payload = {
            "failed_step": payload.failed_step or payload.failedStep or {},
            "logs": payload.logs or [],
            "ai_actions": payload.ai_actions or payload.aiActions or [],
            "test_case": payload.test_case or payload.testCase or {},
            "error_message": payload.error_message or payload.errorMessage or "",
            "error_type": payload.error_type or payload.errorType or "",
            "step_index": payload.step_index or payload.stepIndex or 0,
            "dom_state": payload.dom_state or payload.domState or {},
            "screenshot_url": payload.screenshot_url or payload.screenshotUrl or "",
        }

        execution_id = payload.execution_id or payload.executionId or "unknown"

        # Validate minimum required context
        if not normalized_payload["failed_step"] and not normalized_payload["logs"]:
            raise HTTPException(
                status_code=400,
                detail="Either failed_step or logs must be provided"
            )

        log_event(
            logger,
            "failure_detection_started",
            execution_id=execution_id,
            has_failed_step=bool(normalized_payload["failed_step"]),
            log_count=len(normalized_payload["logs"]),
            has_ai_actions=bool(normalized_payload["ai_actions"]),
        )

        # Build prompt for AI analysis
        prompt = build_ai_detector_fix_prompt(normalized_payload)

        logger.debug(f"📋 Prompt length: {len(prompt)} chars")
        logger.info(f"🔍 Analyzing failure for execution: {execution_id}")

        # Call AI service
        ai_service = get_ai_service()

        try:
            analysis = ai_service.generate_json(
                prompt=prompt,
                timeout=60
            )
        except Exception as exc:
            error_msg = str(exc)
            if "timed out" not in error_msg.lower() and "timeout" not in error_msg.lower():
                raise
            log_error(
                logger,
                "failure_detection_ai_timeout_fallback",
                error=error_msg,
                execution_id=execution_id,
                prompt_chars=len(prompt),
            )
            analysis = _fallback_analysis(normalized_payload, error_msg)

        log_event(
            logger,
            "failure_detection_success",
            execution_id=execution_id,
            root_cause=analysis.get("rootCause", "unknown"),
            confidence=analysis.get("confidence", 0),
        )

        # Ensure all required fields are present
        result = {
            "title": analysis.get("title", "Test Failure Detected"),
            "description": analysis.get("description", "Unable to determine failure cause"),
            "rootCause": analysis.get("rootCause", "unknown"),
            "confidence": float(analysis.get("confidence", 0.0)),
            "failedStepIndex": int(analysis.get("failedStepIndex", 0)),
            "failedStepName": analysis.get("failedStepName", ""),
            "aiActionSummary": analysis.get("aiActionSummary", ""),
            "actionLabel": analysis.get("actionLabel", "Recommended Fix"),
            "actionText": analysis.get("actionText", "Review logs and adjust selectors or timing"),
            "recommendations": _normalize_recommendations(analysis),
            "diagnosticTips": _as_list(analysis.get("diagnosticTips")),
            "suggestedSelectors": _as_list(analysis.get("suggestedSelectors")),
        }

        logger.info(f"✅ Analysis complete for execution {execution_id}")

        return result

    except HTTPException:
        raise
    except Exception as exc:
        error_msg = str(exc)
        execution_id = payload.execution_id or payload.executionId or "unknown"
        
        log_error(
            logger,
            "failure_detection_error",
            error=error_msg,
            execution_id=execution_id,
        )
        
        raise HTTPException(
            status_code=500,
            detail=f"Failure detection analysis failed: {error_msg}"
        )


@router.post("/ai/get-fix-suggestion")
async def get_fix_suggestion(payload: FailureDetectionPayload) -> dict[str, Any]:
    """
    Simplified endpoint to get just the fix suggestion for a failure.
    
    Returns a simplified response focused on actionable fixes.
    """
    try:
        # Call the main detection endpoint
        full_analysis = await detect_failure(payload)
        
        # Return simplified response
        return {
            "actionText": full_analysis.get("actionText", ""),
            "actionLabel": full_analysis.get("actionLabel", "Recommended Fix"),
            "recommendations": full_analysis.get("recommendations", []),
            "diagnosticTips": full_analysis.get("diagnosticTips", []),
            "suggestedSelectors": full_analysis.get("suggestedSelectors", []),
            "rootCause": full_analysis.get("rootCause", "unknown"),
            "confidence": full_analysis.get("confidence", 0),
        }
    except HTTPException:
        raise
    except Exception as exc:
        log_error(logger, "fix_suggestion_error", error=str(exc))
        raise HTTPException(
            status_code=500,
            detail=f"Could not generate fix suggestion: {str(exc)}"
        )
