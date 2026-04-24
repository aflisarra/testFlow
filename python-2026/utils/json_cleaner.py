from __future__ import annotations

import json
import re
from typing import Any, Optional


_FENCE_RE = re.compile(r"```(?:json|JSON)?\s*|\s*```", re.MULTILINE)
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text or "")


def strip_markdown_fences(text: str) -> str:
    return _FENCE_RE.sub("", (text or "").strip()).strip()


def _extract_first_balanced(text: str, open_ch: str, close_ch: str) -> Optional[str]:
    depth = 0
    start: Optional[int] = None
    for i, ch in enumerate(text):
        if ch == open_ch:
            if depth == 0:
                start = i
            depth += 1
        elif ch == close_ch:
            if depth > 0:
                depth -= 1
                if depth == 0 and start is not None:
                    return text[start : i + 1]
    return None


def extract_first_json(text: str) -> Optional[str]:
    """
    Extract the first JSON array or object from noisy LLM output.
    """
    cleaned = strip_markdown_fences(strip_ansi(text))
    array_candidate = _extract_first_balanced(cleaned, "[", "]")
    obj_candidate = _extract_first_balanced(cleaned, "{", "}")
    if array_candidate and obj_candidate:
        return array_candidate if cleaned.find(array_candidate) < cleaned.find(obj_candidate) else obj_candidate
    return array_candidate or obj_candidate


def repair_common_json_issues(text: str) -> str:
    """
    Conservative repairs:
    - remove trailing commas before } or ]
    """
    s = (text or "").strip()
    s = re.sub(r",\s*([}\]])", r"\1", s)
    return s


def safe_json_loads(text: str) -> Any:
    """
    Best-effort JSON parsing for LLM outputs.
    """
    raw = strip_ansi(text or "").strip()

    # direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # strip fences
    stripped = strip_markdown_fences(raw)
    if stripped != raw:
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

    # extract first json
    extracted = extract_first_json(stripped or raw)
    if extracted:
        try:
            return json.loads(extracted)
        except json.JSONDecodeError:
            extracted = repair_common_json_issues(extracted)
            return json.loads(extracted)

    # repair whole string and retry
    repaired = repair_common_json_issues(stripped or raw)
    return json.loads(repaired)

