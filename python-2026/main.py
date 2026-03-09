from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import subprocess

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/chat")
def chat(data: dict):
    message = data.get("message", "")

    try:
        result = subprocess.run(
            [
                r"C:\Users\MSI\AppData\Local\Programs\Ollama\ollama.exe",
                "run",
                "llama3",
                message
            ],
            capture_output=True,
            text=True,
            encoding="utf-8"
        )

        reply = result.stdout.strip()

        return JSONResponse({ "reply": reply })

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={ "reply": f"Erreur Ollama : {str(e)}" }
        )
