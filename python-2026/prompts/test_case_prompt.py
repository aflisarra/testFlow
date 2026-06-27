from __future__ import annotations

from typing import List, Dict


def build_test_case_prompt(
    *,
    plan_id: str,
    plan_title: str,
    plan_description: str,
    project_title: str,
    style_config: str,
    linked_requirements: List[Dict[str, str]],
    spec_chunks: List[Dict[str, str]],
) -> str:

    project_block = project_title.strip() or "(not provided)"
    style_block = style_config.strip() or "(none)"

    req_lines: List[str] = []
    for r in linked_requirements[:5]:
        req_lines.append(
            f"- {r.get('id')} [{r.get('module')}] "
            f"({r.get('priority')}): {r.get('text')}"
        )

    chunk_lines: List[str] = []
    for ch in spec_chunks[:3]:
        chunk_lines.append(
            f"## {ch.get('title')}\n{ch.get('text')[:500]}"
        )


    example = (
    '{\n'
    '  "test_cases": [\n'
    '    {\n'
    '      "id": "TC-1.1",\n'
    '      "title": "Login with valid credentials",\n'
    '      "objective": "Verify that a user can login successfully",\n'
    '      "steps": [\n'
    '        "Open login page",\n'
    '        "Enter valid credentials",\n'
    '        "Click login button"\n'
    '      ],\n'
    '      "stepDetails": [\n'
    '        {\n'
    '          "step": "Open login page",\n'
    '          "expected_result": "Login page is displayed"\n'
    '        },\n'
    '        {\n'
    '          "step": "Enter valid credentials",\n'
    '          "expected_result": "Username and password fields accept the provided values"\n'
    '        },\n'
    '        {\n'
    '          "step": "Click login button",\n'
    '          "expected_result": "User is redirected to dashboard"\n'
    '        }\n'
    '      ],\n'
    '      "expected_result": "User is redirected to dashboard",\n'
    '      "test_data": {\n'
    '        "email": "valid@test.com"\n'
    '      },\n'
    '      "priority": "High",\n'
    '      "severity": "Critical",\n'
    '      "type": "Positive"\n'
    '    }\n'
    '  ]\n'
    '}'
)


    return (
        "<s>[INST]\n"

        "You are a Senior QA Engineer.\n"
        "Follow ISTQB principles.\n"
        "Generate realistic and executable test cases.\n"
        "Use ONLY provided specification.\n"
        "Do NOT invent pages, APIs, buttons, or fields.\n\n"


        "### Task\n"
        "Generate exactly 3 test cases only.\n"
"Each test case must have 3-5 steps maximum.\n"
"Do not generate extra test cases.\n"
"Keep JSON small and concise.\n\n"


        "### Required mix (MANDATORY)\n"
"- TC-1 must be Positive.\n"
"- TC-2 must be Negative.\n"
"- TC-3 must be Boundary.\n"
"- Use Validation or Error handling only if relevant.\n\n"


        "### Hard rules\n"
        "- No duplicates.\n"
        "- Steps must be executable by a tester.\n"
        "- expected_result must be precise.\n"
        "- stepDetails is required and must contain one object per step.\n"
        "- Each stepDetails item must include: step, expected_result.\n"
        "- Keep the step text identical between steps[] and stepDetails[].\n"
        "- priority values only: Critical, High, Medium, Low.\n"
        "- severity values only: Blocker, Critical, Major, Minor, Trivial.\n"
        "- type values only: Positive, Negative, Boundary, Permission, Validation, Error handling.\n\n"


        "### Output format STRICT\n"
        "- Output ONLY valid JSON.\n"
        "- No markdown.\n"
        "- No explanation.\n"
        "- JSON object must contain ONLY key: test_cases.\n"
        "- Each test case MUST contain exactly:"
        "id, title, objective, steps, stepDetails, expected_result, test_data, priority, severity, type, requirements.\n"
        "- requirements must reference linked requirement ids whenever available.\n"
        "- do not invent requirements; use only the provided context.\n\n"


        "### Navigation rule\n"
        "- Steps containing open/navigate/go to must only mention pages.\n"
        "- Never include URLs.\n"
        "Examples:\n"
        "Open application\n"
        "Open login page\n"
        "Navigate to dashboard\n\n"


        "### Example\n"
        f"{example}\n\n"


        "### Test plan\n"
        f"- id: {plan_id}\n"
        f"- title: {plan_title}\n"
        f"- description: {plan_description}\n\n"


        "### Context\n"
        f"- Project: {project_block}\n"
        f"- UI Style: {style_block}\n\n"


        "### Linked requirements (context only)\n"
        + "\n".join(req_lines)
        + "\n\n"


        "### Spec chunks\n"
        + "\n\n".join(chunk_lines)
        + "\n\n"

        "[/INST]"
    )
