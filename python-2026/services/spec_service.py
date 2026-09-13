from __future__ import annotations

import re
from typing import Any, Dict, List

from utils.chunker import split_by_headings, detect_modules_from_chunks, normalize_spec_text
from utils.docx_reader import extract_text_from_docx


SRS_PLAN_SECTIONS = {
    "features",
    "feature",
    "fonctionnalités",
    "fonctionnalite",
    "functional requirements",
    "exigences fonctionnelles",
    "business rules",
    "business rule",
    "regles metier",
    "regle metier",
    "validation rules",
    "validation rule",
    "regles de validation",
    "project description",
    "description du projet",
    "objectives",
    "objectifs",
    "ui components",
    "pass criteria",
    "criteres de succes",
}

SRS_CASE_SECTIONS = {
    "ui components",
    "ui component",
    "user interface",
    "interface utilisateur",
    "composants ui",
    "composant ui",
    "composants interface",
    "ecrans",
    "screens",
    "features",
    "feature",
    "fonctionnalités",
    "forms",
    "formulaires",
    "page",
    "pages",
    "login",
    "connexion",
    "authentication",
    "authentification",
    "business rules",
    "business rule",
    "regles metier",
    "regle metier",
    "validation rules",
    "validation rule",
    "regles de validation",
    "regle de validation",
    "pass criteria",
    "success criteria",
    "criteres de succes",
    "critere de succes",
    "fail criteria",
    "failure criteria",
    "criteres d echec",
    "critere d echec",
}


def extract_spec_text_from_docx_bytes(file_bytes: bytes) -> str:
    return extract_text_from_docx(file_bytes)


def chunk_spec(spec_text: str) -> List[Dict[str, str]]:
    return split_by_headings(spec_text)


def detect_modules(spec_text: str) -> List[str]:
    chunks = chunk_spec(spec_text)
    return detect_modules_from_chunks(chunks)


def classify_priority(text: str) -> str:
    lower = text.lower()
    if any(k in lower for k in ("critical", "bloquant", "authenticat", "security", "sécurité", "payment", "login")):
        return "Critical"
    if any(k in lower for k in ("mandatory", "required", "high", "important", "obligatoire")):
        return "High"
    if any(k in lower for k in ("optional", "low", "mineur", "trivial", "nice to have")):
        return "Low"
    return "Medium"


def _section_key(title: str) -> str:
    title = re.sub(r"^\s*(?:\d+\.)+\s*", "", title or "")
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def _section_matches(title: str, allowed_sections: set[str]) -> bool:
    key = _section_key(title)
    if key in allowed_sections:
        return True
    return any(section in key or key in section for section in allowed_sections)


def get_srs_sections(spec_text: str, allowed_sections: set[str] | None = None) -> List[Dict[str, str]]:
    chunks = chunk_spec(spec_text)
    if not allowed_sections:
        return chunks
    selected: List[Dict[str, str]] = []
    active_parent_prefix = ""
    for chunk in chunks:
        title = str(chunk.get("title") or "")
        title_prefix_match = re.match(r"^\s*((?:\d+\.)*\d+)", title)
        title_prefix = title_prefix_match.group(1) if title_prefix_match else ""
        if _section_matches(title, allowed_sections):
            selected.append(chunk)
            active_parent_prefix = title_prefix
            continue
        if active_parent_prefix and title_prefix.startswith(f"{active_parent_prefix}."):
            selected.append(chunk)
            continue
        if title_prefix and active_parent_prefix and not title_prefix.startswith(f"{active_parent_prefix}."):
            active_parent_prefix = ""
    return selected


