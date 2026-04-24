from __future__ import annotations

from typing import Final


PRIORITIES: Final[tuple[str, ...]] = ("High", "Medium", "Low")
TEST_CASE_TYPES: Final[tuple[str, ...]] = (
    "Positive",
    "Negative",
    "Boundary",
    "Permission",
    "Validation",
    "Error handling",
)

DEFAULT_TEST_PLANS_MIN: Final[int] = 4
DEFAULT_TEST_PLANS_MAX: Final[int] = 8

DEFAULT_TEST_CASES_MIN: Final[int] = 4
DEFAULT_TEST_CASES_MAX: Final[int] = 6

