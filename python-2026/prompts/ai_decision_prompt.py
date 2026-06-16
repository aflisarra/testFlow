def build_ai_decision_prompt(step: dict, dom: str, test_case: str) -> str:

    return f"""
You are a smart QA automation AI.

You must execute a test case using the DOM.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEST CASE:
{test_case}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT STEP:
{step}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOM:
{dom}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Decide EXACTLY:
- action
- target selector
- value (if type)

Return ONLY JSON:

{{
  "action": "type | click",
  "target": {{
    "selector": "css selector"
  }},
  "value": "text if needed"
}}
"""