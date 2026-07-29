import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from prompts.ai_decision_prompt import build_ai_decision_prompt
from services.ai_service import get_ai_service
from utils.selenium_generator import generate_selenium_code
import json
import re

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


def get_test_data_map(test_case):
    return extract_test_data(test_case)


def _find_matching_test_data(el, test_data_map):
    if not isinstance(test_data_map, dict):
        return None

    business_role = str(el.get("businessRole") or "").lower().strip()
    if business_role and business_role in test_data_map:
        return test_data_map[business_role]

    searchable = " ".join(
        [
            str(el.get("id") or ""),
            str(el.get("name") or ""),
            str(el.get("placeholder") or ""),
            str(el.get("ariaLabel") or ""),
            str(el.get("title") or ""),
            str(el.get("text") or ""),
        ]
    ).lower()

    best_value = None
    best_score = 0

    for key, value in test_data_map.items():
        key = str(key).lower()

        score = 0

        if key == searchable:
            score = 100

        elif key in searchable:
            score = 80

        elif any(part in searchable for part in key.split("_")):
            score = 60

        if score > best_score:
            best_score = score
            best_value = value

    return best_value


def _find_dom_element_by_selector(selector: str, dom):
    """
    Resolve a selector string (as produced by this module or by the LLM)
    back to the DOM element dict it was built from. Used both to derive a
    human-readable label and to attach the element's on-screen position
    to the action, so the executor has a coordinate fallback if the
    selector itself no longer matches at run time.
    """
    if not isinstance(dom, list):
        return None
    selector_text = str(selector or "").strip()
    if not selector_text:
        return None

    if selector_text.startswith("text="):
        target_text = _normalize_text(selector_text[5:])
        for el in dom:
            if isinstance(el, dict) and _normalize_text(el.get("text")) == target_text:
                return el
        return None

    if selector_text.startswith("__index:"):
        try:
            idx = int(selector_text.split(":", 1)[1])
        except ValueError:
            return None
        for el in dom:
            if isinstance(el, dict) and el.get("index") == idx:
                return el
        return None

    for el in dom:
        if not isinstance(el, dict):
            continue
        candidates = {
            f"#{str(el.get('id') or '').strip()}",
            f'[name="{str(el.get("name") or "").strip()}"]',
            f'[data-testid="{str(el.get("testId") or "").strip()}"]',
            f'[aria-label="{str(el.get("ariaLabel") or "").strip()}"]',
            f'[placeholder="{str(el.get("placeholder") or "").strip()}"]',
        }
        if selector_text in candidates:
            return el
    return None


def _action_label_from_selector(selector: str, dom) -> str:
    selector_text = str(selector or "").strip()
    if selector_text.startswith("text="):
        return selector_text[5:].strip()

    el = _find_dom_element_by_selector(selector_text, dom)
    if not el:
        return ""

    return str(
        el.get("businessRole")
        or el.get("ariaLabel")
        or el.get("placeholder")
        or el.get("name")
        or el.get("text")
        or ""
    ).strip()


def _enrich_actions(actions, dom):
    enriched = []
    for action in actions or []:
        if not isinstance(action, dict):
            continue
        item = dict(action)
        item_type = str(item.get("type") or item.get("action") or "").strip().lower()
        if item_type:
            item["type"] = item_type

        if not str(item.get("label") or "").strip():
            label = _action_label_from_selector(str(item.get("selector") or ""), dom)
            if label:
                item["label"] = label

        # ✅ Attach the element's on-screen position (from the DOM capture's
        # `rect`) so the frontend can show/edit it, and so the Selenium
        # executor has a coordinate-based fallback (elementFromPoint) when
        # the selector no longer resolves at execution time.
        if not item.get("position"):
            el = _find_dom_element_by_selector(str(item.get("selector") or ""), dom)
            rect = el.get("rect") if isinstance(el, dict) else None
            if isinstance(rect, dict):
                item["position"] = {
                    "x": rect.get("x"),
                    "y": rect.get("y"),
                    "width": rect.get("width"),
                    "height": rect.get("height"),
                }

        enriched.append(item)
    return enriched


