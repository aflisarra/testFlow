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

    step_lines = "\n".join(
        f"{index}. {step}"
        for index, step in enumerate(steps, start=1)
    )

    context_lines = "\n".join(
        f"- {key}: {value}"
        for key, value in sorted((context or {}).items())
    )

    example = (
        "{\n"
        '  "version": "execution-model/v1",\n'
        '  "source": {\n'
        '    "test_case_id": "TC-1.1",\n'
        '    "title": "Login succeeds"\n'
        "  },\n"
        '  "preconditions": [],\n'
        '  "steps": [\n'

        "    {\n"
        '      "id": "S1",\n'
        '      "raw": "Open login page",\n'
        '      "channel": "ui",\n'
        '      "action": "open_login",\n'
        '      "target": {\n'
        '        "kind": "page",\n'
        '        "name": "login",\n'
        '        "role": "page",\n'
        '        "selector": null,\n'
        '        "by": null,\n'
        '        "url": "https://app.example.com/login",\n'
        '        "path": null,\n'
        '        "method": null\n'
        "      },\n"
        '      "value": null,\n'
        '      "assertion": null,\n'
        '      "requires": ["baseUrl"]\n'
        "    },\n"

        "    {\n"
        '      "id": "S2",\n'
        '      "raw": "Enter valid email",\n'
        '      "channel": "ui",\n'
        '      "action": "type",\n'
        '      "target": {\n'
        '        "kind": "field",\n'
        '        "name": "email",\n'
        '        "role": "textbox",\n'
        '        "selector": "#email",\n'
        '        "by": "css",\n'
        '        "url": null,\n'
        '        "path": null,\n'
        '        "method": null\n'
        "      },\n"
        '      "value": {\n'
        '        "source": "credential",\n'
        '        "key": "email",\n'
        '        "text": null\n'
        "      },\n"
        '      "assertion": null,\n'
        '      "requires": ["credentials.email"]\n'
        "    },\n"

        "    {\n"
        '      "id": "S3",\n'
        '      "raw": "Enter valid password",\n'
        '      "channel": "ui",\n'
        '      "action": "type",\n'
        '      "target": {\n'
        '        "kind": "field",\n'
        '        "name": "password",\n'
        '        "role": "textbox",\n'
        '        "selector": "#password",\n'
        '        "by": "css",\n'
        '        "url": null,\n'
        '        "path": null,\n'
        '        "method": null\n'
        "      },\n"
        '      "value": {\n'
        '        "source": "credential",\n'
        '        "key": "password",\n'
        '        "text": null\n'
        "      },\n"
        '      "assertion": null,\n'
        '      "requires": ["credentials.password"]\n'
        "    },\n"

        "    {\n"
        '      "id": "S4",\n'
        '      "raw": "Click login button",\n'
        '      "channel": "ui",\n'
        '      "action": "click",\n'
        '      "target": {\n'
        '        "kind": "button",\n'
        '        "name": "login",\n'
        '        "role": "button",\n'
        '        "selector": "#login-btn",\n'
        '        "by": "css",\n'
        '        "url": null,\n'
        '        "path": null,\n'
        '        "method": null\n'
        "      },\n"
        '      "value": null,\n'
        '      "assertion": null,\n'
        '      "requires": []\n'
        "    },\n"

        "    {\n"
        '      "id": "S5",\n'
        '      "raw": "Verify dashboard is visible",\n'
        '      "channel": "assertion",\n'
        '      "action": "assert_visible",\n'
        '      "target": {\n'
        '        "kind": "element",\n'
        '        "name": "dashboard",\n'
        '        "role": "container",\n'
        '        "selector": ".dashboard",\n'
        '        "by": "css",\n'
        '        "url": null,\n'
        '        "path": null,\n'
        '        "method": null\n'
        "      },\n"
        '      "value": null,\n'
        '      "assertion": {\n'
        '        "kind": "visible",\n'
        '        "expected": true\n'
        "      },\n"
        '      "requires": []\n'
        "    }\n"

        "  ],\n"

        '  "expected_result": "User is authenticated and redirected to dashboard",\n'
        '  "confidence": "high"\n'
        "}\n"
    )

    return (
        "<s>[INST]\n"

        "You are a senior QA automation architect.\n"
        "Interpret natural language test cases into a structured execution model.\n"
        "Your output will be consumed by a GENERIC Selenium execution engine.\n"
        "The engine must work for ANY website, ANY form, ANY login page, ANY dashboard, ANY CRUD flow.\n\n"

        "This is NOT a translation task.\n"
        "You must infer:\n"
        "- user intent\n"
        "- automation action\n"
        "- automation target\n"
        "- selectors\n"
        "- assertions\n"
        "- required data\n\n"

        "====================================================\n"
        "### Allowed channels\n"
        "====================================================\n"

        "- ui\n"
        "- api\n"
        "- assertion\n"
        "- data\n"
        "- unknown\n\n"

        "====================================================\n"
        "### Allowed actions\n"
        "====================================================\n"

        "- open_app\n"
        "- open_login\n"
        "- navigate\n"
        "- click\n"
        "- double_click\n"
        "- right_click\n"
        "- hover\n"
        "- type\n"
        "- clear\n"
        "- submit\n"
        "- upload\n"
        "- scroll\n"
        "- wait\n"
        "- select\n"
        "- checkbox\n"
        "- radio\n"
        "- drag_drop\n"
        "- assert_visible\n"
        "- assert_text\n"
        "- assert_url\n"
        "- assert_authenticated\n"
        "- assert_status\n"
        "- set_auth\n"
        "- http_request\n"
        "- set_context\n"
        "- unknown\n\n"

        "====================================================\n"
        "### Allowed target fields\n"
        "====================================================\n"

        "- kind\n"
        "- name\n"
        "- role\n"
        "- selector\n"
        "- by\n"
        "- url\n"
        "- path\n"
        "- method\n\n"

        "====================================================\n"
        "### Selector strategy (CRITICAL)\n"
        "====================================================\n"

        "- ALWAYS infer selectors for UI actions.\n"
        "- NEVER leave selector empty for UI interactions.\n"
        "- Prefer stable selectors.\n"
        "- Prefer semantic selectors.\n"
        "- Keep selectors short and reusable.\n\n"

        "Selector priority:\n"
        "1. id\n"
        "2. name\n"
        "3. css\n"
        "4. xpath\n\n"

        "Allowed selector strategies:\n"
        "- id\n"
        "- name\n"
        "- css\n"
        "- xpath\n\n"

        "Examples:\n"

        'Good selector:\n'
        '{ "selector": "#email", "by": "css" }\n\n'

        'Good selector:\n'
        '{ "selector": "input[name=email]", "by": "css" }\n\n'

        'Good selector:\n'
        '{ "selector": "//button[contains(text(), \'Login\')]", "by": "xpath" }\n\n'

        "====================================================\n"
        "### UI interpretation rules\n"
        "====================================================\n"

        "- Any navigation step MUST map to action=\"open_app\".\n"
        "- If explicitly about authentication page use action=\"open_login\".\n"
        "- Never classify navigation as unknown.\n"
        "- Infer the most probable action.\n"
        "- Infer assertions whenever possible.\n\n"

        "Examples:\n"

        'Input: "Open form page"\n'
        'Output action: "open_app"\n\n'

        'Input: "Go to dashboard"\n'
        'Output action: "open_app"\n\n'

        'Input: "Open login page"\n'
        'Output action: "open_login"\n\n'

        'Input: "Click submit button"\n'
        'Output action: "click"\n\n'

        'Input: "Verify success message"\n'
        'Output action: "assert_text"\n\n'

        "====================================================\n"
        "### Assertion rules\n"
        "====================================================\n"

        "- Use assert_visible when verifying UI visibility.\n"
        "- Use assert_text when verifying messages or labels.\n"
        "- Use assert_url when verifying redirects.\n"
        "- Use assert_status for API validations.\n"
        "- Assertions should contain expected values whenever possible.\n\n"

        "====================================================\n"
        "### Credential handling rules\n"
        "====================================================\n"

        "- NEVER hardcode passwords.\n"
        "- Use value.source=\"credential\" for secrets.\n"
        "- Use keys:\n"
        "  - email\n"
        "  - username\n"
        "  - password\n"
        "  - apiToken\n\n"

        "====================================================\n"
        "### Hard rules\n"
        "====================================================\n"

        "- Output ONLY valid JSON.\n"
        "- Do NOT explain anything.\n"
        "- Do NOT generate selenium code.\n"
        "- Preserve input step order.\n"
        "- Preserve one input step → one output step.\n"
        "- Use exactly version=\"execution-model/v1\".\n"
        "- Use action=\"unknown\" ONLY if impossible to infer.\n"
        "- The output must be executable by a generic automation engine.\n\n"

        "====================================================\n"
        "### Required JSON shape\n"
        "====================================================\n"

        f"{example}\n"

        "====================================================\n"
        "### Test case\n"
        "====================================================\n"

        f"- id: {test_case_id or ''}\n"
        f"- title: {title or ''}\n"
        f"- expected_result: {expected_result or ''}\n\n"

        "====================================================\n"
        "### Steps\n"
        "====================================================\n"

        f"{step_lines}\n\n"

        "====================================================\n"
        "### Execution context\n"
        "====================================================\n"

        f"{context_lines or '(none)'}\n"

        "[/INST]"
    )