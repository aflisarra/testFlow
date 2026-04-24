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
    """
    Prompt template only.
    Forces JSON reliability and a balanced case mix.
    """
    project_block = project_title.strip() or "(not provided)"
    style_block = style_config.strip() or "(none)"

    req_lines: List[str] = []
    for r in linked_requirements[:18]:
        req_lines.append(f"- {r.get('id')} [{r.get('module')}] ({r.get('priority')}): {r.get('text')}")

    chunk_lines: List[str] = []
    for ch in spec_chunks[:6]:
        chunk_lines.append(f"## {ch.get('title')}\n{ch.get('text')[:900]}")

    example = (
        '{\n'
        '  "test_cases": [\n'
        '    {\n'
        '      "id": "TC-1.1",\n'
        '      "title": "Login succeeds with valid credentials",\n'
        '      "steps": ["Open login page", "Enter valid email and password", "Click Sign in"],\n'
        '      "expected_result": "User is authenticated and redirected to dashboard",\n'
        '      "priority": "High",\n'
        '      "type": "Positive"\n'
        '    }\n'
        '  ]\n'
        '}\n'
    )

    return (
        "<s>[INST]\n"
        "You are a Senior QA Engineer.\n"
        "Follow ISTQB and write test cases that are realistic and verifiable.\n"
        "You MUST use only the provided spec content. Do NOT invent UI elements or endpoints.\n\n"
        "### Task\n"
        "Generate 4 to 6 test cases for the given test plan.\n\n"
        "### Required mix\n"
        "- Include at least: 1 Positive, 1 Negative, 1 Boundary, 1 Validation or Error handling.\n"
        "- Add Permission cases ONLY if roles/permissions exist in spec.\n\n"
        "### Hard rules\n"
        "- No duplicates.\n"
        "- Steps must be executable by a tester.\n"
        "- expected_result must be specific and measurable.\n"
        "- priority must be one of: High, Medium, Low.\n"
        "- type must be one of: Positive, Negative, Boundary, Permission, Validation, Error handling.\n\n"
        "### Output format (STRICT)\n"
        "- Output ONLY valid JSON.\n"
        "- Output a JSON object with a single key: \"test_cases\".\n"
        "- Each test case object has exactly: id, title, steps, expected_result, priority, type.\n"
        "- steps is an array of 3-6 strings.\n\n"
        "### Example\n"
        f"{example}\n"
        "### Test plan\n"
        f"- id: {plan_id}\n"
        f"- title: {plan_title}\n"
        f"- description: {plan_description}\n\n"
        "### Context\n"
        f"- Project: {project_block}\n"
        f"- UI Style Config: {style_block}\n\n"
        "### Linked requirements (subset)\n"
        + "\n".join(req_lines)
        + "\n\n"
        "### Spec chunks (subset)\n"
        + "\n\n".join(chunk_lines)
        + "\n\n"
        "[/INST]"
    )

