"""
AI Detector & Fix Router
========================
Analyzes failed test executions and provides failure diagnostics and fix recommendations.

Endpoints:
- POST /ai/detect-failure  → Analyze a failed test and provide insights
"""

import logging
import json
import re
from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from prompts.ai_detector_fix_prompt import build_ai_detector_fix_prompt
from services.ai_service import get_ai_service
from utils.logger import log_event, log_error


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

    return normalized


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
    return "unknown", "No known failure pattern matched; preserve the captured DOM/action context and retry with fresh verification."


def _extract_failure_lines(payload: dict[str, Any]) -> list[str]:
    """
    Pull every distinct FAIL/ERROR/WARN/exception/timeout line out of the logs,
    instead of only keeping the first one that matches a keyword.
    """
    logs = payload.get("logs") or []
    lines: list[str] = []

    for item in logs:
        text = _compact(item, 500)
        if re.search(r"ASSERTION\s+RESULT\s*=\s*passed", text, re.IGNORECASE):
            continue
        if re.search(r'"nonFailure"\s*:\s*true', text, re.IGNORECASE):
            continue
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


def _dom_evidence(dom_state: dict[str, Any]) -> list[str]:
    """Extract concrete current-DOM evidence before considering generic logs."""
    if not isinstance(dom_state, dict):
        return []

    candidates: list[Any] = []
    for key in (
        "fieldValidationErrors", "field_validation_errors", "validationErrors",
        "validation_errors", "matErrors", "mat_errors", "ariaDescribedBy",
        "aria_described_by", "visibleErrors", "visible_errors", "errorMessage",
        "error_message", "snackbar", "toast", "currentDom", "current_dom",
        "finalDom", "final_dom", "previousDom", "previous_dom",
    ):
        if key in dom_state:
            candidates.append(dom_state[key])

    # Some callers place the live step result under `actual`.
    actual = dom_state.get("actual")
    if isinstance(actual, dict):
        candidates.extend(actual.get(key) for key in (
            "fieldValidationErrors", "field_validation_errors", "validationErrors",
            "validation_errors", "errorMessage", "error_message", "snackbar", "toast",
        ) if key in actual)

    evidence: list[str] = []

    def collect(value: Any, label: str = "DOM") -> None:
        if isinstance(value, dict):
            if "text" in value and value.get("text"):
                collect(value["text"], label)
            elif "message" in value and value.get("message"):
                collect(value["message"], label)
            elif "kind" in value and value.get("text"):
                collect(value["text"], f"{label} {value['kind']}")
            return
        if isinstance(value, (list, tuple, set)):
            for item in value:
                collect(item, label)
            return
        text = str(value or "").strip()
        if text and text not in evidence:
            evidence.append(f"{label}: {text}")

    for candidate in candidates:
        collect(candidate)

    return evidence[:8]


def _dom_change_evidence(dom_state: dict[str, Any]) -> list[str]:
    if not isinstance(dom_state, dict):
        return []
    diff = dom_state.get("domDiff") or dom_state.get("dom_diff") or dom_state.get("domChanges") or dom_state.get("dom_changes")
    if not isinstance(diff, dict):
        return []
    changes: list[str] = []
    for key, label in (("added", "DOM added"), ("removed", "DOM removed"), ("disabledChanges", "DOM state changed")):
        value = diff.get(key)
        if value:
            changes.append(f"{label}: {_compact(value, 500)}")
    if diff.get("urlChanged"):
        changes.append("DOM URL changed after the action")
    return changes[:6]


def _find_step_detail(test_case: dict[str, Any], step_index: int, failed_step_name: str) -> dict[str, Any]:
    """
    Locate the tester-authored details (expected result, per-step test data...)
    for the failed step, so the analysis can quote them instead of only the
    generic step name/index. Tries index first (0-based and 1-based, since
    callers disagree), then falls back to a name match.
    """
    details = test_case.get("stepDetails")
    if not isinstance(details, list):
        return {}

    for candidate_index in (step_index, step_index - 1):
        if 0 <= candidate_index < len(details) and isinstance(details[candidate_index], dict):
            return details[candidate_index]

    name_key = str(failed_step_name or "").strip().lower()
    if name_key:
        for item in details:
            if isinstance(item, dict) and str(item.get("name") or "").strip().lower() == name_key:
                return item

    return {}


def _extract_test_data_preview(test_case: dict[str, Any], limit: int = 6) -> list[str]:
    raw = test_case.get("test_data") or test_case.get("testData") or []
    values: list[str] = []

    def push(item: Any) -> None:
        if item is None:
            return
        if isinstance(item, str):
            for part in item.replace("\r", "\n").split("\n"):
                part = part.strip()
                if part:
                    values.append(part)
            return
        if isinstance(item, dict):
            for value in item.values():
                push(value)
            return
        text = str(item).strip()
        if text:
            values.append(text)

    if isinstance(raw, list):
        for item in raw:
            push(item)
    elif isinstance(raw, dict):
        for item in raw.values():
            push(item)

    return values[:limit]


