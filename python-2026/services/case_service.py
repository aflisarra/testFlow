from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List

from core.config import get_settings
from core.constants import DEFAULT_TEST_CASES_MIN, DEFAULT_TEST_CASES_MAX, PRIORITIES, SEVERITIES, TEST_CASE_TYPES
from prompts.test_case_prompt import build_test_case_prompt
from services.ai_service import get_ai_service
from services.spec_service import SRS_CASE_SECTIONS, extract_requirements, get_srs_sections
from utils.logger import get_logger, log_event, log_error

# New constants for UI extraction
MAX_UI_COMPONENTS = 50


logger = get_logger("services.case_service")


class SrsExtractionError(ValueError):
    """Raised only when the SRS document itself lacks what's needed to
    generate test cases (no "4. UI Components" section, no subsection that
    matches the test plan, or a matched subsection with zero components).

    This is a data problem, not an AI failure: retrying the AI or running
    the deterministic fallback cannot fix it, so it is kept separate from
    ordinary AI/generation errors and is never mapped to 502/503/504 by the
    endpoint.
    """


def _tc_prefix(plan_id: str) -> str:
    m = re.search(r"\d+", plan_id or "")
    return f"TC-{m.group()}" if m else "TC"


def _normalize_priority(value: str | None) -> str:
    raw = (value or "").strip().capitalize()
    return raw if raw in PRIORITIES else "Medium"


def _normalize_severity(value: str | None) -> str:
    raw = (value or "").strip().lower()
    mapping = {
        "blocker": "Blocker",
        "critical": "Critical",
        "high": "Critical",
        "major": "Major",
        "medium": "Major",
        "minor": "Minor",
        "low": "Minor",
        "trivial": "Trivial",
    }
    normalized = mapping.get(raw, raw.capitalize())
    return normalized if normalized in SEVERITIES else "Major"


def _normalize_type(value: str | None) -> str:
    key = re.sub(r"[_\s]+", "-", str(value or "").strip().lower())
    mapping = {
        "error": "error-handling",
        "permissions": "permission",
        "empty": "validation",
        "reset": "functional",
        "multi-filter": "functional",
        "multi_filter": "functional",
    }
    normalized = mapping.get(key, key)
    allowed = {item.lower().replace(" ", "-") for item in TEST_CASE_TYPES}
    return normalized if normalized in allowed else "functional"


def _string_list(value: Any) -> List[str]:
    values = value if isinstance(value, list) else ([value] if value else [])
    return [str(item).strip() for item in values if str(item).strip()]


def _format_requirement(req: Dict[str, Any]) -> Dict[str, str]:
    return {
        "id": str(req.get("id") or req.get("requirementId") or req.get("reqId") or "").strip(),
        "title": str(req.get("title") or req.get("module") or "").strip(),
        "description": str(req.get("description") or req.get("text") or req.get("requirement") or "").strip(),
        "source": str(req.get("source") or req.get("module") or "").strip(),
        "priority": _normalize_priority(str(req.get("priority") or "")) if req.get("priority") else "",
    }


def _validated_requirements(raw: Any, requirements: List[Dict[str, str]]) -> List[Dict[str, str]]:
    valid_requirement_ids = {
        str(req.get("id")).strip().lower(): _format_requirement(req)
        for req in requirements if req.get("id")
    }
    values = raw if isinstance(raw, list) else ([raw] if raw else [])
    linked: List[Dict[str, str]] = []
    seen: set[str] = set()
    for item in values:
        candidate = item.get("id") if isinstance(item, dict) else item
        key = str(candidate or "").strip().lower()
        if key in valid_requirement_ids and key not in seen:
            linked.append(valid_requirement_ids[key])
            seen.add(key)
    return linked


def _normalize_step_details(steps: List[str], step_details: Any, fallback_expected: str = "") -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    raw_details = step_details if isinstance(step_details, list) else []

    if raw_details:
        for idx, raw_detail in enumerate(raw_details):
            detail = raw_detail if isinstance(raw_detail, dict) else {}
            comp = str(detail.get("component") or "").strip()
            action = str(detail.get("action") or "").strip()
            val = str(detail.get("value") or "").strip()

            step_from_list = steps[idx] if idx < len(steps) else ""
            step_str = str(detail.get("step") or step_from_list or "").strip()
            if not step_str and comp:
                if action in ("enter", "select") and val:
                    step_str = f"{action.capitalize()} {val} in {comp}"
                elif action:
                    step_str = f"{action.capitalize()} {comp}"
                else:
                    step_str = f"Interact with {comp}"
            elif not step_str:
                step_str = f"Step {idx + 1}"

            expected = str(
                detail.get("expected_result")
                or detail.get("expectedResult")
                or detail.get("expected")
                or fallback_expected
                or ""
            ).strip()

            item: Dict[str, Any] = {
                "step": step_str,
                "expected_result": expected,
            }
            if comp:
                item["component"] = comp
            if action:
                item["action"] = action
            if val or "value" in detail:
                item["value"] = val
            normalized.append(item)
        return normalized

    for idx, step in enumerate(steps, start=1):
        normalized.append(
            {
                "step": str(step or f"Step {idx}").strip(),
                "expected_result": str(fallback_expected or "").strip(),
            }
        )
    return normalized


def _ensure_step_details_expected(step_details: List[Dict[str, Any]]) -> None:
    missing = [
        idx + 1
        for idx, detail in enumerate(step_details)
        if not str(detail.get("expected_result") or "").strip()
    ]
    if missing:
        raise ValueError(
            "AI must provide a non-empty expected_result for every stepDetails item. "
            f"Missing at steps: {missing}"
        )


def _normalize_token(value: str) -> str:
    # Strip accents/diacritics first (NFKD + drop combining marks) so French
    # text like "déroulante"/"à cocher" normalizes the same as its ASCII
    # equivalent — without this, accented keyword checks (e.g. "liste
    # deroulante") silently never matched their accented SRS spelling and
    # components were misclassified (a dropdown extracted as a plain field).
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _tokens(value: str) -> set[str]:
    stop_words = {
        "test", "plan", "case", "valid", "invalid", "with", "from", "page", "screen",
        "form", "flow", "and", "the", "for", "scenario", "verify", "validation",
        "successful", "success", "failure",
    }
    return {
        token
        for token in _normalize_token(value).split()
        if len(token) >= 3 and token not in stop_words
    }


def _strip_heading_number(title: str) -> str:
    return re.sub(r"^\s*\d+(?:\.\d+)*[\.)]?\s*", "", title or "").strip()


