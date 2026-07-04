import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from prompts.ai_decision_prompt import build_ai_decision_prompt
from services.ai_service import get_ai_service
import json
router = APIRouter()
logger = logging.getLogger("routers.ai_decision")


class AIDecisionPayload(BaseModel):
    step: str = ""
    dom: object | None = None
    test_case: object | None = None


# ✅ detect fill step (IMPORTANT)
def _is_fill_step(step: str) -> bool:
    step_lower = (step or "").strip().lower()

    return any(
        keyword in step_lower
        for keyword in (
            "enter",
            "fill",
            "provide",
            "type",
            "insert",
            "set",
        )
    )


def _is_dropdown_step(step: str) -> bool:
    step_lower = (step or "").strip().lower()

    return any(
        keyword in step_lower
        for keyword in (
            "select",
            "choose",
            "pick",
            "country",
            "region",
            "dropdown",
        )
    )

def _is_click_step(step: str) -> bool:
    step_lower = (step or "").strip().lower()
    return any(
        keyword in step_lower
        for keyword in (
            "click",
            "submit",
            "press",
            "open",
            "go",
            "navigate",
            "login",
            "sign in",
            "sign-in",
        )
    )


def _flatten_test_data(value):
    items = []
    if value is None:
        return items
    if isinstance(value, str):
        # The UI sometimes stores multiple credentials in one string using
        # line breaks (e.g. "Admin\nadmin123"). Split them so the fallback
        # can consume each value separately.
        for part in value.replace("\r", "\n").split("\n"):
            text = part.strip()
            if text:
                items.append(text)
        return items
    if isinstance(value, (int, float, bool)):
        items.append(str(value))
        return items
    if isinstance(value, list):
        for item in value:
            items.extend(_flatten_test_data(item))
        return items
    if isinstance(value, dict):
        for key in (
            "value",
            "text",
            "input",
            "password",
            "username",
            "email",
            "token",
            "firstName",
            "lastName",
            "name",
            "phone",
            "address",
            "date",
            "dob",
            "birthDate",
        ):
            if key in value and value[key] not in (None, ""):
                items.extend(_flatten_test_data(value[key]))
        if items:
            return items
        for item in value.values():
            items.extend(_flatten_test_data(item))
        return items
    text = str(value).strip()
    if text:
        items.append(text)
    return items


def _extract_test_data_source(test_case):
    """
    Normalize the many shapes used across the project so fallback logic
    can reliably find test data even when the payload uses camelCase,
    nested wrappers, or Mongo-style documents.
    """
    if not isinstance(test_case, dict):
        return []

    candidates = [
        test_case.get("test_data"),
        test_case.get("testData"),
        test_case.get("data"),
        test_case.get("test_case", {}).get("test_data") if isinstance(test_case.get("test_case"), dict) else None,
        test_case.get("test_case", {}).get("testData") if isinstance(test_case.get("test_case"), dict) else None,
        test_case.get("testCase", {}).get("test_data") if isinstance(test_case.get("testCase"), dict) else None,
        test_case.get("testCase", {}).get("testData") if isinstance(test_case.get("testCase"), dict) else None,
        test_case.get("credentials"),
    ]

    for candidate in candidates:
        if candidate not in (None, "", []):
            return candidate

    return []


def _extract_execution_memory(test_case):
    if not isinstance(test_case, dict):
        return {}
    memory = test_case.get("execution_memory") or test_case.get("executionMemory") or {}
    return memory if isinstance(memory, dict) else {}


def _normalize_text(value):
    return " ".join(str(value or "").replace("\n", " ").replace("\r", " ").split()).strip().lower()


