from __future__ import annotations

import json
from typing import Any


def _quote(value: Any) -> str:
    return json.dumps("" if value is None else str(value), ensure_ascii=False)


def _selector_method(selector: str) -> tuple[str, str]:
    text = str(selector or "").strip()
    if text.startswith("text="):
        visible_text = text[5:].strip()
        xpath = f"//*[normalize-space()={_quote(visible_text)}]"
        return "By.XPATH", xpath
    if text.startswith("//") or text.startswith("(//"):
        return "By.XPATH", text
    return "By.CSS_SELECTOR", text


def _label(action: dict[str, Any]) -> str:
    label = str(action.get("label") or action.get("businessRole") or "").strip()
    if label:
        return label
    selector = str(action.get("selector") or "").strip()
    return selector or "element"


def generate_selenium_code(actions: list[Any]) -> str:
    lines = [
        "from selenium.webdriver.common.by import By",
        "from selenium.webdriver.support.ui import Select, WebDriverWait",
        "from selenium.webdriver.support import expected_conditions as EC",
        "",
        "wait = WebDriverWait(driver, 15)",
        "",
    ]

    for raw in actions or []:
        if not isinstance(raw, dict):
            continue

        action_type = str(raw.get("type") or raw.get("action") or "").strip().lower()
        selector = str(raw.get("selector") or "").strip()
        value = str(raw.get("value") or "").strip()
        if not action_type or not selector:
            continue

        by, locator = _selector_method(selector)
        name = _label(raw)
        lines.append(f"# {name}")

        if action_type == "type":
            lines.extend([
                f"element = wait.until(EC.visibility_of_element_located(({by}, {_quote(locator)})))",
                "element.clear()",
                f"element.send_keys({_quote(value)})",
                "",
            ])
        elif action_type == "click":
            lines.extend([
                f"element = wait.until(EC.element_to_be_clickable(({by}, {_quote(locator)})))",
                "element.click()",
                "",
            ])
        elif action_type in {"checkbox", "radio"}:
            lines.extend([
                f"element = wait.until(EC.element_to_be_clickable(({by}, {_quote(locator)})))",
                "if not element.is_selected():",
                "    element.click()",
                "",
            ])
        elif action_type == "select":
            lines.extend([
                f"element = wait.until(EC.presence_of_element_located(({by}, {_quote(locator)})))",
                f"Select(element).select_by_visible_text({_quote(value)})",
                "",
            ])
        else:
            lines.extend([
                f"element = wait.until(EC.element_to_be_clickable(({by}, {_quote(locator)})))",
                "element.click()",
                "",
            ])

    return "\n".join(lines).rstrip() + "\n"