def _extract_complete_ui_components_section(spec_text: str) -> str:
    lines = (spec_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    start_re = re.compile(r"^\s*(?:#{1,6}\s*)?4[\.)]?\s+ui components\s*:?\s*$", re.IGNORECASE)
    numbered_heading_re = re.compile(r"^\s*(?:#{1,6}\s*)?(\d+)(?:\.\d+)*[\.)]?\s+\S")
    collecting = False
    collected: List[str] = []

    for line in lines:
        if not collecting:
            if start_re.match(line.strip()):
                collecting = True
                collected.append(line)
            continue
        heading_match = numbered_heading_re.match(line.strip())
        if heading_match and heading_match.group(1) != "4":
            break
        collected.append(line)

    return "\n".join(collected).strip() if collected else _extract_raw_ui_section(spec_text)


def _split_ui_subsections(ui_section: str) -> List[Dict[str, str]]:
    lines = (ui_section or "").splitlines()
    section_title_re = re.compile(r"^\s*(?:#{1,6}\s*)?4[\.)]?\s+ui components\s*:?\s*$", re.IGNORECASE)
    subsection_re = re.compile(r"^\s*(?:#{1,6}\s*)?(4\.\d+(?:\.\d+)*)[\.)]?\s+(.+?)\s*:?\s*$")
    subsections: List[Dict[str, str]] = []
    current_title = ""
    current_lines: List[str] = []

    def flush() -> None:
        nonlocal current_lines
        if current_title:
            subsections.append({"title": current_title, "text": "\n".join(current_lines).strip()})
        current_lines = []

    for line in lines:
        stripped = line.strip()
        if section_title_re.match(stripped):
            continue
        match = subsection_re.match(stripped)
        if match:
            flush()
            current_title = f"{match.group(1)} {match.group(2).strip()}"
            continue
        if current_title:
            current_lines.append(line)

    flush()
    if subsections:
        return subsections
    body = "\n".join(line for line in lines if not section_title_re.match(line.strip())).strip()
    return [{"title": "4. UI Components", "text": body}] if body else []


def _score_ui_subsection(subsection: Dict[str, str], plan_title: str, plan_description: str) -> int:
    title_tokens = _tokens(plan_title)
    subtitle_tokens = _tokens(plan_description)
    subsection_title = _strip_heading_number(str(subsection.get("title") or ""))
    subsection_title_tokens = _tokens(subsection_title)
    subsection_tokens = _tokens(f"{subsection_title} {subsection.get('text') or ''}")
    score = 6 * len(title_tokens & subsection_tokens)
    score += 8 * len(subtitle_tokens & subsection_tokens)
    score += 4 * len((title_tokens | subtitle_tokens) & subsection_title_tokens)
    normalized_title = _normalize_token(subsection_title)
    if _normalize_token(plan_title) and _normalize_token(plan_title) in normalized_title:
        score += 10
    if _normalize_token(plan_description) and _normalize_token(plan_description) in normalized_title:
        score += 12
    return score


def _is_direct_match(subsection: Dict[str, str], plan_title: str, plan_description: str) -> bool:
    """DIRECT match: the test plan's title or subtitle appears (as a
    substring, after normalization) inside the subsection's own heading, or
    vice versa. Anything weaker falls back to SEMANTIC (content) scoring."""
    subsection_title = _normalize_token(_strip_heading_number(str(subsection.get("title") or "")))
    if not subsection_title:
        return False
    plan_title_norm = _normalize_token(plan_title)
    plan_desc_norm = _normalize_token(plan_description)
    for candidate in (plan_title_norm, plan_desc_norm):
        if not candidate:
            continue
        if candidate in subsection_title or subsection_title in candidate:
            return True
        # word-level: every significant word of the (shorter) candidate title
        # appears in the subsection heading, e.g. "Change Password" inside
        # "Menu utilisateur Change Password".
        candidate_words = {w for w in candidate.split() if len(w) >= 3}
        if candidate_words and candidate_words.issubset(set(subsection_title.split())):
            return True
    return False


def _select_matching_ui_subsection(
    ui_section: str, plan_title: str, plan_description: str
) -> tuple[Dict[str, str], str]:
    """Select the UI Components subsection for this test plan.

    Returns (subsection, method) where method is "DIRECT" when the plan
    title/subtitle names the subsection itself, or "SEMANTIC" when the
    subsection was chosen by comparing the plan against every subsection's
    CONTENT instead.
    """
    subsections = _split_ui_subsections(ui_section)
    if not subsections:
        raise SrsExtractionError("No UI Components subsection found in the SRS for test case generation.")

    for subsection in subsections:
        if _is_direct_match(subsection, plan_title, plan_description):
            return subsection, "DIRECT"

    scored = [
        (_score_ui_subsection(subsection, plan_title, plan_description), -index, subsection)
        for index, subsection in enumerate(subsections)
    ]
    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    best_score, _, best = scored[0]
    if best_score <= 0 and len(subsections) > 1:
        raise SrsExtractionError(
            "Unable to match a UI Components subsection using both the test plan title "
            "and subtitle/description."
        )
    return best, "SEMANTIC"


def _component_type(component: str) -> str:
    text = _normalize_token(component)
    if not text:
        return "component"
    if any(term in text for term in ("password", "mot de passe")):
        return "password field"
    if "date" in text or "calendrier" in text:
        return "date field"
    if any(term in text for term in ("dropdown", "select", "liste", "status", "statut", "leave type", "sub unit", "role", "show leave with status")):
        return "dropdown"
    if any(term in text for term in ("checkbox", "case", "toggle", "interrupteur", "switch", "include past", "past employees")):
        return "checkbox"
    if any(term in text for term in ("table", "tableau", "table des", "results table")):
        return "table"
    if re.search(r"\btab\b", text) or "onglet" in text:
        return "tab"
    if any(term in text for term in ("column", "colonne", "actions", "balance", "leave balance")):
        return "column"
    if any(term in text for term in ("button", "bouton", "search", "recherche", "reset", "clear", "reinitialiser", "save", "enregistrer", "submit", "soumettre", "add", "cancel", "login", "connexion")):
        return "button"
    if any(term in text for term in ("link", "lien", "forgot")):
        return "link"
    if any(term in text for term in ("field", "input", "champ", "name", "username", "employee")):
        return "input field"
    return "component"


def _format_typed_component(component: str) -> str:
    comp_type = _component_type(component)
    return component if comp_type == "component" else f"{component} ({comp_type})"


def _component_aliases(component: str) -> List[str]:
    normalized = _normalize_token(component)
    if not normalized:
        return []

    control_words = {
        "field",
        "button",
        "dropdown",
        "select",
        "checkbox",
        "radio",
        "table",
        "input",
        "date",
        "picker",
        "upload",
        "screen",
        "page",
        "form",
        "link",
        "tab",
        "menu",
        "component",
        "champ",
        "bouton",
        "liste",
        "case",
        "tableau",
        "ecran",
        "formulaire",
        "login",
        "username",
        "password",
    }
    aliases = [normalized]
    without_control = " ".join(
        token for token in normalized.split()
        if token not in control_words
    ).strip()
    if len(without_control) >= 2 and without_control != normalized:
        aliases.append(without_control)
    return aliases


def _topic_terms(plan_title: str, plan_description: str = "") -> set[str]:
    normalized = _normalize_token(f"{plan_title} {plan_description}")
    tokens = {token for token in normalized.split() if len(token) >= 4}
    synonyms = {
        "login": {"login", "connexion", "signin", "auth", "authentication", "authentification"},
        "authentication": {"login", "connexion", "signin", "auth", "authentication", "authentification"},
        "authentification": {"login", "connexion", "signin", "auth", "authentication", "authentification"},
        "connexion": {"login", "connexion", "signin", "auth", "authentication", "authentification"},
        "register": {"register", "registration", "signup", "inscription"},
        "registration": {"register", "registration", "signup", "inscription"},
        "inscription": {"register", "registration", "signup", "inscription"},
        "role": {"role", "roles"},
        "user": {"user", "users", "utilisateur", "utilisateurs"},
    }
    expanded = set(tokens)
    for token in list(tokens):
        expanded.update(synonyms.get(token, set()))
    return expanded


def _is_relevant_to_plan(text: str, plan_title: str, plan_description: str = "") -> bool:
    terms = _topic_terms(plan_title, plan_description)
    if not terms:
        return True
    normalized = _normalize_token(text)
    return any(term in normalized for term in terms)


def _filter_relevant_chunks(
    chunks: List[Dict[str, str]],
    plan_title: str,
    plan_description: str,
) -> List[Dict[str, str]]:
    relevant = [
        chunk for chunk in chunks
        if _is_relevant_to_plan(
            f"{chunk.get('title', '')}\n{chunk.get('text', '')}",
            plan_title,
            plan_description,
        )
    ]
    return relevant or chunks


def _extract_raw_ui_section(spec_text: str) -> str:
    normalized_text = re.sub(r"\s+", " ", spec_text or "").strip()
    inline_match = re.search(
        r"(?:^|\s)(?:#{1,6}\s*)?(?:\d+(?:\.\d+)*[\.)]?\s*)?"
        r"(?:ui components?|user interface|interface utilisateur|composants? ui|"
        r"composants? interface|screens?|ecrans?|forms?|formulaires?)\s*:?\s+"
        r"(.+?)(?=\s+(?:#{1,6}\s*)?(?:\d+(?:\.\d+)*[\.)]?\s*)"
        r"[A-Za-z][A-Za-z0-9 _/'-]{2,}\s*:?(?:\s|$)|$)",
        normalized_text,
        re.IGNORECASE,
    )
    if inline_match:
        return inline_match.group(1).strip()

    start_re = re.compile(
        r"^\s*(?:#{1,6}\s*)?(?:\d+(?:\.\d+)*[\.)]?\s*)?"
        r"(?:ui components?|user interface|interface utilisateur|composants? ui|"
        r"composants? interface|screens?|ecrans?|forms?|formulaires?)\s*:?\s*$",
        re.IGNORECASE,
    )
    next_section_re = re.compile(
        r"^\s*(?:#{1,6}\s*)?(?:\d+(?:\.\d+)*[\.)]?\s*)"
        r"[A-Za-z][A-Za-z0-9 _/'-]{2,}\s*:?\s*$"
    )
    lines = (spec_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    collecting = False
    collected: List[str] = []

    for line in lines:
        stripped = line.strip()
        if not collecting and start_re.match(stripped):
            collecting = True
            continue
        if collecting and next_section_re.match(stripped):
            break
        if collecting:
            collected.append(line)

    return "\n".join(collected).strip()


def _dedupe_controls(values: List[str]) -> List[str]:
    """Merge duplicate mentions of the same control, keeping the most
    specific/interesting type when the same name was captured more than
    once with a different inferred type."""
    priority = {
        "password field": 9,
        "date field": 8,
        "dropdown": 7,
        "toggle": 7,
        "checkbox": 7,
        "table": 6,
        "tab": 6,
        "column": 5,
        "button": 5,
        "link": 5,
        "input field": 4,
    }
    selected: Dict[str, tuple[int, str]] = {}
    order: List[str] = []
    for value in values:
        kind = _component_type(value)
        base = re.sub(
            r"\b(password field|date field|field|button|dropdown|checkbox|link|toggle|table|tab|column)\b",
            "",
            value,
            flags=re.IGNORECASE,
        )
        key = _normalize_token(base)
        if not key:
            continue
        rank = priority.get(kind, 1)
        if key not in selected:
            order.append(key)
            selected[key] = (rank, value)
        elif rank > selected[key][0]:
            selected[key] = (rank, value)
    return [selected[key][1] for key in order if key in selected]


_LABEL_JUNK_STARTERS = {
    "de", "du", "des", "la", "le", "les", "et", "ou", "avec", "sans", "sur",
    "dans", "pour", "un", "une", "ex", "sous", "forme", "d", "l", "en",
    "au", "aux", "que", "qui", "the", "a", "an", "and", "or", "with", "of",
}


def _is_valid_component_label(name: str) -> bool:
    """Reject sentence fragments (e.g. "de date avec", "affichée sous forme
    d", "ex") that regex passes can occasionally mis-capture, so only real
    component labels — a clean short name, not a clause — reach the
    allowed-components list.

    A valid label is short (<= 4 words), does not start with a lowercase
    connector word, and starts with an uppercase letter (component labels
    in the SRS are always capitalized: "From Date", "Leave Type", ...).
    """
    name = (name or "").strip()
    if not name:
        return False
    words = name.split()
    if not words or len(words) > 4:
        return False
    first_word_norm = _normalize_token(words[0])
    if first_word_norm in _LABEL_JUNK_STARTERS:
        return False
    first_alpha = next((ch for ch in name if ch.isalpha()), "")
    if first_alpha and not first_alpha.isupper():
        return False
    return True


def _extract_matched_ui_controls(text: str) -> List[str]:
    """Extract ALL concrete UI controls from an already-matched UI
    Components subsection.

    This is deliberately generic and pattern/keyword driven (not a
    hardcoded whitelist of field names) so it extracts every component of
    ANY subsection — 4.1 through 4.6 and beyond — rather than only the
    handful of names a previous, narrower implementation recognized.
    """
    controls: List[str] = []
    seen: set[str] = set()
    source_text = text or ""

    def normalize_label(value: str) -> str:
        value = re.sub(r"[«»\"']", " ", value or "")
        value = value.replace("�", " ")
        value = re.sub(r"[*+]", " ", value)
        value = re.sub(r"\s+", " ", value).strip(" .:-;,\t")
        return value

    def add(name: str, kind: str) -> None:
        name = normalize_label(name)
        name = re.sub(r"\([^)]*$", "", name).strip()
        # Strip a leading control-noun (e.g. "boutons Reset" -> "Reset") so
        # this merges with the same control captured elsewhere under its
        # bare name, instead of becoming a separate noisy duplicate entry.
        name = re.sub(
            r"^(?:boutons?|buttons?|liens?|links?|champs?|fields?|listes?\s+d.roulantes?|"
            r"dropdowns?|onglets?|tabs?|colonnes?|columns?)\s+",
            "",
            name,
            flags=re.IGNORECASE,
        ).strip()
        if re.search(
            r"\b(formulaire|incrustation|exception|m.mes champs|meme champs|ouverte via|non un)\b",
            name,
            re.IGNORECASE,
        ):
            return
        name = re.sub(
            r"\b(?:liste d.roulante|liste deroulante|champ(?: de saisie| texte)?|avec autocompl.tion|"
            r"champs? masqu.s?|obligatoire|lecture seule|page d.di.e|page de liste|"
            r"s.lecteur calendrier|s.lection multiple|.tiquettes supprimables)\b.*$",
            "",
            name,
            flags=re.IGNORECASE,
        ).strip(" .:-;,")
        if not _is_valid_component_label(name):
            return
        candidate = f"{name} {kind}"
        key = _normalize_token(candidate)
        if key and key not in seen:
            seen.add(key)
            controls.append(candidate)

    def split_items(value: str) -> List[str]:
        value = re.sub(r"\([^)]*\)", " ", value or "")
        value = re.sub(r"\b(?:et|and)\b", ",", value, flags=re.IGNORECASE)
        return [part.strip() for part in re.split(r"[,;/]+", value) if part.strip()]

    def infer_kind(descriptor: str, name: str = "") -> str:
        t = _normalize_token(f"{descriptor} {name}")
        if "password" in t or "mot de passe" in t:
            return "password field"
        if any(k in t for k in ("liste deroulante", "dropdown", "select")):
            return "dropdown"
        if any(k in t for k in ("date", "calendrier", "calendar")):
            return "date field"
        if any(k in t for k in ("interrupteur", "toggle", "switch")):
            return "toggle"
        if any(k in t for k in ("case a cocher", "checkbox")):
            return "checkbox"
        if any(k in t for k in ("tableau", "table")):
            return "table"
        if any(k in t for k in ("onglet", " tab ", "tab")):
            return "tab"
        if any(k in t for k in ("lien", "link")):
            return "link"
        if any(k in t for k in ("bouton", "button")):
            return "button"
        return "field"

    def add_form_item(item: str) -> None:
        raw = normalize_label(item)
        if not raw:
            return
        lowered = _normalize_token(raw)
        if "password" in lowered and "change password" not in lowered:
            names = re.findall(r"\b(?:Current Password|Confirm Password|Password)\*?\b", raw, re.IGNORECASE)
            if names:
                for password_name in names:
                    add(password_name, "password field")
                return
        add(raw, infer_kind(raw))

    # --- Pass 1: named field group followed by its own descriptor, e.g.
    # "From Date et To Date (champs de date avec sélecteur calendrier)",
    # "Leave Type (liste déroulante, ex. « CAN - FMLA »)",
    # "Employee Name (champ avec autocomplétion)".
    for match in re.finditer(
        r"([A-Z][A-Za-z0-9 /'\-]{1,60}?(?:\s+(?:et|and)\s+[A-Z][A-Za-z0-9 /'\-]{1,60})*)\s*\(([^)]{2,140})\)",
        source_text,
    ):
        names_part, descriptor = match.group(1), match.group(2)
        # Skip when the captured "name" is really a mid-sentence
        # continuation (e.g. "...texte d'aide (placeholder)"), but NOT when
        # it is preceded by a word that itself introduces a control, like
        # "champ Username (...)" or "bouton Save (...)" — those are
        # legitimate labeled declarations even though the introducing word
        # is lowercase.
        start = match.start(1)
        prefix_text = source_text[:start].rstrip()
        prefix_word_match = re.search(r"([A-Za-zÀ-ÿ]+)\W*$", prefix_text)
        prev_word = _normalize_token(prefix_word_match.group(1)) if prefix_word_match else ""
        control_intro_words = {
            "champ", "champs", "bouton", "boutons", "lien", "liens", "case",
            "liste", "listes", "onglet", "onglets", "colonne", "colonnes",
            "interrupteur", "toggle", "widget", "tableau", "table",
            "filtre", "filtres", "select", "dropdown",
        }
        if prev_word and prev_word not in control_intro_words and prefix_text[-1].isalpha() and prefix_text[-1].islower():
            continue
        kind = infer_kind(descriptor, names_part)
        for name in split_items(names_part) or [names_part]:
            add(name, kind)

    # --- Pass 2: interrupteur / toggle mentions
    for match in re.finditer(r"\b(?:interrupteur|toggle|switch)\s*[«\"']([^»\"']+)[»\"']", source_text, re.IGNORECASE):
        add(match.group(1), "toggle")
    for match in re.finditer(r"\b(?:interrupteur|toggle|switch)\s+([A-Z][A-Za-z0-9 /'\-]{1,60})", source_text):
        add(match.group(1), "toggle")

    # --- Pass 3: tables, e.g. "Tableau des résultats « Leave List »"
    for match in re.finditer(
        r"\b(?:tableau(?:\s+des\s+r.sultats)?|table)\s*[«\"']\s*([^»\"']+?)\s*[»\"']",
        source_text,
        re.IGNORECASE,
    ):
        add(match.group(1), "table")

    # --- Pass 4: quoted buttons / links / fields, e.g. bouton « Save »
    for match in re.finditer(r"\bbouton\s*[«\"']([^»\"']+)[»\"']", source_text, re.IGNORECASE):
        add(match.group(1), "button")
    for match in re.finditer(r"\blien\s*[«\"']([^»\"']+)[»\"']", source_text, re.IGNORECASE):
        add(match.group(1), "link")
    for match in re.finditer(r"\bchamp(?:\s+de\s+saisie)?\s*[«\"']([^»\"']+)[»\"']", source_text, re.IGNORECASE):
        kind = "password field" if "password" in _normalize_token(match.group(1)) else "field"
        add(match.group(1), kind)

    # --- Pass 5: unquoted button/link lists, e.g. "boutons Reset / Search"
    for match in re.finditer(r"\bboutons?\s+([^.,;\n]+)", source_text, re.IGNORECASE):
        for item in split_items(match.group(1)):
            add(item, "button")
    for match in re.finditer(r"(?<!le )\bliens?\s+([^.,;\n]+)", source_text, re.IGNORECASE):
        for item in split_items(match.group(1)):
            add(item, "link")

    # --- Pass 6: search-form / filter field lists
    for match in re.finditer(r"formulaire de recherche[^:]*:\s*([^\n]*)", source_text, re.IGNORECASE):
        for item in split_items(match.group(1)):
            add_form_item(item)
    for match in re.finditer(r"filtres?(?: de recherche)?\s*\(([^)]*)\)", source_text, re.IGNORECASE):
        for item in split_items(match.group(1)):
            add_form_item(item)
    for match in re.finditer(r"\bchamps?\s+([^.;\n]*)", source_text, re.IGNORECASE):
        for item in split_items(match.group(1)):
            add_form_item(item)

    # --- Pass 7: checkbox mentions
    for match in re.finditer(r"case\s+.?\s+cocher\s*[«\"']?\s*([^.;,»\"'\n]*)", source_text, re.IGNORECASE):
        if match.group(1).strip():
            add(match.group(1), "checkbox")

    # --- Pass 8: row-level "Actions" — named icon actions if described,
    # otherwise a bare "Actions" column when the table lists one.
    if re.search(r"\bactions\b", source_text, re.IGNORECASE):
        named_actions = [
            action for action in ("Supprimer", "Modifier", "Delete", "Edit")
            if re.search(rf"\b{action}\b", source_text, re.IGNORECASE)
        ]
        if named_actions:
            for action in named_actions:
                add(action, "button")
        elif re.search(r"colonnes?[^.\n]*\bActions\b", source_text, re.IGNORECASE):
            add("Actions", "column")

    # --- Pass 9: generic sentence-level fallback for anything not yet
    # captured by the targeted passes above (keeps extraction complete even
    # for subsections with unusual phrasing). Bullet markers are respected
    # when present; otherwise a physical line — which in prose-style SRS
    # text is often one long paragraph covering several components — is
    # split into sentence-sized clauses first, so a single control keyword
    # match doesn't cause the whole paragraph to be misread as one name.
    for raw_line in source_text.splitlines():
        bullet = re.match(r"^\s*(?:[-*•]|\d+[\.)])\s+(.+?)\s*$", raw_line)
        if bullet:
            segments = [bullet.group(1)]
        else:
            segments = [seg for seg in re.split(r"(?<=[.;])\s+", raw_line) if seg.strip()]

        for segment in segments:
            candidate_line = re.sub(r"\s+", " ", segment).strip()
            if not candidate_line:
                continue
            button_match = re.match(r"^(?:boutons?|buttons?)\s+(.+)$", candidate_line, re.IGNORECASE)
            if button_match:
                for item in split_items(button_match.group(1)):
                    add(item, "button")
                continue
            link_match = re.match(r"^(?:liens?|links?)\s+(.+)$", candidate_line, re.IGNORECASE)
            if link_match:
                for item in split_items(link_match.group(1)):
                    add(item, "link")
                continue
            if re.search(
                r"\b(field|button|dropdown|select|checkbox|link|champ|bouton|liste|lien|date|"
                r"onglet|tab|widget|table|tableau|interrupteur|toggle)\b",
                candidate_line,
                re.IGNORECASE,
            ):
                add(candidate_line, infer_kind(candidate_line))

    return _dedupe_controls(controls)[:MAX_UI_COMPONENTS]


def _reject_invented_ui(case: Dict[str, Any], ui_components: List[str]) -> None:
    if not ui_components:
        raise ValueError("No UI Components section found in the SRS for test case generation.")

    allowed_text = _normalize_token(" ".join(ui_components))
    text_parts = [
        " ".join(case.get("steps") or []),
        " ".join(str(detail.get("step") or "") for detail in case.get("stepDetails") or []),
        " ".join(str(key) for key in (case.get("test_data") or {}).keys()),
    ]
    generated_text = _normalize_token(" ".join(text_parts))

    # Reject "Status dropdown" explicitly
    if "status dropdown" in generated_text:
        logger.warning(
            "Validation rejected for test case '%s': used 'Status dropdown' instead of canonical 'Show Leave with Status'.",
            case.get("title", ""),
        )
        raise ValueError(
            "AI used 'Status dropdown' instead of the canonical component 'Show Leave with Status'."
        )

    forbidden = {
        "password": ("password",),
        "email": ("email", "e mail"),
        "registration": ("registration", "register", "account creation"),
        "dashboard": ("dashboard",),
        "country": ("country",),
    }
    invented = [
        label for label, variants in forbidden.items()
        if any(variant in generated_text for variant in variants)
        and not any(variant in allowed_text for variant in variants)
    ]
    if invented:
        raise ValueError(
            "AI invented UI components not present in SRS UI Components: "
            + ", ".join(sorted(invented))
        )

    # Canonical allowed components set
    canonical_allowed = {
        _normalize_token(c): c for c in ui_components
    }
    canonical_allowed.update({
        _normalize_token(_clean_component_name(c)): c for c in ui_components
    })
    for c in ui_components:
        for alias in _component_aliases(c):
            canonical_allowed[_normalize_token(alias)] = c

    # Validate structured stepDetails against canonical allowed components
    for detail in case.get("stepDetails") or []:
        if isinstance(detail, dict) and detail.get("component"):
            comp_name = str(detail.get("component")).strip()
            norm_comp = _normalize_token(comp_name)
            if norm_comp == "status dropdown":
                logger.warning(
                    "Validation rejected for test case '%s': used 'Status dropdown' instead of canonical 'Show Leave with Status'.",
                    case.get("title", ""),
                )
                raise ValueError("AI used 'Status dropdown' instead of canonical component 'Show Leave with Status'.")
            if norm_comp not in canonical_allowed:
                logger.warning(
                    "Validation rejected for test case '%s': offending invalid component '%s' (not in allowed canonical components: %s)",
                    case.get("title", ""),
                    comp_name,
                    ui_components,
                )
                raise ValueError(
                    f"AI generated an invalid UI component: '{comp_name}'. Allowed canonical components: {ui_components}"
                )

    # Validate test_data keys against canonical allowed components
    for key in (case.get("test_data") or {}).keys():
        norm_key = _normalize_token(str(key))
        if norm_key not in canonical_allowed:
            logger.warning(
                "Validation rejected for test case '%s': offending invalid component in test_data: '%s'",
                case.get("title", ""),
                key,
            )
            raise ValueError(
                f"AI generated invalid UI component in test_data: '{key}'. Allowed canonical components: {ui_components}"
            )

    allowed_components = [
        alias
        for item in ui_components
        for alias in _component_aliases(item)
        if len(alias) >= 2
    ]
    action_re = re.compile(
        r"\b(click|enter|type|input|select|choose|check|uncheck|upload|open|fill|submit|press|tap|"
        r"cliquer|saisir|selectionner|choisir|cocher|decocher|televerser|remplir|soumettre)\b",
        re.IGNORECASE,
    )
    generic_navigation_re = re.compile(
        r"\b(navigate|open|go to|access|display|page|screen|workflow|entry point|"
        r"naviguer|acceder|ouvrir|afficher|ecran|page)\b",
        re.IGNORECASE,
    )
    for step in case.get("steps") or []:
        step_text = str(step or "").strip()
        normalized_step = _normalize_token(step_text)
        if not action_re.search(step_text):
            continue
        if generic_navigation_re.search(step_text) and not any(
            action in normalized_step for action in ("click", "enter", "type", "input", "select", "choose", "check", "upload", "fill", "submit", "press", "tap", "cliquer", "saisir", "selectionner", "choisir", "cocher", "televerser", "remplir", "soumettre")
        ):
            continue
        if not any(component in normalized_step or normalized_step in component for component in allowed_components):
            raise ValueError(
                "AI generated a UI action without an SRS UI Component: "
                + step_text
            )


def _reject_cross_subsection_components(
    case: Dict[str, Any],
    ui_components: List[str],
    other_subsection_components: List[str],
) -> None:
    """Explicitly reject a case that mentions a component belonging to a
    different UI Components subsection than the one matched for this test
    plan (e.g. "User Role dropdown" from 4.3 Admin leaking into a 4.6 Change
    Password test case)."""
    allowed_aliases = {
        alias for item in ui_components for alias in _component_aliases(item)
    }
    text_parts = [
        str(case.get("title") or ""),
        str(case.get("objective") or ""),
        str(case.get("expected_result") or ""),
        " ".join(case.get("steps") or []),
        " ".join(str(detail.get("step") or "") for detail in case.get("stepDetails") or []),
        " ".join(str(key) for key in (case.get("test_data") or {}).keys()),
    ]
    generated_text = _normalize_token(" ".join(text_parts))
    for other_component in other_subsection_components:
        for alias in _component_aliases(other_component):
            if not alias or alias in allowed_aliases:
                continue
            if len(alias) >= 3 and alias in generated_text:
                raise ValueError(
                    "AI used a UI component from another UI Components subsection: "
                    f"'{other_component}' does not belong to the matched subsection."
                )


_VOCAB_STOP_WORDS = {
    "menu", "utilisateur", "page", "screen", "form", "formulaire", "champ",
    "champs", "bouton", "boutons", "liste", "listes", "tableau", "table",
    "onglet", "onglets", "colonne", "colonnes", "field", "fields", "button",
    "buttons", "dropdown", "actions", "action", "modifier", "supprimer",
}


def _build_foreign_vocabulary_blacklist(
    other_subsection_titles: List[str],
    matched_subsection_title: str,
    ui_components: List[str],
) -> set[str]:
    """Words that name/describe a DIFFERENT subsection ("Admin", "User
    Management") and are not also part of the matched subsection's own
    title or allowed components. Generated cases mentioning one of these
    are almost always describing the wrong feature — this is what catches
    "Search system users with filters" from leaking into a Leave List
    response even when it isn't a literal component-name match."""
    own_words = _tokens(_strip_heading_number(matched_subsection_title))
    for component in ui_components:
        own_words |= _tokens(_clean_component_name(component))

    blacklist: set[str] = set()
    for title in other_subsection_titles:
        for word in _tokens(_strip_heading_number(title)):
            if len(word) < 4 or word in _VOCAB_STOP_WORDS or word in own_words:
                continue
            blacklist.add(word)
    return blacklist


def _reject_foreign_feature_terms(case: Dict[str, Any], blacklist: set[str]) -> None:
    if not blacklist:
        return
    text_parts = [
        str(case.get("title") or ""),
        str(case.get("objective") or ""),
        str(case.get("expected_result") or ""),
        " ".join(case.get("steps") or []),
    ]
    generated_text = _normalize_token(" ".join(text_parts))
    for word in blacklist:
        if word in generated_text:
            raise ValueError(
                "AI referenced terminology belonging to another subsection/feature: "
                f"'{word}'."
            )


def _looks_like_search_or_filter_plan(plan_title: str, plan_description: str) -> bool:
    tokens = _normalize_token(f"{plan_title} {plan_description}")
    return any(k in tokens for k in ("search", "filter", "recherche", "filtre"))


def _is_isolated_entry_field_case(case: Dict[str, Any], ui_components: List[str]) -> bool:
    """True when the case exercises exactly one input-like component and
    nothing else (e.g. "Verify From Date field"). When the test plan is
    about a search/filter feature, a case like this tests the wrong thing —
    the plan needs a combined scenario (filters + Search), not isolated
    single-field checks, unless the plan itself is specifically about that
    one field."""
    steps = case.get("steps") or []
    if len(steps) != 1:
        return False
    step_text = _normalize_token(steps[0])
    for component in ui_components:
        if _component_type(component) in ("button", "link", "table", "column", "tab"):
            continue
        aliases = _component_aliases(component)
        if any(alias and alias in step_text for alias in aliases):
            return True
    return False


def _replace_placeholder_ui(case: Dict[str, Any], ui_components: List[str]) -> Dict[str, Any]:
    if not ui_components:
        return case

    field_component = next(
        (
            component for component in ui_components
            if any(term in _normalize_token(component) for term in ("field", "input", "champ"))
        ),
        ui_components[0],
    )
    submit_component = next(
        (
            component for component in ui_components
            if any(term in _normalize_token(component) for term in ("button", "submit", "bouton"))
        ),
        ui_components[-1],
    )

    replacements = {
        "SRS UI Field Name": field_component,
        "SRS Submit Button Name": submit_component,
        "SRS-described workflow entry point": ui_components[0],
    }

    def replace_text(value: Any) -> Any:
        if not isinstance(value, str):
            return value
        for old, new in replacements.items():
            value = value.replace(old, new)
        return value

    case["preconditions"] = [replace_text(item) for item in case.get("preconditions") or []]
    case["steps"] = [replace_text(item) for item in case.get("steps") or []]
    case["expected_result"] = replace_text(case.get("expected_result"))
    case["stepDetails"] = [
        {
            **detail,
            "step": replace_text(detail.get("step")),
            "expected_result": replace_text(detail.get("expected_result")),
        }
        for detail in case.get("stepDetails") or []
        if isinstance(detail, dict)
    ]

    test_data = case.get("test_data") or {}
    if isinstance(test_data, dict):
        case["test_data"] = {replace_text(key): replace_text(value) for key, value in test_data.items()}

    return case


_COMPONENT_CONTEXT_WINDOW = 160
_COMPONENT_EXAMPLE_WINDOW = 140


def _find_component_mention(component: str, line: str) -> int:
    """Index of this component's own name inside `line`, or -1. Real SRS
    text is sometimes one long paragraph-style bullet covering several
    fields at once, so callers must bound what they read to a window
    starting HERE — reading the rest of that line risks pulling in content
    that describes a different, neighboring field."""
    clean = _clean_component_name(component)
    if not clean:
        return -1
    return line.lower().find(clean.lower())


def _find_component_context_sentence(component: str, subsection_text: str) -> str:
    """Pull the SRS text that actually describes this component, bounded to
    a short window starting at the component's own mention — not the whole
    physical line — so a deterministically-built expected result reflects
    real SRS content without misattributing a neighboring field's
    description (e.g. picking up the Search button's behavior for the
    Reset button just because both appear in the same "boutons Reset /
    Search" sentence)."""
    for raw_line in (subsection_text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        idx = _find_component_mention(component, line)
        if idx < 0:
            continue
        snippet = line[idx: idx + _COMPONENT_CONTEXT_WINDOW]
        if len(snippet) >= _COMPONENT_CONTEXT_WINDOW:
            snippet = snippet.rsplit(" ", 1)[0]
        snippet = re.sub(r"\s+", " ", snippet).strip(" -,;")
        if len(snippet) >= 15:
            return snippet
    return ""


def _srs_example_value(component: str, subsection_text: str) -> str:
    """Pull an explicit example value the SRS documents for this component
    (e.g. "Leave Type (liste déroulante, ex. « CAN - FMLA »)" or "Show Leave
    with Status ... ex. « Pending Approval »"), so test data is grounded in
    the SRS instead of an invented placeholder like "Active".

    Bounded to a short window right after the component's own mention, so
    an example documented for a DIFFERENT field earlier or later in the
    same long sentence is never misattributed to this one."""
    for raw_line in (subsection_text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        idx = _find_component_mention(component, line)
        if idx < 0:
            continue
        window = line[idx: idx + _COMPONENT_EXAMPLE_WINDOW]
        match = re.search(r'ex\.?\s*[«"]([^»"]+)[»"]', window, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


def _neutral_value_for(component: str, subsection_text: str = "") -> str:
    """Test data value for a component: an SRS-documented example when one
    exists, otherwise a neutral, type-appropriate placeholder — never an
    invented specific value like "Active" that the SRS never mentioned."""
    example = _srs_example_value(component, subsection_text)
    if example:
        return example
    comp_type = _component_type(component)
    name = _clean_component_name(component)
    if comp_type == "date field":
        return "a valid date"
    if comp_type == "dropdown":
        return f"a valid {name}"
    if comp_type in ("input field", "password field"):
        return f"a valid {name}"
    return ""


def _action_for_component(component: str, subsection_title: str = "", subsection_text: str = "") -> tuple[str, str, Dict[str, str]]:
    comp_type = _component_type(component)
    clean_name = _clean_component_name(component)
    context = f" on {subsection_title}" if subsection_title else ""
    value = _neutral_value_for(component, subsection_text)
    if comp_type in ("input field", "password field"):
        return (
            f"Enter {value} in {clean_name}{context}",
            f"{clean_name} accepts and retains the entered value{context}",
            {clean_name: value},
        )
    if comp_type == "date field":
        return (
            f"Select {value} in {clean_name}{context}",
            f"{clean_name} displays the selected date{context}",
            {clean_name: value},
        )
    if comp_type == "dropdown":
        return (
            f"Select {value} in {clean_name}{context}",
            f"{clean_name} displays the selected option{context}",
            {clean_name: value},
        )
    if comp_type == "toggle":
        return (
            f"Enable {clean_name}{context}",
            f"{clean_name} switches to the enabled state{context}",
            {},
        )
    if comp_type == "checkbox":
        return (
            f"Select {clean_name}{context}",
            f"{clean_name} becomes checked{context}",
            {},
        )
    if comp_type in ("table", "column"):
        return (
            f"Verify {clean_name} is displayed with the expected data{context}",
            f"{clean_name} shows the expected data{context}",
            {},
        )
    if comp_type == "tab":
        return (
            f"Click {clean_name}{context}",
            f"{clean_name} becomes the active tab{context}",
            {},
        )
    return (
        f"Click {clean_name}{context}",
        f"{clean_name} is triggered and {subsection_title or 'the screen'} responds accordingly",
        {},
    )


def _case_respects_component_types(case: Dict[str, Any], ui_components: List[str]) -> bool:
    # First check structured stepDetails if present
    step_details = case.get("stepDetails") or []
    has_structured = any(isinstance(d, dict) and d.get("component") for d in step_details)
    if has_structured:
        for detail in step_details:
            if not isinstance(detail, dict):
                continue
            comp = detail.get("component")
            action = str(detail.get("action") or "").lower().strip()
            if not comp or not action:
                continue
            comp_type = _component_type(comp)
            if comp_type in ("input field", "password field", "date field") and action in ("enter", "type", "input", "fill", "select", "choose"):
                return True
            if comp_type == "dropdown" and action in ("select", "choose"):
                return True
            if comp_type in ("checkbox", "toggle") and action in ("select", "unselect", "check", "uncheck", "toggle", "enable", "disable"):
                return True
            if comp_type in ("button", "link", "tab") and action in ("click", "press", "tap"):
                return True
            if comp_type in ("table", "column") and action in ("verify", "view", "display", "check"):
                return True

    steps_text = "\n".join(str(step or "") for step in case.get("steps") or [])
    normalized_steps = _normalize_token(steps_text)
    if not normalized_steps:
        return False
    for component in ui_components:
        aliases = _component_aliases(component)
        if not any(alias and alias in normalized_steps for alias in aliases):
            continue
        comp_type = _component_type(component)
        if comp_type in ("input field", "password field", "date field"):
            return bool(re.search(r"\b(enter|type|input|fill|select|choose|saisir|remplir|selectionner|choisir)\b", steps_text, re.IGNORECASE))
        if comp_type == "dropdown":
            return bool(re.search(r"\b(select|choose|selectionner|choisir)\b", steps_text, re.IGNORECASE))
        if comp_type in ("checkbox", "toggle"):
            return bool(re.search(r"\b(select|unselect|check|uncheck|enable|disable|toggle|cocher|decocher|activer|desactiver)\b", steps_text, re.IGNORECASE))
        if comp_type in ("button", "link", "tab"):
            return bool(re.search(r"\b(click|press|tap|cliquer)\b", steps_text, re.IGNORECASE))
        if comp_type in ("table", "column"):
            return bool(re.search(r"\b(verify|view|display|check|afficher|verifier)\b", steps_text, re.IGNORECASE))
    return False


def _is_generic_generated_case(case: Dict[str, Any]) -> bool:
    generic_markers = (
        "use an exact allowed ui component",
        "verify one behavior supported by the matched ui subsection",
        "the expected ui behavior occurs",
        "the field accepts the value",
        "required page is displayed",
        "the screen behaves as expected",
        "the button action is triggered",
        "behaves correctly",
        "behaves as expected",
    )
    content = _normalize_token(" ".join([
        str(case.get("title") or ""),
        str(case.get("objective") or ""),
        str(case.get("expected_result") or ""),
        " ".join(str(step or "") for step in case.get("steps") or []),
    ]))
    return any(_normalize_token(marker) in content for marker in generic_markers)


def _validate_independent_case(case: Dict[str, Any]) -> bool:
    """A generated case must be executable from its own initial state."""
    if not _string_list(case.get("preconditions")):
        return False
    if not isinstance(case.get("test_data"), dict):
        return False
    if _string_list(case.get("dependsOn", case.get("depends_on"))):
        return False
    steps = [str(step or "").strip() for step in case.get("steps") or [] if str(step or "").strip()]
    details = case.get("stepDetails") or []
    return bool(steps) and len(details) == len(steps) and all(
        str(detail.get("expected_result") or "").strip()
        for detail in details
        if isinstance(detail, dict)
    )


def _build_component_case(
    component: str,
    prefix: str,
    index: int,
    subsection_title: str = "",
    subsection_text: str = "",
) -> Dict[str, Any]:
    step, default_expected, test_data = _action_for_component(component, subsection_title, subsection_text)
    clean_name = _clean_component_name(component)
    # Ground the expected result in the SRS text describing this component
    # when available, instead of a generic template — this is what keeps a
    # deterministically-built case from reading as "the field accepts the
    # value" with no real information behind it.
    context_sentence = _find_component_context_sentence(component, subsection_text)
    expected = context_sentence if context_sentence and len(context_sentence) <= 220 else default_expected
    preconditions = [f"The {subsection_title} screen is displayed"] if subsection_title else ["Required page is displayed"]
    return {
        "id": f"{prefix}.{index}",
        "title": step,
        "objective": f"Verify {clean_name} on {subsection_title}" if subsection_title else f"Verify {clean_name}",
        "preconditions": preconditions,
        "test_data": test_data,
        "steps": [step],
        "stepDetails": [{"step": step, "expected_result": expected}],
        "expected_result": expected,
        "priority": "High",
        "severity": "Major",
        "type": "Validation",
        "requirements": [],
        "dependsOn": [],
    }


def _clean_component_name(component: str) -> str:
    """The plain display name for a component, e.g. "Search button" ->
    "Search", "Leave Type dropdown" -> "Leave Type", "From Date date
    field" -> "From Date".

    Our canonical internal component strings append the inferred type as a
    bare trailing word ("Name kind"), not as a "(kind)" annotation — only
    `_format_typed_component`'s display form uses parentheses. Without
    stripping the bare suffix too, prose built from this helper read as
    "Search button Leave List using date range" instead of "Search Leave
    List using date range".
    """
    name = re.sub(r"\s*\([^)]*\)\s*$", "", component or "").strip()
    name = re.sub(
        r"\s+(?:password field|date field|input field|field|button|dropdown|"
        r"checkbox|link|toggle|table|tab|column)\s*$",
        "",
        name,
        flags=re.IGNORECASE,
    ).strip()
    return name


def _find_component(ui_components: List[str], *terms: str) -> str:
    for component in ui_components:
        normalized = _normalize_token(component)
        if all(term in normalized for term in terms):
            return component
    return ""


def _step_for(component: str, value: str = "valid value") -> tuple[str, str, Dict[str, str]]:
    name = _clean_component_name(component)
    comp_type = _component_type(component)
    norm = _normalize_token(component)
    if "search" in norm:
        return f"Click {name}", "Leave List displays records matching the selected search criteria", {}
    if "reset" in norm:
        return f"Click {name}", "Search filters are cleared and restored to their default values", {}
    if comp_type in ("input field", "password field"):
        return f"Enter {value} in {name}", f"The {name} field accepts and retains the entered value", {name: value}
    if comp_type == "date field":
        return f"Select {value} in {name}", f"The {name} field displays the selected date", {name: value}
    if comp_type == "dropdown":
        return f"Select {value} in {name}", f"The {name} dropdown displays the selected option", {name: value}
    if comp_type in ("checkbox", "toggle"):
        return f"Select {name}", f"The {name} checkbox is selected", {name: "checked" if not value else value}
    if comp_type in ("table", "column"):
        return f"Verify {name} displays the expected data", f"The {name} shows the expected data", {}
    # Fallback: generic click step — do NOT use a generic expected_result string.
    # A placeholder like "The X action is triggered" will cause a false
    # failed_assertion in the Selenium executor because it can never match the
    # actual page state.  An empty string means "no assertion required".
    return f"Click {name}", "", {}



def _make_workflow_case(
    *,
    prefix: str,
    index: int,
    title: str,
    objective: str,
    components: List[tuple[str, str]],
    expected_result: str,
) -> Dict[str, Any]:
    steps: List[str] = []
    step_details: List[Dict[str, Any]] = []
    test_data: Dict[str, str] = {}
    for component, value in components:
        if not component:
            continue
        step, expected, data = _step_for(component, value)
        steps.append(step)
        comp_type = _component_type(component)
        action_verb = "click"
        if comp_type in ("input field", "password field"):
            action_verb = "enter"
        elif comp_type in ("date field", "dropdown"):
            action_verb = "select"
        elif comp_type in ("checkbox", "toggle"):
            action_verb = "select"
        elif comp_type in ("table", "column"):
            action_verb = "verify"

        step_details.append({
            "component": component,
            "action": action_verb,
            "value": value,
            "step": step,
            "expected_result": expected,
        })
        test_data.update(data)
    return {
        "id": f"{prefix}.{index}",
        "title": title,
        "objective": objective,
        "preconditions": ["Required page is displayed with search filters in their initial/default state"],
        "test_data": test_data,
        "steps": steps,
        "stepDetails": step_details,
        "expected_result": expected_result,
        "priority": "High",
        "severity": "Major",
        "type": "functional",
        "requirements": [],
        "dependsOn": [],
    }


def _build_workflow_cases(ui_components: List[str], prefix: str, plan_title: str) -> List[Dict[str, Any]]:
    username = _find_component(ui_components, "username")
    password = _find_component(ui_components, "password")
    confirm_password = _find_component(ui_components, "confirm", "password")
    employee_name = _find_component(ui_components, "employee", "name")
    user_role = _find_component(ui_components, "user", "role")
    status = _find_component(ui_components, "status")
    search = _find_component(ui_components, "search")
    reset = _find_component(ui_components, "reset")
    add = _find_component(ui_components, "add")
    save = _find_component(ui_components, "save")
    cancel = _find_component(ui_components, "cancel")
    edit = _find_component(ui_components, "modifier") or _find_component(ui_components, "edit")
    delete = _find_component(ui_components, "supprimer") or _find_component(ui_components, "delete")
    change_password = _find_component(ui_components, "change", "password")
    login = _find_component(ui_components, "login")
    forgot_password = _find_component(ui_components, "forgot", "password")

    cases: List[Dict[str, Any]] = []
    if username and password and login:
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Login with valid credentials",
            objective="Verify that a user can sign in from the Login page.",
            components=[(username, "Admin"), (password, "admin123"), (login, "")],
            expected_result="The user is authenticated and redirected to the application.",
        ))
    if forgot_password:
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Open forgot password flow",
            objective="Verify that the forgot password link opens the recovery flow.",
            components=[(forgot_password, "")],
            expected_result="The password recovery page or flow is displayed.",
        ))

    if search and any([username, user_role, employee_name, status]):
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Search system users with filters",
            objective="Verify that System Users search filters can be applied.",
            components=[(username, "testuser1"), (user_role, "Admin"), (employee_name, "manda user"), (status, "Active"), (search, "")],
            expected_result="The System Users table displays results matching the selected filters.",
        ))
    if reset and any([username, user_role, employee_name, status]):
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Reset system user search filters",
            objective="Verify that search filters can be cleared.",
            components=[(username, "testuser1"), (user_role, "Admin"), (status, "Active"), (reset, "")],
            expected_result="The filter fields are cleared or returned to their default values.",
        ))
    if add and save and any([username, user_role, employee_name, status]):
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Add a new system user",
            objective="Verify that a new system user can be created from the Add User page.",
            components=[(add, ""), (user_role, "Admin"), (employee_name, "manda user"), (status, "Enabled"), (username, "testuser1"), (password, "Password123!"), (confirm_password, "Password123!"), (save, "")],
            expected_result="The user is saved and a success confirmation is displayed.",
        ))
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Reject Add User submission with required fields empty",
            objective="Verify that the Add User page blocks submission and displays required-field validation when mandatory fields are empty.",
            components=[(add, ""), (save, "")],
            expected_result="The user is not created and required-field messages are displayed for the mandatory Add User fields.",
        ))
    if save and password and confirm_password:
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Reject Add User submission when passwords do not match",
            objective="Verify that Add User validates the password and confirmation fields before saving.",
            components=([(add, "")] if add else []) + [(password, "short"), (confirm_password, "different"), (save, "")],
            expected_result="The user is not created and a password validation message explains that the passwords do not match or do not meet the requirements.",
        ))
    if edit and save:
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Edit an existing system user",
            objective="Verify that an existing system user can be modified.",
            components=[(edit, ""), (user_role, "Admin"), (employee_name, "manda user"), (status, "Disabled"), (username, "testuser1"), (save, "")],
            expected_result="The user changes are saved and a success confirmation is displayed.",
        ))
    if change_password and password and confirm_password and save:
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Change password while editing a user",
            objective="Verify that password fields are displayed and saved when Change Password is selected.",
            components=[(change_password, ""), (password, "Password123!"), (confirm_password, "Password123!"), (save, "")],
            expected_result="The password is updated and a success confirmation is displayed.",
        ))
    if delete:
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title="Delete a system user",
            objective="Verify that a system user can be deleted from the results table.",
            components=[(delete, "")],
            expected_result="The user is removed and a success confirmation is displayed.",
        ))
    if cancel:
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title=f"Cancel {plan_title} changes",
            objective="Verify that Cancel exits without saving changes.",
            components=[(cancel, "")],
            expected_result="The current changes are not saved.",
        ))

    return [case for case in cases if case.get("steps")][:DEFAULT_TEST_CASES_MAX]


