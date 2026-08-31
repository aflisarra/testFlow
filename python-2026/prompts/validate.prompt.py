def build_validation_prompt(step, result, expected):

    return f"""
You are a QA validator.

STEP:
{step}

RESULT:
{result}

EXPECTED:
{expected}

Decide:
- PASSED
- FAILED

Return JSON:

{{
  "status": "passed | failed",
  "reason": "why"
}}
"""
