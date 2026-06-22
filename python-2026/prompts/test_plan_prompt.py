from __future__ import annotations

from typing import List, Dict


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
    for ch in spec_chunks[:10]:
        chunk_lines.append(
            f"## {ch.get('title')}\n{ch.get('text')[:900]}"
        )

    


    example = """
{
  "test_plans": [
    {
      "id": "TP-1",
      "title": "Student Registration",
      "description": "Verification of student registration workflow",
      "objective": "Verify that student registration behaves according to specification",
      "scope": "Student creation, required fields, and submission flow",
      "priority": "High"
    }
  ]
}
"""


    return (
        "<s>[INST]\n"

        "You are a Senior QA Engineer specialized in test analysis.\n"
        "Use ISTQB principles for test planning.\n\n"

        "Your task is to transform the provided specification into professional QA test plans.\n\n"

        "CORE LOGIC:\n"
        "A test plan represents a REAL application feature, business workflow, or user journey.\n"
        "The specification is the only source of truth.\n\n"

        "DO NOT:\n"
        "- invent features\n"
        "- add generic QA areas\n"
        "- create Security, Performance, CRUD, Authentication plans unless explicitly described\n"
        
        "- create plans only because they are common in QA projects\n\n"

        "DO:\n"
        "- identify actual features from the specification\n"
        "- group related flows together\n"
        "- create meaningful feature-level test plans\n"
        "- avoid duplicates\n"
        "- create fewer plans if the specification is small\n\n"


        "### Generation rules\n"
        "- Minimum: only what exists in specification\n"
        "- Maximum: 6 plans\n"
        "- One plan = one feature/workflow\n"
        "- Scope must describe what will be tested\n"
        "- Objective must describe verification purpose\n\n"


        "### Output STRICT JSON ONLY\n"
        "No markdown.\n"
        "No explanation.\n\n"

        "Return exactly:\n"
        "{ \"test_plans\": [] }\n\n"

        "Each object MUST contain ONLY:\n"
"id, title, description, objective, scope, priority\n\n"

        "Priority values:\n"
        "Critical | High | Medium | Low\n\n"

    


        "### Example\n"
        f"{example}\n"


        "### Project\n"
        f"{project_block}\n\n"

        "### UI Style\n"
        f"{style_block}\n\n"


        "### Specification\n"
        + "\n\n".join(chunk_lines)
        
        + "\n\n"

        "[/INST]"
    )