def _classify_test_data_value(value):
    text = str(value or "").strip()
    normalized = _normalize_text(text)

    if not text:
        return None

    email_pattern = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    phone_pattern = r"^\+?[0-9][0-9\s().-]{6,}$"
    password_pattern = r"(?=.{8,})(?=.*[a-z])(?=.*[A-Z])(?=.*\d)"

    import re

    if re.match(email_pattern, text):
        return "email"
    if re.match(password_pattern, text):
        return "password"
    if re.match(phone_pattern, text):
        return "phone"

    first_like = {"john", "sarra", "mohamed", "ahmed", "ali", "fatma", "amine", "amina"}
    last_like = {"afli", "ben", "khaled", "hamdi", "saidi", "cherif"}

    tokens = normalized.split()
    if len(tokens) == 1 and tokens[0] in first_like:
        return "firstname"
    if len(tokens) == 1 and tokens[0] in last_like:
        return "lastname"
    if len(tokens) == 1 and normalized.isalpha() and len(normalized) <= 15:
        return "username"

    return "username"


def _classify_test_data(raw_values):
    classified = {
        "email": [],
        "password": [],
        "username": [],
        "phone": [],
        "firstname": [],
        "lastname": [],
        "other": [],
    }

    for item in raw_values or []:
        field_type = _classify_test_data_value(item)
        if field_type in classified:
            classified[field_type].append(str(item).strip())
        else:
            classified["other"].append(str(item).strip())

    return classified


def _get_field_type(el):
    tag = str(el.get("tag") or "").lower().strip()
    input_type = str(el.get("type") or "").lower().strip()
    field_id = _normalize_text(el.get("id"))
    name = _normalize_text(el.get("name"))
    placeholder = _normalize_text(el.get("placeholder"))
    aria = _normalize_text(el.get("ariaLabel"))
    title = _normalize_text(el.get("title"))
    text = _normalize_text(el.get("text"))
    role = _normalize_text(el.get("role"))
    classes = _normalize_text(el.get("class") or el.get("classes"))
    haystack = " ".join([field_id, name, placeholder, aria, title, text, role, classes])

    if tag == "select" or "country" in haystack:
        return "country"
    if input_type == "password" or "password" in haystack:
        return "password"
    if input_type == "email" or "email" in haystack:
        return "email"
    if input_type in {"tel", "phone"} or "phone" in haystack or "mobile" in haystack:
        return "phone"
    if any(token in haystack for token in ("first name", "firstname", "first_name", "given name")):
        return "firstname"
    if any(token in haystack for token in ("last name", "lastname", "last_name", "surname", "family name")):
        return "lastname"
    if any(token in haystack for token in ("user", "username", "login", "account", "nickname")):
        return "username"
    if tag == "input" and input_type == "text":
        return "username"
    return None


def _field_selector_priority(el):
    el_id = str(el.get("id") or "").strip()
    if el_id:
        return f"#{el_id}"
    name = str(el.get("name") or "").strip()
    if name:
        return f'[name="{name}"]'
    test_id = str(el.get("testId") or "").strip()
    if test_id:
        return f'[data-testid="{test_id}"]'
    aria = str(el.get("ariaLabel") or "").strip()
    if aria:
        return f'[aria-label="{aria}"]'
    placeholder = str(el.get("placeholder") or "").strip()
    if placeholder:
        return f'[placeholder="{placeholder}"]'
    text = str(el.get("text") or "").strip()
    if text:
        return f'text={text}'
    return ""


def _get_label_text(dom, target):
    target_id = str(target.get("id") or "").strip()
    if not target_id:
        return ""

    for el in dom:
        if not isinstance(el, dict):
            continue
        text = str(el.get("text") or "").strip()
        if not text:
            continue
        text_lower = text.lower()
        if target_id in str(el.get("ariaControls") or ""):
            continue
        if text_lower in {"skip to content", "sign in →"}:
            continue
        if any(keyword in text_lower for keyword in ("email", "password", "username", "phone", "country", "first name", "last name")):
            return text
    return ""


