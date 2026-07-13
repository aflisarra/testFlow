from __future__ import annotations

import json
from typing import Any


def _compact(value: Any, limit: int = 12000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = str(value)
    return text[:limit]


def _compact_logs(logs: Any, limit: int = 4500) -> str:
    if not isinstance(logs, list):
        return _compact(logs, limit)

    important = []
    for item in logs:
        text = _compact(item, 900)
        lowered = text.lower()
        if any(token in lowered for token in (
            "fail",
            "error",
            "warn",
            "assert",
            "expected",
            "actual",
            "not available",
            "not found",
            "dropdown",
            "country",
            "region",
            "timeout",
            "exception",
            "ai actions",
        )):
            important.append(text)

    return "\n".join(important[-12:])[:limit]


def build_ai_detector_fix_prompt(payload: dict[str, Any]) -> str:
    failed_step = payload.get("failed_step") or payload.get("failedStep") or {}
    logs = payload.get("logs") or []
    ai_actions = payload.get("ai_actions") or payload.get("aiActions") or []
    test_case = payload.get("test_case") or payload.get("testCase") or {}
    error_message = payload.get("error_message") or payload.get("errorMessage") or ""
    error_type = payload.get("error_type") or payload.get("errorType") or ""
    step_index = payload.get("step_index") or payload.get("stepIndex") or 0
    dom_state = payload.get("dom_state") or payload.get("domState") or {}
    screenshot = payload.get("screenshot_url") or payload.get("screenshotUrl") or ""

    return f"""
You are an expert senior QA automation failure analyzer specializing in Selenium + AI-driven UI automation.

Your task: Analyze the failed test execution context and provide:
1. Root cause analysis of why the test failed
2. The most likely reason the AI action failed or made an incorrect decision
3. Concrete, actionable recommendations a senior tester can apply immediately for every distinct error found in the logs
4. Confidence level based on available evidence

Context Information:
- Error Type: {error_type or 'Not specified'}
- Error Message: {error_message or 'Not available'}
- Failed Step Index: {step_index}

Return ONLY valid JSON with this exact shape:
{{
  "title": "Brief (5-8 words) summary of the failure",
  "description": "One clear sentence explaining why the test failed, using the exact failed selector/action when available",
  "rootCause": "One of: selector_not_found | element_not_interactable | timing_timeout | assertion_failed | navigation_failed | data_mismatch | ai_logic_error | element_intercepted | application_error | unknown",
  "confidence": 0.75,
  "failedStepIndex": {step_index},
  "failedStepName": "Name of the failed step",
  "aiActionSummary": "Exact action(s) the AI/backend attempted, including selector and value when available",
  "actionLabel": "Recommended Fix",
  "actionText": "Specific, concrete senior-QA fix to apply: selector/wait/data/assertion change plus where to apply it",
  "recommendations": [
    {{
      "error": "Exact log error or failure symptom",
      "rootCause": "selector_not_found | element_not_interactable | timing_timeout | assertion_failed | navigation_failed | data_mismatch | ai_logic_error | element_intercepted | application_error | unknown",
      "fix": "Specific concrete fix for this error"
    }}
  ],
  "diagnosticTips": ["tip1", "tip2", "tip3"],
  "suggestedSelectors": ["selector1", "selector2"]
}}

Analysis Rules:
1. Root Cause Categories:
   - selector_not_found: Element cannot be located using the current CSS/XPath selector
   - element_not_interactable: Element exists but is blocked, covered, or disabled
   - timing_timeout: Action took too long or element appeared after timeout
   - assertion_failed: Expected value doesn't match actual value
   - navigation_failed: Page didn't navigate as expected
   - data_mismatch: Input data doesn't match field requirements
   - ai_logic_error: AI made wrong decision about element interaction
   - element_intercepted: Another element is blocking the target
   - application_error: Server/application returned an error
   - unknown: Cannot determine cause from logs

2. For Selector Issues:
   - Suggest alternative selectors (data-testid, aria-label, more specific XPath)
   - Recommend adding wait strategies (wait for element, wait for visibility)
   - Consider page state changes

3. For Timing Issues:
   - Recommend explicit waits (WebDriverWait, element visibility)
   - Consider page load states or AJAX requests
   - Suggest scroll-into-view before interaction

4. For Data Issues:
   - Check field requirements (length, format, type)
   - Verify test data matches application expectations
   - Look for validation errors in logs

5. For AI Logic Issues:
   - Explain what decision the AI made incorrectly
   - Suggest what should have been done instead
   - Recommend adding more context to AI instructions

6. Quality Rules:
   - Use logs and DOM state as source of truth
   - Do NOT invent errors not present in context
   - Do NOT recommend changes that contradict logs
   - Keep actionText practical and implementable
   - Mention whether the failing action came from the AI decision, backend execution, test data, or application response when evidence allows it
   - If a dropdown failed, explicitly check this sequence: trigger opened, search input detected, test data typed, matching option found, option clicked
   - If there are duplicated/partial actions in logs, distinguish planned AI actions from execution trace logs
   - diagnosticTips: Provide 2-3 debugging tips
   - suggestedSelectors: List 1-3 alternative selectors if applicable
   - recommendations: include one item for EACH distinct FAIL/ERROR/WARN/exception/timeout/assertion log entry that represents a separate failure cause. Do not collapse two different errors into one recommendation.
   - actionText can summarize the first/highest priority recommendation, but recommendations must preserve all distinct fixes.

FAILED STEP DETAILS:
{_compact(failed_step, 4000)}

AI ACTIONS & DECISIONS:
{_compact(ai_actions, 1800)}

EXECUTION LOGS (most recent first):
{_compact_logs(logs, 4500)}

TEST CASE DEFINITION:
{_compact(test_case, 1800)}

DOM STATE AT FAILURE:
{_compact(dom_state, 1800)}

SCREENSHOT: {screenshot}
""".strip()
