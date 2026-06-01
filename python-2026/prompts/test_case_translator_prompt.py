from __future__ import annotations

from typing import Any, Dict, List


def build_test_case_translator_prompt(
    *,
    test_case_id: str,
    title: str,
    steps: List[str],
    expected_result: str,
    context: Dict[str, Any],
) -> str:
    """
    Prompt for interpreting a natural language test case into a runner-neutral model.
    The output is intentionally not Selenium, Playwright, Cypress, or Postman code.
    """
    step_lines = "\n".join(f"{index}. {step}" for index, step in enumerate(steps, start=1))
    context_lines = "\n".join(f"- {key}: {value}" for key, value in sorted((context or {}).items()))

    example = (
        "{\n"
        '  "version": "execution-model/v1",\n'
        '  "source": {"test_case_id": "TC-1.1", "title": "Login succeeds"},\n'
        '  "preconditions": [],\n'
        '  "steps": [\n'
        "    {\n"
        '      "id": "S1",\n'
        '      "raw": "Open login page",\n'
        '      "channel": "ui",\n'
        '      "action": "open_login",\n'
        '      "target": {"kind": "page", "name": "login", "role": null, "url": null, "path": null, "method": null},\n'
        '      "value": null,\n'
        '      "assertion": null,\n'
        '      "requires": ["baseUrl"]\n'
        "    },\n"
        "    {\n"
        '      "id": "S2",\n'
        '      "raw": "Enter valid email and password",\n'
        '      "channel": "ui",\n'
        '      "action": "type_credentials",\n'
        '      "target": {"kind": "credential_form", "name": "login credentials", "role": "form", "url": null, "path": null, "method": null},\n'
        '      "value": {"source": "credential", "key": "email,password", "text": null},\n'
        '      "assertion": null,\n'
        '      "requires": ["credentials.email", "credentials.password"]\n'
        "    }\n"
        "  ],\n"
        '  "expected_result": "User is authenticated and redirected to dashboard",\n'
        '  "confidence": "high"\n'
        "}\n"
    )

    return (
        "<s>[INST]\n"
        "You are a senior QA automation architect.\n"
        "Interpret natural language test case steps into a standardized execution model.\n"
        "This is NOT a translation task. Extract intent, target, data needs, assertions, and API/UI channel.\n"
        "The model must be independent from Selenium, Playwright, Cypress, Postman, and any concrete driver.\n\n"
        "### Allowed channels\n"
        "- ui\n"
        "- api\n"
        "- assertion\n"
        "- data\n"
        "- unknown\n\n"
        "### Allowed actions\n"
        "- open_app, open_login, navigate, type, type_credentials, click, submit, wait\n"
        "- assert_visible, assert_text, assert_url, assert_authenticated\n"
        "- set_auth, http_request, assert_status\n"
        "- set_context, unknown\n\n"
        "### Hard rules\n"
        "- Output ONLY valid JSON.\n"
        "- Use exactly version \"execution-model/v1\".\n"
        "- Preserve each input step as one output step in the same order.\n"
        "- Do not output CSS selectors, XPath, Selenium locators, or code.\n"
        "- Put secret values behind value.source=\"credential\" and value.key, never in value.text.\n"
        "- When a step mentions email/password/login credentials, require credentials.email and/or credentials.password.\n"
        "- For API requests, infer method/path only when explicit in the step; otherwise keep target.path empty.\n"
        "- If intent is unclear, use action=\"unknown\" but keep the raw step.\n\n"
        "### Required JSON shape\n"
        f"{example}\n"
        "### Test case\n"
        f"- id: {test_case_id or ''}\n"
        f"- title: {title or ''}\n"
        f"- expected_result: {expected_result or ''}\n\n"
        "### Steps\n"
        f"{step_lines}\n\n"
        "### Execution context\n"
        f"{context_lines or '(none)'}\n"
        "[/INST]"
    )
