from __future__ import annotations

import json
from typing import Any, Dict, List


def build_test_plan_prompt(
    *,
    project_title: str,
    style_config: str,
    modules: List[str],
    requirements: List[Dict[str, str]],
    spec_chunks: List[Dict[str, str]],
    features: List[Dict[str, str]] | None = None,
    business_rules: List[Dict[str, str]] | None = None,
    target_count: int = 5,
) -> str:

    project_block = project_title.strip() or "Software System"
    style_block = style_config.strip() or "(standard)"

    features_list = features or []
    rules_list = business_rules or []

    # Format Features block
    features_text = ""
    if features_list:
        features_text = "\n".join(
            f"- Feature: {f.get('title')}\n  Details: {f.get('text')}"
            for f in features_list[:20]
        )
    else:
        # If no explicit features passed, format from spec_chunks
        features_text = "\n\n".join(
            f"## {ch.get('title')}\n{ch.get('text')}"
            for ch in spec_chunks[:10]
        )

    # Format Business Rules block
    rules_text = ""
    if rules_list:
        rules_text = "\n".join(
            f"- [{r.get('title')}]: {r.get('rule')}"
            for r in rules_list[:25]
        )
    else:
        rules_text = "(Apply standard validation and business logic constraints from the specification)"

    example = """
{
  "test_plans": [
    {
      "id": "TP-1",
      "title": "User Authentication & Access Control",
      "description": "Verify user login, credential validation, session handling, and password recovery according to Section 5 Features and Section 6 Business Rules.",
      "objective": "Ensure secure authentication and role-based access restrictions operate as specified.",
      "scope": "Login form, credentials verification, password reset, session timeout, authentication error handling.",
      "priority": "Critical",
      "requirements": ["REQ-001", "REQ-002"]
    },
    {
      "id": "TP-2",
      "title": "User Account Registration & Profile Setup",
      "description": "Verify complete registration workflow, email verification, input constraints, and profile creation.",
      "objective": "Ensure new users can register accurately with valid data and mandatory validation rules are enforced.",
      "scope": "Registration form, mandatory fields validation, duplicate email check, activation flow.",
      "priority": "High",
      "requirements": ["REQ-003", "REQ-004"]
    }
  ]
}
"""

    return (
        "<s>[INST]\n"
        "You are a Lead QA Engineer specialized in Software Test Planning according to ISTQB standards.\n\n"

        "### OBJECTIVE\n"
        "Generate a complete, professional suite of QA Test Plans based directly on the **Features (Section 5)** and **Business Rules (Section 6)** extracted from the SRS document.\n\n"

        "### CORE RULES\n"
        "1. **Feature-Driven Plans**: Each Test Plan MUST correspond to a major functional Feature/Module described in the specification.\n"
        "2. **Business Rules Verification**: Each Test Plan MUST integrate the validation rules and business constraints from Section 6.\n"
        "3. **Clear Functional Titles**: Use real, descriptive business titles (e.g. 'User Authentication & Login', 'Task Creation & Assignment', 'Leave Request Management'). NEVER use robotic placeholders like 'REQ-005 - Permission'.\n"
        "4. **Traceability**: Link each test plan to its relevant requirement IDs from the provided REQUIREMENTS list.\n"
        "5. **Priority**: Assign realistic priorities: 'Critical', 'High', 'Medium', or 'Low'.\n\n"

        f"Generate {target_count} comprehensive test plan(s) covering the key features.\n\n"

        "### OUTPUT FORMAT\n"
        "Return ONLY valid JSON without markdown formatting or introductory text.\n"
        "JSON Schema:\n"
        "{\n"
        '  "test_plans": [\n'
        "    {\n"
        '      "id": "TP-1",\n'
        '      "title": "Clear Feature Title",\n'
        '      "description": "Functional description of what is tested",\n'
        '      "objective": "QA goal for this feature",\n'
        '      "scope": "Components and business rules covered",\n'
        '      "priority": "Critical | High | Medium | Low",\n'
        '      "requirements": ["REQ-001", "REQ-002"]\n'
        "    }\n"
        "  ]\n"
        "}\n\n"

        "### EXAMPLE\n"
        f"{example}\n\n"

        "### PROJECT CONTEXT\n"
        f"Project: {project_block}\n"
        f"Style: {style_block}\n\n"

        "### 5. FEATURES & FUNCTIONAL MODULES (SPECIFICATION)\n"
        f"{features_text}\n\n"

        "### 6. BUSINESS RULES & VALIDATION CONSTRAINTS (SPECIFICATION)\n"
        f"{rules_text}\n\n"

        "### EXTRACTED REQUIREMENTS (FOR TRACEABILITY)\n"
        f"{json.dumps(requirements[:40], indent=2, ensure_ascii=False)}\n\n"

        "[/INST]"
    )
