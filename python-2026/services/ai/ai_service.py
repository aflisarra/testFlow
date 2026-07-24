import json
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
    except:
        pass

    # ✅ extract JSON array
    array_match = re.search(r"\[.*\]", text, re.DOTALL)
    if array_match:
        try:
            return json.loads(array_match.group())
        except:
            pass

    # ✅ extract objects individually
    matches = re.findall(r"\{.*?\}", text, re.DOTALL)

    results = []
    for m in matches:
        try:
            results.append(json.loads(m))
        except:
            continue

    if results:
        return results

    raise Exception(f"Invalid JSON from AI:\n{text}")


class AIService:
 
    def generate_json(self, prompt: str, timeout: int):
 
        resp = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "qwen2.5-coder:7b",
                "prompt": prompt,
                "stream": False,
                "format": "json",              # force Ollama to output valid JSON
                "options": {"temperature": 0},  # deterministic, less filler text
            },
            timeout=timeout,
        )
        resp.raise_for_status()
 
        raw = resp.json().get("response", "").strip()
        print("🧠 RAW:", raw)
 
        try:
            return safe_json_loads(raw)
        except Exception as e:
            # Don't crash the whole request if the model output was
            # imperfect — fall back to an empty list, consistent with
            # _extract_actions() on the router side.
            print("❌ JSON parse failed:", e, "\nRAW WAS:\n", raw)
            return {"data": []}


def get_ai_service():
    return AIService()
