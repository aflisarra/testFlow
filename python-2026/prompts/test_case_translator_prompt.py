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
        "This is NOT a translation task. Extract intent, action, target, data needs, and assertions.\n\n"

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

        "### UI interpretation rules (CRITICAL)\n"
        "- Any step that means opening or navigating to a page MUST be mapped to action=\"open_app\".\n"
        "- Examples:\n"
        "  open page, open form page, open form, open homepage\n"
        "  go to page, go to form, navigate to page, navigate to form\n"
        "- Do NOT use action=\"unknown\" for navigation steps.\n"
        "- If step explicitly says 'login page', use action=\"open_login\".\n"
        "- Otherwise all navigation → open_app.\n\n"

        "### Inference rules\n"
        "- Try to infer the most relevant action.\n"
        "- Use action=\"unknown\" ONLY if the step truly cannot be mapped.\n\n"

        "### Hard rules\n"
        "- Output ONLY valid JSON.\n"
        "- Use exactly version \"execution-model/v1\".\n"
        "- Preserve each input step as one output step in same order.\n"
        "- Do NOT output selectors or automation code.\n"
        "- Do NOT leave navigation steps as unknown.\n"
        "- Use credentials for sensitive values.\n\n"

        "### Example mappings\n"
        "Input: \"Open the form page\"\n"
        "Output action: open_app\n\n"

        "Input: \"Go to user form\"\n"
        "Output action: open_app\n\n"

        "Input: \"Open login page\"\n"
        "Output action: open_login\n\n"

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