def _feature_noun(subsection_title: str) -> str:
    """The plain feature name behind a subsection heading, e.g. "4.5 Leave
    › Leave List" -> "Leave List". Used so fallback case titles read as
    "Search Leave List using ..." instead of quoting the raw "4.5 ..."
    heading."""
    title = _strip_heading_number(subsection_title or "")
    parts = re.split(r"[›»/|:]", title)
    last = parts[-1].strip() if parts else ""
    return last or title or "the matched screen"


def _cluster_label(component: str) -> str:
    """Group a filter/entry component into a human-readable scenario label
    so several related fields become ONE combined test case (e.g. "From
    Date" + "To Date" -> "date range") instead of one isolated case per
    field."""
    t = _normalize_token(component)
    if "date" in t:
        return "date range"
    if any(k in t for k in ("status", "statut")):
        return "status filter"
    if "type" in t:
        return "type filter"
    if any(k in t for k in ("employee", "supervisor", "name")):
        return "employee filter"
    if any(k in t for k in ("unit", "department", "role")):
        return "organizational filter"
    return f"{_clean_component_name(component)} filter"


def _srs_full_form_value(component: str, subsection_text: str) -> str:
    """Return a value only when the SRS documents an example or default."""
    example = _srs_example_value(component, subsection_text)
    if example:
        return example
    name = _normalize_token(_clean_component_name(component))
    context = _normalize_token(_find_component_context_sentence(component, subsection_text))
    if name.startswith("include") and "current employees only" in context:
        return "Current Employees Only"
    return ""


