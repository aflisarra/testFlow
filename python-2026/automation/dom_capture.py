"""
Structured DOM capture for the AI planner.

Replaces the old `driver.page_source[:6000]` (raw HTML, truncated and
unreadable once escaped into JSON) with a list of dictionaries describing
the visible interactive elements on the page.

This is EXACTLY the format already expected by routers/ai_decision.py
(_infer_test_data_from_dom, _dom_to_fill_actions, _dom_submit_action) —
no changes are needed on the router side, its fallback logic "wakes up"
automatically once it receives this format instead of an HTML string.
"""

from __future__ import annotations

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# NOTE: the tags captured here must stay in sync with the ones used in
# resolve_indexed_selector() below (same document order => same indices
# between capture and selector resolution).
_CAPTURED_TAGS_CSS = """
input,
button,
a,
textarea,
select,
[role="button"],
[role="link"],
[role="option"],
[role="combobox"]
"""
_CAPTURE_JS_TEMPLATE = r"""
return (function () {
    const LIMIT = %(limit)d;
    const results = [];
    let index = 0;

function isVisible(el) {
 const style = window.getComputedStyle(el);
 const rect = el.getBoundingClientRect();

 return (
   style.display !== 'none' &&
   style.visibility !== 'hidden' &&
   style.opacity !== '0' &&
   rect.width > 0 &&
   rect.height > 0 &&
   rect.bottom >= 0 &&
   rect.right >= 0 &&
   rect.top <= window.innerHeight &&
   rect.left <= window.innerWidth
 );
}

    function shortText(el) {
        const t = (el.innerText || el.textContent || '').trim();
        return t ? t.slice(0, 80) : null;
    }

    const elements = document.querySelectorAll('%(selector)s');

    for (const el of elements) {
        if (index >= LIMIT) break;

        const tag = el.tagName.toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();

        if (type === 'hidden') continue;
        const visible = isVisible(el);
        if (!visible) continue;

        const entry = {
            index: index,
            tag: tag,
            class: el.className || null,
            role: el.getAttribute('role') || null,
            visible: visible,
            rect: {
                x: Math.round(el.getBoundingClientRect().x),
                y: Math.round(el.getBoundingClientRect().y),
                width: Math.round(el.getBoundingClientRect().width),
                height: Math.round(el.getBoundingClientRect().height),
            },
            type: type || null,
            id: el.id || null,
            name: el.getAttribute('name') || null,
            placeholder: el.getAttribute('placeholder') || null,
            ariaLabel: el.getAttribute('aria-label') || null,
            ariaExpanded: el.getAttribute('aria-expanded') || null,
            ariaHaspopup: el.getAttribute('aria-haspopup') || null,
            ariaControls: el.getAttribute('aria-controls') || null,
            ariaOwns: el.getAttribute('aria-owns') || null,
            title: el.getAttribute('title') || null,
            testId: el.getAttribute('data-testid') || null,
            text: shortText(el),
            value: (el.value !== undefined && el.value !== '') ? String(el.value).slice(0, 80) : null,
            disabled: !!el.disabled,
            checked: (tag === 'input' && (type === 'checkbox' || type === 'radio')) ? !!el.checked : null,
            selected: (tag === 'option' || tag === 'select') ? !!el.selected : null,
            businessRole: (() => {
                const text = (
                    (el.id || '') + ' ' +
                    (el.name || '') + ' ' +
                    (el.placeholder || '') + ' ' +
                    (el.getAttribute('aria-label') || '')
                ).toLowerCase();

                if (text.includes('email')) return 'email';
                if (text.includes('password')) return 'password';
                if (text.includes('country')) return 'country';
                if (text.includes('username') || text.includes('login')) return 'username';
                return null;
            })(),
        };
        if (tag === 'select') {
            entry.options = Array.from(el.options || []).slice(0, 20).map(o => ({
                value: o.value,
                text: (o.textContent || '').trim().slice(0, 60),
                selected: !!o.selected,
                disabled: !!o.disabled,
            }));
        }

        results.push(entry);
        index += 1;
    }

    return results;
})();
"""


def capture_dom_elements(driver, limit: int = 150) -> list[dict]:
    """
    Run a JS snippet in the current page and return a structured list of
    visible interactive elements (input/textarea/select/button/a[href]),
    in document order.

    Selenium automatically deserializes the JS return value into Python
    objects (list[dict]) via the WebDriver protocol — no json.loads needed.
    """
    script = _CAPTURE_JS_TEMPLATE % {"limit": limit, "selector": _CAPTURED_TAGS_CSS}
    try:
        elements = driver.execute_script(script)
    except Exception:
        elements = []
    return elements if isinstance(elements, list) else []


def resolve_indexed_selector(driver, selector: str, wait_seconds: int = 5):
    """
    Resolve a "__index:N" pseudo-selector (generated by the AI fallback
    when an element has no id, name, or placeholder) by finding it via
    XPath position, using the same set of tags as capture_dom_elements().

    Approximation: assumes the page hasn't changed between the DOM
    capture and the action execution (true in the vast majority of cases
    for a single step).
    """
    if not selector.startswith("__index:"):
        raise ValueError("Not an indexed selector")

    idx = int(selector.split(":", 1)[1])
    xpath = (
        f"(//input | //button | //a | //textarea | //select | "
        f"//*[@role='button'] | //*[@role='link'] | //*[@role='option'] | //*[@role='combobox'])[{idx + 1}]"
    )

    return WebDriverWait(driver, wait_seconds).until(
        EC.element_to_be_clickable((By.XPATH, xpath))
    )