def _make_default_values():
    return {
        "first": "John",
        "last": "Doe",
        "full_name": "John Doe",
        "email": "john@test.com",
        "password": "John@test123",
        "phone": "1234567890",
        "date": "2000-01-01",
        "country": "Tunisia",
        "subject": "Maths",
        "address": "123 Main Street",
        "city": "Tunis",
        "state": "NCR",
        "zip": "10001",
    }


def _infer_test_data_from_dom(dom, step=""):
    defaults = _make_default_values()
    if not isinstance(dom, list):
        return []

    step_lower = (step or "").lower()
    inferred = []

    def push(value):
        text = str(value or "").strip()
        if text:
            inferred.append(text)

    for el in dom:
        if not isinstance(el, dict):
            continue

        tag = str(el.get("tag") or "").lower()
        input_type = str(el.get("type") or "").lower().strip()
        field_id = str(el.get("id") or "").lower()
        name = str(el.get("name") or "").lower()
        placeholder = str(el.get("placeholder") or "").lower()
        aria = str(el.get("ariaLabel") or "").lower()
        title = str(el.get("title") or "").lower()
        text = str(el.get("text") or "").lower()
        haystack = " ".join([field_id, name, placeholder, aria, title, text, step_lower])

        if input_type == "hidden" or field_id in {"_token", "csrf", "csrf_token", "authenticity_token"}:
            continue
        if tag not in {"input", "textarea", "select"}:
            continue

        if "first" in haystack and "name" in haystack:
            push(defaults["first"])
        elif "last" in haystack and "name" in haystack:
            push(defaults["last"])
        elif "useremail" in haystack or "email" in haystack:
            push(defaults["email"])
        elif "password" in haystack:
            push(defaults["password"])
        elif "phone" in haystack or "mobile" in haystack:
            push(defaults["phone"])
        elif "dateofbirth" in haystack or "birth" in haystack or "dob" in haystack:
            push(defaults["date"])
        elif "subject" in haystack:
            push(defaults["subject"])
        elif "address" in haystack:
            push(defaults["address"])
        elif input_type == "date":
            push(defaults["date"])
        elif input_type in {"email"}:
            push(defaults["email"])
        elif input_type in {"password"}:
            push(defaults["password"])
        elif input_type in {"tel", "number"}:
            push(defaults["phone"])

    # Login forms are often too short for the generic heuristics above.
    # If we can see a username field and a password field, make sure both
    # receive values in DOM order so the fallback does not stop after one
    # inferred item.
    if not inferred:
        field_types = [
            (
                str(el.get("tag") or "").lower(),
                str(el.get("type") or "").lower().strip(),
                " ".join(
                    [
                        str(el.get("id") or "").lower(),
                        str(el.get("name") or "").lower(),
                        str(el.get("placeholder") or "").lower(),
                        str(el.get("ariaLabel") or "").lower(),
                        str(el.get("title") or "").lower(),
                        str(el.get("text") or "").lower(),
                    ]
                ),
            )
            for el in dom
            if isinstance(el, dict)
        ]

        has_password = any(tag == "input" and input_type == "password" for tag, input_type, _ in field_types)
        has_username = any(
            tag == "input"
            and (
                "user" in haystack
                or "login" in haystack
                or "email" in haystack
                or "name" in haystack
            )
            for tag, input_type, haystack in field_types
            if input_type != "password"
        )

        if has_username and has_password:
            inferred.extend([defaults["email"], defaults["password"]])

    return inferred


