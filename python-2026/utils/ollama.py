# ============================================================
# utils/ollama.py — Helpers pour appeler Ollama
# ============================================================

import subprocess
import shutil
import json
import os

def get_ollama_model() -> str:
    # Read env at runtime (main.py loads .env, but this also supports direct imports).
    return os.getenv("OLLAMA_MODEL", "llama3")


def get_ollama_path() -> str:
    path = shutil.which("ollama")
    if path:
        return path
    return r"C:\Users\MSI\AppData\Local\Programs\Ollama\ollama.exe"


def _strip_code_fences(text: str) -> str:
    trimmed = (text or "").strip()
    if not trimmed.startswith("```"):
        return trimmed
    trimmed = trimmed.replace("```json", "```").replace("```JSON", "```")
    lines = trimmed.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def parse_json_from_ollama(text: str):
    raw = _strip_code_fences(text)

    # Essai 1 : JSON direct
    try:
        return json.loads(raw)
    except Exception:
        pass

    # Essai 2 : array JSON dans le texte
    l, r = raw.find("["), raw.rfind("]")
    if l != -1 and r > l:
        try:
            return json.loads(raw[l: r + 1])
        except Exception:
            pass

    # Essai 3 : objet JSON dans le texte
    l, r = raw.find("{"), raw.rfind("}")
    if l != -1 and r > l:
        try:
            return json.loads(raw[l: r + 1])
        except Exception:
            pass

    raise ValueError(f"Cannot parse JSON from Ollama:\n{raw[:300]}")


def run_ollama(prompt: str) -> str:
    result = subprocess.run(
        [get_ollama_path(), "run", get_ollama_model()],
        input=prompt,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
    )
    stdout = (result.stdout or "").strip()
    if stdout:
        return stdout
    stderr = (result.stderr or "").strip()
    if result.returncode and stderr:
        raise RuntimeError(stderr)
    raise RuntimeError(stderr or "Ollama returned an empty response.")
