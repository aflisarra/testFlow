import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from prompts.ai_decision_prompt import build_ai_decision_prompt
from services.ai_service import get_ai_service

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
            "select",
            "choose",
            "pick",
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


def _make_default_values():
    return {
        "first": "John",
        "last": "Doe",
        "full_name": "John Doe",
        "email": "john@test.com",
        "password": "John@test123",
        "phone": "1234567890",
        "date": "2000-01-01",
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

    def selector_for(el):
        el_id = str(el.get("id") or "").strip()
        if el_id:
            return f"#{el_id}"
        name = str(el.get("name") or "").strip()
        if name:
            return f'[name="{name}"]'
        placeholder = str(el.get("placeholder") or "").strip()
        if placeholder:
            return f'[placeholder="{placeholder}"]'
        if isinstance(el.get("index"), int):
            return f"__index:{el['index']}"
        return ""

    def semantic_value(el, cursor):
        tag = str(el.get("tag") or "").lower()
        input_type = str(el.get("type") or "").lower().strip()
        field_id = str(el.get("id") or "").lower()
        name = str(el.get("name") or "").lower()
        placeholder = str(el.get("placeholder") or "").lower()
        haystack = " ".join([field_id, name, placeholder, str(el.get("ariaLabel") or "").lower(), str(el.get("text") or "").lower()])

        # Login forms frequently expose username/email and password fields
        # with minimal metadata; treat them explicitly before consuming the
        # generic ordered test data cursor.
        if "password" in haystack or input_type == "password":
            return raw_values[cursor] if cursor < len(raw_values) else defaults["password"]
        if any(token in haystack for token in ("user", "login", "email", "username")):
            return raw_values[cursor] if cursor < len(raw_values) else defaults["email"]
        if "subjects" in haystack:
            return defaults["subject"]
        if "birth" in haystack or "dateofbirth" in haystack or "dob" in haystack:
            return defaults["date"]
        if "email" in haystack:
            return raw_values[cursor] if cursor < len(raw_values) else defaults["email"]
        if "phone" in haystack or "mobile" in haystack or input_type == "tel":
            return raw_values[cursor] if cursor < len(raw_values) else defaults["phone"]
        if "first" in haystack and "name" in haystack:
            return raw_values[cursor] if cursor < len(raw_values) else defaults["first"]
        if "last" in haystack and "name" in haystack:
            return raw_values[cursor] if cursor < len(raw_values) else defaults["last"]
        if "address" in haystack or "currentaddress" in haystack:
            return defaults["address"]
        if tag == "textarea":
            return defaults["address"]
        if input_type == "date":
            return defaults["date"]
        return raw_values[cursor] if cursor < len(raw_values) else ""

    actions = []
    used_selectors = set()
    used_buckets = set()
    choice_selected = False
    value_cursor = 0

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

        value = semantic_value(el, value_cursor)
        if value_cursor < len(raw_values):
            value_cursor += 1
        elif not value:
            value = defaults["subject"] if "subject" in selector.lower() else ""

        logger.info(f"✏️ Filling {selector} → {value}")
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


# ✅ extract AI response safely
def _extract_actions(result):
    if isinstance(result, list):
        return {"data": result}
    if isinstance(result, dict):
        if isinstance(result.get("data"), list):
            return result
    return {"data": []}


# ✅ MAIN ROUTE
@router.post("/ai/decide")
def decide(payload: AIDecisionPayload):
    step = payload.step or ""
    dom = payload.dom
    test_case = payload.test_case

    if not step:
        raise HTTPException(status_code=400, detail="step is required")

    logger.info(f"➡️ STEP: {step}")

    # ✅ build prompt
    resolved_test_case = test_case if isinstance(test_case, dict) else {}
    if resolved_test_case.get("test_data") is None and not resolved_test_case.get("testData"):
        inferred = _infer_test_data_from_dom(dom, step)
        if inferred:
            resolved_test_case = dict(resolved_test_case)
            resolved_test_case["test_data"] = inferred
            logger.info("🧩 Inferred test_data from DOM", extra={"count": len(inferred)})

    prompt = build_ai_decision_prompt(step, dom, resolved_test_case)
    print("🧠 PROMPT:", prompt[:1500])

    # ✅ call AI
    try:
        client = get_ai_service()
        result = client.generate_json(prompt=prompt, timeout=90)

        print("🧠 RAW AI RESULT:", result)

        extracted = _extract_actions(result)

        logger.info(f"🤖 AI actions: {extracted}")

        # ✅ FORCE fallback for fill steps
        if _is_fill_step(step):
            logger.info("✅ Fill step detected → using fallback")
            fill_actions = _dom_to_fill_actions(dom, resolved_test_case)
            if fill_actions:
                return {"data": fill_actions}

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
                        return {"data": [submit_action]}
                    return extracted

                logger.warning("⚠️ Non-click step with inputs → fallback to fill actions")
                fill_actions = _dom_to_fill_actions(dom, resolved_test_case)
                if fill_actions:
                    return {"data": fill_actions}

        # ✅ return AI if valid
        if extracted.get("data"):
            return extracted

    except Exception as e:
        logger.exception(f"🔥 AI ERROR: {str(e)}")

    logger.warning("⚠️ Returning empty actions")
    return {"data": []}