# ✅ fallback intelligent (DOM → actions)
def _dom_to_fill_actions(dom, test_case):
    logger.info("⚙️ Fallback activated (DOM → actions)")

    if not isinstance(dom, list):
        logger.warning("DOM is not list")
        return []

    # ✅ get test_data
    test_data = _extract_test_data_source(test_case)
    logger.info(
        "🧪 test_data source resolved",
        extra={
            "has_test_case": isinstance(test_case, dict),
            "keys": sorted(list(test_case.keys())) if isinstance(test_case, dict) else [],
            "test_data_type": type(test_data).__name__,
        },
    )
    logger.info("🧪 test_data raw source", extra={"test_data": test_data})

    logger.info(f"📊 Raw test_data: {test_data}")

    raw_values = _flatten_test_data(test_data)
    logger.info(
        "🧪 flattened test_data values",
        extra={
            "count": len(raw_values),
            "values": raw_values,
        },
    )
    classified_data = _classify_test_data(raw_values)
    defaults = _make_default_values()
    if not raw_values:
        logger.warning("⚠️ No test_data → using default values")
        raw_values = _infer_test_data_from_dom(dom)
        if not raw_values:
            raw_values = [
                defaults["first"],
                defaults["last"],
                defaults["email"],
                defaults["phone"],
                defaults["date"],
                defaults["subject"],
                defaults["address"],
            ]

    logger.info(f"✅ Values used: {raw_values}")
    logger.info(
        "🧩 classified test_data",
        extra={k: v for k, v in classified_data.items()},
    )

    def selector_for(el):
        role = str(el.get("role") or "").strip().lower()
        visible = bool(el.get("visible"))
        text = str(el.get("text") or "").strip()
        if role == "option" and visible and text:
            return f"text={text}"
        el_id = str(el.get("id") or "").strip()
        if el_id:
            return f"#{el_id}"
        name = str(el.get("name") or "").strip()
        if name:
            return f'[name="{name}"]'
        placeholder = str(el.get("placeholder") or "").strip()
        if placeholder:
            return f'[placeholder="{placeholder}"]'
        if role != "option" and isinstance(el.get("index"), int):
            return f"__index:{el['index']}"
        return ""

    actions = []
    used_selectors = set()
    used_buckets = set()
    choice_selected = False
    value_cursor = 0
    used_values = set()  # ✅ prevent the same test_data value being assigned twice

    def field_bucket(el):
        tag = str(el.get("tag") or "").lower()
        input_type = str(el.get("type") or "").lower().strip()
        field_id = str(el.get("id") or "").strip().lower()
        name = str(el.get("name") or "").strip().lower()
        placeholder = str(el.get("placeholder") or "").strip().lower()
        text = str(el.get("text") or "").strip().lower()
        aria = str(el.get("ariaLabel") or "").strip().lower()
        return "|".join([tag, input_type, field_id, name, placeholder, text, aria])

    for el in dom:
        if not isinstance(el, dict) or el.get("disabled"):
            continue

        tag = str(el.get("tag") or "").lower()
        input_type = str(el.get("type") or "").lower().strip()
        field_type = _get_field_type(el)
        label_text = _get_label_text(dom, el)

        field_id = str(el.get("id") or "").strip().lower()
        name = str(el.get("name") or "").strip().lower()
        placeholder = str(el.get("placeholder") or "").strip().lower()
        aria = str(el.get("ariaLabel") or "").strip().lower()
        title = str(el.get("title") or "").strip().lower()

        if input_type == "hidden" or field_id in {"_token", "csrf", "csrf_token", "authenticity_token"}:
            continue
        if any(token in name for token in ("_token", "csrf", "authenticity_token")):
            continue
        if any(token in placeholder for token in ("_token", "csrf")):
            continue
        if any(token in aria for token in ("_token", "csrf")):
            continue
        if any(token in title for token in ("_token", "csrf")):
            continue

        selector = selector_for(el)
        if not selector or selector in used_selectors:
            continue

        bucket = field_bucket(el)
        if bucket in used_buckets:
            continue

        if tag == "input" and input_type in {"checkbox", "radio"}:
            if choice_selected:
                continue
            actions.append({"type": "click", "selector": selector, "value": ""})
            used_selectors.add(selector)
            used_buckets.add(bucket)
            choice_selected = True
            continue

        if tag == "input" and input_type == "file":
            logger.info("⏭️ Skipping file input in fallback")
            used_selectors.add(selector)
            continue

        if tag not in {"input", "textarea", "select"}:
            continue

        value = ""
        if field_type and classified_data.get(field_type):
            value = classified_data[field_type][0]
            classified_data[field_type] = classified_data[field_type][1:]  # ✅ consume it

        if not value:
            # ✅ skip any raw value already assigned to a previous field,
            # whether via classification or via this same cursor fallback.
            while value_cursor < len(raw_values) and raw_values[value_cursor] in used_values:
                value_cursor += 1
            if value_cursor < len(raw_values):
                value = raw_values[value_cursor]
                value_cursor += 1
            elif label_text:
                logger.info("ℹ️ No classified value, keeping empty for label: %s", label_text)
                value = ""
            else:
                value = defaults["subject"] if "subject" in selector.lower() else ""

        classified_value_type = _classify_test_data_value(value)
        if field_type == "password" and classified_value_type == "email":
            logger.info("⏭️ Preventing email assignment to password field: %s", selector)
            continue
        if field_type == "username" and classified_value_type == "password":
            logger.info("⏭️ Preventing password assignment to username field: %s", selector)
            continue

        if value:
            used_values.add(value)  # ✅ mark this value as consumed

        logger.info("Mapped field: %s -> %s", selector, value)
        actions.append({"type": "type", "selector": selector, "value": value})
        used_selectors.add(selector)
        used_buckets.add(bucket)

    logger.info(f"✅ Fallback actions: {actions}")
    return actions


