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
        if any(
            token in lowered
            for token in (
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
            )
        ):
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
You are an expert senior QA automation failure analyzer for the TARGET
APPLICATION that this Selenium execution was testing.

Your task: Analyze the failed test execution context and provide:
1. Root cause analysis of why the test failed
2. The most likely reason the AI action failed or made an incorrect decision
3. Concrete, actionable recommendations a senior tester can apply immediately for every distinct error found in the logs
4. Confidence level based on available evidence

Scope boundary:
- Analyse the target application, its test case, the AI decision, and the
  automation execution only from the supplied evidence.
- Do not diagnose, recommend, or invent changes to this QA platform, its
  dashboard, its database, or its internal services unless a log explicitly
  proves that one of them caused the failure.
- Every recommendation must name its owner: Application, Test case/Test data,
  or Automation/AI decision. Application recommendations must describe an
  observable behavior of the application under test, not a generic framework
  change.

Context Information:
- Error Type: {error_type or "Not specified"}
- Error Message: {error_message or "Not available"}
- Failed Step Index: {step_index}

Return ONLY valid JSON with this exact shape:

{{
  "title": "",
  "description": "",
  "summary": "",
  "whatHappened": "",
  "simpleExplanation": "",
  "example": "",
  "expectedBehavior": "",
  "actualBehavior": "",
  "whyItFailed": "",
  "rootCause": "",
  "severity": "Low|Medium|High|Critical",
  "confidence": 0.0,

  "failedStepIndex": 0,
  "failedStepName": "",

  "aiActionSummary": "",

  "timeline": [
    {{
      "step": 0,
      "action": "",
      "result": ""
    }}
  ],

  "evidence": [],

  "developerFix": [
    ""
  ],

  "testerFix": [
    ""
  ],

  "actionLabel": "Recommended Fix",
  "actionText": "",

  "recommendations": [
    {{
      "error": "",
      "rootCause": "",
      "whatHappened": "",
      "example": "",
      "fix": ""
    }}
  ],

  "diagnosticTips": [],
  "suggestedSelectors": []
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
   - Keep the recommendation inside the proven owner scope. For example, wrong
     credentials supplied by a test case are Test data, an unchanged login URL
     with an "Invalid credentials" message is Application response, and a
     selector that clicked a different visible button is Automation/AI decision.
   - A successful click or type action is not proof of a successful business
     outcome. For login, registration, save, or checkout, verify a concrete
     target-application signal such as the expected URL, heading, confirmation,
     or visible error message before claiming success.
   - Do not label a valid action as an AI Decision Error merely because the
     business outcome failed. If the action clicked the intended Login button
     and the page shows invalid credentials, attribute the primary cause to
     Test data or Application response according to the evidence. Call it an
     AI Decision Error only when the action itself targeted the wrong element,
     used the wrong supplied value, or contradicted the current test step.
   - If a dropdown failed, explicitly check this sequence: trigger opened, search input detected, test data typed, matching option found, option clicked
   - If there are duplicated/partial actions in logs, distinguish planned AI actions from execution trace logs
   - diagnosticTips: Provide 2-3 debugging tips
   - suggestedSelectors: List 1-3 alternative selectors if applicable
   - recommendations: include one item for EACH distinct FAIL/ERROR/WARN/exception/timeout/assertion log entry that represents a separate failure cause. Do not collapse two different errors into one recommendation.
   - actionText can summarize the first/highest priority recommendation, but recommendations must preserve all distinct fixes.
   - whatHappened (top-level and per-recommendation): write in plain, simple English suitable for both a developer AND a non-technical tester. Avoid jargon like "assertion", "selector", "DOM" when possible — describe what the user would actually SEE happen (e.g. "the test tried to click Save, but the page had not finished loading, so nothing happened").
   - example (top-level and per-recommendation): always ground the example in the REAL data from this failure (real selector, real URL, real field name, real expected vs actual value) — never a generic placeholder example. If the exact real value isn't available in the logs, say so instead of inventing one.

7. Additional Reporting Rules

You must explain failures in VERY SIMPLE ENGLISH.

Assume the reader is:

- Junior QA Engineer
- Manual Tester
- Developer unfamiliar with the application

For every failure explain:

1. What the test wanted to do.
2. What actually happened.
3. What the AI clicked or typed.
4. What page was expected.
5. What page was opened.
6. Why the failure occurred.
7. How a developer should fix it.
8. How a tester should fix it.

Always use real values from the logs.

Good:

Expected URL:
/dashboard/index

Actual URL:
/admin/saveSystemUser

Bad:

Expected page
Actual page

Never give generic explanations.

Always mention when available:

- selector names
- URLs
- page titles
- button names
- field names
- expected values
- actual values

If the failure is caused by AI behavior:

Explain exactly:

- what decision the AI made
- why that decision was wrong
- what action should have been executed instead

Determine whether the failure is:

- AI Decision Error
- Test Data Error
- Assertion Error
- Selector Error
- Application Bug
- Timing Issue

Always identify the most likely owner:

- Automation
- Test Data
- AI
- Application

Example:

The login succeeded.

The AI clicked "Admin".

The AI clicked "Add".

The browser navigated to:

/web/index.php/admin/saveSystemUser

The expected page was:

/web/index.php/dashboard/index

Because of these unexpected clicks, the test left the expected flow and the verification failed.

simpleExplanation must be understandable by a non-technical tester.

Avoid technical jargon whenever possible.

7. Timeline Rules

timeline must contain the chronological sequence of important actions
that led to the failure.

Use real actions from logs whenever available.

Example:

"timeline": [
  {{
    "step": 1,
    "action": "Enter Username",
    "result": "Success"
  }},
  {{
    "step": 2,
    "action": "Enter Password",
    "result": "Success"
  }},
  {{
    "step": 3,
    "action": "Click Login",
    "result": "Success"
  }},
  {{
    "step": 4,
    "action": "Click Admin",
    "result": "Unexpected Action"
  }}
]

Rules:
- Preserve chronological order.
- Include only important actions.
- Mention failed or unexpected actions.
- Use actual action names from logs.
- Do not invent actions that are not present in the logs.

9. Evidence Rules

Evidence must contain exact log fragments proving the failure.

Example:

"evidence": [
  "Expected URL: /dashboard/index",
  "Actual URL: /admin/saveSystemUser",
  "AI Action: click Admin",
  "AI Action: click Add"
]

Rules:
- Use exact text from logs whenever possible.
- Include URLs, selectors, button names, field names and error messages.
- Never invent evidence.
- Always prefer real values over summaries.

Use simple English.
Avoid technical jargon whenever possible.

====================================================
FAILURE CONTEXT
====================================================

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