def _fallback_analysis(payload: dict[str, Any], reason: str = "") -> dict[str, Any]:
    failed_step = payload.get("failed_step") or {}
    step_index = int(payload.get("step_index") or 0)
    failed_step_name = str(failed_step.get("name") or "")
    test_case = payload.get("test_case") or {}
    dom_state = payload.get("dom_state") or {}

    step_detail = _find_step_detail(test_case, step_index, failed_step_name)
    expected_result = str(
        step_detail.get("expectedResult")
        or step_detail.get("expected_result")
        or failed_step.get("expectedResult")
        or failed_step.get("expected_result")
        or ""
    ).strip()
    test_data_preview = _extract_test_data_preview(test_case)
    actual_url = str(dom_state.get("sourceUrl") or dom_state.get("url") or "").strip()

    dom_evidence = _dom_evidence(dom_state)
    dom_changes = _dom_change_evidence(dom_state)
    failure_lines = _extract_failure_lines(payload)
    has_log_evidence = bool(failure_lines)
    if not dom_evidence and not failure_lines:
        failure_lines = [str(payload.get("error_message") or "")]

    primary_evidence = dom_evidence or failure_lines
    primary_text = primary_evidence[0] if primary_evidence else ""
    session_text = " ".join([
        actual_url,
        " ".join(dom_evidence),
        _compact(dom_state, 2500),
    ])
    session_expired = bool(
        re.search(r"session\s+(?:has\s+)?expired|sign\s+in\s+again", session_text, re.IGNORECASE)
        and re.search(r"login|sign[ -]?in|auth", session_text, re.IGNORECASE)
    )
    if session_expired:
        root_cause = "ENVIRONMENT"
        fix = "The session expired during the test. Re-authenticate before running this step and verify the session stays valid throughout the test."
        report_type = "unknown"
    elif dom_evidence:
        if any(re.search(r"validation|mat-error|aria|error", item, re.IGNORECASE) for item in dom_evidence):
            root_cause = "APPLICATION"
            fix = "A validation error was visible in the DOM. Check the validation rule for the affected field and correct the input value."
            report_type = "validation"
        elif any(re.search(r"toast|snackbar|error", item, re.IGNORECASE) for item in dom_evidence):
            root_cause = "APPLICATION"
            fix = "The application displayed an error message. Inspect the handler for this action and verify the error condition."
            report_type = "unknown"
        else:
            root_cause = "UNKNOWN"
            fix = "The DOM state after the action did not match the expected result. Inspect the component state and DOM binding."
            report_type = "unknown"
    elif has_log_evidence:
        _rc, fix = _categorize(primary_text)
        root_cause = _rc.upper().replace("_", " ")
        report_type = (
            "dropdown" if re.search(r"dropdown|requestedValue|fallbackValue", primary_text, re.IGNORECASE)
            else "unknown"
        )
    else:
        root_cause = "UNKNOWN"
        fix = "The step did not produce a verifiable result. Inspect the application state at the moment of failure."
        report_type = "unknown"

    recommendations = [{"error": primary_text or "failure", "rootCause": root_cause, "fix": fix}]
    if dom_changes:
        recommendations.append({
            "error": dom_changes[0],
            "rootCause": root_cause,
            "fix": "Inspect the DOM change between the action and the expected result.",
        })
    recommendations = recommendations[:2]

    # Build a human-readable problem description
    problem_desc = (
        f'Step "{failed_step_name}" did not reach the expected result.'
        if failed_step_name
        else "The test step did not reach the expected result."
    )

    # Build actual behavior
    if session_expired:
        actual_behavior = "The page was redirected to the login screen, indicating the session expired."
    elif dom_evidence:
        actual_behavior = dom_evidence[0].replace("DOM: ", "").strip()
    else:
        actual_behavior = "The step result did not match the expected outcome."

    # Developer recommendations
    developer_fix: list[str] = [fix]
    if dom_changes:
        developer_fix.append("Verify the component state and DOM binding are updated correctly after the action.")
    if test_data_preview:
        developer_fix.append(f"Verify that the test data is valid: {', '.join(test_data_preview[:3])}.")

    # Tester recommendations
    tester_fix: list[str] = []
    if failed_step_name:
        tester_fix.append(
            f'Reproduce the failure by running only the "{failed_step_name}" step in isolation and observe the result.'
        )
    tester_fix.append(
        "Run the test with different input values to determine whether the failure is data-dependent."
    )
    if expected_result:
        tester_fix.append(
            f"Verify the expected outcome manually in the application: {expected_result[:120]}."
        )

    return {
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
    test_plan_titles: Optional[list[Any]] = None
    testPlanTitles: Optional[list[Any]] = None
    current_test_case: Optional[dict[str, Any]] = None
    currentTestCase: Optional[dict[str, Any]] = None
    final_dom: Optional[dict[str, Any]] = None
    finalDom: Optional[dict[str, Any]] = None
    final_field_values: Optional[dict[str, Any]] = None
    finalFieldValues: Optional[dict[str, Any]] = None
    validation_messages: Optional[list[Any]] = None
    validationMessages: Optional[list[Any]] = None
    final_toast: Optional[Any] = None
    finalToast: Optional[Any] = None
    final_url: Optional[str] = None
    finalUrl: Optional[str] = None
    execution_result: Optional[Any] = None
    executionResult: Optional[Any] = None


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
            "test_plan_titles": payload.test_plan_titles or payload.testPlanTitles or [],
            "current_test_case": payload.current_test_case or payload.currentTestCase or payload.test_case or payload.testCase or {},
            "final_dom": payload.final_dom or payload.finalDom or payload.dom_state or payload.domState or {},
            "final_field_values": payload.final_field_values or payload.finalFieldValues or {},
            "validation_messages": payload.validation_messages or payload.validationMessages or [],
            "final_toast": payload.final_toast if payload.final_toast is not None else payload.finalToast,
            "final_url": payload.final_url or payload.finalUrl or "",
            "execution_result": payload.execution_result if payload.execution_result is not None else payload.executionResult,
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
            log_error(
                logger,
                "failure_detection_ai_fallback",
                error=error_msg,
                execution_id=execution_id,
                prompt_chars=len(prompt),
            )
            analysis = _fallback_analysis(normalized_payload, error_msg)

        # A small local model can return technically-valid JSON that is
        # still nearly empty (e.g. only {"evidence": [...]}) — every other
        # field then silently falls back to the hardcoded generic defaults
        # below ("Test Failure Detected" / "unknown" / "Review logs and
        # adjust selectors or timing"), even though the payload already
        # carries real, usable context (test data, expected result, actual
        # URL, categorized log lines). Always compute that deterministic
        # analysis and use it to fill in whatever the model left blank or
        # answered with a non-answer, instead of only doing this when the
        # model call raised an exception outright.
        deterministic_analysis = _fallback_analysis(normalized_payload)
        _GENERIC_PLACEHOLDERS = {
            "", "unknown", "not available", "not specified", "n/a", "none",
            "failure detected", "test failure detected",
            "unable to determine failure cause",
            "review logs and adjust selectors or timing",
        }

        def _is_blank(value: Any) -> bool:
            if isinstance(value, str):
                return value.strip().lower() in _GENERIC_PLACEHOLDERS
            if isinstance(value, (list, dict)):
                return len(value) == 0
            return value is None

        if isinstance(analysis, dict):
            for key, fallback_value in deterministic_analysis.items():
                if _is_blank(analysis.get(key)):
                    analysis[key] = fallback_value
        else:
            analysis = deterministic_analysis

        analysis["evidence"] = [
            item for item in _as_list(analysis.get("evidence"))
            if not re.search(r"ASSERTION\s+RESULT\s*=\s*passed", str(item), re.IGNORECASE)
        ][:8]
        
        unique_recommendations = []
        seen_recommendations = set()
        for item in _as_list(analysis.get("recommendations")):
            key = _compact(item, 800).strip().lower()
            if key and key not in seen_recommendations:
                seen_recommendations.add(key)
                unique_recommendations.append(item)
        analysis["recommendations"] = unique_recommendations[:2]
        analysis.setdefault("confidenceLabel", "Medium" if analysis.get("evidence") else "Low")
        analysis.setdefault("type", "unknown")

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

        formatted_evidence = _as_list(analysis.get("evidence"))
        formatted_recommendations = _normalize_recommendations(analysis)[:2]
        formatted_fix = " ".join(
            item.get("fix", "") for item in formatted_recommendations if item.get("fix")
        ) or str(analysis.get("actionText") or "NOT VERIFIED")
        formatted_report = (
            f"🔴 Root Cause: {analysis.get('rootCause', 'NOT VERIFIED')}\n"
            f"📍 Failed Step: {analysis.get('failedStepName', '')}\n"
            f"🔎 DOM Evidence: {' | '.join(str(item) for item in formatted_evidence) or 'NOT VERIFIED'}\n"
            f"💡 Recommendation: {formatted_fix}\n"
            f"🎯 Type: {analysis.get('type', 'unknown')}\n"
            f"Confidence: {analysis.get('confidenceLabel', 'Low')}"
        )

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

    "type": analysis.get("type", "unknown"),

    "confidenceLabel": analysis.get("confidenceLabel", "Medium"),

    "formattedReport": formatted_report,

    "confidence": (
        float(analysis.get("confidence", 0.0))
        if str(analysis.get("confidence", "0.0")).replace(".", "", 1).isdigit()
        else {"High": 0.9, "Medium": 0.6, "Low": 0.2}.get(
            str(analysis.get("confidence", "Medium")), 0.6
        )
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

    "developerCodeExample": analysis.get(
        "developerCodeExample",
        ""
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
            detail=f"Could not generate fix suggestion: {str(exc)}"
        )