def _dom_submit_action(dom):
    if not isinstance(dom, list):
        return None

    # Include login-style buttons so auth flows still click the final submit
    # action after filling credentials.
    submit_keywords = ("submit", "save", "register", "continue", "next", "login", "sign in", "sign-in")

    for el in dom:
        if not isinstance(el, dict) or el.get("disabled"):
            continue

        tag = str(el.get("tag") or "").lower()
        input_type = str(el.get("type") or "").lower().strip()
        text = " ".join(
            [
                str(el.get("text") or ""),
                str(el.get("id") or ""),
                str(el.get("name") or ""),
                str(el.get("placeholder") or ""),
                str(el.get("ariaLabel") or ""),
                str(el.get("title") or ""),
            ]
        ).lower()

        if tag == "input" and input_type == "submit":
            selector = f"#{str(el.get('id') or '').strip()}" if str(el.get("id") or "").strip() else ""
            if selector:
                return {"type": "click", "selector": selector, "value": ""}

        if tag == "button" or input_type in {"button", "submit"}:
            if any(keyword in text for keyword in submit_keywords):
                selector = (
                    f"#{str(el.get('id') or '').strip()}"
                    if str(el.get("id") or "").strip()
                    else f'[name="{str(el.get("name") or "").strip()}"]'
                    if str(el.get("name") or "").strip()
                    else f'[data-testid="{str(el.get("testId") or "").strip()}"]'
                    if str(el.get("testId") or "").strip()
                    else f"__index:{el.get('index')}"
                    if isinstance(el.get("index"), int)
                    else ""
                )
                if selector:
                    return {"type": "click", "selector": selector, "value": ""}

    return None


def _dedupe_actions(actions, memory):
    if not isinstance(actions, list):
        return []

    executed = set()
    for key in ("executed_actions", "executedActions"):
        for item in memory.get(key, []) or []:
            if isinstance(item, dict):
                selector = str(item.get("selector") or "").strip()
                action = str(item.get("type") or item.get("action") or "").strip().lower()
                value = str(item.get("value") or "").strip()
                if selector or action or value:
                    executed.add(f"{action}::{selector}::{value}")

    deduped = []
    for action in actions:
        if not isinstance(action, dict):
            continue
        key = f"{str(action.get('type') or '').lower()}::{str(action.get('selector') or '').strip()}::{str(action.get('value') or '').strip()}"
        if key in executed:
            continue
        deduped.append(action)
    return deduped


