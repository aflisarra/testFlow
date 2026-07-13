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
                "classes",
                "checked",
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
                "index",
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

    def compact_dom(value):
        """
        If `dom` is the structured list produced by capture_dom_elements()
        (dom_capture.py), strip empty keys to save space within the 6000
        character budget sent to the model. Any other format passes
        through unchanged (backward compatibility).
        """
        if not isinstance(value, list):
            return value
        # Keep the model input tight: only the whitelisted fields survive,
        # and empty values are removed after the projection.
        allowed_keys = {

    "index",
    "tag",
    "role",
    "type",
    "id",
    "name",
    "placeholder",
    "ariaLabel",
    "ariaExpanded",
    "ariaHaspopup",
    "title",
    "testId",
    "text",
    "value",
    "classes",
    "checked",
    "disabled",
    "visible",
    "rect",
    "options",
    "businessRole",
    
  # NEW
    "ariaInvalid",
    "required",
    "validity",


}
        compacted = []
        for el in value:
            if not isinstance(el, dict):
                continue
            projected = {k: v for k, v in el.items() if k in allowed_keys and v not in (None, "", [])}
            if (
                projected.get("role") == "option"
                and projected.get("visible") is True
                and projected.get("text")
            ):
                projected["selector"] = f'text={str(projected["text"]).strip()}'
            if "options" in projected and isinstance(projected["options"], list):
                projected["options"] = [
                    {k: v for k, v in opt.items() if v not in (None, "", [])}
                    for opt in projected["options"]
                    if isinstance(opt, dict)
                ]
            compacted.append(projected)
        return compacted

    def safe(v):
        try:
            return json.dumps(v, ensure_ascii=False)[:6000]
        except Exception:
            return str(v)[:6000]

    step_text = str(step or "").strip()
    dom_text = safe(compact_dom(dom))

    test_data = []
    if isinstance(test_case, dict):
        test_data = (
            test_case.get("test_data")
            or test_case.get("testData")
            or test_case.get("data")
            or []
        )

    execution_memory = {}
    if isinstance(test_case, dict):
        execution_memory = (
            test_case.get("execution_memory")
            or test_case.get("executionMemory")
            or {}
        )

    test_data_text = safe(test_data)
    
        
    memory_text = safe(execution_memory) if execution_memory else "{}"

    return f"""
You are a Selenium automation planner.

Your task is to convert a TEST STEP into executable Selenium UI actions
Use the provided DOM and TEST DATA when available.
If TEST DATA is incomplete, generate missing values based on the TEST CASE.

OUTPUT FORMAT (STRICT JSON ONLY):

{{"data":[{{"type":"type|click","selector":"CSS selector","value":"text"}}]}}

RULES:

- Return ONLY valid JSON.
- No explanation.
- No markdown.
- Use ONLY elements existing in DOM.
- Never invent selectors.

Prefer selectors:

1. id (#id)
2. name
3. testId
4. unique CSS selector
5. text selector for buttons/options

---

STEP INTENT HAS HIGHEST PRIORITY.

Analyze STEP first.
Then apply EXECUTION MEMORY constraints.
Then use DOM.

================================================
CLICK ACTION RULES
================================================

If STEP contains:

- click
- submit
- register
- login
- save
- continue
- confirm
- next
- press
- create account

Generate ONLY click actions.

Ignore input fields.

For click:

Prefer:

1. button[type="submit"]
2. button elements
3. input type="submit"
4. role="button"
5. text matching button

For registration steps:

Strongly prefer buttons whose visible text matches:

- Create account
- Register
- Sign up
- Submit

Apply this priority:

Create account > Register > Sign up > Submit > Continue

Social login buttons must never be selected when a registration submit button exists.

Never click:

- hidden elements
- visible=false
- height=0
- width=0
- wrappers
- containers
- captcha
- checkbox unless required
- radio unless required

Never select OAuth or social authentication buttons:

- Continue with Google
- Continue with Apple
- Continue with Facebook
- Continue with Microsoft
- Login with Google
- Sign in with Google
- Sign in with Apple

These buttons are not form submission buttons.
If an element has visible text:

Create account
Register
Submit
Sign up
Continue

the selector MUST be:

text=VISIBLE_TEXT

Example:

Correct:

{{
  "type":"click",
  "selector":"text=Create account"
}}

Incorrect:

{{
  "type":"click",
  "selector":"__index:8"
}}

Never use __index selector when a stable selector exists.

For register/login/create account steps:

Only skip:
- checkbox (unless explicitly required)
- radio (unless required)

BUT:

- If STEP requires dropdown selection, you MUST complete dropdown first before any submit.
- Dropdown selection always has higher priority than form submission.

Only click the submit/register button.

Planner memory rules:

- Ignore any action already present in EXECUTION MEMORY.executed_actions.
- If a field is already present in EXECUTION MEMORY.filled_fields with the
  expected value, do not type it again.
- If a dropdown is already present in EXECUTION MEMORY.selected_dropdowns
  with the requested value, do not reopen it.
- If a checkbox is already present in EXECUTION MEMORY.checked_checkboxes,
  do not click it again.
- Only generate actions for the current step.
- Never repeat actions from previous steps.
================================================
TYPE ACTION RULES
================================================

If STEP contains:

- enter
- fill
- type
- provide
- insert
- set

Generate ONLY type actions.

Find:

- input
- textarea
- select

Map TEST DATA:

email -> email field

password -> password field

username -> username field


Do NOT fill unrelated fields.

If a visible button contains the exact text mentioned in the STEP,
always use that button.

Example:

STEP:
Click register button "Create account"


Correct:

{{
  "type":"click",
  "selector":"text=Create account",
  "value":""
}}


Incorrect:

{{
  "type":"click",
  "selector":"__index:8",
  "value":""
}}


If STEP contains "Select" or "Choose":

You MUST STRICTLY follow this sequence:

1. Find dropdown trigger
2. Click dropdown trigger
3. WAIT for options to appear
4. Select matching option

CRITICAL:

- Do NOT interact with ANY other element before completing dropdown selection
- Do NOT click checkbox, button or link before dropdown is selected
- Dropdown selection is mandatory and cannot be skipped

Never skip dropdown.
Never go to next elements before selecting value.

================================================
PRIORITY RULES
================================================

Priority of actions:

1. Dropdown selection (highest priority)
2. Input typing
3. Checkbox / radio
4. Submit button (lowest priority)

Rules:

- NEVER click submit if dropdown not selected
- NEVER click checkbox if dropdown exists in step
- ALWAYS complete dropdown before any other action
================================================
DROPDOWN HANDLING RULES
================================================
If STEP is about dropdown:

- NEVER click checkbox
- NEVER click unrelated elements
- IGNORE all checkbox and links

If STEP requires selecting a value in any dropdown implementation:

Example:

Select Tunisia country


Do this sequence:

1. Find dropdown trigger:

- button
- role=combobox
- role=listbox
- aria-haspopup
- aria-haspopup="listbox"
- aria-haspopup="dialog"
- aria-haspopup="menu"
- aria-expanded
- input dropdown trigger
- any visible custom dropdown trigger


2. Click dropdown trigger.
   If the visible text selector already matches the trigger,
   click that element first.
   Prefer the trigger whose text/label/aria/name best matches the
   requested dropdown value when several buttons are visible.

3. Wait for the popup/listbox/options to be visible.
   If the DOM changes after opening, use the updated DOM.

4. If a search input exists inside the opened dropdown:

- focus it
- clear it
- type the requested value


5. Find the option whose visible text exactly matches the requested value.

6. If it is not immediately visible:

- scroll the dropdown container, not the page
- continue until found or end reached

7. Click the matching visible option.

8. If the dropdown refuses to open:

- type the requested value into the trigger if it is an input/combobox
- do not choose an arbitrary option

If an element contains:

- aria-haspopup
- aria-expanded
- role=combobox
- role=listbox

It MUST be treated as a dropdown trigger.

For options:

ONLY click if:

- role="option"
- text matches
- visible=true


Never click:

- visible=false
- height=0
- width=0


Never use:

__index:N

for dropdown options.

If the dropdown does not open after clicking the trigger,
type the requested value into the dropdown input or combobox
instead of choosing an arbitrary option.
Do not click a random button from the page.
Use the trigger related to the dropdown value when available.
Support React, Vue, Angular, Svelte, Next.js, GitHub Primer, Material UI,
Ant Design, Radix, HeadlessUI, Bootstrap, PrimeReact, Chakra and custom div/button dropdowns.


Correct:

{{
"type":"click",
"selector":"text=Tunisia",
"value":"Tunisia"
}}


Incorrect:

{{
"type":"click",
"selector":"__index:50",
"value":"Tunisia"
}}


================================================
INDEX SELECTOR RULES
================================================

__index is allowed ONLY as last fallback.

Never use __index for:

- dropdown option
- hidden element
- role=option
- dropdown items
- list items
- menu items

For dropdown options:

If DOM contains:

role="option"
visible=true
text="VALUE"

generate:

{{
"type":"click",
"selector":"text=VALUE",
"value":"VALUE"
}}


If element has text:

use:

text=ElementText


================================================
FIELD VALIDATION RULES
================================================

Some applications validate fields immediately after typing.

Indicators:

- validity=true
- ariaInvalid=false
- success icon
- validation message

If a field is already valid:

- do not retype it
- consider the field completed

Do not generate unnecessary actions on validated fields.

Some applications validate only after submit.

Do not assume a form is invalid simply because
the URL has not changed.

Typing a value into a field is considered successful
if the value exists in the field and there is no visible
validation error.
================================================
TEST DATA RULES
================================================

Use the provided TEST DATA when available.

If TEST DATA is missing, incomplete, empty, or does not contain all required values, generate realistic missing values according to the TEST CASE objective and workflow.

Generated values must:

Respect the field purpose.
Respect the test scenario type.
Be realistic and executable.
Not be random meaningless values.

Examples:

For a valid login test:

Generate valid username and password values.

For an invalid login test:

Generate valid username and an incorrect password value, or invalid credentials according to the scenario.

For registration:

Generate realistic email, username, password, and required fields.

Never leave mandatory fields empty when the workflow requires them.

Never stop execution because TEST DATA is incomplete.


TEST OBJECTIVE PRIORITY RULE

When generating missing test data, the TEST CASE objective, title, and type have higher priority than incomplete existing data.

If the test type is Positive:

Generate valid data for all required fields.

If the test type is Negative:

Generate invalid data only for the field or rule being tested.
Keep all other mandatory fields valid.

If the test type is Validation:

Generate data that triggers the specific validation described in the test case.

Always generate data that allows the test scenario to be executed correctly.

================================================
ACTION CONSISTENCY
================================================

- One action = one STEP intention.
- Minimum required actions.
- All selectors must exist.
- Do not repeat actions from previous steps.
- If the current step is a dropdown selection, return only the
  dropdown trigger click and the final option click/value handling.
- Do not re-emit completed email/password/checkbox actions when the
  current step is about another field or dropdown.

---

STEP:

{step_text}

TEST DATA:

{test_data_text}

EXECUTION MEMORY:

{memory_text}

DOM:

{dom_text}

"""