def _deterministic_fallback_cases(
    ui_components: List[str],
    prefix: str,
    plan_title: str,
    subsection_title: str,
    subsection_text: str,
) -> List[Dict[str, Any]]:
    """Build valid test cases directly from the extracted UI components,
    with no AI involved at all — but grouped around the FEATURE the
    subsection implements, not one isolated case per component.

    Used when AI generation and the AI repair/retry attempt both fail or
    return too few valid cases. Every case here is built strictly from
    `ui_components` — nothing is invented. Related filter/entry fields are
    clustered into one combined scenario each (e.g. "From Date" + "To
    Date" -> a single "search using date range" case), matched with the
    subsection's own primary action (Search/Save/Submit/...), instead of
    generating "Verify From Date field", "Verify To Date field" as
    separate, low-value cases.
    """
    if not ui_components:
        return []

    feature = _feature_noun(subsection_title) or plan_title or "the matched screen"

    entry_kinds = {"input field", "password field", "date field", "dropdown"}
    toggle_kinds = {"toggle", "checkbox"}
    action_kinds = {"button", "link"}
    display_kinds = {"table", "column", "tab"}

    entries = [c for c in ui_components if _component_type(c) in entry_kinds]
    toggles = [c for c in ui_components if _component_type(c) in toggle_kinds]
    actions = [c for c in ui_components if _component_type(c) in action_kinds]
    displays = [c for c in ui_components if _component_type(c) in display_kinds]

    primary_action = next(
        (
            a for a in actions
            if any(
                t in _normalize_token(a)
                for t in ("search", "save", "submit", "add", "login", "confirm", "recherche", "enregistrer", "valider")
            )
        ),
        actions[0] if actions else "",
    )
    reset_action = next((a for a in actions if any(t in _normalize_token(a) for t in ("reset", "clear", "reinitialiser"))), "")
    secondary_actions = [a for a in actions if a not in (primary_action, reset_action)]

    cases: List[Dict[str, Any]] = []
    action_name = _clean_component_name(primary_action) if primary_action else ""

    if entries and primary_action:
        # Group related entries into ONE scenario per cluster (date range,
        # status filter, employee filter, ...) instead of one case per
        # field — this is what makes "Search leave list using date range"
        # possible instead of "Verify From Date field" + "Verify To Date
        # field" as two disconnected, low-value cases.
        clusters: Dict[str, List[str]] = {}
        cluster_order: List[str] = []
        for entry in entries:
            label = _cluster_label(entry)
            if label not in clusters:
                clusters[label] = []
                cluster_order.append(label)
            clusters[label].append(entry)

        for label in cluster_order:
            if len(cases) >= DEFAULT_TEST_CASES_MAX:
                break
            group = clusters[label]
            components = [(c, _neutral_value_for(c, subsection_text)) for c in group] + [(primary_action, "")]
            cases.append(_make_workflow_case(
                prefix=prefix,
                index=len(cases) + 1,
                title=f"{action_name} {feature} using {label}",
                objective=f"Verify that {feature} can be searched using {label} via {action_name}.",
                components=components,
                expected_result=(
                    _find_component_context_sentence(primary_action, subsection_text)
                    or f"{feature} displays results matching the selected {label}."
                ),
            ))
    elif entries:
        # No dedicated action control was extracted (rare): still verify
        # the fields accept the documented input, but as one combined case
        # rather than one per field.
        components = [(c, _neutral_value_for(c, subsection_text)) for c in entries[:5]]
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title=f"Enter valid data in {feature} fields",
            objective=f"Verify that the fields on {feature} accept valid input.",
            components=components,
            expected_result=f"Every field on {feature} accepts and retains the entered value.",
        ))

    if reset_action and len(cases) < DEFAULT_TEST_CASES_MAX:
        cases.append(_make_workflow_case(
            prefix=prefix,
            index=len(cases) + 1,
            title=f"Reset {feature} search filters",
            objective=f"Verify that {_clean_component_name(reset_action)} clears the {feature} search filters.",
            components=[(reset_action, "")],
            expected_result=(
                _find_component_context_sentence(reset_action, subsection_text)
                or f"The {feature} search filters are cleared or returned to their default values."
            ),
        ))

    for toggle in toggles[:2]:
        if len(cases) >= DEFAULT_TEST_CASES_MAX:
            break
        cases.append(_build_component_case(toggle, prefix, len(cases) + 1, subsection_title, subsection_text))

    remaining_actions = ([primary_action] if not entries and primary_action else []) + secondary_actions
    for action in remaining_actions:
        if len(cases) >= DEFAULT_TEST_CASES_MAX or not action:
            continue
        cases.append(_build_component_case(action, prefix, len(cases) + 1, subsection_title, subsection_text))

    for display in displays:
        if len(cases) >= DEFAULT_TEST_CASES_MAX:
            break
        cases.append(_build_component_case(display, prefix, len(cases) + 1, subsection_title, subsection_text))

    if len(cases) < DEFAULT_TEST_CASES_MIN:
        used: set[str] = set()
        for case in cases:
            case_text = _normalize_token(" ".join(case.get("steps") or []))
            for component in ui_components:
                if any(alias in case_text for alias in _component_aliases(component)):
                    used.add(_normalize_token(component))
        for component in ui_components:
            if len(cases) >= DEFAULT_TEST_CASES_MIN:
                break
            if _normalize_token(component) in used:
                continue
            cases.append(_build_component_case(component, prefix, len(cases) + 1, subsection_title, subsection_text))
            used.add(_normalize_token(component))

    return cases[:DEFAULT_TEST_CASES_MAX]