def _decision_response(actions, dom=None):
    enriched = _enrich_actions(actions, dom)
    return {
        "data": enriched,
        "selenium_code": generate_selenium_code(enriched),
    }


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

    # ✅ priorité absolue au businessRole enrichi côté DOM
    business_role = str(
        el.get("businessRole") or ""
    ).strip().lower()

    if business_role:
        return business_role

    tag = str(el.get("tag") or "").lower().strip()
    input_type = str(el.get("type") or "").lower().strip()

    field_id = _normalize_text(el.get("id"))
    name = _normalize_text(el.get("name"))
    placeholder = _normalize_text(el.get("placeholder"))
    aria = _normalize_text(el.get("ariaLabel"))
    title = _normalize_text(el.get("title"))
    text = _normalize_text(el.get("text"))
    role = _normalize_text(el.get("role"))
    classes = _normalize_text(
        el.get("class") or el.get("classes")
    )

    haystack = " ".join([
        field_id,
        name,
        placeholder,
        aria,
        title,
        text,
        role,
        classes,
    ])

    # ✅ dropdowns
    if tag == "select":
        return "select"

    # ✅ password
    if input_type == "password" or "password" in haystack:
        return "password"

    # ✅ email
    if input_type == "email" or "email" in haystack:
        return "email"

    # ✅ phone
    if (
        input_type in {"tel", "phone"}
        or "phone" in haystack
        or "mobile" in haystack
    ):
        return "phone"

    # ✅ first name
    if any(
        token in haystack
        for token in (
            "first name",
            "firstname",
            "first_name",
            "given name",
        )
    ):
        return "firstname"

    # ✅ last name
    if any(
        token in haystack
        for token in (
            "last name",
            "lastname",
            "last_name",
            "surname",
            "family name",
        )
    ):
        return "lastname"

    # ✅ username
    if any(
        token in haystack
        for token in (
            "username",
            "user name",
            "login",
            "user",
        )
    ):
        return "username"

    # ✅ country / region
    if any(
        token in haystack
        for token in (
            "country",
            "region",
            "nationality",
        )
    ):
        return "country"

    # ✅ generic text field
    if tag == "input" and input_type in (
        "",
        "text",
        "search",
    ):
        return "text"

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


FIELD_SYNONYMS = {
    "email": ("email", "e-mail", "mail"),
    "password": ("password", "passwd", "pass word"),
    "username": ("username", "user name", "login", "user"),
    "phone": ("phone", "mobile", "telephone", "tel"),
    "country": ("country", "region", "nationality"),
    "firstname": ("firstname", "first_name", "first name", "given_name", "given name", "prenom", "prénom"),
    "lastname": ("lastname", "last_name", "last name", "surname", "family_name", "family name", "nom"),
    "address": ("address", "street", "adresse"),
    "city": ("city", "town", "ville"),
    "postal_code": ("postalcode", "postal_code", "postal code", "zip", "zipcode", "zip code"),
}

TEST_DATA_KEY_ALIASES = {
    "first_name": "firstname",
    "firstName": "firstname",
    "given_name": "firstname",
    "givenName": "firstname",
    "last_name": "lastname",
    "lastName": "lastname",
    "family_name": "lastname",
    "familyName": "lastname",
    "surname": "lastname",
    "postal": "postal_code",
    "postalCode": "postal_code",
    "postal_code": "postal_code",
    "zip": "postal_code",
    "zipCode": "postal_code",
    "zipcode": "postal_code",
    "mobile": "phone",
    "telephone": "phone",
    "tel": "phone",
    "login": "username",
    "user": "username",
    "user_name": "username",
    "userName": "username",
    "passwd": "password",
}


