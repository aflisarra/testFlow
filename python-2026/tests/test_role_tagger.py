"""Phase 3 deterministic cascade tests (no embedding model required)."""

from services.ingestion.items import Item
from services.ingestion.tagger import tag_role


def _item(text: str, heading_path: list[str] | None = None) -> Item:
    return Item(
        id="ITEM-00000",
        source_chunk_id="CHUNK-001",
        heading_path=heading_path or [],
        text=text,
    )


def test_regex_stage_wins_before_heading_prior() -> None:
    item = _item(
        "Le systÃ¨me doit conserver les journaux d'audit.",
        ["Contexte"],
    )

    tag_role([item])

    assert item.role == "REQUIREMENT"
    assert item.role_method == "regex"
    assert item.role_score is None
    assert item.requirement_id == "REQ-00000"


def test_closest_matching_heading_wins_over_a_matching_parent() -> None:
    item = _item("Compte gratuit avec publicitÃ©.", ["PrÃ©sentation", "Utilisateurs"])

    tag_role([item])

    assert item.role == "ACTOR"
    assert item.role_method == "heading"


def test_parent_heading_is_used_when_closest_heading_has_no_role_signal() -> None:
    item = _item("Plateforme musicale disponible sur mobile et web.", ["Contexte", "Vue d'ensemble"])

    tag_role([item])

    assert item.role == "CONTEXT"
    assert item.role_method == "heading"


def test_closest_heading_wins_when_multiple_headings_are_relevant() -> None:
    item = _item("Compte gratuit avec publicitÃ©.", ["Contexte", "Utilisateurs"])

    tag_role([item])

    assert item.role == "ACTOR"
    assert item.role_method == "heading"


def test_non_functional_requires_explicit_constraint_signal() -> None:
    requirement = _item("Le lecteur applique un crossfade configurable de 0 Ã  12 secondes.")
    non_functional = _item("Latence maximum 500 ms.")

    tag_role([requirement, non_functional])

    assert requirement.role == "UNTAGGED"
    assert requirement.role_method == "none"
    assert non_functional.role == "NON_FUNCTIONAL"
    assert non_functional.role_method == "regex"


def test_unresolved_item_remains_diagnostic_untagged() -> None:
    item = _item("Plateforme musicale disponible sur mobile et web.")

    tag_role([item])

    assert item.role == "UNTAGGED"
    assert item.role_method == "none"
    assert item.requirement_id is None


def test_labelled_actor_table_row_is_not_misclassified_as_glossary() -> None:
    item = _item("Actor: Admin | Actions: Create users and deactivate accounts")

    tag_role([item])

    assert item.role == "ACTOR"
    assert item.role_method == "regex"