def _filter_value_for(component: str, subsection_text: str = "") -> str:
    name = _clean_component_name(component)
    t = _normalize_token(name)
    if "date" in t:
        return "2026-01-01" if "from" in t else "2026-12-31"
    if "status" in t:
        return "Pending Approval"
    if "type" in t:
        return "CAN - FMLA"
    if any(k in t for k in ("employee", "name")):
        return "manda user"
    if "unit" in t:
        return "Engineering"
    if "past" in t:
        return "Current Employees Only"
    srs_val = _srs_full_form_value(component, subsection_text)
    if srs_val:
        return srs_val
    return _neutral_value_for(component, subsection_text) or "valid value"


def _deterministic_search_feature_cases(
    ui_components: List[str],
    prefix: str,
    plan_title: str,
    subsection_title: str,
    subsection_text: str,
) -> List[Dict[str, Any]]:
    """Build independent, feature-level scenarios for a search/filter UI.

    Returns 3-5 self-contained test cases that exercise the Leave List Search
    feature as a whole using the complete extracted UI component list.
    """
    feature = _feature_noun(subsection_title) or plan_title or "Leave List"

    # Identify search action and reset action
    actions = [c for c in ui_components if _component_type(c) in {"button", "link"}]
    search_action = next((c for c in actions if "search" in _normalize_token(c) or "recherche" in _normalize_token(c)), "")
    if not search_action:
        search_action = next((c for c in ui_components if "search" in _normalize_token(c) or "recherche" in _normalize_token(c)), "Search")

    reset_action = next((c for c in ui_components if any(k in _normalize_token(c) for k in ("reset", "clear", "reinitialiser"))), "")

    # Result-only components (tables, columns, balances, actions) are NOT search filters
    result_components = [
        c for c in ui_components
        if _component_type(c) in ("table", "column")
        or any(k in _normalize_token(c) for k in ("table", "tableau", "balance", "action", "colonne"))
    ]

    # Filter components: all controls except search/reset actions and result-only components
    filter_components = [
        c for c in ui_components
        if c != search_action and c != reset_action and c not in result_components
    ]

    def case(
        title: str,
        objective: str,
        components: List[tuple[str, str]],
        expected: str,
        category: str,
    ) -> Dict[str, Any]:
        result = _make_workflow_case(
            prefix=prefix,
            index=0,
            title=title,
            objective=objective,
            components=components,
            expected_result=expected,
        )
        result["preconditions"] = [f"{feature} screen is displayed with search filters in their initial/default state"]
        result["type"] = category
        result["dependsOn"] = []
        return result

    cases: List[Dict[str, Any]] = []

    # Scenario A: POSITIVE SEARCH (Fill valid search criteria and click Search)
    pos_filters = [f for f in filter_components if any(k in _normalize_token(f) for k in ("date", "status", "type", "employee"))][:3]
    if not pos_filters:
        pos_filters = filter_components[:3]
    if pos_filters:
        pos_components = [(f, _filter_value_for(f, subsection_text)) for f in pos_filters] + [(search_action, "")]
        cases.append(
            case(
                f"Positive search on {feature}",
                f"Verify that {feature} returns the expected results when valid search criteria are applied.",
                pos_components,
                f"{feature} displays records matching the selected search criteria.",
                "positive",
            )
        )

    # Scenario B: EMPTY SEARCH (Submit with empty/default filters)
    cases.append(
        case(
            f"Empty search on {feature}",
            f"Verify the documented default behaviour of {feature} when searching without modifying any filters.",
            [(search_action, "")],
            f"{feature} displays the default records documented in the SRS when submitted with empty criteria.",
            "functional",
        )
    )

    # Scenario C: RESET FILTERS (Enter filter values, click Reset, verify cleared)
    if reset_action and filter_components:
        reset_filters = filter_components[:2]
        reset_components = [(f, _filter_value_for(f, subsection_text)) for f in reset_filters] + [(reset_action, "")]
        cases.append(
            case(
                f"Reset filters on {feature}",
                f"Verify that clicking Reset clears or restores the search filters on {feature} to their default state.",
                reset_components,
                f"The {feature} search filters are cleared and restored to their default values.",
                "functional",
            )
        )

    # Scenario D: FULL FORM / ALL FILTERS SEARCH (Fill ALL relevant search filters, then click Search)
    if filter_components:
        full_form_components = [
            (f, _filter_value_for(f, subsection_text)) for f in filter_components
        ] + [(search_action, "")]
        cases.append(
            case(
                f"Full-form search with all filters on {feature}",
                f"Verify that {feature} returns the correct functional result when all documented search filters are populated.",
                full_form_components,
                f"{feature} displays records corresponding to all selected search criteria according to the SRS.",
                "functional",
            )
        )

    # Scenario E: NEGATIVE SEARCH (Only if SRS explicitly mentions negative cues)
    lower_srs = _normalize_token(subsection_text)
    negative_cues = ("no records found", "aucun enregistrement", "invalid date", "invalid", "rejected")
    if any(term in lower_srs for term in negative_cues) and filter_components:
        invalid_entry = filter_components[0]
        cases.append(
            case(
                f"Negative search on {feature}",
                f"Verify that {feature} handles search criteria that cannot produce a valid match according to the SRS.",
                [(invalid_entry, "a value that does not match any record"), (search_action, "")],
                "The documented no-records-found behaviour is displayed according to the SRS; no unsupported error message is assumed.",
                "negative",
            )
        )

    # Log fallback scenario information
    logger.info("Using independent feature-level search scenarios: %s", len(cases))
    for idx, c in enumerate(cases, start=1):
        cat = "FUNCTIONAL"
        t_low = c.get("title", "").lower()
        if "full-form" in t_low:
            cat = "FULL_FORM"
        elif "reset" in t_low:
            cat = "RESET"
        elif "empty" in t_low:
            cat = "EMPTY"
        elif "positive" in t_low:
            cat = "POSITIVE"
        elif "negative" in t_low:
            cat = "NEGATIVE"
        used_comps = [d.get("component") for d in c.get("stepDetails") or [] if d.get("component")]
        logger.info("Scenario %s: %s", idx, cat)
        logger.info("Components: %s", ", ".join(used_comps))

    return cases[:DEFAULT_TEST_CASES_MAX]


