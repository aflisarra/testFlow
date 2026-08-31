from __future__ import annotations

import json
from collections.abc import Sequence


def build_test_case_prompt(
    *,
    plan_id: str,
    plan_title: str,
    plan_description: str,
    project_title: str,
    style_config: str,
    linked_requirements: list[dict[str, str]],
    spec_chunks: list[dict[str, str]] | None = None,
    filtered_items: Sequence[object] | None = None,
) -> str:

    project_block = project_title.strip() or "(not provided)"
    style_block = style_config.strip() or "(none)"

    chunk_lines = []

    if filtered_items is not None:
        for item in filtered_items:
            heading_path = getattr(item, "heading_path", [])
            heading = " > ".join(heading_path) if heading_path else "(no heading)"
            chunk_lines.append(
                f"## [{getattr(item, 'role', 'UNKNOWN')}] {heading}\n{getattr(item, 'text', '')}"
            )
    else:
        for ch in (spec_chunks or [])[:5]:
            chunk_lines.append(f"## {ch.get('title')}\n{ch.get('text')[:500]}")

    example = """
{
  "test_cases": [
    {
      "id": "TC-1.1",
      "title": "Successful Account Creation",
      "objective": "Verify that the selected test plan workflow succeeds when SRS rules and criteria are satisfied",
      "preconditions": [
        "Registration page is displayed"
      ],
      "test_data": {
        "field_1": "valid value",
        "field_2": "valid value"
      },
      "steps": [
        "Navigate to the SRS-described workflow entry point",
        "Complete all SRS-required UI components with valid data",
        "Submit using the SRS-described action"
      ],
      "stepDetails": [
        {
          "step": "Navigate to the SRS-described workflow entry point",
          "expected_result": "The workflow entry point is available"
        },
        {
          "step": "Complete all SRS-required UI components with valid data",
          "expected_result": "The provided data satisfies the SRS validation rules"
        },
        {
          "step": "Submit using the SRS-described action",
          "expected_result": "The SRS pass criteria are met"
        }
      ],
      "expected_result": "The selected test plan behavior satisfies the SRS pass criteria",
      "priority": "High",
      "severity": "Major",
      "type": "Validation",
      "requirements": []
    }
  ]
}
"""

    return (
        "<s>[INST]\n"
        "You are a Senior QA Engineer specialized in test analysis.\n"
        "Apply ISTQB principles.\n\n"
        "### TASK\n"
        "Generate detailed QA test cases for the confirmed test plan.\n"
        "Use ONLY information explicitly described in the SRS.\n\n"
        "### CONFIRMED TEST PLAN\n"
        f"ID: {plan_id}\n"
        f"TITLE: {plan_title}\n"
        f"DESCRIPTION: {plan_description}\n\n"
        "### LINKED REQUIREMENTS\n"
        f"{json.dumps(linked_requirements, indent=2, ensure_ascii=False)}\n\n"
        "### SPECIFICATION\n" + "\n\n".join(chunk_lines) + "\n\n"
        "### PLAN CONSISTENCY RULE\n"
        "Every generated test case MUST be consistent with the confirmed test plan.\n"
        "A test case must stay inside the scope of the selected test plan.\n"
        "Every step must be traceable to the selected test plan.\n\n"
        "### SRS SOURCE RULE\n"
        "Generate test cases from the selected Test Plan plus these SRS sections only:\n"
        "- UI Components\n"
        "- Business Rules\n"
        "- Validation Rules\n"
        "- Pass Criteria\n"
        "- Fail Criteria\n\n"
        "Use only UI Components described in the SRS, including fields, buttons, dropdowns, checkboxes, radio buttons, tables, date pickers, and upload controls.\n"
        "Do not invent screens, workflows, actions, or UI components.\n\n"
        "### REALISTIC EXECUTION RULE\n"
        "Test cases must be executable in the real workflow, not isolated field fragments.\n"
        "If the behavior under test belongs to a form or flow with other mandatory fields, prerequisites, account state, verification state, or navigation context, include those required dependencies in preconditions, test_data, and steps.\n"
        "Do not submit a form while leaving required fields empty unless the specific test objective is to validate the empty-field error.\n"
        "For a field-focused test, fill the other required inputs with valid SRS-compliant data before submitting, unless those fields are the negative condition being tested.\n\n"
        "### CORE LOGIC\n"
        "- A test case validates one functional behavior or business rule.\n"
        "- The SRS is the ONLY source of truth.\n"
        "- Generate positive, negative, validation, boundary and error scenarios when supported by the SRS.\n"
        "- Do not invent undocumented functionality.\n\n"
        "### TRACEABILITY RULE\n"
        "Every generated test case should be traceable to at least one specification requirement.\n\n"
        "### STEP DETAILS RULE\n"
        "Every item in stepDetails MUST contain:\n"
        "- step\n"
        "- expected_result\n\n"
        "Neither value may be empty.\n\n"
        "### TEST DATA RULE\n"
        "test_data MUST always be a JSON object.\n"
        "If no test data exists, return {}.\n\n"
        "### CRITICAL RULE\n"
        "Return ONLY a JSON object with root key test_cases.\n"
        "Do NOT return test_plans.\n"
        "Do NOT return plans.\n"
        "Do NOT return user_journey.\n"
        "Do NOT return explanations.\n\n"
        "### OUTPUT FORMAT\n"
        "Return exactly:\n"
        '{ "test_cases": [] }\n\n'
        "Each test case MUST contain:\n"
        "- id\n"
        "- title\n"
        "- objective\n"
        "- preconditions\n"
        "- test_data\n"
        "- steps\n"
        "- stepDetails\n"
        "- expected_result\n"
        "- priority\n"
        "- severity\n"
        "- type\n"
        "- requirements\n\n"
        "Priority values:\n"
        "Critical | High | Medium | Low\n\n"
        "Severity values:\n"
        "Blocker | Critical | Major | Minor | Trivial\n\n"
        "### WRITING STYLE RULE\n"
        "Keep all generated text concise.\n\n"
        "title:\n"
        "- maximum 6 words\n\n"
        "objective:\n"
        "- maximum 15 words\n"
        "- one short sentence\n\n"
        "preconditions:\n"
        "- short sentences only\n"
        "- maximum 10 words per item\n\n"
        "steps:\n"
        "- maximum 12 words per step\n"
        "- use action verbs\n\n"
        "expected_result:\n"
        "- maximum 15 words\n"
        "- short sentence only\n\n"
        "stepDetails.expected_result:\n"
        "- maximum 15 words\n"
        "- short sentence only\n\n"
        "requirements:\n"
        "- only requirement IDs\n\n"
        "test_data:\n"
        "- use a JSON object with meaningful keys\n"
        "- Example:\n"
        "{\n"
        '  "email": "user@test.com",\n'
        '  "password": "Password123",\n'
        '  "username": "user123",\n'
        '  "country": "Albania"\n'
        "}\n\n"
        "Do NOT return test_data as a list.\n"
        "Do NOT return long explanations.\n"
        "Do NOT return paragraphs.\n"
        "Generate between 3 and 5 test cases maximum.\n\n"
        "### EXAMPLE\n"
        f"{example}\n\n"
        "### PROJECT\n"
        f"{project_block}\n\n"
        "### UI STYLE\n"
        f"{style_block}\n\n"
        "[/INST]"
    )
