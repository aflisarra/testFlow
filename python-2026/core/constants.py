from __future__ import annotations

from typing import Final


PRIORITIES: Final[tuple[str, ...]] = ("Critical", "High", "Medium", "Low")
SEVERITIES: Final[tuple[str, ...]] = ("Blocker", "Critical", "Major", "Minor", "Trivial")
TEST_CASE_TYPES: Final[tuple[str, ...]] = (
    "Functional",
    "Regression",
    "Integration",
    "E2E",
    "API",
    "UI",
    "Performance",
    "Security",
    "Smoke",
    "Sanity",
    "Usability",
    "Positive",
    "Negative",
    "Boundary",
    "Permission",
    "Validation",
    "Error handling",
)

DEFAULT_TEST_PLANS_MIN: Final[int] = 10
DEFAULT_TEST_PLANS_MAX: Final[int] = 1000

DEFAULT_TEST_CASES_MIN: Final[int] = 3
DEFAULT_TEST_CASES_MAX: Final[int] = 5
