from __future__ import annotations

import json
from typing import Any


def _safe(value: Any, limit: int = 8000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = str(value)
    return text[:limit]


def _test_plan_titles_block(titles: Any) -> str:
    items: list[str] = []
    if isinstance(titles, list):
        for t in titles:
            label = str(t.get("title") or t) if isinstance(t, dict) else str(t)
            if label.strip():
                items.append(f"  * {label.strip()}")
    return "\n".join(items) if items else "  (no test plan titles provided)"


def _current_test_case_block(test_case: dict[str, Any]) -> str:
    if not isinstance(test_case, dict):
        return "(no test case details)"
    title = str(test_case.get("title") or "").strip()
    steps = test_case.get("steps") or test_case.get("stepDetails") or []
    lines: list[str] = []
    if title:
        lines.append(f"Title: {title}")
    if isinstance(steps, list):
        for i, step in enumerate(steps):
            if isinstance(step, dict):
                name = str(step.get("name") or step.get("title") or f"Step {i+1}").strip()
                expected = str(step.get("expectedResult") or step.get("expected_result") or "").strip()
                lines.append(f"  Step {i+1}: {name}")
                if expected:
                    lines.append(f"    -> Expected: {expected}")
            else:
                lines.append(f"  Step {i+1}: {step}")
    return "\n".join(lines) if lines else "(no steps found)"


def _failed_step_block(failed_step: dict[str, Any], step_index: int) -> str:
    if not isinstance(failed_step, dict):
        return f"Step index: {step_index}"
    name = str(failed_step.get("name") or "").strip()
    subtitle = str(failed_step.get("subtitle") or "").strip()
    expected = str(
        failed_step.get("expectedResult") or failed_step.get("expected_result") or ""
    ).strip()
    parts = [f"Step index: {step_index}"]
    if name:
        parts.append(f"Step name: {name}")
    if subtitle:
        parts.append(f"Result message: {subtitle}")
    if expected:
        parts.append(f"Expected result: {expected}")
    return "\n".join(parts)


def _field_values_block(field_values: Any) -> str:
    if not field_values:
        return "(not provided)"
    if isinstance(field_values, dict):
        lines = [f"  {k}: {v}" for k, v in field_values.items() if v is not None]
        return "\n".join(lines) if lines else "(empty)"
    return str(field_values)[:1500]


def _messages_block(validation_messages: Any, toast: Any) -> str:
    lines: list[str] = []
    if isinstance(validation_messages, list):
        for msg in validation_messages:
            text = str(msg.get("text") or msg) if isinstance(msg, dict) else str(msg)
            if text.strip():
                lines.append(f"  * {text.strip()}")
    elif validation_messages:
        lines.append(f"  * {str(validation_messages)[:400]}")
    if toast is not None:
        toast_text = str(toast.get("text") or toast) if isinstance(toast, dict) else str(toast)
        if toast_text.strip():
            lines.append(f"  * Toast: {toast_text.strip()}")
    return "\n".join(lines) if lines else "  (none)"


def _final_dom_block(final_dom: Any) -> str:
    if not final_dom:
        return "(not provided)"
    if isinstance(final_dom, dict):
        elements = final_dom.get("elements") or []
        url = str(final_dom.get("sourceUrl") or final_dom.get("url") or "").strip()
        lines: list[str] = []
        if url:
            lines.append(f"Page URL: {url}")
        if isinstance(elements, list) and elements:
            lines.append(f"DOM elements captured: {len(elements)}")
            for el in elements[:60]:
                if not isinstance(el, dict):
                    continue
                tag = str(el.get("tag") or "").lower()
                val = str(el.get("value") or "").strip()
                placeholder = str(el.get("placeholder") or "").strip()
                text = str(el.get("text") or "").strip()
                aria_label = str(el.get("ariaLabel") or "").strip()
                name = str(el.get("name") or el.get("id") or "").strip()
                if tag in ("input", "select", "textarea") and (val or placeholder):
                    field_name = aria_label or placeholder or name or tag
                    lines.append(f"  Field '{field_name}': value='{val}'")
                elif text and len(text) < 120:
                    lines.append(f"  [{tag}] {text[:120]}")
        if lines:
            return "\n".join(lines)
        return _safe(final_dom, 3000)
    return str(final_dom)[:3000]


def _ai_actions_block(ai_actions: Any) -> str:
    if not isinstance(ai_actions, list) or not ai_actions:
        return "  (no AI actions recorded)"
    lines: list[str] = []
    for action in ai_actions[-8:]:
        if not isinstance(action, dict):
            continue
        t = str(action.get("type") or action.get("action") or "?")
        selector = str(action.get("selector") or "").strip()
        value = str(action.get("value") or "").strip()
        status = str(action.get("status") or action.get("result") or "").strip()
        line = f"  {t}"
        if selector:
            line += f" on {selector[:60]}"
        if value:
            line += f" -> value: '{value[:40]}'"
        if status:
            line += f" [{status}]"
        lines.append(line)
    return "\n".join(lines) if lines else "  (no AI actions recorded)"


def build_ai_detector_fix_prompt(payload: dict[str, Any]) -> str:
    failed_step: dict = payload.get("failed_step") or {}
    ai_actions: list = payload.get("ai_actions") or []
    test_case: dict = payload.get("test_case") or {}
    step_index: int = int(payload.get("step_index") or 0)
    execution_result: Any = payload.get("execution_result")
    test_plan_titles: list = payload.get("test_plan_titles") or []
    current_test_case: dict = payload.get("current_test_case") or test_case
    final_dom: Any = payload.get("final_dom") or payload.get("dom_state") or {}
    final_field_values: Any = payload.get("final_field_values") or {}
    validation_messages: Any = payload.get("validation_messages") or []
    final_toast: Any = payload.get("final_toast")
    final_url: str = str(payload.get("final_url") or "").strip()

    plan_titles = _test_plan_titles_block(test_plan_titles)
    tc_block = _current_test_case_block(current_test_case)
    fs_block = _failed_step_block(failed_step, step_index)
    ai_block = _ai_actions_block(ai_actions)
    dom_block = _final_dom_block(final_dom)
    fv_block = _field_values_block(final_field_values)
    msg_block = _messages_block(validation_messages, final_toast)
    url_line = f"Final URL: {final_url}" if final_url else "(not provided)"
    exec_result = str(execution_result or "").strip()[:600] if execution_result else "(not provided)"

    # Use triple-quoted template. The curly braces for JSON schema are doubled.
    template = """You are a senior QA engineer and software debugging expert.

====================================================
YOUR TASK
====================================================

Analyze ONLY the FAILED STEP below. Do NOT analyze any other step.

Evidence priority:
1. FINAL DOM (field values, visible text, error messages)
2. FINAL FIELD VALUES
3. VALIDATION MESSAGES AND TOASTS
4. OTHER TEST CASE TITLES (context only — understand the page features, do NOT analyze these steps)

====================================================
ALL TEST CASE TITLES (context only)
====================================================
{plan_titles}

====================================================
CURRENT TEST CASE (steps + expected results)
====================================================
{tc_block}

====================================================
FAILED STEP DETAILS
====================================================
{fs_block}

====================================================
AI ACTIONS EXECUTED
====================================================
{ai_block}

====================================================
FINAL URL
====================================================
{url_line}

====================================================
FINAL DOM (field values, visible text, errors)
====================================================
{dom_block}

====================================================
FINAL FIELD VALUES
====================================================
{fv_block}

====================================================
VALIDATION / ERROR / HELPER MESSAGES AND TOASTS
====================================================
{msg_block}

====================================================
EXECUTION RESULT
====================================================
{exec_result}

====================================================
ANALYSIS INSTRUCTIONS
====================================================

Step 1 - ACTION RESULT
Was the Selenium action (click/type/select) executed successfully?
If NO -> root cause is AI_ACTION.

Step 2 - STEP RESULT
Did the application reach the expected result stated in the FAILED STEP?

Step 3 - ROOT CAUSE
Choose exactly ONE:
  APPLICATION  - Action succeeded but app did not update correctly.
  TEST_DATA    - Input data was invalid or caused rejection.
  ASSERTION    - The expected result was incorrectly defined.
  ENVIRONMENT  - Session expired or unexpected redirect.
  TIMING       - Async/DOM loading issue.
  AI_ACTION    - Wrong element targeted or action not executed.
  UNKNOWN      - Only when evidence is truly insufficient.

Confidence: HIGH / MEDIUM / LOW

Step 4 - DEVELOPER RECOMMENDATION (max 3 items)
* Focus on different technical areas: handler logic, component state, DOM binding, validation.
* When APPLICATION is the cause and a pattern is clear, provide a SHORT illustrative code snippet.
* LABEL it clearly as example code - do NOT invent real project method or variable names.

Step 5 - TESTER RECOMMENDATION (max 3 items)
* Use the OTHER TEST CASE TITLES to understand all available fields/features on the page.
* Propose diagnostic scenarios that isolate, reproduce or confirm the bug.
* Do NOT suggest: rerun the test, check the test data, verify the result.
* Must differ from developer recommendations.

====================================================
REQUIRED OUTPUT (STRICT JSON - no other text)
====================================================

Return ONLY this JSON object. No markdown. No explanation. No text before or after the JSON:

{{
  "title": "TEST ANALYSIS",
  "failedStepName": "[human-readable step name, max 1 sentence]",
  "description": "[Problem: one short paragraph explaining what went wrong]",
  "expectedBehavior": "[What the step should have achieved, short and specific]",
  "actualBehavior": "[What actually happened based on DOM/messages, short and specific]",
  "rootCause": "[CATEGORY] - [HIGH|MEDIUM|LOW]",
  "whyItFailed": "[Technical reason in 1-2 sentences]",
  "developerFix": [
    "[Technical recommendation #1]",
    "[Technical recommendation #2]",
    "[Technical recommendation #3 - optional]"
  ],
  "developerCodeExample": "[Short illustrative code snippet, or empty string if not applicable]",
  "testerFix": [
    "[Diagnostic test scenario #1]",
    "[Diagnostic test scenario #2]",
    "[Diagnostic test scenario #3 - optional]"
  ]
}}

STRICT RULES:
- Simple language, short sentences.
- No raw JSON in text fields.
- No stack traces, no Selenium error messages, no file paths, no log indexes.
- developerFix and testerFix must have different content.
- rootCause format: CATEGORY - CONFIDENCE (example: APPLICATION - HIGH).
- developerCodeExample is an example only, clearly an illustration, not the real code."""

    return template.format(
        plan_titles=plan_titles,
        tc_block=tc_block,
        fs_block=fs_block,
        ai_block=ai_block,
        url_line=url_line,
        dom_block=dom_block,
        fv_block=fv_block,
        msg_block=msg_block,
        exec_result=exec_result,
    ).strip()