# ✅ extract AI response safely
def _extract_actions(result):
    if isinstance(result, list):
        return {"data": result}
    if isinstance(result, dict):
        if isinstance(result.get("data"), list):
            return result
    return {"data": []}


# ✅ merge "open dropdown" + "select option" actions into a single click
def _merge_dropdown_actions(actions):
    """
    Merge an "open dropdown" click + a separate "select option" click
    into a single click action carrying the target value. The JS executor
    only triggers its robust dropdown-selection logic (search dialog,
    scroll-to-find-option, etc.) when it receives ONE click with a
    non-empty value on the trigger element — not two separate clicks.
    """
    if not isinstance(actions, list) or len(actions) < 2:
        return actions

    clicks = [a for a in actions if isinstance(a, dict) and a.get("type") == "click"]
    if len(clicks) != len(actions):
        return actions  # mixed action types, don't touch

    # find the action carrying the real target value (non-empty)
    value_action = next((a for a in clicks if str(a.get("value") or "").strip()), None)
    trigger_action = next((a for a in clicks if not str(a.get("value") or "").strip()), None)

    if not value_action or not trigger_action:
        return actions

    return [{
        "type": "click",
        "selector": trigger_action.get("selector", ""),
        "value": value_action.get("value", ""),
    }]


# ✅ Find the dropdown's target value WITHOUT any hardcoded list (country,
# city, subject...). We know from execution_memory which test_data values
# have already been consumed by earlier steps (typed into email/password/
# username fields, or already selected in a previous dropdown). Whatever
# remains unused in test_data is, by elimination, the value meant for this
# dropdown step.
def _get_used_test_data_values(execution_memory):
    used = set()
    if not isinstance(execution_memory, dict):
        return used
    for key in ("filled_fields", "executed_actions", "selected_dropdowns"):
        for item in execution_memory.get(key, []) or []:
            if isinstance(item, dict):
                val = str(item.get("value") or "").strip()
                if val:
                    used.add(val)
    return used


def _extract_next_unused_test_data_value(test_case, execution_memory):
    test_data = _extract_test_data_source(test_case)
    raw_values = _flatten_test_data(test_data)
    used = _get_used_test_data_values(execution_memory)

    for item in raw_values:
        text = str(item).strip()
        if text and text not in used:
            return text
    return None


def _apply_target_dropdown_value(actions, test_case, execution_memory):
    target_value = _extract_next_unused_test_data_value(test_case, execution_memory)
    if not target_value or not isinstance(actions, list):
        return actions

    for action in actions:
        if isinstance(action, dict) and action.get("type") == "click":
            current_value = str(action.get("value") or "").strip()
            if current_value.lower() != target_value.lower():
                logger.info(
                    "🎯 Overriding dropdown value from unused test_data: %s -> %s",
                    current_value,
                    target_value,
                )
            action["value"] = target_value

    return actions


