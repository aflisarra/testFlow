from __future__ import annotations

import threading
import time

_LOCK = threading.Lock()
_CANCELLED_UNTIL: dict[str, float] = {}
_DEFAULT_TTL_SECONDS = 15 * 60


def _build_key(*, test_suite_id: str, plan_id: str, scope: str) -> str:
    return f"{scope}:{test_suite_id}:{plan_id}"


def _build_request_key(*, request_id: str, scope: str) -> str:
    return f"{scope}:request:{request_id}"


def _normalize_scope(scope: str | None) -> str:
    raw = str(scope or "all").strip().lower()
    if raw in {"plans", "cases", "all"}:
        return raw
    return "all"


def _cleanup_expired(now: float) -> None:
    expired = [key for key, until in _CANCELLED_UNTIL.items() if until <= now]
    for key in expired:
        _CANCELLED_UNTIL.pop(key, None)


def request_cancel(
    *,
    test_suite_id: str | None,
    plan_id: str | None,
    scope: str | None,
    request_id: str | None = None,
) -> dict:
    tsid = str(test_suite_id or "").strip()
    pid = str(plan_id or "").strip()
    rid = str(request_id or "").strip()
    scp = _normalize_scope(scope)
    now = time.time()
    until = now + _DEFAULT_TTL_SECONDS

    # Prefer request-scoped cancellation when request_id is provided so that
    # a cancelled run does not block future fresh runs for the same suite/plan.
    if rid:
        keys = [
            _build_request_key(request_id=rid, scope=scp),
            _build_request_key(request_id=rid, scope="all"),
        ]
    else:
        keys = [
            _build_key(test_suite_id=tsid, plan_id=pid, scope=scp),
            _build_key(test_suite_id=tsid, plan_id="", scope=scp),
            _build_key(test_suite_id=tsid, plan_id=pid, scope="all"),
            _build_key(test_suite_id=tsid, plan_id="", scope="all"),
        ]

    with _LOCK:
        _cleanup_expired(now)
        for key in keys:
            _CANCELLED_UNTIL[key] = until

    return {
        "cancelled": True,
        "scope": scp,
        "test_suite_id": tsid,
        "plan_id": pid,
        "request_id": rid,
    }


def is_cancelled(
    *,
    test_suite_id: str | None,
    plan_id: str | None,
    scope: str | None,
    request_id: str | None = None,
) -> bool:
    tsid = str(test_suite_id or "").strip()
    pid = str(plan_id or "").strip()
    rid = str(request_id or "").strip()
    scp = _normalize_scope(scope)
    now = time.time()

    if not tsid and not rid:
        return False

    keys = [
        _build_key(test_suite_id=tsid, plan_id=pid, scope=scp),
        _build_key(test_suite_id=tsid, plan_id="", scope=scp),
        _build_key(test_suite_id=tsid, plan_id=pid, scope="all"),
        _build_key(test_suite_id=tsid, plan_id="", scope="all"),
    ]
    if rid:
        keys.extend(
            [
                _build_request_key(request_id=rid, scope=scp),
                _build_request_key(request_id=rid, scope="all"),
            ]
        )

    with _LOCK:
        _cleanup_expired(now)
        matched = [key for key in keys if _CANCELLED_UNTIL.get(key, 0) > now]
        if not matched:
            return False

        # One-shot consume: once a cancellation is observed by a running request,
        # clear it immediately so future new runs are not blocked.
        for key in matched:
            _CANCELLED_UNTIL.pop(key, None)
        return True