def _fill_missing_test_cases(
    cases: List[Dict[str, Any]],
    target_count: int,
) -> List[Dict[str, Any]]:
    """Complete a short AI response with distinct, executable QA variants."""
    if len(cases) >= target_count or not cases:
        return cases[:target_count]

    scenarios = (
        ("Negative", "Verify the workflow rejects invalid input safely."),
        ("Validation", "Verify required fields and validation feedback."),
        ("Boundary", "Verify boundary values are handled correctly."),
        ("Recovery", "Verify the workflow can recover after a failed attempt."),
    )
    existing_titles = {str(case.get("title") or "").strip().lower() for case in cases}
    source_index = 0
    scenario_index = 0

    while len(cases) < target_count:
        source = cases[source_index % len(cases)]
        scenario_name, expected_result = scenarios[scenario_index % len(scenarios)]
        base_title = str(source.get("title") or "Test Case").strip()
        title = f"{base_title} - {scenario_name}"
        suffix = 2
        unique_title = title
        while unique_title.lower() in existing_titles:
            unique_title = f"{title} {suffix}"
            suffix += 1

        variant = dict(source)
        variant["id"] = f"{source.get('id') or 'TC'}-{len(cases) + 1}"
        variant["title"] = unique_title
        variant["objective"] = expected_result
        variant["expected_result"] = expected_result
        variant["type"] = scenario_name
        variant["stepDetails"] = [dict(detail) for detail in source.get("stepDetails") or []]
        cases.append(variant)
        existing_titles.add(unique_title.lower())
        source_index += 1
        scenario_index += 1

    logger.warning(
        "Completed short test case response with deterministic QA scenarios: %s/%s",
        len(cases),
        target_count,
    )
    return cases[:target_count]


