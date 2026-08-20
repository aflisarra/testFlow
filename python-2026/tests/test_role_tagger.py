"""Phase 3 deterministic cascade tests (no embedding model required)."""

from services.ingestion.items import Item
from services.ingestion.role_heading_prior import match_heading
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
    item = _item(
        "Plateforme musicale disponible sur mobile et web.", ["Contexte", "Vue d'ensemble"]
    )

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


def test_heading_prior_covers_common_bilingual_srs_sections() -> None:
    cases = {
        "4.2 Exigences non fonctionnelles — Sécurité": "NON_FUNCTIONAL",
        "3.1 Rôles et responsabilités": "ACTOR",
        "Termes, acronymes et abréviations": "GLOSSARY",
        "Business Rules": "REQUIREMENT",
        "Expected Results": "ACCEPTANCE",
        "System Capabilities": "FEATURE",
        "Limitations and exclusions": "OUT_OF_SCOPE",
        "Purpose and assumptions": "CONTEXT",
    }

    for heading, expected_role in cases.items():
        assert match_heading(heading) == expected_role


def test_heading_prior_uses_word_boundaries_not_substrings() -> None:
    assert match_heading("Facteurs de risque") is None
    assert match_heading("Dysfonctionnements connus") is None


def test_specific_heading_phrase_wins_over_generic_requirement_word() -> None:
    item = _item(
        "Ces règles s'appliquent à tous les modules.",
        ["Requirements", "Non-functional requirements"],
    )

    tag_role([item])

    assert item.role == "NON_FUNCTIONAL"
    assert item.role_method == "heading"


def test_structural_labels_are_not_misclassified_as_glossary() -> None:
    cases = {
        "Acceptance criteria: Payment is rejected for an expired card.": "ACCEPTANCE",
        "Purpose: Describe the product and its audience.": "CONTEXT",
        "Feature: Offline playback is available.": "FEATURE",
        "NFR-12: Availability must be at least 99.9%.": "NON_FUNCTIONAL",
    }

    for text, expected_role in cases.items():
        item = _item(text)
        tag_role([item])
        assert item.role == expected_role
        assert item.role_method == "regex"


def test_additional_obligation_forms_are_requirements() -> None:
    items = [
        _item("Les utilisateurs doivent confirmer leur adresse."),
        _item("The application is required to retain audit records."),
    ]

    tag_role(items)

    assert all(item.role == "REQUIREMENT" for item in items)
