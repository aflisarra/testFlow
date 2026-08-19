"""
AI Detector & Fix Router
========================
Analyzes failed test executions and provides failure diagnostics and fix recommendations.

Endpoints:
- POST /ai/detect-failure  → Analyze a failed test and provide insights
"""

import json
import logging
import re
from typing import Any

from fastapi import APIRouter, HTTPException
from prompts.ai_detector_fix_prompt import build_ai_detector_fix_prompt
from pydantic import BaseModel
from services.ai_service import get_ai_service
from utils.logger import log_error, log_event

router = APIRouter()
logger = logging.getLogger("routers.ai_fix")


def _compact(value: Any, limit: int = 500) -> str:
    """Serialize log values safely before using them in an AI fallback."""
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = str(value)
    return text[:limit]


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
            "whatHappened": str(item.get("whatHappened") or ""),
            "example": str(item.get("example") or ""),
            "fix": str(item.get("fix") or item.get("actionText") or item.get("recommendation") or ""),
        })

    if normalized:
        return normalized

    return [{
        "error": str(analysis.get("description") or "Failure detected"),
        "rootCause": str(analysis.get("rootCause") or "unknown"),
        "whatHappened": "",
        "example": "",
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


# ---------------------------------------------------------------------------
# Rule-based fallback (used only when the AI model times out or errors out)
# ---------------------------------------------------------------------------

# Matches any log line that looks like a failure worth surfacing to the user.
_ERROR_LOG_PATTERN = re.compile(
    r"\b(fail|error|warn|assert|exception|timeout|not available|not found)\b",
    re.IGNORECASE,
)

# Ordered list of (pattern, rootCause, fix). First match wins for a given line.
_RULES: list[tuple[re.Pattern, str, str]] = [
    (
        re.compile(r"username.*not available|not available.*username", re.IGNORECASE),
        "data_mismatch",
        "Generate a unique username or pick one of the suggested available usernames, then submit the form again.",
    ),
    (
        re.compile(r"country|region|dropdown", re.IGNORECASE),
        "ai_logic_error",
        "Click the Country/Region dropdown trigger, type the target value in the filter if one appears, then click the exact visible option before submitting.",
    ),
    (
        re.compile(r"not interactable|click intercepted|element.*blocked|element.*covered", re.IGNORECASE),
        "element_not_interactable",
        "Add an explicit wait until the element is visible and clickable, scroll it into view, then retry the click.",
    ),
    (
        re.compile(r"no such element|unable to locate|selector.*not found|not found", re.IGNORECASE),
        "selector_not_found",
        "The selector used by the AI action is likely stale. Refresh the DOM capture just before the action and prefer data-testid/aria-label selectors.",
    ),
    (
        re.compile(r"timeout|timed out|awaiting", re.IGNORECASE),
        "timing_timeout",
        "Replace the fixed delay with an explicit WebDriverWait for this action and wait for the page/network to settle before proceeding.",
    ),
    (
        re.compile(r"assert|expected .* actual|expected success|not detected", re.IGNORECASE),
        "assertion_failed",
        "Compare the actual page/DOM state to the expected result and adjust the assertion target or wait for the real success indicator.",
    ),
    (
        re.compile(r"\b5\d\d\b|server error|internal error|application error", re.IGNORECASE),
        "application_error",
        "This looks like a backend/application error rather than a UI/selector issue — check server-side logs for this request.",
    ),
]


def _categorize(message: str) -> tuple[str, str]:
    """Return (rootCause, fix) for a single failure log line."""
    for pattern, root_cause, fix in _RULES:
        if pattern.search(message):
            return root_cause, fix
    return "unknown", "Review this log entry manually — no known failure pattern matched it."


def _extract_failure_lines(payload: dict[str, Any]) -> list[str]:
    """
    Pull every distinct FAIL/ERROR/WARN/exception/timeout line out of the logs,
    instead of only keeping the first one that matches a keyword.
    """
    logs = payload.get("logs") or []
    lines: list[str] = []

    for item in logs:
        text = _compact(item, 500)
        if _ERROR_LOG_PATTERN.search(text):
            lines.append(text)

    err_msg = str(payload.get("error_message") or "").strip()
    if err_msg and err_msg not in lines:
        lines.insert(0, err_msg)

    # Deduplicate while preserving order (case-insensitive)
    seen: set[str] = set()
    unique_lines: list[str] = []
    for line in lines:
        key = line.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        unique_lines.append(line)

    return unique_lines[:8]  # cap so the UI doesn't get flooded


def _fallback_analysis(payload: dict[str, Any], reason: str = "") -> dict[str, Any]:
    failed_step = payload.get("failed_step") or {}
    step_index = int(payload.get("step_index") or 0)
    failed_step_name = str(failed_step.get("name") or "")

    failure_lines = _extract_failure_lines(payload) or [
        str(payload.get("error_message") or "Unknown failure")
    ]

    recommendations: list[dict[str, str]] = []
    for line in failure_lines:
        root_cause, fix = _categorize(line)
        recommendations.append({"error": line, "rootCause": root_cause, "fix": fix})

    top = recommendations[0]

    tips = [
        "Keep only failure logs in the analysis payload to speed up AI analysis.",
        "Check Ollama availability and model load time.",
    ]
    if reason:
        tips.append(f"AI fallback reason: {reason}")

    return {
    "title": "AI analysis unavailable — rule-based diagnosis used",

    "description": top["error"],

    "summary": top["error"],

    "whatHappened":
        f"The test failed during step {step_index}.",

    "expectedBehavior":
        "The step should have completed successfully.",

    "actualBehavior":
        top["error"],

    "whyItFailed":
        top["fix"],

    "example":
        failure_lines[0] if failure_lines else "",

    "severity":
        "Medium",

    "rootCause":
        top["rootCause"],

    "confidence":
        0.6,

    "failedStepIndex":
        step_index,

    "failedStepName":
        failed_step_name,

    "aiActionSummary":
        "Fallback analysis generated from logs because the model did not answer in time.",

    "developerFix": [
        top["fix"]
    ],

    "testerFix": [
        "Review the test step and assertion."
    ],

    "timeline": [],

    "actionLabel":
        "Recommended Fix",

    "actionText":
        top["fix"],

    "recommendations":
        recommendations,

    "diagnosticTips":
        tips[:3],

    "suggestedSelectors":
        []
    }


class FailureDetectionPayload(BaseModel):
    """Payload for failure detection request"""
    failed_step: dict[str, Any] | None = None
    failedStep: dict[str, Any] | None = None
    logs: list[Any] | None = None
    ai_actions: list[Any] | None = None
    aiActions: list[Any] | None = None
    test_case: dict[str, Any] | None = None
    testCase: dict[str, Any] | None = None
    error_message: str | None = None
    errorMessage: str | None = None
    error_type: str | None = None
    errorType: str | None = None
    step_index: int | None = None
    stepIndex: int | None = None
    dom_state: dict[str, Any] | None = None
    domState: dict[str, Any] | None = None
    screenshot_url: str | None = None
    screenshotUrl: str | None = None
    execution_id: str | None = None
    executionId: str | None = None


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
                timeout=60,
                max_tokens=3000,  # failure JSON has many fields; 1500 default truncates it
            )
            # Guard: LLM occasionally returns a JSON array instead of an object.
            # Extract the first dict element, or fall back to rule-based analysis.
            if isinstance(analysis, list):
                analysis = next((item for item in analysis if isinstance(item, dict)), None)
                if analysis is None:
                    analysis = _fallback_analysis(normalized_payload, "AI returned a list with no dict elements")
        except Exception as exc:
            error_msg = str(exc)
            log_error(
                logger,
                "failure_detection_ai_fallback",
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
        raw_step_index = analysis.get("failedStepIndex", normalized_payload["step_index"])
        try:
            failed_step_index = int(raw_step_index)
        except (TypeError, ValueError):
            failed_step_index = int(normalized_payload["step_index"] or 0)

        result = {
    # Main analysis
    "title": analysis.get(
        "title",
        "Test Failure Detected"
    ),

    "description": analysis.get(
        "description",
        "Unable to determine failure cause"
    ),

    "summary": analysis.get(
        "summary",
        ""
    ),

    "whatHappened": analysis.get(
        "whatHappened",
        ""
    ),

    "example": analysis.get(
        "example",
        ""
    ),

    "expectedBehavior": analysis.get(
        "expectedBehavior",
        ""
    ),

    "actualBehavior": analysis.get(
        "actualBehavior",
        ""
    ),

    "whyItFailed": analysis.get(
        "whyItFailed",
        ""
    ),

    "severity": analysis.get(
        "severity",
        "Medium"
    ),

    # Root cause
    "rootCause": analysis.get(
        "rootCause",
        "unknown"
    ),

    "confidence": float(
        analysis.get("confidence", 0.0)
    ),

    # Step information
    "failedStepIndex": failed_step_index,

    "failedStepName": analysis.get(
        "failedStepName",
        ""
    ),

    # AI actions
    "aiActionSummary": analysis.get(
        "aiActionSummary",
        ""
    ),

    # Timeline
    "timeline": _as_list(
        analysis.get("timeline")
    ),

    "evidence": _as_list(
    analysis.get("evidence")
    ),

    # Fixes
    "developerFix": _as_list(
        analysis.get("developerFix")
    ),

    "testerFix": _as_list(
        analysis.get("testerFix")
    ),

    "actionLabel": analysis.get(
        "actionLabel",
        "Recommended Fix"
    ),

    "actionText": analysis.get(
        "actionText",
        "Review logs and adjust selectors or timing"
    ),

    # Recommendations
    "recommendations": _normalize_recommendations(
        analysis
    ),

    # Debugging help
    "diagnosticTips": _as_list(
        analysis.get("diagnosticTips")
    ),


    "suggestedSelectors": _as_list(
        analysis.get("suggestedSelectors")
    ),
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
            detail=f"Could not generate fix suggestion: {exc!s}"
        )
