from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

import requests
import time


def smart_find(driver, selector):
    """
    Amélioration du targeting pour radio / checkbox invisibles
    """
    try:
        return driver.find_element(By.CSS_SELECTOR, selector)
    except:
        pass

    # ✅ fallback radio -> label
    try:
        return driver.find_element(By.CSS_SELECTOR, f'label[for="{selector.replace("#","")}"]')
    except:
        pass

    return None


def run_test(test_case: dict):

    driver = webdriver.Chrome()

    url = test_case.get("url") or "https://demoqa.com/automation-practice-form"
    driver.get(url)

    logs = []

    steps = test_case.get("steps", [])

    for step_index, step in enumerate(steps):

        print(f"\n➡️ STEP {step_index+1}: {step}")

        html = driver.page_source[:6000]

        resp = requests.post(
            "http://localhost:8000/ai/decide",
            json={
                "step": step,
                "dom": html,
                "test_case": test_case
            }
        )

        decision = resp.json()
        actions = decision if isinstance(decision, list) else [decision]

        for i, act in enumerate(actions):

            action = act.get("action")
            selector = act.get("target", {}).get("selector")
            value = act.get("value", "")

            print(f"👉 TRY: {action} {selector}")

            try:
                el = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )

                # ✅ RADIO / CHECKBOX FIX
                if action == "type" and "radio" in selector:
                    action = "click"

                if action == "type" and "checkbox" in selector:
                    action = "click"

                # ✅ EXECUTION
                if action == "type":

                    driver.execute_script("arguments[0].scrollIntoView();", el)
                    time.sleep(0.5)

                    el.clear()
                    el.send_keys(value)

                elif action == "click":

                    try:
                        driver.execute_script("arguments[0].click();", el)
                    except:
                        el.click()

                print(f"✅ DONE: {action} → {selector}")

                # ✅ WAIT UI
                time.sleep(1)

                # ✅ SCREENSHOT
                filename = f"step_{step_index}_{i}.png"
                driver.save_screenshot(filename)

                logs.append({
                    "step": step,
                    "action": action,
                    "selector": selector,
                    "status": "passed",
                    "screenshot": filename
                })

            except Exception as e:

                print(f"❌ ERROR → {selector}: {e}")

                filename = f"error_{step_index}_{i}.png"
                driver.save_screenshot(filename)

                logs.append({
                    "step": step,
                    "selector": selector,
                    "status": "failed",
                    "error": str(e),
                    "screenshot": filename
                })

                continue

    print("\n📊 FINAL LOGS:")
    for l in logs:
        print(l)

    return {
        "status": "done",
        "logs": logs
    }