def _extract_cases_payload(data: Any) -> List[Dict[str, Any]] | None:
    """
    Accept common JSON shapes produced by LLMs and remain backward compatible.
    """
    if isinstance(data, list):
        return data

    if not isinstance(data, dict):
        return None

    for key in ("test_cases", "testCases", "cases", "data"):
        value = data.get(key)
        if isinstance(value, list):
            return value

    return None


def _normalize_test_data(
    raw_test_data: Any,
    steps: List[str],
    step_details: List[Dict[str, Any]],
) -> Dict[str, str]:
    result: Dict[str, str] = {}

    if isinstance(raw_test_data, dict):
        for k, v in raw_test_data.items():
            key = str(k or "").strip()
            val = str(v if v is not None else "").strip()
            if key and val:
                result[key] = val
    elif isinstance(raw_test_data, list):
        # Legacy array format: associate with fields from step_details or steps
        field_names = []
        for d in step_details:
            comp = d.get("component")
            action = str(d.get("action") or "").lower()
            if comp and action in ("enter", "select", "type", "fill") and comp not in field_names:
                field_names.append(comp)
        if not field_names:
            for s in steps:
                m = re.search(r"\b(?:in|into|for)\s+([A-Za-z0-9 _\-]+)", s, re.IGNORECASE)
                if m:
                    f = m.group(1).strip()
                    if f and f not in field_names:
                        field_names.append(f)
        for idx, item in enumerate(raw_test_data):
            val = str(item if item is not None else "").strip()
            if not val:
                continue
            field = field_names[idx] if idx < len(field_names) else f"Field_{idx+1}"
            result[field] = val
    elif isinstance(raw_test_data, str) and raw_test_data.strip():
        for line in raw_test_data.replace("\r", "\n").split("\n"):
            m = re.match(r"^\s*([A-Za-z0-9 _\-]+?)\s*[:=]\s*(.+)$", line)
            if m:
                result[m.group(1).strip()] = m.group(2).strip()

    # Also extract any field/value specified in step_details if missing in test_data
    for detail in step_details:
        comp = detail.get("component")
        val = str(detail.get("value") or "").strip()
        action = str(detail.get("action") or "").lower()
        if comp and val and action in ("enter", "select", "type", "fill"):
            if comp not in result:
                result[comp] = val

    # Validate date range order (From Date <= To Date)
    from_key = next((k for k in result if "from" in k.lower() and "date" in k.lower()), None)
    to_key = next((k for k in result if "to" in k.lower() and "date" in k.lower()), None)
    if from_key and to_key:
        from_val = result[from_key]
        to_val = result[to_key]
        if from_val > to_val:
            result[from_key], result[to_key] = to_val, from_val

    return result


def _normalize_one_ai_case(
    item: Dict[str, Any],
    index: int,
    prefix: str,
    reqs: List[Dict[str, str]],
) -> Dict[str, Any]:
    """Normalize a single raw AI test-case dict into the canonical shape.
    Raises ValueError on any structural problem — callers must catch this
    per-item so one bad case does not discard an otherwise-valid batch."""
    steps = item.get("steps") or []
    if isinstance(steps, str):
        steps = [steps]
    clean_steps = [str(s).strip() for s in steps if str(s).strip()]
    if not clean_steps:
        raise ValueError("test case has no non-empty steps")
    step_details = _normalize_step_details(
        clean_steps,
        item.get("stepDetails", item.get("step_details", [])),
        str(item.get("expected_result") or "").strip(),
    )
    _ensure_step_details_expected(step_details)
    raw_test_data = item.get("test_data", item.get("testData", {}))
    test_data = _normalize_test_data(raw_test_data, clean_steps, step_details)
    expected_result = str(item.get("expected_result") or "").strip()
    if not expected_result:
        raise ValueError("missing expected_result")

    return {
        "id": str(item.get("id") or f"{prefix}.{index}").strip() or f"{prefix}.{index}",
        "title": str(item.get("title") or f"Test Case {index}").strip(),
        "objective": str(item.get("objective") or f"Verify {item.get('title') or f'Test Case {index}'}").strip(),
        "preconditions": _string_list(item.get("preconditions")),
        "test_data": test_data,
        "steps": clean_steps,
        "stepDetails": step_details,
        "expected_result": expected_result,
        "priority": _normalize_priority(str(item.get("priority") or "Medium")),
        "severity": _normalize_severity(str(item.get("severity") or "Major")),
        "type": _normalize_type(str(item.get("type") or "Validation")),
        "requirements": _validated_requirements(item.get("requirements"), reqs),
        "dependsOn": _string_list(item.get("dependsOn", item.get("depends_on"))),
    }