def _canonical_key(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    compact = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")
    if compact in TEST_DATA_KEY_ALIASES:
        return TEST_DATA_KEY_ALIASES[compact]
    for field, synonyms in FIELD_SYNONYMS.items():
        normalized_synonyms = {re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_") for s in synonyms}
        if compact == field or compact in normalized_synonyms:
            return field
    return compact


def extract_test_data(test_case):
    """
    Normalize test_data into a field -> value dictionary.

    Supported input shapes:
    - [{"field": "email", "value": "john@test.com"}]
    - [{"name": "email", "value": "john@test.com"}]
    - {"email": "john@test.com", "password": "123456"}
    - [{"email": "john@test.com", "password": "123456"}]
    """
    source = _extract_test_data_source(test_case)
    normalized = {}

    def put(key, value):
        canonical = _canonical_key(key)
        if not canonical:
            return
        if value in (None, ""):
            return
        if isinstance(value, (dict, list)):
            return
        normalized[canonical] = str(value).strip()

    def consume(value):
        if value in (None, "", []):
            return
        if isinstance(value, dict):
            field_name = value.get("field") or value.get("name") or value.get("key")
            if field_name and "value" in value:
                put(field_name, value.get("value"))
                return
            for key, item in value.items():
                put(key, item)
            return
        if isinstance(value, list):
            for item in value:
                consume(item)
            return
        if isinstance(value, str):
            # Do not heuristically classify raw strings into the map.
            # They will be processed sequentially by the fallback cursor instead.
            return

    consume(source)
    return normalized


def _step_requested_fields(step):
    text = _normalize_text(step)
    fields = []
    for field, synonyms in FIELD_SYNONYMS.items():
        if any(_normalize_text(synonym) in text for synonym in synonyms):
            fields.append(field)
    return fields


def _score_dom_element_for_field(el, field):
    if not isinstance(el, dict) or el.get("disabled"):
        return 0

    tag = str(el.get("tag") or "").lower().strip()
    input_type = str(el.get("type") or "").lower().strip()
    if input_type == "hidden":
        return 0

    is_fillable = tag in {"input", "textarea", "select"} or str(el.get("role") or "").lower() in {"combobox", "listbox"}
    if not is_fillable:
        return 0

    synonyms = FIELD_SYNONYMS.get(field, ())
    business_role = _canonical_key(el.get("businessRole"))
    score = 0
    if business_role == field:
        score += 120

    weighted_fields = (
        ("id", 45),
        ("name", 40),
        ("placeholder", 34),
        ("ariaLabel", 34),
        ("title", 24),
        ("type", 28),
    )
    for key, weight in weighted_fields:
        value = _normalize_text(el.get(key))
        if not value:
            continue
        for synonym in synonyms:
            if _normalize_text(synonym) in value:
                score += weight
        if _canonical_key(value) == field:
            score += weight

    if field == "password" and input_type == "password":
        score += 100
    if field == "email" and input_type == "email":
        score += 90
    if field == "phone" and input_type in {"tel", "phone"}:
        score += 70
    if field == "country" and (tag == "select" or str(el.get("role") or "").lower() in {"combobox", "listbox"}):
        score += 55

    return score


def _best_dom_element_for_field(dom, field):
    best = None
    best_score = 0
    for el in dom or []:
        score = _score_dom_element_for_field(el, field)
        if score > best_score:
            best = el
            best_score = score
    return best if best_score >= 35 else None


def _deterministic_actions_for_step(step, dom, test_case):
    if not isinstance(dom, list):
        return []

    test_data = extract_test_data(test_case)
    requested_fields = _step_requested_fields(step)
    if not requested_fields:
        return []

    actions = []
    used_selectors = set()
    logger.info("STEP=%s", step)
    logger.info("TEST DATA=%s", test_data)

    for field in requested_fields:
        value = test_data.get(field)
        if not value:
            continue

        el = _best_dom_element_for_field(dom, field)
        if not el:
            continue

        selector = _field_selector_priority(el)
        if not selector or selector in used_selectors:
            continue

        tag = str(el.get("tag") or "").lower().strip()
        role = str(el.get("role") or "").lower().strip()
        action_type = "click" if field == "country" and tag != "select" and role in {"combobox", "listbox", "button"} else "type"

        action = {
            "type": action_type,
            "selector": selector,
            "value": value,
            "label": field,
        }
        actions.append(action)
        used_selectors.add(selector)

        logger.info("MATCHED FIELD=%s", field)
        logger.info("SELECTOR=%s", selector)
        logger.info("VALUE=%s", value)

    logger.info("GENERATED ACTIONS=%s", actions)
    return actions


def _first_dom_option_value(dom):
    """
    Pick a plausible value directly from the DOM when no test_data value
    is left to assign to a dropdown step (all explicit values already
    consumed, or none were ever provided). Prefers a visible option
    element, then falls back to a <select> element's first <option>.
    """
    if not isinstance(dom, list):
        return None

    for el in dom:
        if not isinstance(el, dict):
            continue
        if (
            str(el.get("role") or "").lower() == "option"
            and el.get("visible")
            and str(el.get("text") or "").strip()
        ):
            return str(el.get("text")).strip()

    for el in dom:
        if not isinstance(el, dict):
            continue
        if str(el.get("tag") or "").lower() == "select":
            for opt in el.get("options") or []:
                text = str(opt.get("text") or "").strip()
                if text:
                    return text

    return None


def _infer_actions_when_empty(step, dom, test_case):
    actions = _deterministic_actions_for_step(step, dom, test_case)
    if actions:
        return actions
    if _is_click_step(step):
        action = _dom_click_action_for_step(step, dom)
        return [action] if action else []
    if _is_fill_step(step):
        # No longer refuses when test_data is empty: _dom_to_fill_actions
        # generates plausible placeholder values from the DOM itself so the
        # step can still run instead of being permanently blocked.
        return _dom_to_fill_actions(dom, test_case, step=step)
    if _is_dropdown_step(step):
        value = _extract_next_unused_test_data_value(test_case, _extract_execution_memory(test_case))
        if not value:
            # No test_data left for this dropdown: pick a plausible option
            # straight from the DOM so the step still executes.
            value = _first_dom_option_value(dom)
        action = _dom_dropdown_action(dom, value)
        return [action] if action else []
    return []


def _dom_click_action_for_step(step, dom):
    """Return a safe text-based click fallback when the AI returns no action."""
    if not isinstance(dom, list):
        return None

    step_text = str(step or "").strip()
    quoted = re.search(r'["\']([^"\']+)["\']', step_text)
    if quoted:
        target = quoted.group(1)
    else:
        # Covers instructions such as "Click on the login button" while
        # discarding any trailing navigation expectation or URL.
        match = re.search(
            r"(?:click|press|open)\s+(?:on\s+)?(?:the\s+)?(?:button\s+|link\s+)?(.+?)(?:\s+(?:button|link))?(?:\s+to\b|\s*[:\-]|$)",
            step_text,
            flags=re.IGNORECASE,
        )
        target = match.group(1) if match else ""

    target = _normalize_text(target)
    logger.info("CLICK TARGET=%s", target)
    if not target:
        return None

    best_element = None
    best_score = 0
    for element in dom:
        if not isinstance(element, dict) or element.get("disabled") or element.get("visible") is False:
            continue
        tag = str(element.get("tag") or "").lower()
        role = str(element.get("role") or "").lower()
        if tag not in {"button", "a", "input"} and role not in {"button", "link"}:
            continue
        label = _normalize_text(
            element.get("text") or element.get("ariaLabel") or element.get("title") or element.get("value")
        )
        if not label:
            continue
        score = 100 if label == target else 60 if target in label else 0
        if score > best_score:
            best_element, best_score = element, score
        logger.info(
    "BEST_ELEMENT=%s BEST_SCORE=%s",
    best_element,
    best_score,
)
    if not best_element:
        return None
    selector = _selector_for_dom_element(best_element)
    return {"type": "click", "selector": selector, "value": "", "label": target} if selector else None


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
def _dom_to_fill_actions(dom, test_case, step=""):
    logger.info("⚙️ Fallback activated (DOM → actions)")

    defaults = _make_default_values()

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
    test_data_map = get_test_data_map(test_case)

    if not raw_values:
        # No explicit test_data at all: generate plausible placeholder
        # values from the DOM (field type heuristics) rather than blocking
        # the step. Explicit values always win when present — this branch
        # only runs when test_data is completely empty for this test case.
        logger.warning("No explicit test_data; generating placeholder values from DOM")
        raw_values = _infer_test_data_from_dom(dom, step)
        test_data_map = {}
        if not raw_values:
            logger.warning("Could not infer any placeholder values from DOM either")
            return []

    logger.info(
        "🧪 flattened test_data values",
        extra={
            "count": len(raw_values),
            "values": raw_values,
        },
    )
    logger.info(f"✅ Values used: {raw_values}")
    logger.info("🧩 test_data_map", extra=test_data_map)

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

        # ── FIX: checkbox/radio ne référence plus une variable `value`
        # qui n'existait pas encore à ce stade — on clique simplement
        # dessus (une case à cocher n'a pas de "valeur texte" à taper).
        if tag == "input" and input_type in {"checkbox", "radio"}:
            if choice_selected:
                continue
            actions.append({
                "type": "click",
                "selector": selector,
                "label": (
                    el.get("businessRole")
                    or el.get("placeholder")
                    or el.get("ariaLabel")
                    or el.get("name")
                    or el.get("id")
                    or "Field"
                ),
                "value": "",
            })
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

        value = _find_matching_test_data(el, test_data_map) or ""

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

        if value:
            used_values.add(value)  # ✅ mark this value as consumed

        logger.info("Mapped field: %s -> %s", selector, value)
        actions.append({
    "type": "type",
    "selector": selector,
    "label": (
        el.get("businessRole")
        or el.get("placeholder")
        or el.get("ariaLabel")
        or el.get("name")
        or el.get("id")
        or "Field"
    ),
    "value": value
})
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


def _selector_for_dom_element(el):
    if not isinstance(el, dict):
        return ""
    for key in ("id", "testId", "name"):
        value = str(el.get(key) or "").strip()
        if value:
            if key == "id":
                return f"#{value}"
            if key == "testId":
                return f'[data-testid="{value}"]'
            return f'[name="{value}"]'
    text = str(el.get("text") or el.get("ariaLabel") or el.get("title") or "").strip()
    if text:
        return f"text={text[:80]}"
    index = el.get("index")
    return f"__index:{index}" if index is not None else ""


def _dom_dropdown_action(dom, target_value):
    if not isinstance(dom, list):
        return None

    best = None
    best_score = -1
    for el in dom:
        if not isinstance(el, dict) or el.get("visible") is False:
            continue
        tag = str(el.get("tag") or "").lower()
        role = str(el.get("role") or "").lower()
        el_type = str(el.get("type") or "").lower()
        text_blob = " ".join(
            str(el.get(key) or "")
            for key in ("text", "ariaLabel", "name", "id", "placeholder", "title", "classes")
        ).lower()

        score = 0
        if tag in ("button", "select") or role in ("combobox", "listbox", "button") or el.get("ariaHaspopup"):
            score += 3
        if "country" in text_blob or "region" in text_blob:
            score += 8
        if target_value and str(target_value).lower() in text_blob:
            score += 5
        if "copilot" in text_blob or "create account" in text_blob or el_type in ("checkbox", "radio", "submit"):
            score -= 20

        if score > best_score:
            best = el
            best_score = score

    if not best or best_score < 3:
        return None

    selector = _selector_for_dom_element(best)
    if not selector:
        return None
    return {"type": "click", "selector": selector, "value": target_value or ""}


def _dropdown_actions_are_specific(actions):
    if not isinstance(actions, list) or not actions:
        return False
    for action in actions:
        if not isinstance(action, dict):
            return False
        selector = str(action.get("selector") or "").lower()
        value = str(action.get("value") or "").strip()
        if not value:
            return False
        if (
            "copilot" in selector
            or "create account" in selector
            or "submit" in selector
            or "checkbox" in selector
        ):
            return False
    return True


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
    dom = payload.dom if isinstance(payload.dom, list) else []
    test_case = payload.test_case

    if not step:
        raise HTTPException(status_code=400, detail="step is required")

    logger.info("STEP=%s", step)

    resolved_test_case = test_case if isinstance(test_case, dict) else {}
    execution_memory = _extract_execution_memory(resolved_test_case)

    # Test data belongs to the test case. An explicit value always wins —
    # generated/inferred values (see _dom_to_fill_actions / _first_dom_option_value)
    # only ever fill in for a field that has no explicit test_data entry.

    if execution_memory:
        resolved_test_case = dict(resolved_test_case)
        resolved_test_case["execution_memory"] = execution_memory

    deterministic_actions = _deterministic_actions_for_step(step, dom, resolved_test_case)
    if deterministic_actions:
        actions = _dedupe_actions(deterministic_actions, execution_memory)
        logger.info("Returning deterministic actions before LLM: %s", actions)
        return _decision_response(actions, dom)

    logger.info("DOM COUNT=%s", len(dom))

    for el in dom:
        text = str(el.get("text") or "").strip()

        if text.lower() == "add":
            logger.info("✅ ADD BUTTON FOUND IN DOM=%s", el)

    try:
        prompt = build_ai_decision_prompt(step, dom, resolved_test_case)
        logger.debug("PROMPT: %s", prompt[:1500])

        client = get_ai_service()
        result = client.generate_json(prompt=prompt, timeout=90)
        logger.info("RAW AI RESPONSE=%s", result)
        logger.info("================ AI RESULT ================")
        logger.info(json.dumps(result, indent=2, ensure_ascii=False))
        logger.info("=============================================")

        extracted = _extract_actions(result)
        ai_actions = extracted.get("data", []) if isinstance(extracted, dict) else []
        logger.info("AI actions=%s", ai_actions)

        if _is_click_step(step) and (
            "sign-up" in step.lower()
            or "sign up" in step.lower()
            or "create account" in step.lower()
        ):
            return _decision_response(
                [{
                    "type": "click",
                    "selector": "text=Create account",
                    "label": "Create account",
                    "value": "",
                }],
                dom,
            )

        if _is_dropdown_step(step):
            dropdown_actions = _merge_dropdown_actions(ai_actions)
            dropdown_actions = _apply_target_dropdown_value(
                dropdown_actions, resolved_test_case, execution_memory
            )
            target_value = _extract_next_unused_test_data_value(resolved_test_case, execution_memory)
            if not _dropdown_actions_are_specific(dropdown_actions):
                fallback_action = _dom_dropdown_action(dom, target_value)
                if fallback_action:
                    dropdown_actions = [fallback_action]
            actions = _dedupe_actions(dropdown_actions, execution_memory)
            if actions:
                return _decision_response(actions, dom)

        if _is_fill_step(step):
            fill_actions = _infer_actions_when_empty(step, dom, resolved_test_case)
            if fill_actions:
                actions = _dedupe_actions(fill_actions, execution_memory)
                return _decision_response(actions, dom)

        if ai_actions:
            only_clicks = all(isinstance(a, dict) and a.get("type") == "click" for a in ai_actions)
            has_inputs = any(
                isinstance(el, dict) and el.get("tag") in ["input", "textarea", "select"]
                for el in dom
            )
            if only_clicks and has_inputs and not _is_click_step(step):
                inferred_actions = _infer_actions_when_empty(step, dom, resolved_test_case)
                if inferred_actions:
                    actions = _dedupe_actions(inferred_actions, execution_memory)
                    return _decision_response(actions, dom)

            actions = _dedupe_actions(ai_actions, execution_memory)
            if actions:
                return _decision_response(actions, dom)

        inferred_actions = _infer_actions_when_empty(step, dom, resolved_test_case)
        if inferred_actions:
            actions = _dedupe_actions(inferred_actions, execution_memory)
            logger.warning("AI returned empty actions; inferred actions=%s", actions)
            return _decision_response(actions, dom)

        logger.warning("No deterministic, AI, or inferred action matched STEP=%s", step)
        return _decision_response([], dom)

    except Exception as e:
        logger.exception("AI ERROR: %s", str(e))
        fallback_actions = _infer_actions_when_empty(step, dom, resolved_test_case)
        if fallback_actions:
            return _decision_response(_dedupe_actions(fallback_actions, execution_memory), dom)
        return _decision_response([], dom)