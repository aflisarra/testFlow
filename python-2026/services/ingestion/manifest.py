"""Task-to-role contract used by the generation pipeline."""

from __future__ import annotations


TASK_MANIFEST: dict[str, set[str]] = {
    "generate-plan": {"CONTEXT", "FEATURE", "ACTOR"},
    "generate-test-cases": {"FEATURE", "REQUIREMENT", "ACCEPTANCE"},
}