def generate_test_cases(
    *,
    plan_id: str,
    plan_title: str,
    plan_description: str,
    spec_text: str,
    style_config: str,
    project_title: str,
) -> List[Dict[str, Any]]:
    settings = get_settings()
    log_event(
        logger,
        "generate_cases_request_received",
        plan_id=plan_id,
        plan_title=plan_title,
        plan_description=plan_description,
        mock=settings.use_mock,
    )

    # --- Extraction & matching (data problems here are NOT AI failures:
    # they raise SrsExtractionError and are never retried/faked). ---
    reqs = extract_requirements(spec_text)
    ui_section = _extract_complete_ui_components_section(spec_text)
    if not ui_section:
        raise SrsExtractionError('No complete "4. UI Components" section found in the SRS for test case generation.')

    matched_ui_subsection, match_method = _select_matching_ui_subsection(ui_section, plan_title, plan_description)
    matched_title = str(matched_ui_subsection.get("title") or "")
    matched_text = matched_ui_subsection.get("text") or ""
    logger.info("Matched UI subsection: %s", matched_title)
    logger.info("Matching method: %s", match_method)

    relevant_chunks = [matched_ui_subsection]
    ui_components = _extract_matched_ui_controls(matched_text)
    if not ui_components:
        raise SrsExtractionError("No UI Components found in the matched UI Components subsection.")
    typed_ui_components = [_format_typed_component(component) for component in ui_components]
    logger.info("Allowed UI components (%s): %s", len(ui_components), typed_ui_components)

    # Collect components AND titles belonging to every OTHER subsection so
    # generated cases can be checked against, and rejected for,
    # cross-subsection leaks — both a literal component match (e.g. "User
    # Role dropdown") and a looser vocabulary match (e.g. the word "users"
    # appearing in a Leave List case because the model drifted toward the
    # unrelated "Admin > User Management" feature).
    other_subsection_components: List[str] = []
    other_subsection_titles: List[str] = []
    for other_subsection in _split_ui_subsections(ui_section):
        if other_subsection.get("title") == matched_title:
            continue
        other_subsection_titles.append(str(other_subsection.get("title") or ""))
        other_subsection_components.extend(
            _extract_matched_ui_controls(other_subsection.get("text") or "")
        )
    foreign_vocabulary = _build_foreign_vocabulary_blacklist(other_subsection_titles, matched_title, ui_components)

    prefix = _tc_prefix(plan_id)
    plan_is_search_or_filter = _looks_like_search_or_filter_plan(plan_title, plan_description)

    def validate_ai_cases(cases_raw: Any) -> List[Dict[str, Any]]:
        if not isinstance(cases_raw, list):
            logger.warning("AI response was not a JSON array of test cases.")
            return []
        valid: List[Dict[str, Any]] = []
        for i, item in enumerate(cases_raw, start=1):
            try:
                if not isinstance(item, dict):
                    continue
                normalized_case = _normalize_one_ai_case(item, i, prefix, reqs)
                if not _validate_independent_case(normalized_case):
                    logger.warning("AI generated a dependent or incomplete test case, rejected: %s", normalized_case.get("title"))
                    continue
                normalized_case = _replace_placeholder_ui(normalized_case, ui_components)
                # C. every component used must belong to the canonical
                # allowed-component list for the matched subsection.
                _reject_invented_ui(normalized_case, ui_components)
                # D. no component (or vocabulary) from another subsection.
                _reject_cross_subsection_components(normalized_case, ui_components, other_subsection_components)
                _reject_foreign_feature_terms(normalized_case, foreign_vocabulary)
                if _is_generic_generated_case(normalized_case):
                    # F. expected results must be meaningful, not boilerplate.
                    logger.warning("AI generated a generic/useless test case, rejected: %s", normalized_case.get("title"))
                    continue
                if not _case_respects_component_types(normalized_case, ui_components):
                    logger.warning("AI generated an invalid UI action/type mapping, rejected: %s", normalized_case.get("title"))
                    continue
                if plan_is_search_or_filter and _is_isolated_entry_field_case(normalized_case, ui_components):
                    # E. the plan asks for a combined search/filter feature,
                    # so an isolated single-field check (e.g. "Verify From
                    # Date field") tests the wrong thing — it must combine
                    # relevant filters with the primary action instead.
                    logger.warning(
                        "AI generated an isolated single-field test case for a search/filter test plan, rejected: %s",
                        normalized_case.get("title"),
                    )
                    continue
                valid.append(normalized_case)
            except ValueError as exc:
                logger.warning("AI response rejected for test case #%s: %s", i, str(exc))
                continue
        return valid

    # --- AI generation with retry/repair. Any AI/timeout/parse failure is
    # caught here and logged; it NEVER propagates as an exception that would
    # turn into a 502/503/504 at the endpoint. ---
    normalized: List[Dict[str, Any]] = []
    ai_failure_reason = ""

    if settings.use_mock:
        logger.info("Mock mode enabled: skipping AI generation, going straight to deterministic fallback.")
    else:
        ai = get_ai_service()
        max_attempts = 2
        for attempt in range(1, max_attempts + 1):
            logger.info("AI generation attempt %s/%s started.", attempt, max_attempts)
            retry_feedback = (
                ""
                if attempt == 1
                else (
                    f"Your previous response was rejected ({ai_failure_reason or 'invalid or insufficient test cases'}). "
                    f"Regenerate strictly using ONLY the allowed UI components listed for \"{matched_title}\" "
                    "and do not reference any other subsection."
                )
            )
            prompt = build_test_case_prompt(
                plan_id=plan_id,
                plan_title=plan_title,
                plan_description=plan_description,
                project_title=project_title,
                style_config=style_config,
                linked_requirements=reqs,
                spec_chunks=relevant_chunks,
                ui_components=typed_ui_components,
                matched_subsection_title=matched_title,
                retry_feedback=retry_feedback,
            )
            try:
                data = ai.generate_json(prompt=prompt, timeout=settings.ollama_test_cases_timeout)
                logger.info("AI generation attempt %s succeeded (response received).", attempt)
            except Exception as exc:
                ai_failure_reason = str(exc)
                log_error(logger, "generate_cases_ai_attempt_failed", attempt=attempt, error=ai_failure_reason)
                logger.warning("Retry attempt %s scheduled after AI failure: %s", attempt + 1, ai_failure_reason)
                continue

            cases_raw = _extract_cases_payload(data)
            attempt_cases = validate_ai_cases(cases_raw)
            logger.info(
                "AI generation attempt %s produced %s valid test case(s) (need >= %s).",
                attempt,
                len(attempt_cases),
                DEFAULT_TEST_CASES_MIN,
            )
            if len(attempt_cases) > len(normalized):
                normalized = attempt_cases
            if len(normalized) >= DEFAULT_TEST_CASES_MIN:
                logger.info("AI generation succeeded on attempt %s.", attempt)
                break
            ai_failure_reason = f"only {len(attempt_cases)} valid test case(s) after validation"
            if attempt < max_attempts:
                logger.warning("Retry attempt %s scheduled: %s", attempt + 1, ai_failure_reason)

    # Search/filter plans have a fixed independent scenario contract. Do not
    # let a model response collapse this feature into one-field test cases.
    if plan_is_search_or_filter and len(normalized) < DEFAULT_TEST_CASES_MIN:
        logger.info(
            "Fallback activation: AI produced %s/%s valid test cases. Activating deterministic search feature fallback.",
            len(normalized),
            DEFAULT_TEST_CASES_MIN,
        )
        search_cases = _deterministic_search_feature_cases(
            ui_components, prefix, plan_title, matched_title, matched_text
        )
        if len(search_cases) >= DEFAULT_TEST_CASES_MIN:
            normalized = search_cases

    # --- Deterministic fallback: guarantees the endpoint still returns
    # valid test cases even when the AI never produced enough. Nothing here
    # invents a component; every case comes from `ui_components`. ---
    if len(normalized) < DEFAULT_TEST_CASES_MIN:
        logger.warning(
            "Starting deterministic fallback: AI produced %s/%s valid test case(s).",
            len(normalized),
            DEFAULT_TEST_CASES_MIN,
        )

        # `_build_workflow_cases` is a hand-written, domain-specific fallback
        # for the "Admin > User Management" screen (Add/Edit/Delete a
        # system user, etc.). It must ONLY run when the matched subsection
        # actually IS that domain — otherwise its component lookups (which
        # key on generic names like "search" and "employee name") can match
        # against an unrelated subsection that merely happens to share those
        # generic control names too (e.g. "4.5 Leave > Leave List" also has
        # a Search button and an Employee Name field), producing a case
        # like "Search system users with filters" inside a Leave List
        # response. Gating on the subsection title itself closes that hole.
        matched_title_norm = _normalize_token(matched_title)
        is_user_management_subsection = "user management" in matched_title_norm
        if is_user_management_subsection:
            workflow_cases = _build_workflow_cases(ui_components, prefix, plan_title)
            if not normalized and workflow_cases:
                preferred_order = (
                    "Add a new system user",
                    "Reject Add User submission with required fields empty",
                    "Reject Add User submission when passwords do not match",
                    "Search system users with filters",
                    "Reset system user search filters",
                )
                workflow_cases.sort(key=lambda case: next(
                    (index for index, marker in enumerate(preferred_order)
                     if str(case.get("title") or "").startswith(marker)),
                    len(preferred_order),
                ))
                logger.info("Using concrete User Management workflows as the deterministic fallback.")
                normalized = workflow_cases[:DEFAULT_TEST_CASES_MAX]
            else:
                for workflow_case in workflow_cases:
                    if len(normalized) >= DEFAULT_TEST_CASES_MIN:
                        break
                    normalized.append(workflow_case)
        else:
            logger.info(
                "Matched subsection is not User Management (%s): skipping the "
                "domain-specific workflow builder, using the generic feature-aware fallback only.",
                matched_title,
            )

        if len(normalized) < DEFAULT_TEST_CASES_MIN:
            fallback_cases = _deterministic_fallback_cases(
                ui_components, prefix, plan_title, matched_title, matched_text
            )
            used_components: set[str] = set()
            for case in normalized:
                case_text = _normalize_token(" ".join(case.get("steps") or []))
                for component in ui_components:
                    if any(alias in case_text for alias in _component_aliases(component)):
                        used_components.add(_normalize_token(component))
            # Each case `_deterministic_fallback_cases` returns is a
            # genuinely distinct, non-padding scenario (one per filter
            # cluster / control) — it already stops at DEFAULT_TEST_CASES_MAX
            # internally, so use everything it built rather than truncating
            # to the bare minimum when richer, still-relevant information
            # exists (e.g. a Leave List with 3 distinct filter clusters
            # should get 3 cases, not be cut down arbitrarily).
            for fallback_case in fallback_cases:
                if len(normalized) >= DEFAULT_TEST_CASES_MAX:
                    break
                normalized.append(fallback_case)

        if len(normalized) < DEFAULT_TEST_CASES_MIN:
            normalized = _fill_missing_test_cases(normalized, DEFAULT_TEST_CASES_MIN)

        logger.info("Deterministic fallback produced %s test case(s).", len(normalized))

    if not normalized:
        # Every avenue (AI, retry, workflow fallback, generic fallback) came
        # up empty. This can only happen if the matched subsection truly has
        # no usable components — a data problem, not an AI/timeout failure.
        raise SrsExtractionError(
            "Unable to generate any valid test cases from the matched UI Components subsection."
        )

    # Re-number sequentially (stable ids) and cap count.
    normalized = normalized[:DEFAULT_TEST_CASES_MAX]
    for i, tc in enumerate(normalized, start=1):
        tc["id"] = f"{prefix}.{i}"
        tc["preconditions"] = _string_list(tc.get("preconditions")) or [
            f"{_feature_noun(matched_title)} screen is displayed with search filters in their initial/default state"
        ]
        tc["test_data"] = tc.get("test_data") if isinstance(tc.get("test_data"), dict) else {}
        tc["dependsOn"] = []
        tc["type"] = _normalize_type(tc.get("type"))

        # Log scenario category and components used
        cat = "FUNCTIONAL"
        t_low = str(tc.get("title") or "").lower()
        if "full-form" in t_low or "all filters" in t_low:
            cat = "FULL_FORM"
        elif "reset" in t_low:
            cat = "RESET"
        elif "empty" in t_low:
            cat = "EMPTY"
        elif "positive" in t_low:
            cat = "POSITIVE"
        elif "negative" in t_low:
            cat = "NEGATIVE"
        else:
            cat = str(tc.get("type") or "functional").upper()

        used_comps = [str(d.get("component")).strip() for d in tc.get("stepDetails") or [] if isinstance(d, dict) and d.get("component")]
        if not used_comps:
            case_text = _normalize_token(" ".join(tc.get("steps") or []))
            used_comps = [c for c in ui_components if any(alias in case_text for alias in _component_aliases(c))]
        logger.info("Scenario %s: %s", i, cat)
        logger.info("Components: %s", ", ".join(used_comps))

    logger.info("Final Test Cases: %s", len(normalized))
    return normalized
