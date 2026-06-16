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

    result = ai.generate_json(prompt=prompt, timeout=120)

    return result