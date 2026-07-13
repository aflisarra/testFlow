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
    for ch in spec_chunks:
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
    

'          "preconditions": [\n'
'           "Login page is accessible",\n'
'           "User is not authenticated"\n'
'            ],\n'
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
'        "email": "john.doe@example.com",\n'
'        "password": "ValidPass123!",\n'
'        "username": "john-doe-2026",\n'
'        "country": "Tunisia"\n'
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

    "You are a Senior QA Engineer and Test Analyst.\n"
    "Follow ISTQB principles.\n"
    "Generate realistic, executable, and business-oriented test cases.\n\n"

    "### SOURCE TRACEABILITY\n"
    "Test cases must be generated ONLY from:\n"
    "1. Specification chunks linked to this test plan\n"
    "2. Linked requirements\n\n"

    "Never use common application assumptions.\n\n"
    "Never infer common software features.\n"
"Do not invent CRUD operations, authentication failures, rejected login, locked account, disabled account, search, filter, export, import, permissions, security tests or performance tests unless they are explicitly described in the specification.\n\n"

    "Do not invent:\n"
    "- pages\n"
    "- buttons\n"
    "- fields\n"
    "- workflows\n"
    "- validation rules\n"
    "- API calls\n"
    "- business rules\n\n"

    "The specification is the only source of truth.\n\n"

    "### TASK\n"
    "Generate enough test cases to cover all major business workflows, validation rules, required fields, and error scenarios described in the specification.\n"
    "Avoid redundant test cases.\n"
    "Keep only meaningful and unique scenarios.\n\n"

   "### QA TEST DESIGN RULES\n"
"Apply ISTQB test design techniques.\n\n"

"Generate ONLY the test categories explicitly supported by the specification.\n"
"If the specification does not describe validation, boundary, error handling, or negative scenarios, do NOT generate them.\n"
"If the specification only describes the normal workflow, generate only Positive test cases.\n\n"

"Possible categories:\n"
"- Happy Path\n"
"- Validation\n"
"- Boundary\n"
"- Error Handling\n"
"- Negative\n\n"

"Only generate a category when it is explicitly described in the specification.\n\n"

    "Avoid:\n"
    "- Duplicate test cases\n"
    "- Redundant scenarios\n"
    "- Artificial scenarios\n"
    "- Single-field scenarios that cannot be executed independently\n\n"

    "### BUSINESS WORKFLOW RULE\n"
    "Test cases must represent complete user workflows.\n"
    "Do not create isolated field validation scenarios when the application requires multiple mandatory fields.\n"
    "Every test case must contain all prerequisite actions required to reach the validation point.\n\n"

    "### VALIDATION TESTING RULE\n"
    "When testing a specific field validation:\n"
    "- All other mandatory fields must contain valid values.\n"
    "- Only the target field may contain invalid or boundary data.\n"
    "- Test cases must isolate the validation being tested.\n"
    "- Validation failures must be attributable to a single field.\n\n"

    "Example:\n"
    "Invalid Email Test:\n"
    "- Email = invalid\n"
    "- Password = valid\n"
    "- Username = valid\n"
    "- Country = valid\n\n"

    "Weak Password Test:\n"
    "- Email = valid\n"
    "- Password = weak\n"
    "- Username = valid\n"
    "- Country = valid\n\n"

    "### WORKFLOW COMPLETENESS RULE\n"
    "For registration, signup, checkout, payment, booking, profile creation, account creation, or any multi-field workflow:\n"
    "- Include all mandatory fields.\n"
    "- Include all mandatory steps.\n"
    "- Generate complete test data.\n"
    "- Do not omit required fields.\n"
    "- Do not assume missing data.\n\n"

    
"### Preconditions Rule\n"
"Every test case MUST include preconditions.\n"
"Preconditions describe the required application state before execution.\n"
"Preconditions must be realistic and directly related to the workflow.\n"
"Do not generate empty preconditions.\n"
"At least one precondition is required.\n\n"

    "Preconditions describe the required state before execution.\n\n"

    "Examples:\n"
    "- Registration page is accessible\n"
    "- User is not authenticated\n"
    "- User is on the login page\n"
    "- Internet connection is available\n\n"

    "### TEST DATA RULE\n"
    "Generate complete, realistic, and executable test data.\n"
    "Never generate partial test data when multiple mandatory fields exist.\n\n"

    "Avoid:\n"
    "- test@test.com\n"
    "- valid@test.com\n"
    "- user123\n"
    "- abc123\n\n"

    "Prefer:\n"
    "- john.doe@example.com\n"
    "- sarah.smith@example.com\n"
    "- john-doe-2026\n"
    "- ValidPass123!\n"
    "- Tunisia\n"
    "- Romania\n\n"

    "### TEST DATA COMPLETENESS RULE\n"
    "The test_data object must contain all data required to execute the test case.\n"
    "If the workflow contains email, password, username, and country fields, all values must be provided.\n\n"
    "### JSON STRICT RULE\n"
