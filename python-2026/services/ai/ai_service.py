import requests

class AIService:

    def generate_json(self, prompt: str, timeout: int):

        resp = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "mistral",
                "prompt": prompt,
                "format": "json"
            },
            timeout=timeout
        )

        return resp.json()


def get_ai_service():
    return AIService()