def extract_features_and_rules(spec_text: str) -> Dict[str, Any]:
    """
    Extract structured Features (Section 5) and Business Rules (Section 6) from SRS.
    Handles headings like:
      - 5. Features / 5. Functional Requirements
      - 5.1 Login, 5.2 User Management, ...
      - 6. Business Rules / 6. Validation Rules
      - 6.1 Password Policy, 6.2 Role Permissions, ...
    """
    chunks = chunk_spec(spec_text)
    features: List[Dict[str, str]] = []
    business_rules: List[Dict[str, str]] = []
    general_context: List[str] = []

    feature_keywords = {"feature", "features", "fonctionnalite", "fonctionnalités", "functional requirement", "functional requirements", "module", "modules"}
    rule_keywords = {"business rule", "business rules", "regle metier", "regles metier", "validation rule", "validation rules", "regles de validation", "business logic"}

    for chunk in chunks:
        title = str(chunk.get("title") or "").strip()
        body = str(chunk.get("text") or "").strip()
        key = _section_key(title)

        is_feature_section = any(k in key for k in feature_keywords)
        is_rule_section = any(k in key for k in rule_keywords)

        if is_feature_section:
            # Check if this chunk is a specific sub-feature (e.g. 5.1 Authentication) or a collection of features
            lines = [l.strip() for l in body.split("\n") if l.strip()]
            sub_feature_items: List[Dict[str, str]] = []
            
            # Sub-features could be formatted as bullets or numbered lists or paragraphs
            bullet_re = re.compile(r"^(\-|\*|•|\d+[\.\)])\s+(.*)$")
            current_feat_title = ""
            current_feat_lines: List[str] = []

            for ln in lines:
                m = bullet_re.match(ln)
                # Check for sub-headings like "5.1 Feature Name" or "Feature Name:"
                if re.match(r"^(?:\d+\.\d+|\bFeature\s+\d+|###|\*\*)\s*(.+?)(?:\*\*|:|$)", ln):
                    if current_feat_title and current_feat_lines:
                        sub_feature_items.append({
                            "title": current_feat_title,
                            "text": " ".join(current_feat_lines),
                        })
                        current_feat_lines = []
                    heading_clean = re.sub(r"^(?:\d+\.\d+|\bFeature\s+\d+|###|\*\*)\s*", "", ln).strip().strip("*:").strip()
                    current_feat_title = heading_clean if len(heading_clean) > 3 else f"Feature {len(sub_feature_items) + 1}"
                elif m:
                    content = m.group(2).strip()
                    if ":" in content and len(content.split(":")[0]) <= 50:
                        parts = content.split(":", 1)
                        sub_feature_items.append({
                            "title": parts[0].strip().strip("*").strip(),
                            "text": parts[1].strip(),
                        })
                    else:
                        current_feat_lines.append(content)
                else:
                    current_feat_lines.append(ln)

            if current_feat_title and current_feat_lines:
                sub_feature_items.append({
                    "title": current_feat_title,
                    "text": " ".join(current_feat_lines),
                })
            elif not sub_feature_items and body:
                # If no sub-items detected, treat the whole chunk as a feature or split by paragraphs
                clean_title = re.sub(r"^\s*(?:\d+\.)+\s*", "", title).strip()
                if clean_title.lower() not in {"features", "fonctionnalités", "functional requirements"}:
                    sub_feature_items.append({"title": clean_title, "text": body})
                else:
                    # Split paragraphs
                    paras = [p.strip() for p in body.split("\n\n") if len(p.strip()) > 20]
                    for idx, p in enumerate(paras, start=1):
                        first_line = p.split("\n")[0].strip().strip("*-:").strip()
                        f_title = first_line[:50] if len(first_line) <= 50 else f"Feature {idx}"
                        sub_feature_items.append({"title": f_title, "text": p})

            features.extend(sub_feature_items)

        elif is_rule_section:
            clean_title = re.sub(r"^\s*(?:\d+\.)+\s*", "", title).strip()
            lines = [l.strip() for l in body.split("\n") if l.strip()]
            for ln in lines:
                cleaned_line = re.sub(r"^(\-|\*|•|\d+[\.\)])\s*", "", ln).strip()
                if len(cleaned_line) >= 15:
                    business_rules.append({
                        "title": clean_title,
                        "rule": cleaned_line,
                    })
        else:
            if any(k in key for k in ("description", "objective", "scope", "target", "overview")):
                general_context.append(f"{title}: {body[:400]}")

    # Deduplicate features by title
    seen_f: set[str] = set()
    uniq_features: List[Dict[str, str]] = []
    for f in features:
        t_key = f["title"].strip().lower()
        if t_key and t_key not in seen_f:
            seen_f.add(t_key)
            uniq_features.append(f)

    return {
        "features": uniq_features,
        "business_rules": business_rules,
        "context": "\n".join(general_context),
    }


def extract_requirements(spec_text: str) -> List[Dict[str, str]]:
    """
    Extract atomic requirements mapped directly to functional modules and features.
    """
    parsed = extract_features_and_rules(spec_text)
    features = parsed.get("features") or []
    rules = parsed.get("business_rules") or []

    out: List[Dict[str, str]] = []
    req_id_counter = 1

    # Extract requirements from Features
    for feat in features:
        title = feat.get("title", "Feature").strip()
        body = feat.get("text", "").strip()
        
        # Split body into sentences / sub-clauses
        sentences = [s.strip() for s in re.split(r"(?<=[\.\!\?])\s+|\n+", body) if len(s.strip()) >= 15]
        if not sentences:
            sentences = [body] if len(body) >= 15 else []

        for s in sentences:
            cleaned = re.sub(r"<\/?w:[^>]+>", " ", s, flags=re.IGNORECASE)
            cleaned = re.sub(r"<\/?[^>]+>", " ", cleaned)
            cleaned = re.sub(r"\s+", " ", cleaned).strip()
            if cleaned:
                out.append({
                    "id": f"REQ-{req_id_counter:03d}",
                    "module": title,
                    "title": title,
                    "text": cleaned,
                    "priority": classify_priority(cleaned),
                })
                req_id_counter += 1

    # Extract requirements from Business Rules
    for rule in rules:
        r_title = rule.get("title", "Business Rule").strip()
        r_text = rule.get("rule", "").strip()
        cleaned = re.sub(r"\s+", " ", r_text).strip()
        if cleaned:
            out.append({
                "id": f"REQ-{req_id_counter:03d}",
                "module": r_title,
                "title": r_title,
                "text": cleaned,
                "priority": classify_priority(cleaned),
            })
            req_id_counter += 1

    # Fallback if no structured features or rules detected
    if not out:
        source_chunks = get_srs_sections(spec_text, SRS_PLAN_SECTIONS) or chunk_spec(spec_text)
        source_text = "\n\n".join(f"# {chunk.get('title')}\n{chunk.get('text')}" for chunk in source_chunks)
        normalized = normalize_spec_text(source_text)
        lines = [ln.strip() for ln in normalized.split("\n") if ln.strip()]
        
        bullet_re = re.compile(r"^(\-|\*|•|\d+[\.\)])\s+(.*)$")
        for ln in lines:
            if re.match(r"^#{1,3}\s+", ln):
                continue
            m = bullet_re.match(ln)
            text = m.group(2).strip() if m else ln
            if len(text) >= 20:
                out.append({
                    "id": f"REQ-{req_id_counter:03d}",
                    "module": "Functional Requirement",
                    "title": "System Feature",
                    "text": text,
                    "priority": classify_priority(text),
                })
                req_id_counter += 1

    return out
