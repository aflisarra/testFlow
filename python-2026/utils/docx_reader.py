# ============================================================
# utils/docx_reader.py — Extraction texte depuis fichier Word
# ============================================================

import io


def extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        from docx.table import Table
        from docx.text.paragraph import Paragraph
        blocks = []
        for child in doc.element.body.iterchildren():
            if child.tag.endswith("}p"):
                paragraph = Paragraph(child, doc)
                text = paragraph.text.strip()
                if not text:
                    continue
                style = (paragraph.style.name or "").strip()
                blocks.append(f"{'#' * int(style[-1])} {text}" if style in {"Heading 1", "Heading 2", "Heading 3"} else text)
            elif child.tag.endswith("}tbl"):
                for row in Table(child, doc).rows:
                    cells = [cell.text.strip() for cell in row.cells]
                    if any(cells):
                        blocks.append(" | ".join(cells))
        return "\n".join(blocks)
    except ImportError:
        raise RuntimeError("python-docx not installed. Run: pip install python-docx")
    except Exception as e:
        raise RuntimeError(f"Cannot read .docx file: {str(e)}")
