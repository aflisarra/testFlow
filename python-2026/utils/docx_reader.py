"""DOCX parsing helpers shared by text extraction and structured ingestion."""

from __future__ import annotations

import io
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

_HEADING_STYLE_RE = re.compile(r"^(?:Heading|Titre)\s+([1-6])$", re.IGNORECASE)

# Labels commonly found in requirements tables. They are used only to infer
# whether the first row is a horizontal header or the first column is a set of
# vertical keys; the original label text is retained in the flattened output.
_KNOWN_TABLE_LABELS = {
    "acceptance criteria",
    "action",
    "actions",
    "acteur",
    "acteurs",
    "actor",
    "actors",
    "business rule",
    "business rules",
    "critere d acceptation",
    "criteres d acceptation",
    "description",
    "expected result",
    "exigence",
    "exigences",
    "feature",
    "features",
    "fonctionnalite",
    "fonctionnalites",
    "id",
    "identifier",
    "module",
    "permission",
    "permissions",
    "priority",
    "priorite",
    "requirement",
    "requirements",
    "resultat attendu",
    "role",
    "roles",
    "status",
    "statut",
}


@dataclass(frozen=True)
class _SyntheticStyle:
    name: str = "Normal"


@dataclass
class SyntheticParagraph:
    """Paragraph-shaped block used for one flattened logical table record."""

    text: str
    style: _SyntheticStyle = field(default_factory=_SyntheticStyle)
    _p: None = None


def extract_doc_from_bytes(file_bytes: bytes):
    """Return a parsed ``python-docx`` document without flattening its styles."""
    try:
        from docx import Document

        return Document(io.BytesIO(file_bytes))
    except ImportError:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")
    except Exception as e:
        raise RuntimeError(f"Cannot read .docx file: {e!s}")


def _clean_cell_text(text: str) -> str:
    """Collapse cell paragraphs/line breaks without losing their boundaries."""
    parts = [re.sub(r"\s+", " ", part).strip() for part in (text or "").splitlines()]
    return "; ".join(part for part in parts if part)


def _label_key(text: str) -> str:
    normalized = "".join(
        char
        for char in unicodedata.normalize("NFKD", text or "")
        if not unicodedata.combining(char)
    ).casefold()
    return re.sub(r"[^a-z0-9]+", " ", normalized).strip()


def _is_known_label(text: str) -> bool:
    return _label_key(text) in _KNOWN_TABLE_LABELS


def _is_label_like(text: str) -> bool:
    value = (text or "").strip()
    return (
        bool(value)
        and len(value) <= 60
        and len(value.split()) <= 7
        and not value.endswith((".", "!", "?"))
    )


def _row_is_formatted_header(row: Any) -> bool:
    """Use Word's repeat-header flag or explicit bold runs when available."""
    try:
        tr_properties = row._tr.trPr
        if tr_properties is not None and tr_properties.tblHeader is not None:
            return True
    except Exception:
        pass

    runs = []
    try:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                runs.extend(run for run in paragraph.runs if run.text.strip())
    except Exception:
        return False
    return bool(runs) and all(run.bold is True for run in runs)


def _unique_labels(labels: list[str]) -> list[str]:
    """Make blank or repeated headers safe without discarding any column."""
    counts: dict[str, int] = {}
    result: list[str] = []
    for index, raw_label in enumerate(labels, start=1):
        label = raw_label.strip() or f"Column {index}"
        key = label.casefold()
        counts[key] = counts.get(key, 0) + 1
        result.append(label if counts[key] == 1 else f"{label} {counts[key]}")
    return result


def _render_pairs(labels: list[str], values: list[str]) -> str:
    parts = [f"{label}: {value}" for label, value in zip(labels, values) if value.strip()]
    return " | ".join(parts)


def _table_matrix(table: Any) -> list[list[str]]:
    matrix: list[list[str]] = []
    for row in table.rows:
        values = [_clean_cell_text(cell.text) for cell in row.cells]
        if any(values):
            matrix.append(values)
    if not matrix:
        return []

    width = max(len(row) for row in matrix)
    return [row + [""] * (width - len(row)) for row in matrix]


