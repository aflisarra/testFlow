from __future__ import annotations

import json
import re
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
    ui_components: List[str],
    matched_subsection_title: str = "",
    retry_feedback: str = "",
) -> str:

    project_block = project_title.strip() or "(not provided)"
    style_block = style_config.strip() or "(none)"
    ui_component_block = json.dumps(ui_components, indent=2, ensure_ascii=False)
    requirement_block = json.dumps(linked_requirements, indent=2, ensure_ascii=False)
    subsection_block = matched_subsection_title.strip() or "(matched subsection not provided)"

    chunk_lines = []
    for ch in spec_chunks:
        chunk_lines.append(
            f"## {ch.get('title')}\n{ch.get('text')[:1200]}"
        )
    spec_block = "\n\n".join(chunk_lines).strip() or "(no matching SRS sections found)"

    # Build the few-shot example DYNAMICALLY from the actually-matched UI
    # components instead of a hardcoded scenario. A fixed example (e.g. from
    # "Add User" / "User Role dropdown") gets imitated verbatim by the model
    # even when the matched subsection is unrelated (e.g. "Change Password"),
    # which is exactly how components from another subsection used to leak
    # into generated cases. Using the real, in-scope components here removes
    # that leakage path at the source.
    #
    # The example also demonstrates a COMBINED, feature-level scenario (two
    # filter-like components used together with the subsection's own action
    # control) rather than a single isolated field check — this is what
    # keeps the model from defaulting to "one test case per component"
    # instead of testing the feature the test plan actually names.
    def _clean(name: str) -> str:
        return name.split(" (")[0].strip()

    def _control_type(name: str) -> str:
        match = re.search(r"\(([^)]+)\)\s*$", name)
        return match.group(1).strip().lower() if match else ""

    def _feature_name(title: str) -> str:
        parts = re.split(r"[›»/|:]", title or "")
        last = parts[-1].strip() if parts else ""
        return last or (title or "the matched screen")

    entry_kinds = {"input field", "password field", "date field", "dropdown"}
    action_kinds = {"button", "link"}
    entry_like = [c for c in ui_components if _control_type(c) in entry_kinds]
    action_like = [c for c in ui_components if _control_type(c) in action_kinds]

    if entry_like:
        comp_a_full = entry_like[0]
        comp_b_full = entry_like[1] if len(entry_like) > 1 else entry_like[0]
    elif ui_components:
        comp_a_full = ui_components[0]
        comp_b_full = ui_components[1] if len(ui_components) > 1 else ui_components[0]
    else:
        comp_a_full = "Example Field (input field)"
        comp_b_full = "Example Field (input field)"
    action_full = action_like[0] if action_like else (ui_components[-1] if ui_components else "Example Button (button)")

    comp_a, comp_b, action_name = _clean(comp_a_full), _clean(comp_b_full), _clean(action_full)
    feature = _feature_name(subsection_block)
    single_entry = comp_a_full == comp_b_full

    if single_entry:
        example_steps = [f"Enter a valid {comp_a} in {comp_a}", f"Click {action_name}"]
        example_step_details = [
            {"component": comp_a, "action": "enter", "value": f"a valid {comp_a}", "step": example_steps[0], "expected_result": f"{comp_a} accepts and retains the entered value"},
            {"component": action_name, "action": "click", "value": "", "step": example_steps[1], "expected_result": f"{feature} processes the request using the entered {comp_a}"},
        ]
        example_test_data = {comp_a: f"a valid {comp_a}"}
        example_title = f"{action_name} {feature} using {comp_a}"
        example_objective = f"Verify that {feature} can be filtered by {comp_a} using {action_name}."
        example_expected = f"{feature} displays results matching the selected {comp_a}."
    else:
        example_steps = [
            f"Enter a valid {comp_a} in {comp_a}",
            f"Enter a valid {comp_b} in {comp_b}",
            f"Click {action_name}",
        ]
        example_step_details = [
            {"component": comp_a, "action": "enter", "value": f"a valid {comp_a}", "step": example_steps[0], "expected_result": f"{comp_a} accepts and retains the entered value"},
            {"component": comp_b, "action": "enter", "value": f"a valid {comp_b}", "step": example_steps[1], "expected_result": f"{comp_b} accepts and retains the entered value"},
            {"component": action_name, "action": "click", "value": "", "step": example_steps[2], "expected_result": f"{feature} displays results matching the applied filters"},
        ]
        example_test_data = {comp_a: f"a valid {comp_a}", comp_b: f"a valid {comp_b}"}
        example_title = f"{action_name} {feature} using {comp_a} and {comp_b}"
        example_objective = f"Verify that {feature} can be filtered by {comp_a} and {comp_b} using {action_name}."
        example_expected = f"{feature} displays results matching the selected {comp_a} and {comp_b}."

    example = json.dumps(
        {
            "test_cases": [
                {
                    "id": "TC-1.1",
                    "title": example_title,
                    "objective": example_objective,
                    "preconditions": [f"The {feature} screen is displayed with search filters in their initial/default state"],
                    "test_data": example_test_data,
                    "steps": example_steps,
                    "stepDetails": example_step_details,
                    "expected_result": example_expected,
                    "priority": "High",
                    "severity": "Major",
                    "type": "positive",
                    "requirements": [],
                    "dependsOn": []
                }
            ]
        },
        indent=2,
        ensure_ascii=False,
    )

    retry_block = ""
    if retry_feedback.strip():
        retry_block = (
            "### RETRY NOTICE\n"
            f"{retry_feedback.strip()}\n\n"
        )

    return (
        "<s>[INST]\n"
        "You are a Senior QA Engineer. Generate executable QA test cases.\n\n"
        "Use ONLY the selected test plan and matched UI Components subsection below. Do not invent UI components.\n\n"
        f"{retry_block}"
        "### PROJECT\n"
        f"{project_block}\n\n"
        "### SELECTED TEST PLAN\n"
        f"ID: {plan_id}\n"
        f"Title: {plan_title}\n"
        f"Description: {plan_description or '(not provided)'}\n\n"
        "### REQUIREMENTS\n"
        f"{requirement_block[:3000]}\n\n"
        f"### MATCHED UI COMPONENTS SUBSECTION (AUTHORITATIVE SCOPE)\n"
        f"{subsection_block}\n\n"
        f"### ALLOWED UI COMPONENTS extracted ONLY from \"{subsection_block}\"\n"
        f"{ui_component_block}\n\n"
        "### MATCHED UI COMPONENTS SUBSECTION TEXT ONLY\n"
        f"{spec_block[:6000]}\n\n"
        "Rules:\n"
        "- Generate ONLY 3 to 5 test cases total. Prefer 3 well-built cases over 5 shallow ones.\n"
        "- Every test case MUST be independent: start from its own precondition, own test data, own steps, and own expected results. Never assume another test case ran first.\n"
        "- Set dependsOn to [] for every test case. Do not use execution state, created records, selected filters, or data from another test case.\n"
        "\n"
        "THE TEST PLAN OBJECTIVE IS PRIMARY — READ THIS FIRST:\n"
        f"- The FEATURE being tested is defined by the Test Plan Title (\"{plan_title}\") and Description above, NOT by the UI component list.\n"
        "- The UI components are supporting information for building realistic steps — they do not each need their own test case.\n"
        "- DO NOT generate one test case per UI component (e.g. a separate case for every single field). That is the wrong granularity.\n"
        "- Instead, COMBINE the UI components that belong together into ONE scenario that tests the Test Plan's declared feature "
        "(e.g. for a search/filter feature: combine the relevant filter fields with the Search/primary action button into one case; "
        "then build another combined case for a different filter combination; only test a single isolated field on its own if the "
        "Test Plan itself is specifically about that one field).\n"
        "- Every test case's title and objective must clearly describe the FEATURE from the Test Plan (e.g. \"Search <feature> using "
        "<filter> and <filter>\"), not just \"Verify <component>\".\n"
        "\n"
        f"- Every test case MUST belong to the \"{subsection_block}\" subsection only. Do not reference any other screen, page, module, or subsection of \"4. UI Components\" even if you know it from general knowledge of similar applications.\n"
        "- Never use terminology, field names, or screen names belonging to a DIFFERENT feature/subsection than the one matched above, even if that other feature is common in similar applications you know about.\n"
        "- Base every test case strictly on the ALLOWED UI COMPONENTS list above. That list is authoritative and exhaustive for this subsection: if a component is not in the list, it does not exist for this test plan.\n"
        "- The matched subsection is the source of truth: mention its page/module behavior in each title, objective, step, or expected result.\n"
        "- Never use generic titles or expected results such as 'Use an exact allowed UI component', 'The field accepts the value', "
        "'The expected UI behavior occurs', 'The screen behaves as expected', or 'The button action is triggered'. Every expected "
        "result must describe what the FEATURE does (e.g. \"The leave list displays results corresponding to the selected search "
        "criteria.\"), grounded in the matched subsection text above when it describes that behavior — never invent a business rule "
        "the SRS text does not state.\n"
        "- Each case must test a concrete behavior, state change, validation, navigation, search, add, edit, delete, or confirmation described in the matched subsection.\n"
        "- If the feature is Search or Filter, cover different feature scenarios rather than individual fields: positive search, negative/no-match search only when supported by the SRS, empty search, reset, and multi-filter search. Generate only categories supported by the SRS.\n"
        "- If the subsection has several search/filter fields and the SRS provides meaningful values for all of them, consider one independent Full Form Search case that fills every relevant filter before Search. Full Form Search is distinct from Multi-filter Search; do not generate both when they are functionally redundant.\n"
        "- Do not create a Full Form Search case when the SRS does not provide enough meaningful values to populate every relevant filter. Never invent dates, names, statuses, leave types, or other data.\n"
        "- For an empty search, keep search fields empty, click Search, and report only the behavior documented by the SRS; never assume an error.\n"
        "- For Reset, fill filters first, click Reset, and expect filters to clear or return to documented defaults. Do not expect search results after Reset unless the SRS explicitly says so.\n"
        "- For negative search, use only a semantic invalid/inconsistent value supported by the SRS or a logically derived constraint; never invent an error message.\n"
        "- Respect component type: input/password/date field = enter/select a value; button/link = click; checkbox/toggle = select/unselect; dropdown = select an option.\n"
        "- CRITICAL CANONICAL COMPONENT NAMES:\n"
        "  * Use ONLY the exact canonical UI component names from the ALLOWED UI COMPONENTS list above. Do NOT shorten, alias, or alter names.\n"
        "  * For '4.5 Leave › Leave List', use the canonical name 'Show Leave with Status'. NEVER write 'Status dropdown' or 'Status'. You MUST use 'Show Leave with Status'.\n"
        "  * Result section components (e.g. 'Leave Balance', 'Actions', 'Leave List table') are results/columns, NOT search filters. Do not use them as search input fields.\n"
        "- STRUCTURED stepDetails RULE:\n"
        "  * Each item in stepDetails MUST have these exact keys:\n"
        "    {\n"
        "      \"component\": \"<Exact Canonical Component Name from ALLOWED UI COMPONENTS>\",\n"
        "      \"action\": \"select\" | \"enter\" | \"click\" | \"check\" | \"verify\",\n"
        "      \"value\": \"<value or empty string for click>\",\n"
        "      \"step\": \"<step description>\",\n"
        "      \"expected_result\": \"<functional expected result>\"\n"
        "    }\n"
        "- STRICT test_data RULES (CRITICAL):\n"
        "  * test_data MUST always be a JSON object: {\"<field/component name>\": \"<value>\"}.\n"
        "  * Every key represents an exact canonical UI field/component referenced by the test steps.\n"
        "  * Every value represents the value to enter/select for that field.\n"
        "  * NEVER return test_data as an array (e.g. NEVER [\"Admin\", \"admin123456\"]).\n"
        "  * NEVER return values without their associated field names.\n"
        "  * Do not use array position to represent relationships; relationships MUST always be field -> value.\n"
        "  * Only include fields actually used by the test case.\n"
        "  * If the test case requires dates, preserve field/value relationships (e.g. {\"From Date\": \"2026-05-01\", \"To Date\": \"2026-05-31\"}).\n"
        "  * When generating date ranges, respect logical constraints: From Date <= To Date. Never generate From Date after To Date.\n"
        "  * test_data values must be meaningful: reuse an example value explicitly given in the matched subsection text above when one "
        "exists (e.g. a documented status, date, or type). Otherwise use a neutral placeholder such as \"2026-05-01\" or \"a valid "
        "employee name\" — never invent an unsupported value and never use the literal placeholder text \"example value\".\n"
        "- Do not invent UI components not in the list, and do not borrow components from any other subsection of \"4. UI Components\" (the example below only illustrates JSON shape, not the topic).\n"
        "- stepDetails length must equal steps length.\n"
        "- Every stepDetails item must have a non-empty expected_result describing the concrete functional result.\n"
        "- requirements must contain only requirement IDs.\n"
        "- dependsOn MUST be an empty array [] for every test case; test cases are independent and must not depend on another case.\n"
        "- priority: Critical, High, Medium, or Low.\n"
        "- severity: Blocker, Critical, Major, Minor, or Trivial.\n"
        "- type MUST be one of: functional, regression, integration, e2e, api, ui, performance, security, smoke, sanity, usability, positive, negative, boundary, permission, validation, error-handling, exploratory. Use lowercase.\n"
        "Required schema:\n"
        f"{example}\n\n"
        "FINAL ANSWER RULE:\n"
        "Return ONLY valid JSON. No markdown. No explanation. No extra keys.\n"
        "The root key MUST be test_cases and its value MUST be an array.\n"
        "Return now only this JSON object:\n"
        "{ \"test_cases\": [ ... ] }\n"
        "[/INST]"
    )
