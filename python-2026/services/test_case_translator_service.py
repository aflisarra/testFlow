from __future__ import annotations

import re
from typing import Any, Dict, List

from core.config import get_settings
from prompts.test_case_translator_prompt import build_test_case_translator_prompt
from schemas.execution_model_schema import ExecutionModel
from services.ai_service import get_ai_service
from utils.logger import get_logger, log_event, log_error


logger = get_logger("services.test_case_translator")


def _dump_model(model: ExecutionModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(by_alias=True)  # type: ignore[attr-defined]
    return model.dict(by_alias=True)


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _target(kind: str, name: str, role: str | None = None, **extra: Any) -> Dict[str, Any]:
    return {
        "kind": kind,
        "name": name,
        "role": role,
        "url": extra.get("url"),
        "path": extra.get("path"),
        "method": extra.get("method"),
    }


def _value(source: str, key: str | None = None, text: str | None = None) -> Dict[str, Any]:
    return {"source": source, "key": key, "text": text}


def _assertion(kind: str, expected: Any = None) -> Dict[str, Any]:
    return {"kind": kind, "expected": expected}


def _infer_api_method(text: str) -> str | None:
    lowered = text.lower()
    for method in ("post", "get", "put", "patch", "delete"):
        if re.search(rf"\b{method}\b", lowered):
            return method.upper()
    return None


def _infer_path(text: str) -> str | None:
    match = re.search(r"(?:endpoint|path|url)\s+[`'\"]?([/][^\s`'\"]+)", text, flags=re.IGNORECASE)
    if match:
        return match.group(1)
    match = re.search(r"\b(/[a-zA-Z0-9._~:/?#\[\]@!$&'()*+,;=%-]+)", text)
    return match.group(1) if match else None


def _infer_url(text: str) -> str | None:
    match = re.search(r"https?://[^\s`'\")\]]+", text, flags=re.IGNORECASE)
    return match.group(0) if match else None


def _fallback_step(raw_step: str, index: int) -> Dict[str, Any]:
    raw = _safe_text(raw_step)
    lowered = raw.lower()
    step_id = f"S{index}"

    if any(word in lowered for word in ("authorization header", "basic auth", "auth credential", "http authorization")):
        return {
            "id": step_id,
            "raw": raw,
            "channel": "api",
            "action": "set_auth",
            "target": _target("credential", "basic auth", "api"),
            "value": _value("credential", "email,apiToken"),
            "assertion": None,
            "requires": ["credentials.email", "credentials.apiToken"],
        }

    if any(word in lowered for word in ("post request", "get request", "put request", "patch request", "delete request", "endpoint")):
        method = _infer_api_method(raw)
        return {
            "id": step_id,
            "raw": raw,
            "channel": "api",
            "action": "http_request",
            "target": _target("endpoint", "api endpoint", "api", path=_infer_path(raw), method=method),
            "value": None,
            "assertion": None,
            "requires": ["baseUrl"],
        }

    status_match = re.search(r"status code (?:is|should be|equals?)\s+(\d{3})", lowered)
    if status_match:
        return {
            "id": step_id,
            "raw": raw,
            "channel": "assertion",
            "action": "assert_status",
            "target": _target("response", "last api response", "api"),
            "value": None,
            "assertion": _assertion("status_code", int(status_match.group(1))),
            "requires": ["lastResponse"],
        }

    if any(word in lowered for word in ("open application", "open app", "open url", "go to url", "navigate to")):
        return {
            "id": step_id,
            "raw": raw,
            "channel": "ui",
            "action": "open_app",
            "target": _target("url", "application", url=_infer_url(raw)),
            "value": _value("context", "baseUrl"),
            "assertion": None,
            "requires": ["baseUrl"],
        }

    if any(word in lowered for word in ("login page", "open login", "go to login", "navigate login")):
        return {
            "id": step_id,
            "raw": raw,
            "channel": "ui",
            "action": "open_login",
            "target": _target("page", "login", "page", url=_infer_url(raw)),
            "value": _value("context", "baseUrl"),
            "assertion": None,
            "requires": ["baseUrl"],
        }

    if (
        any(word in lowered for word in ("leave", "keep", "clear", "empty", "blank", "without entering", "do not enter", "don't enter"))
        and any(word in lowered for word in ("email", "username", "password", "field"))
    ):
        target_name = "password" if "password" in lowered else "email" if any(word in lowered for word in ("email", "username")) else "field"
        return {
            "id": step_id,
            "raw": raw,
            "channel": "ui",
            "action": "clear_field",
            "target": _target("field", target_name, "textbox"),
            "value": _value("literal", text=""),
            "assertion": None,
            "requires": [],
        }

    if "password" in lowered and any(word in lowered for word in ("email", "username", "credential", "login")):
        return {
            "id": step_id,
            "raw": raw,
            "channel": "ui",
            "action": "type_credentials",
            "target": _target("credential_form", "login credentials", "form"),
            "value": _value("credential", "email,password"),
            "assertion": None,
            "requires": ["credentials.email", "credentials.password"],
        }

    if any(word in lowered for word in ("fill", "enter", "type")):
        target_name = "password" if "password" in lowered else "email" if any(word in lowered for word in ("email", "username")) else "field"
        value_key = "password" if target_name == "password" else "email" if target_name == "email" else None
        return {
            "id": step_id,
            "raw": raw,
            "channel": "ui",
            "action": "type",
            "target": _target("field", target_name, "textbox"),
            "value": _value("credential" if value_key else "literal", value_key),
            "assertion": None,
            "requires": [f"credentials.{value_key}"] if value_key else [],
        }

    if any(word in lowered for word in ("click", "press", "submit", "sign in", "login")):
        return {
            "id": step_id,
            "raw": raw,
            "channel": "ui",
            "action": "submit" if any(word in lowered for word in ("submit", "sign in", "login")) else "click",
            "target": _target("button", "login" if "login" in lowered or "sign in" in lowered else "button", "button"),
            "value": None,
            "assertion": None,
            "requires": [],
        }

    if any(word in lowered for word in ("verify dashboard", "assert dashboard", "check dashboard", "redirected", "authenticated")):
        return {
            "id": step_id,
            "raw": raw,
            "channel": "assertion",
            "action": "assert_authenticated",
            "target": _target("page", "authenticated area", "page"),
            "value": None,
            "assertion": _assertion("redirected", "authenticated area"),
            "requires": [],
        }

    return {
        "id": step_id,
        "raw": raw,
        "channel": "unknown",
        "action": "unknown",
        "target": _target("unknown", ""),
        "value": None,
        "assertion": None,
        "requires": [],
    }


def build_fallback_execution_model(
    *,
    test_case_id: str,
    title: str,
    steps: List[str],
    expected_result: str,
) -> Dict[str, Any]:
    return {
        "version": "execution-model/v1",
        "source": {"test_case_id": test_case_id, "title": title},
        "preconditions": [],
        "steps": [_fallback_step(step, index) for index, step in enumerate(steps, start=1)],
        "expected_result": expected_result,
        "confidence": "medium",
    }


def normalize_execution_model(raw: Any, *, test_case_id: str, title: str, steps: List[str], expected_result: str) -> Dict[str, Any]:
    model_raw = raw.get("execution_model") if isinstance(raw, dict) and "execution_model" in raw else raw
    model_raw = model_raw.get("executionModel") if isinstance(model_raw, dict) and "executionModel" in model_raw else model_raw
    if not isinstance(model_raw, dict):
        raise ValueError("Translator did not return an execution model object")

    fallback = build_fallback_execution_model(
        test_case_id=test_case_id,
        title=title,
        steps=steps,
        expected_result=expected_result,
    )

    model_raw["version"] = "execution-model/v1"
    model_raw["source"] = model_raw.get("source") or fallback["source"]
    model_raw["preconditions"] = model_raw.get("preconditions") if isinstance(model_raw.get("preconditions"), list) else []
    model_raw["expected_result"] = _safe_text(model_raw.get("expected_result") or expected_result)
    model_raw["confidence"] = _safe_text(model_raw.get("confidence") or "medium").lower()

    raw_steps = model_raw.get("steps")
    if not isinstance(raw_steps, list):
        raw_steps = []

    normalized_steps: List[Dict[str, Any]] = []
    fallback_steps = fallback["steps"]
    for index, original in enumerate(steps, start=1):
        candidate = raw_steps[index - 1] if index - 1 < len(raw_steps) and isinstance(raw_steps[index - 1], dict) else {}
        fallback_step = fallback_steps[index - 1]
        target = candidate.get("target") if isinstance(candidate.get("target"), dict) else fallback_step["target"]
        value = candidate.get("value") if isinstance(candidate.get("value"), dict) else fallback_step["value"]
        assertion = candidate.get("assertion") if isinstance(candidate.get("assertion"), dict) else fallback_step["assertion"]
        requires = candidate.get("requires") if isinstance(candidate.get("requires"), list) else fallback_step["requires"]
        candidate_channel = _safe_text(candidate.get("channel")).lower()
        candidate_action = _safe_text(candidate.get("action")).lower()

        normalized_steps.append(
            {
                "id": _safe_text(candidate.get("id") or f"S{index}"),
                "raw": _safe_text(candidate.get("raw") or original),
                "channel": candidate_channel if candidate_channel and candidate_channel != "unknown" else fallback_step["channel"],
                "action": candidate_action if candidate_action and candidate_action != "unknown" else fallback_step["action"],
                "target": {
                    "kind": _safe_text(target.get("kind") or "unknown").lower(),
                    "name": _safe_text(target.get("name")),
                    "role": target.get("role"),
                    "url": target.get("url"),
                    "path": target.get("path"),
                    "method": _safe_text(target.get("method")).upper() or None,
                },
                "value": value,
                "assertion": assertion,
                "requires": [_safe_text(item) for item in requires if _safe_text(item)],
            }
        )

    model_raw["steps"] = normalized_steps
    
    if isinstance(model_raw.get("preconditions"), list):
        model_raw["preconditions"] = [
            p.get("raw", "") if isinstance(p, dict) else str(p)
            for p in model_raw["preconditions"]
        ]

    return _dump_model(ExecutionModel(**model_raw))


def translate_test_case_to_execution_model(
    *,
    test_case_id: str,
    title: str,
    steps: List[str],
    expected_result: str,
    context: Dict[str, Any],
) -> Dict[str, Any]:
    clean_steps = [_safe_text(step) for step in steps if _safe_text(step)]
    settings = get_settings()
    log_event(
        logger,
        "translate_test_case_request_received",
        test_case_id=test_case_id,
        steps=len(clean_steps),
        mock=settings.use_mock,
    )

    if settings.use_mock:
        return build_fallback_execution_model(
            test_case_id=test_case_id,
            title=title,
            steps=clean_steps,
            expected_result=expected_result,
        )

    prompt = build_test_case_translator_prompt(
        test_case_id=test_case_id,
        title=title,
        steps=clean_steps,
        expected_result=expected_result,
        context=context,
    )
    ai = get_ai_service()
    try:
        raw = ai.generate_json(prompt=prompt, timeout=settings.ollama_test_translator_timeout)
        return normalize_execution_model(
            raw,
            test_case_id=test_case_id,
            title=title,
            steps=clean_steps,
            expected_result=expected_result,
        )
    except Exception as exc:
        log_error(logger, "translate_test_case_ai_failed", error=str(exc))
        return build_fallback_execution_model(
            test_case_id=test_case_id,
            title=title,
            steps=clean_steps,
            expected_result=expected_result,
        )
