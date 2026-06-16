from fastapi import APIRouter
from services.selenium.selenium_service import run_test

router = APIRouter(prefix="/test-runner", tags=["test-runner"])


@router.post("/run")
def run(payload: dict):

    test_case = payload.get("test_case")

    result = run_test(test_case)

    return {"result": result}