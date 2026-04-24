# ============================================================
# utils/ollama.py
#
# FIX 502 : mistral retourne souvent du texte AUTOUR du JSON
# FIX ANSI : suppression des séquences d'échappement terminal
# ============================================================

import subprocess
import shutil
import json
import re
import os


def get_ollama_model() -> str:
    return os.getenv("OLLAMA_MODEL", "mistral")


def get_ollama_path() -> str:
    path = shutil.which("ollama")
    if path:
        return path
    return r"C:\Users\MSI\AppData\Local\Programs\Ollama\ollama.exe"


def _default_timeout() -> int:
    try:
        return int(os.getenv("OLLAMA_TIMEOUT", "300"))
    except ValueError:
        return 300


def _strip_ansi(text: str) -> str:
    """
    Supprime les séquences d'échappement ANSI de la réponse Ollama.
    Exemple : \x1b[4D  \x1b[1D  \x1b[3D  → supprimés
    Ces caractères viennent du terminal interne d'Ollama et cassent le JSON.
    """
    ansi_escape = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
    return ansi_escape.sub("", text)


def _strip_code_fences(text: str) -> str:
    """Supprime les ``` que mistral ajoute souvent."""
    trimmed = (text or "").strip()
    trimmed = re.sub(r"^```(?:json|JSON)?\s*", "", trimmed)
    trimmed = re.sub(r"\s*```$", "", trimmed)
    return trimmed.strip()


def _extract_json_array(text: str):
    """
    Extrait le premier tableau JSON valide du texte.
    Mistral peut écrire du texte avant/après le JSON.
    """
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "[":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start: i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    start = None
    return None


def _extract_json_object(text: str):
    """
    Extrait le premier objet JSON valide du texte.
    Certains modèles wrappent le tableau dans un objet.
    """
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start: i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    start = None
    return None


def parse_json_from_ollama(text: str):
    """
    Parse la réponse d'Ollama en JSON avec 5 stratégies en cascade.

    Mistral peut retourner :
      - Du JSON direct                          → stratégie 1
      - ```json [...] ```                       → stratégie 2
      - "Here are the test cases: [...]"        → stratégie 3
      - {"test_cases": [...]}                   → stratégie 4
      - JSON avec virgules finales (invalide)   → stratégie 5

    Raises ValueError si aucune stratégie ne fonctionne.
    """
    # ── Nettoyage ANSI en premier (avant tout parsing) ──────
    raw = _strip_ansi((text or "").strip())

    # ── Stratégie 1 : JSON direct ───────────────────────────
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # ── Stratégie 2 : strip les ``` puis retry ──────────────
    stripped = _strip_code_fences(raw)
    if stripped != raw:
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

    # ── Stratégie 3 : extraire le premier tableau JSON ──────
    arr = _extract_json_array(stripped or raw)
    if arr is not None:
        return arr

    # ── Stratégie 4 : extraire le premier objet JSON ────────
    obj = _extract_json_object(stripped or raw)
    if obj is not None:
        for key in ("test_cases", "testCases", "cases", "results", "items"):
            if isinstance(obj.get(key), list):
                return obj[key]
        # Si c'est un objet unique avec les clés d'un test case, le wrapper dans une liste
        if isinstance(obj, dict) and all(k in obj for k in ("id", "title", "steps", "expected_result")):
            return [obj]
        return obj

    # ── Stratégie 5 : nettoyer les virgules finales (JSON5) ─
    cleaned = re.sub(r",\s*([}\]])", r"\1", stripped or raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    arr2 = _extract_json_array(cleaned)
    if arr2 is not None:
        return arr2

    raise ValueError(
        f"Cannot parse JSON from Ollama response.\n"
        f"Raw output (first 500 chars):\n{raw[:500]}"
    )


def run_ollama(prompt: str, timeout: int | None = None) -> str:
    """
    Envoie un prompt à Ollama (par l'API HTTP d'abord, via subprocess en fallback).

    Args:
        prompt:  Texte envoyé au LLM.
        timeout: Secondes avant TimeoutExpired.
                 Si None → lit OLLAMA_TIMEOUT (.env) ou 300s par défaut.
    """
    effective_timeout = timeout if timeout is not None else _default_timeout()

    # Essaie d'utiliser l'API locale en priorité (pas de terminal == pas d'anomalies ANSI/wrapping)
    import urllib.request
    import urllib.error
    import json
    
    try:
        url = "http://127.0.0.1:11434/api/generate"
        req_body = {
            "model": get_ollama_model(),
            "prompt": prompt,
            "stream": False,
            "options": {"num_ctx": 4096}
        }
        data = json.dumps(req_body).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        
        with urllib.request.urlopen(req, timeout=effective_timeout) as response:
            resp_body = response.read().decode("utf-8")
            js = json.loads(resp_body)
            # Pas besoin de nettoyer les séquences ANSI ici
            return js.get("response", "")
    except Exception as e:
        print(f"Ollama HTTP API fallback because of: {e}")
        pass

    import os
    # Fallback CLI
    result = subprocess.run(
        [get_ollama_path(), "run", get_ollama_model()],
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=effective_timeout,
        env={**os.environ, "TERM": "dumb"}  # évite le redessin et la coloration
    )

    stdout = (result.stdout or "").strip()
    if stdout:
        return _strip_ansi(stdout)

    stderr = (result.stderr or "").strip()
    if result.returncode and stderr:
        raise RuntimeError(stderr)

    raise RuntimeError(stderr or "Ollama returned an empty response.")