"test_data MUST be a JSON object.\n\n"

"Allowed:\n"

"{\n"
"  \"email\": \"john@example.com\",\n"
"  \"password\": \"ValidPass123!\",\n"
"  \"username\": \"john-doe\",\n"
"  \"country\": \"Tunisia\"\n"
"}\n\n"

"Forbidden:\n"

"[\"email\",\"password\"]\n\n"

"Forbidden:\n"

"{\n"
"  \"values\": [\"john@example.com\"]\n"
"}\n\n"

"The AI must always use named fields.\n"
"Never return arrays for test_data.\n\n"
"### CRITICAL TEST DATA MAPPING RULE\n"
"The AI must NEVER return test_data as:\n"

"[\n"
"  \"john@example.com\",\n"
"  \"password123\"\n"
"]\n\n"

"or\n\n"

"[\n"
"  \"value1\",\n"
"  \"value2\"\n"
"]\n\n"

"or\n\n"

"{\n"
"  \"data\": [\"john@example.com\"]\n"
"}\n\n"

"The AI must ALWAYS return named fields.\n\n"

"Correct:\n\n"

"{\n"
"  \"email\": \"john@example.com\",\n"
"  \"password\": \"ValidPass123!\",\n"
"  \"username\": \"john-doe\",\n"
"  \"country\": \"Tunisia\"\n"
"}\n\n"

"Incorrect:\n\n"

"[\n"
"  \"john@example.com\",\n"
"  \"ValidPass123!\"\n"
"]\n\n"
    "### REDUNDANCY RULE\n"
    "Do not generate separate test cases that validate the same workflow.\n"
    "Merge related validations whenever appropriate.\n\n"

    "Prefer:\n"
    "- Successful Registration\n"
    "- Invalid Email During Registration\n"
    "- Weak Password During Registration\n"
    "- Invalid Username During Registration\n"
    "- Missing Required Field During Registration\n\n"

    "Instead of:\n"
    "- Verify Email Field\n"
    "- Verify Password Field\n"
    "- Verify Username Field\n\n"

    "### EXPECTED RESULT RULE\n"
    "Expected results must validate business behavior.\n"
    "Do not validate only UI interactions.\n\n"

    "Bad examples:\n"
    "- Button clicked successfully\n"
    "- Value entered successfully\n\n"

    "Good examples:\n"
    "- Registration proceeds to the next step\n"
    "- Email validation error is displayed\n"
    "- Account is created successfully\n"
    "- Username is rejected because it already exists\n\n"

    "### OUTPUT FORMAT STRICT\n"
    "Output ONLY valid JSON.\n"
    "No markdown.\n"
    "No explanation.\n\n"

    "Return:\n"
    "{ \"test_cases\": [] }\n\n"

    "Each test case MUST contain EXACTLY:\n"
"- id\n"
"- title\n"
"- objective\n"
"- preconditions\n"
"- steps\n"
"- stepDetails\n"
"- expected_result\n"
"- test_data\n"
"- priority\n"
"- severity\n"
"- type\n"
"- requirements\n\n"

    "### PRIORITY VALUES\n"
    "Critical | High | Medium | Low\n\n"

    "### SEVERITY VALUES\n"
    "Blocker | Critical | Major | Minor | Trivial\n\n"

    "### TYPE VALUES\n"
    "Positive | Negative | Boundary | Validation | Error handling | Permission\n\n"

    "### NAVIGATION RULE\n"
    "Steps containing open, navigate, go to, access must only reference pages.\n"
    "Never include URLs.\n\n"

    "### EXAMPLE\n"
    f"{example}\n\n"

    "### TEST PLAN\n"
    f"- id: {plan_id}\n"
    f"- title: {plan_title}\n"
    f"- description: {plan_description}\n\n"

    "### PROJECT\n"
    f"{project_block}\n\n"

    "### UI STYLE\n"
    f"{style_block}\n\n"

    "### LINKED REQUIREMENTS\n"
    + "\n".join(req_lines)
    + "\n\n"

    "### SPECIFICATION\n"
    + "\n\n".join(chunk_lines)
    + "\n\n"

    "[/INST]"
)