def _horizontal_header(
    table: Any,
    matrix: list[list[str]],
    *,
    allow_heuristic: bool = True,
) -> bool:
    if len(matrix) < 2:
        return False

    first = [value for value in matrix[0] if value]
    if len(first) < 2:
        return False
    if _row_is_formatted_header(table.rows[0]):
        return True
    if sum(_is_known_label(value) for value in first) >= 2:
        return True

    if not allow_heuristic:
        return False

    # Best effort for custom, unformatted headers: short labels followed by at
    # least one materially longer data cell.
    if all(_is_label_like(value) for value in first):
        first_lengths = [len(value) for value in matrix[0]]
        return any(
            len(value) >= first_lengths[index] + 12
            for row in matrix[1:]
            for index, value in enumerate(row)
            if value and index < len(first_lengths)
        )
    return False


def _vertical_key_value_table(matrix: list[list[str]]) -> bool:
    if len(matrix) < 2 or len(matrix[0]) != 2:
        return False
    labels = [row[0] for row in matrix]
    if not all(_is_label_like(label) for label in labels):
        return False
    if len({_label_key(label) for label in labels}) != len(labels):
        return False
    if sum(_is_known_label(label) for label in labels) >= 2:
        return True

    # Unknown vertical labels are accepted only when their values look
    # substantially more descriptive than the keys.
    label_chars = sum(len(label) for label in labels)
    value_chars = sum(len(row[1]) for row in matrix)
    return value_chars >= label_chars * 2


def flatten_table_records(table: Any) -> list[str]:
    """Flatten a Word table into one ``Header: Value`` string per record.

    Horizontal tables use their first row as headers. Two-column vertical
    key/value tables become one combined record. Headerless tables retain all
    rows using stable ``Column N`` labels.
    """
    matrix = _table_matrix(table)
    if not matrix:
        return []

    # Prefer explicit/formatted horizontal headers, then vertical key/value
    # structure, and only then the length-based horizontal heuristic. This
    # keeps ``Actor | Admin`` / ``Actions | ...`` vertical tables intact.
    if _horizontal_header(table, matrix, allow_heuristic=False):
        headers = _unique_labels(matrix[0])
        records = []
        for row in matrix[1:]:
            # Repeated headers are common when a table spans Word pages.
            if [_label_key(value) for value in row] == [_label_key(value) for value in matrix[0]]:
                continue
            rendered = _render_pairs(headers, row)
            if rendered:
                records.append(rendered)
        return records

    if _vertical_key_value_table(matrix):
        labels = _unique_labels([row[0] for row in matrix])
        rendered = _render_pairs(labels, [row[1] for row in matrix])
        return [rendered] if rendered else []

    if _horizontal_header(table, matrix):
        headers = _unique_labels(matrix[0])
        return [rendered for row in matrix[1:] if (rendered := _render_pairs(headers, row))]

    width = len(matrix[0])
    if width == 1:
        return [row[0] for row in matrix if row[0]]

    labels = [f"Column {index}" for index in range(1, width + 1)]
    return [rendered for row in matrix if (rendered := _render_pairs(labels, row))]


def iter_document_paragraphs(doc: Any) -> Iterable[Any]:
    """Yield paragraphs and flattened tables in their original body order."""
    body = getattr(getattr(doc, "element", None), "body", None)
    if body is None:
        paragraphs = getattr(doc, "paragraphs", None)
        if paragraphs is None:
            raise TypeError("Expected a python-docx Document or paragraph container")
        yield from paragraphs
        return

    try:
        from docx.table import Table
        from docx.text.paragraph import Paragraph
    except ImportError:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")

    for child in body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, doc)
        elif child.tag.endswith("}tbl"):
            table = Table(child, doc)
            for record in flatten_table_records(table):
                # Bullet form guarantees one logical table record becomes one
                # atomic Item in expand_section_to_items().
                yield SyntheticParagraph(text=f"- {record}")


def extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        doc = extract_doc_from_bytes(file_bytes)
        blocks = []
        for paragraph in iter_document_paragraphs(doc):
            text = paragraph.text.strip()
            if not text:
                continue
            style = str(getattr(getattr(paragraph, "style", None), "name", "") or "")
            heading = _HEADING_STYLE_RE.match(style.strip())
            blocks.append(f"{'#' * int(heading.group(1))} {text}" if heading else text)
        return "\n".join(blocks)
    except ImportError:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")
    except Exception as e:
        raise RuntimeError(f"Cannot read .docx file: {e!s}")
