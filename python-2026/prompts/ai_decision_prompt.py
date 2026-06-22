def build_ai_decision_prompt(step: str, dom, test_case) -> str:
    import json

    def flatten_test_data(value):
        items = []

        if value is None:
            return items

        if isinstance(value, str):
            text = value.strip()
            if text:
                items.append(text)
            return items

        if isinstance(value, (int, float, bool)):
            items.append(str(value))
            return items

        if isinstance(value, list):
            for item in value:
                items.extend(flatten_test_data(item))
            return items

        if isinstance(value, dict):
            preferred_keys = (
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
            )

            matched = False
            for key in preferred_keys:
                if key in value and value[key] not in (None, ""):
                    matched = True
                    items.extend(flatten_test_data(value[key]))

            if matched:
                return items

            for item in value.values():
                items.extend(flatten_test_data(item))
            return items

        text = str(value).strip()
        if text:
            items.append(text)
        return items

    def safe(v):
        try:
            return json.dumps(v, ensure_ascii=False)[:6000]
        except:
            return str(v)[:6000]

    step_text = str(step or "").strip()
    dom_text = safe(dom)
    test_case_text = safe(test_case)

    test_data = []
    if isinstance(test_case, dict):
        test_data = (
            test_case.get("test_data")
            or test_case.get("testData")
            or test_case.get("data")
            or []
        )

    flattened_test_data = flatten_test_data(test_data)
    test_data_text = "\n".join(
        f"{idx + 1}. {value}" for idx, value in enumerate(flattened_test_data)
    ) or "[]"

    return f"""
You are a Selenium automation planner.

Convert STEP into UI actions using DOM and TEST DATA.

OUTPUT (STRICT JSON):
{{"data":[{{"type":"type|click","selector":"CSS selector","value":"text"}}]}}

RULES:
- Return ONLY JSON
- No explanation
- Use only elements from DOM
- Prefer id (#id) if available
- If the DOM contains input, textarea, or select elements for the current step, you MUST generate type actions for them
- For "Enter", "Fill", "Provide", "Type", "Insert", or "Set" steps, output ONLY type actions unless no editable field exists
- For "Click" or "Submit" steps, output click actions only when the step is clearly about navigation or submission
- Never click page wrappers, containers, or unrelated links when editable fields exist
- Use TEST DATA VALUES in order, top to bottom
- Treat TEST DATA as ordered values, not as a free-form paragraph
- If TEST DATA is empty and the step is about filling fields, still target the editable fields and use empty strings rather than inventing click actions
- Prefer visible form controls that match the step intent

---

IMPORTANT:

If step says:
- "Enter", "Fill", "Provide"
→ Fill ALL input fields

If step says:
- "Click", "Submit"
→ Click button

Decision order:
1. Find editable fields that match the step intent.
2. Use one type action per field, in DOM order, mapping TEST DATA values sequentially.
3. Only if no editable field exists, consider a click action.

---

EXAMPLE:

STEP: Enter user details
TEST DATA: ["John","Doe","john@mail.com"]

DOM:
input id="firstName"
input id="lastName"
input id="email"

OUTPUT:
{{"data":[
  {{"type":"type","selector":"#firstName","value":"John"}},
  {{"type":"type","selector":"#lastName","value":"Doe"}},
  {{"type":"type","selector":"#email","value":"john@mail.com"}}
]}}
- ALWAYS generate values even if TEST DATA is empty.
---

STEP:
{step_text}

TEST DATA:
{test_data_text}

DOM:
{dom_text}
"""
