from fastapi import APIRouter
from services.ai.ai_service import get_ai_service
from prompts.ai_decision_prompt import build_ai_decision_prompt

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/decide")
def decide(payload: dict):

    step = payload.get("step")
    dom = payload.get("dom")
    test_case = payload.get("test_case")

    prompt = build_ai_decision_prompt(step, dom, test_case)

    ai = get_ai_service()

    result = ai.generate_json(prompt=prompt, timeout=180)


    

    return result

@router.post("/validate")
def validate(payload: dict):

    step = payload.get("step")
    result = payload.get("result")
    expected = payload.get("expected")

    prompt = f"""
You are a QA validation AI.

STEP:
{step}

ACTUAL RESULT:
{result}

EXPECTED RESULT:
{expected}

Return JSON:

{{
  "status": "passed" or "failed",
  "reason": "short explanation"
}}
"""

    ai = get_ai_service()

    return ai.generate_json(prompt=prompt, timeout=120)