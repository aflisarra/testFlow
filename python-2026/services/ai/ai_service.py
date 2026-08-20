import json
import os
import re

import requests

from utils.json_cleaner import safe_json_loads


def extract_json(text):

    text = text.strip()

    # ✅ remove markdown ```json ```
    text = re.sub(r"```json", "", text)
    text = re.sub(r"```", "", text)

    # ✅ remove comments //...
    text = re.sub(r"//.*", "", text)

    # ✅ remove JS expressions (very important)
    text = re.sub(r"\+.*?\)", "", text)  # remove "+ Math.random()..."

    # ✅ fix trailing commas
    text = re.sub(r",\s*}", "}", text)
    text = re.sub(r",\s*]", "]", text)

    # ✅ try full parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # ✅ extract JSON array
    array_match = re.search(r"\[.*\]", text, re.DOTALL)
    if array_match:
        try:
            return json.loads(array_match.group())
        except json.JSONDecodeError:
            pass

    # ✅ extract objects individually
    matches = re.findall(r"\{.*?\}", text, re.DOTALL)

    results = []
    for m in matches:
        try:
            results.append(json.loads(m))
        except json.JSONDecodeError:
            continue

    if results:
        return results

    raise Exception(f"Invalid JSON from AI:\n{text}")


class AIService:
    def generate_json(self, prompt: str, timeout: int):

        resp = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "qwen2.5:3b-instruct",
                "prompt": prompt,
                "stream": False,
                "format": "json",  # force Ollama to output valid JSON
                "options": {
                    "temperature": 0,
                    "num_predict": int(os.getenv("OLLAMA_NUM_PREDICT", "800")),
                    "num_ctx": int(os.getenv("OLLAMA_NUM_CTX", "2048")),
                },  # deterministic, less filler text
            },
            timeout=timeout,
        )
        resp.raise_for_status()

        raw = resp.json().get("response", "").strip()
        print("🧠 RAW:", raw)

        try:
            result = safe_json_loads(raw)
        except Exception as e:
            # Don't crash the whole request if the model output was
            # imperfect — fall back to an empty dict, consistent with
            # callers expecting a dict (e.g. detect_failure calls result.get(...)).
            print("❌ JSON parse failed:", e, "\nRAW WAS:\n", raw)
            return {}

        # safe_json_loads can return a list when the LLM emits a JSON array
        # instead of an object.  Callers always call .get() on the result, so
        # normalise: unwrap a single-element list of dicts, or return {} as a
        # safe fallback so we never hand a raw list back to the caller.
        if isinstance(result, list):
            if result and isinstance(result[0], dict):
                return result[0]
            return {}
        if not isinstance(result, dict):
            return {}
        return result


def get_ai_service():
    return AIService()