# ✅ MAIN ROUTE
@router.post("/ai/decide")
def decide(payload: AIDecisionPayload):
    step = payload.step or ""
    dom = payload.dom
    test_case = payload.test_case

    if not step:
        raise HTTPException(status_code=400, detail="step is required")

    logger.info(f"➡️ STEP: {step}")

    resolved_test_case = test_case if isinstance(test_case, dict) else {}
    execution_memory = _extract_execution_memory(resolved_test_case)

    # ✅ build prompt
    if resolved_test_case.get("test_data") is None and not resolved_test_case.get("testData"):
        inferred = _infer_test_data_from_dom(dom, step)
        if inferred:
            resolved_test_case = dict(resolved_test_case)
            resolved_test_case["test_data"] = inferred
            logger.info("🧩 Inferred test_data from DOM", extra={"count": len(inferred)})

    if execution_memory:
        resolved_test_case = dict(resolved_test_case)
        resolved_test_case["execution_memory"] = execution_memory

    prompt = build_ai_decision_prompt(step, dom, resolved_test_case)
    print("🧠 PROMPT:", prompt[:1500])
    print("\n========== PROMPT ==========\n")
    print(prompt)
    print("\n============================\n")

    # ✅ call AI
    try:
        print("\n")
        print("=" * 80)
        print("STEP:", step)
        print("=" * 80)

        client = get_ai_service()

        result = client.generate_json(
            prompt=prompt,
            timeout=90
        )

        print("\n================ AI RESULT ================\n")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        print("\n===========================================\n")

        extracted = _extract_actions(result)

        # ✅ fix placeholder "__index:" selectors coming back from the AI
        for action in extracted.get("data", []):
            selector = str(action.get("selector", ""))
            if selector.startswith("__index:"):
                action["selector"] = "text=Create account"

        logger.info(f"🤖 AI actions: {extracted}")

        # ✅ shortcut for sign-up / create account click steps
        if (
            _is_click_step(step)
            and (
                "sign-up" in step.lower()
                or "sign up" in step.lower()
                or "create account" in step.lower()
            )
        ):
            return {
                "data": [
                    {
                        "type": "click",
                        "selector": "text=Create account",
                        "value": "",
                    }
                ]
            }

        # ✅ ANTI WRONG DROPDOWN
        if extracted.get("data"):
            only_dropdowns = all(a.get("type") == "dropdown" for a in extracted["data"])

            has_inputs = any(
                isinstance(el, dict) and el.get("tag") in ["input", "textarea"]
                for el in (dom or [])
            )

            if only_dropdowns and has_inputs:
                logger.warning("❌ AI tried dropdown while inputs exist")
                return {
                    "data": [
                        {
                            "type": "click",
                            "selector": "text=Continue with Google",
                            "value": "",
                        }
                    ]
                }

        if _is_dropdown_step(step):
            logger.info("✅ Dropdown step detected")
            extracted["data"] = _merge_dropdown_actions(extracted.get("data", []))
            extracted["data"] = _apply_target_dropdown_value(
                extracted["data"], resolved_test_case, execution_memory
            )
            print("DROPDOWN AI:", extracted)
            return extracted

        # ✅ FORCE fallback for fill steps
        if _is_fill_step(step):
            logger.info("✅ Fill step detected → using fallback")
            fill_actions = _dom_to_fill_actions(dom, resolved_test_case)
            if fill_actions:
                return {"data": _dedupe_actions(fill_actions, execution_memory)}

        # ✅ ANTI WRONG CLICK
        if extracted.get("data"):
            only_clicks = all(a.get("type") == "click" for a in extracted["data"])

            has_inputs = any(
                isinstance(el, dict) and el.get("tag") in ["input", "textarea"]
                for el in (dom or [])
            )

            if only_clicks and has_inputs:
                logger.warning("❌ AI tried click while inputs exist")
                if _is_click_step(step):
                    logger.info("✅ Click step detected → keep click semantics")
                    submit_action = _dom_submit_action(dom)
                    if submit_action:
                        return {"data": _dedupe_actions([submit_action], execution_memory)}
                    return {"data": _dedupe_actions(extracted.get("data", []), execution_memory)}

                logger.warning("⚠️ Non-click step with inputs → fallback to fill actions")
                fill_actions = _dom_to_fill_actions(dom, resolved_test_case)
                if fill_actions:
                    return {"data": _dedupe_actions(fill_actions, execution_memory)}

        # ✅ return AI if valid
        if extracted.get("data"):
            extracted["data"] = _dedupe_actions(extracted["data"], execution_memory)
            return extracted

    except Exception as e:
        logger.exception(f"🔥 AI ERROR: {str(e)}")
        return {
            "data": [],
            "error": str(e),
            "error_type": type(e).__name__,
        }

    logger.warning("⚠️ Returning empty actions")
    return {"data": []}