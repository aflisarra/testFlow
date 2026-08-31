"""Observability helpers for Phase 4 modules."""

from __future__ import annotations

from typing import Any


def compare_module_detection(
    legacy_modules: list[str], generated_modules: list[dict[str, Any]]
) -> dict[str, list[str]]:
    """Compare names for diagnostics only; this is not a quality score."""
    legacy = {str(name) for name in legacy_modules}
    generated = {str(module["name"]) for module in generated_modules}
    return {
        "legacy": sorted(legacy),
        "generated": sorted(generated),
        "only_legacy": sorted(legacy - generated),
        "only_generated": sorted(generated - legacy),
    }
