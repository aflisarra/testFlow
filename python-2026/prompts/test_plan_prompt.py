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
      "title": "User Registration",
      "description": "Verification of the complete user registration workflow",
      "objective": "Verify that a new user can successfully create an account according to the specification",
      "scope": "Registration form, mandatory fields, validation rules, and account creation process",
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
        "A test plan represents a real business feature, user workflow, or functional area explicitly described in the specification.\n"
        "The specification is the only source of truth.\n"
        "A test plan is not a test case.\n"
        "A test plan groups related test cases belonging to the same business objective.\n\n"

        "SOURCE PRIORITY:\n"
        "Information priority order:\n"
        "1. Specification chunks (highest priority)\n"
        "2. Linked requirements\n"
        "3. Modules\n"
        "4. Project metadata\n\n"

        "If information conflicts, always follow the specification.\n"
        "Every generated test plan must be traceable to at least one specification chunk.\n"
        "Do not create a plan if no specification section supports it.\n\n"

        "BUSINESS FEATURE RULE:\n"
        "Generate ONLY business features explicitly described in the specification.\n"
"Do not invent Authentication, CRUD, Registration, Login, Search, Filter, Export, Import, Dashboard, User Management or Settings unless they are explicitly described.\n"
"If a feature is not clearly documented in the specification, do not generate a test plan for it.\n\n"
        "Create plans only for features explicitly described in the specification.\n"
        "Do not create technical or generic QA plans.\n\n"

        "Valid examples:\n"
        "- User Registration\n"
        "- User Authentication\n"
        "- Password Reset\n"
        "- Checkout Process\n"
        "- Appointment Booking\n\n"

        "Invalid examples:\n"
        "- Validation Testing\n"
        "- Security Testing\n"
        "- CRUD Testing\n"
        "- Input Testing\n\n"

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

        "### REDUNDANCY RULE\n"
        "Do not create multiple plans describing the same workflow.\n"
        "Merge related functionality into a single business-oriented plan.\n\n"

        "Good:\n"
        "- Registration Workflow\n"
        "- Checkout Workflow\n\n"

        "Bad:\n"
        "- Email Registration\n"
        "- Password Registration\n"
        "- Username Registration\n\n"

        "### GENERATION RULES\n"
        "Generate the minimum number of plans required to cover all business features described in the specification.\n\n"

        "One plan must represent one complete business workflow or feature.\n\n"

        "Avoid creating plans for:\n"
        "- individual fields\n"
        "- individual buttons\n"
        "- generic QA categories\n\n"

        "Prefer:\n"
        "- User Registration\n"
        "- User Authentication\n"
        "- Checkout Process\n"
        "- Appointment Booking\n\n"

        "Instead of:\n"
        "- Email Validation\n"
        "- Password Validation\n"
        "- Button Verification\n\n"

        "Usually generate between 1 and 6 plans.\n"
        "- One plan = one feature/workflow\n"
        "- Scope must describe what will be tested\n"
        "- Objective must describe verification purpose\n\n"

        "### TRACEABILITY RULE\n"
        "Every generated test plan must be traceable to at least one specification section.\n"
        "If a feature is not described in the specification, do not create a plan for it.\n\n"

        "### WORKFLOW GRANULARITY RULE\n"
        "If a feature contains multiple fields participating in the same workflow, create one plan for the workflow and not one plan per field.\n\n"

        "Example:\n"
        "Registration Page containing:\n"
        "- Email\n"
        "- Password\n"
        "- Username\n"
        "- Country\n\n"

        "Generate:\n"
        "- Registration Workflow\n\n"

        "Do not generate:\n"
        "- Email Feature\n"
        "- Password Feature\n"
        "- Username Feature\n"
        "- Country Feature\n\n"

        "### OUTPUT FORMAT STRICT JSON ONLY\n"
        "No markdown.\n"
        "No explanation.\n\n"

        "Return exactly:\n"
        "{ \"test_plans\": [] }\n\n"

        "Each object MUST contain ONLY:\n"
        "id, title, description, objective, scope, priority\n\n"

        "Priority values:\n"
        "Critical | High | Medium | Low\n\n"

        "### EXAMPLE\n"
        f"{example}\n"

        "### PROJECT\n"
        f"{project_block}\n\n"

        "### UI STYLE\n"
        f"{style_block}\n\n"

        "### SPECIFICATION\n"
        + "\n\n".join(chunk_lines)
        + "\n\n"

        "[/INST]"
    )