from __future__ import annotations

import json
from typing import Dict, List


def build_test_plan_prompt(
    *,
    project_title: str,
    style_config: str,
    modules: List[str],
    requirements: List[Dict[str, str]],
    spec_chunks: List[Dict[str, str]],
) -> str:

    project_block = project_title.strip() or "(not provided)"
    style_block = style_config.strip() or "(none)"

    chunk_lines = []

    for ch in spec_chunks[:5]:
        chunk_lines.append(
            f"## {ch.get('title')}\n{ch.get('text')[:500]}"
        )

    example = """
{
  "test_plans": [
    {
      "id": "TP-1",
      "title": "Account Creation",
      "description": "Verification of the account creation feature described in the SRS",
      "objective": "Ensure the feature satisfies its SRS objectives and requirements",
      "scope": "Feature behavior, supported workflow, and related business outcomes",
      "priority": "High",
      "requirements": ["REQ-001"]
    },
    {
      "id": "TP-2",
      "title": "User Login",
      "description": "Verification of the login feature described in the SRS",
      "objective": "Ensure users can access the application according to SRS objectives",
      "scope": "Login feature behavior and expected business outcome",
      "priority": "Medium",
      "requirements": ["REQ-002"]
    }
  ]
}
"""

    return (
        "<s>[INST]\n"

        "You are a Senior QA Engineer specialized in test analysis.\n"
        "Apply ISTQB principles.\n\n"

        "### PIPELINE\n"
        "SRS -> Text Extraction -> Chunking -> Test Plan Generation -> Test Case Generation.\n"
        "Use the SRS structure. Do not use keyword heuristics.\n\n"

        "### TASK\n"
        "Generate test plans from the SRS sections: Features, Project Description, and Objectives.\n"
        "Do NOT generate test plans from UI Components, Business Rules, Validation Rules, Pass Criteria, or Fail Criteria.\n\n"

        "### REQUIREMENTS RULE\n"
        "The provided REQUIREMENTS are extracted only from Features, Project Description, and Objectives.\n"
        "Generate test plans ONLY from functionality represented in those REQUIREMENTS.\n"
        "Every test plan MUST be supported by at least one requirement.\n"
        "Every test plan MUST contain a non-empty requirements array.\n"
        "Use ONLY requirement IDs that exist in the provided REQUIREMENTS.\n"
        "Never invent requirement IDs.\n"
        "If no valid requirement supports a test plan, do not generate it.\n"
        "Do not independently discover features from UI components or validation details.\n\n"

        "### COVERAGE RULE\n"
        "Cover the different Features, Project Description goals, and Objectives represented by the REQUIREMENTS.\n"
        "Do not stop after covering only the first requirements.\n"
        "Group closely related requirements only when the resulting plan still clearly covers them.\n\n"

        "### REALISTIC FLOW RULE\n"
        "A test plan may focus on one requirement, but its description, objective, and scope must remain executable in the real workflow.\n"
        "If the feature depends on fields, prerequisites, account state, verification state, or navigation context described in the SRS, include those dependencies in the plan scope.\n"
        "Do not describe isolated field testing that leaves the rest of a required form or workflow empty.\n\n"

        "### TRACEABILITY RULE\n"
        "Every generated test plan must be traceable to at least one provided requirement ID.\n"
        "If a plan cannot be linked to a valid requirement ID, do not generate it.\n\n"

        "### REDUNDANCY RULE\n"
        "Do not generate duplicate plans.\n"
        "Merge related functionality into a single business-oriented plan.\n\n"
        
        "### PRIORITY RULE\n"
        "Priority values:\n"
        "- Critical\n"
        "- High\n"
        "- Medium\n"
        "- Low\n\n"

        "### OUTPUT FORMAT\n"
        "Return ONLY valid JSON.\n"
        "No markdown.\n"
        "No explanations.\n\n"

        "Root object MUST be:\n"
        "{ \"test_plans\": [] }\n\n"

        "Each plan MUST contain:\n"
"- id\n"
"- title\n"
"- description\n"
"- objective\n"
"- scope\n"
"- priority\n"
"- requirements\n\n"

"### WRITING STYLE RULE\n"
"Keep all generated text concise.\n"
"\n"
"title:\n"
"- maximum 5 words\n"
"\n"
"description:\n"
"- maximum 15 words\n"
"- one short sentence\n"
"\n"
"objective:\n"
"- maximum 15 words\n"
"- one short sentence\n"
"\n"
"scope:\n"
"- maximum 20 words\n"
"- list only the key functionality covered\n"
"\n"
"Do not write long explanations.\n"
"Do not write paragraphs.\n"
"Use short business-oriented wording.\n\n"

"Generate between 10 and 10 test plans maximum.\n\n"

        "### EXAMPLE\n"
        f"{example}\n\n"

        "### PROJECT\n"
        f"{project_block}\n\n"

        "### UI STYLE\n"
        f"{style_block}\n\n"

        "### REQUIREMENTS\n"
        f"{json.dumps(requirements, indent=2, ensure_ascii=False)}\n\n"

        "### SPECIFICATION\n"
        + "\n\n".join(chunk_lines)
        + "\n\n"

        "[/INST]"
    )
