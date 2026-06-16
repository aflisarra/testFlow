from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

import requests


def run_test(test_case: str):

    driver = webdriver.Chrome()

    driver.get("https://demoqa.com/automation-practice-form")

    steps = [
        "Fill first name",
        "Fill email",
        "Click submit"
    ]

    for step in steps:

        html = driver.page_source[:5000]

        resp = requests.post(
            "http://localhost:8000/ai/decide",
            json={
                "step": step,
                "dom": html,
                "test_case": test_case
            }
        )

        decision = resp.json()

        action = decision.get("action")
        selector = decision["target"]["selector"]
        value = decision.get("value", "")

        el = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )

        if action == "type":
            el.clear()
            el.send_keys(value)

        elif action == "click":
            el.click()

    return "Test executed ✅"