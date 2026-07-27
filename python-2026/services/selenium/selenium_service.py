from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

import requests
import time
import logging

try:
    from automation.dom_capture import capture_dom_elements, resolve_indexed_selector
except ModuleNotFoundError:  # pragma: no cover
    from ..automation.dom_capture import capture_dom_elements, resolve_indexed_selector


logger = logging.getLogger("services.selenium.selenium_service")


def refresh_page_state(driver, before_url):
    """Stabilize the app, then return a fresh DOM for the current page."""
    # This is the existing post-action application stabilization delay.  It is
    # intentionally not a wait for navigation: SPA and same-page actions are
    # both valid.
    time.sleep(0.5)
    after_url = driver.current_url
    url_changed = before_url != after_url
    if url_changed:
        logger.info("url_changed before_url=%s after_url=%s", before_url, after_url)
    logger.info("current_url url=%s", after_url)

    dom = capture_dom_elements(driver)
    logger.info(
        "dom_recaptured url=%s elements=%s url_changed=%s",
        after_url,
        len(dom),
        url_changed,
    )
    return dom


def smart_find(driver, selector):
    """
    Resolve a selector into a Selenium element.
    - "__index:N" -> resolved by position (AI fallback when no id/name exists)
    - otherwise -> CSS, with a label[for=...] fallback for radios/checkboxes
    """
    if selector.startswith("__index:"):
        try:
            return resolve_indexed_selector(driver, selector)
        except Exception:
            return None

    try:
        return WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )
    except Exception:
        pass

    try:
        return driver.find_element(By.CSS_SELECTOR, f'label[for="{selector.replace("#", "")}"]')
    except Exception:
        return None


def run_test(test_case: dict):

    driver = webdriver.Chrome()

    try:
        url = test_case.get("url") or "https://demoqa.com/automation-practice-form"
        driver.get(url)

        logs = []
        steps = test_case.get("steps", [])
        # Keep the current page representation between test steps.  It is
        # refreshed after every executed action, including SPA updates where
        # the URL does not change.
        current_dom = None

        for step_index, step in enumerate(steps):

            print(f"\n➡️ STEP {step_index + 1}: {step}")

            # FIX critical bug #2: structured DOM (list[dict]) instead of
            # driver.page_source[:6000] (raw HTML, truncated and unreadable
            # once escaped into JSON). This is the format expected by the
            # router-side fallback (_dom_to_fill_actions, etc.).
            if current_dom is None:
                current_dom = capture_dom_elements(driver)
                logger.info(
                    "dom_recaptured reason=initial_capture url=%s elements=%s",
                    driver.current_url,
                    len(current_dom),
                )
            dom = current_dom

            resp = requests.post(
                "http://localhost:8000/ai/decide",
                json={
                    "step": step,
                    "dom": dom,
                    "test_case": test_case,
                },
                timeout=120,
            )
            resp.raise_for_status()
            decision = resp.json()

            # FIX critical bug #1: the API always returns {"data": [...]}.
            # Before: `actions = [decision]` wrapped the ENTIRE payload as a
            # single fake action -> nothing ever actually executed.
            if isinstance(decision, dict):
                actions = decision.get("data", [])
            elif isinstance(decision, list):
                actions = decision
            else:
                actions = []

            for i, act in enumerate(actions):

                # FIX critical bug #1: the real keys are "type" and
                # "selector" (flat), not "action" and "target.selector".
                action = act.get("type")
                selector = act.get("selector")
                value = act.get("value", "")

                print(f"👉 TRY: {action} {selector}")

                if not action or not selector:
                    print(f"⏭️ Skipping invalid action: {act}")
                    continue

                # Capture the URL immediately before the AI-directed Selenium
                # action.  This supports both conventional navigation and SPA
                # interactions without treating an unchanged URL as a failure.
                before_url = driver.current_url
                action_executed = False

                try:
                    el = smart_find(driver, selector)
                    if el is None:
                        raise Exception(f"Element not found: {selector}")

                    # RADIO / CHECKBOX FIX — based on the element's actual
                    # "type" attribute rather than the selector's text
                    # (the old `"radio" in selector` check only worked by
                    # coincidence on demoqa, e.g. id="gender-radio-1").
                    el_type = (el.get_attribute("type") or "").lower()
                    if action == "type" and el_type in {"radio", "checkbox"}:
                        action = "click"

                    if action == "type":
                        logger.info(
                            "action_execution step_index=%s action_index=%s action=%s selector=%s url=%s",
                            step_index, i, action, selector, before_url,
                        )
                        action_executed = True
                        driver.execute_script("arguments[0].scrollIntoView();", el)
                        time.sleep(0.3)
                        el.clear()
                        el.send_keys(value)

                    elif action == "click":
                        logger.info(
                            "action_execution step_index=%s action_index=%s action=%s selector=%s url=%s",
                            step_index, i, action, selector, before_url,
                        )
                        action_executed = True
                        try:
                            driver.execute_script("arguments[0].click();", el)
                        except Exception:
                            el.click()

                    print(f"✅ DONE: {action} → {selector}")
                    # Never allow the DOM from before an action to reach the
                    # next AI decision.  This also refreshes dynamic UIs when
                    # their URL remains unchanged.
                    current_dom = refresh_page_state(driver, before_url)

                    filename = f"step_{step_index}_{i}.png"
                    driver.save_screenshot(filename)

                    logs.append({
                        "step": step,
                        "action": action,
                        "selector": selector,
                        "status": "passed",
                        "screenshot": filename,
                    })

                except Exception as e:

                    # An interaction can have taken effect before Selenium
                    # reports an error.  If it was started, do not carry its
                    # old DOM into the next AI decision.
                    if action_executed:
                        current_dom = refresh_page_state(driver, before_url)

                    print(f"❌ ERROR → {selector}: {e}")

                    filename = f"error_{step_index}_{i}.png"
                    driver.save_screenshot(filename)

                    logs.append({
                        "step": step,
                        "selector": selector,
                        "status": "failed",
                        "error": str(e),
                        "screenshot": filename,
                    })

                    continue

        print("\n📊 FINAL LOGS:")
        for l in logs:
            print(l)

        return {
            "status": "done",
            "logs": logs,
        }

    finally:
        # Bonus: avoids zombie Chrome processes staying open after each
        # run_test() call.
        driver.quit()
