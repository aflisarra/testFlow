# ================================================================================
# MAIN.PY — FastAPI Application Entry Point
# ================================================================================
#
# PURPOSE:
# This file is the main entry point for the Python FastAPI backend.
# It initializes the FastAPI application, configures CORS, and registers
# all route modules (routers) for handling API requests.
#
# SETUP INSTRUCTIONS:
# 1. Install dependencies: pip install fastapi uvicorn python-dotenv python-docx python-multipart requests
# 2. Start the server: uvicorn main:app --reload
# 3. Server runs at http://localhost:8000
#
# ================================================================================
# API ENDPOINTS:
# ================================================================================
#   GET  /                      → Health check - returns server status
#   POST /chat                  → Free chat with Ollama AI model
#   POST /upload-spec           → Upload Word document → extracts spec_text
#   POST /generate-plan         → Generate Test Plans (TP-1, TP-2, ...)
#   POST /generate-test-cases  → Generate Test Cases (TC-1.1, TC-1.2, ...)
# ================================================================================

# FastAPI framework for building REST APIs
from fastapi import FastAPI

# CORS middleware to allow cross-origin requests from frontend
from fastapi.middleware.cors import CORSMiddleware

# JSON response helper
from fastapi.responses import JSONResponse

# Subprocess for running external commands
import subprocess

# OS utilities for environment variables
import os

# Load environment variables from .env file
from dotenv import load_dotenv

# Load env vars BEFORE importing modules that read them
load_dotenv()

# Import route modules (routers) for different API endpoints
from routers import test_plans, test_cases          # noqa: E402

# Import utility functions for Ollama AI interaction
from utils.ollama import run_ollama, get_ollama_model  # noqa: E402

# Get the Ollama model name from environment (default: "mistral")
# This determines which AI model will be used for generating test plans/cases
OLLAMA_MODEL = get_ollama_model()

# Determine if mock mode is enabled (for testing without AI)
# Set USE_MOCK=true in .env to use mock data instead of calling Ollama
USE_MOCK     = os.getenv("USE_MOCK", "false").lower() in ("1", "true", "yes")


# ================================================================================
# TIMEOUT CONFIGURATION
# ================================================================================
# Configurable timeouts for different AI operations (in seconds)
# Can be overridden via environment variables
# ================================================================================

def _chat_timeout() -> int:
    """
    Get timeout for the /chat endpoint.
    Priority order:
      1) OLLAMA_CHAT_TIMEOUT (specific to chat)
      2) OLLAMA_TIMEOUT (general timeout)
      3) 300 seconds (default fallback)
    """
    raw = os.getenv("OLLAMA_CHAT_TIMEOUT", os.getenv("OLLAMA_TIMEOUT", "300"))
    try:
        return int(raw)
    except ValueError:
        return 300


# ================================================================================
# FASTAPI APP INITIALIZATION
# ================================================================================
# Create the FastAPI application instance with metadata
# ================================================================================

app = FastAPI(
    title="Ollama AI API",
    description="Test Plan & Test Cases generation with Ollama",
    version="2.0.0"
)


# ================================================================================
# CORS MIDDLEWARE CONFIGURATION
# ================================================================================
# Configure Cross-Origin Resource Sharing to allow frontend to communicate
# with this backend API. Allows all origins, methods, and headers for simplicity.
# In production, you would restrict this to specific frontend domains.
# =============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Allow all origins
    allow_methods=["*"],          # Allow all HTTP methods
    allow_headers=["*"],          # Allow all headers
)


# ================================================================================
# ROUTER REGISTRATION
# ================================================================================
# Register route modules (routers) with the FastAPI app.
# Each router handles a specific set of related endpoints.
# =============================================================================

# Register test plans router (handles /upload-spec and /generate-plan)
app.include_router(test_plans.router)

# Register test cases router (handles /generate-test-cases)
app.include_router(test_cases.router)


# ================================================================================
# ROOT ENDPOINT (Health Check)
# ================================================================================
# GET / - Returns server status and available endpoints
# ================================================================================

@app.get("/")
def root():
    """
    Health check endpoint.
    Returns server status, version, configured model, and available endpoints.
    """
    return {
        "status":    "running",
        "version":   "2.0.0",
        "model":     OLLAMA_MODEL,
        "mock_mode": USE_MOCK,
        "endpoints": {
            "upload_spec":         "POST /upload-spec",
            "generate_test_plans": "POST /generate-plan",
            "generate_test_cases": "POST /generate-test-cases",
            "chat":                "POST /chat",
        }
    }


# ================================================================================
# CHAT ENDPOINT
# ================================================================================
# POST /chat - Free-form chat with Ollama AI model
# ================================================================================

@app.post("/chat")
def chat(data: dict):
    """
    Free chat endpoint - sends a message to Ollama and returns the response.
    
    Request Body:
        {"message": "Your message here"}
    
    Returns:
        {"reply": "AI response text"}
    
    Error Codes:
        - 400: Empty message
        - 500: Ollama not running or other error
        - 504: Ollama request timeout
    """
    # Extract message from request body
    message = data.get("message", "")

    # Validate message is not empty
    if not message.strip():
        return JSONResponse(status_code=400, content={"reply": "Message is empty."})

    # If mock mode is enabled, return mock response
    if USE_MOCK:
        return JSONResponse({"reply": f"[MOCK] Received: {message[:100]}..."})

    try:
        # Call Ollama with the message and configured timeout
        reply = run_ollama(message, timeout=_chat_timeout())
        return JSONResponse({"reply": reply})

    # Handle specific error types with appropriate HTTP status codes
    except FileNotFoundError as e:
        # Ollama executable not found - likely not installed
        return JSONResponse(status_code=500, content={"reply": str(e)})
    except subprocess.TimeoutExpired:
        # Ollama took too long to respond
        return JSONResponse(status_code=504, content={"reply": "Ollama took too long."})
    except RuntimeError as e:
        # General runtime error from Ollama
        return JSONResponse(status_code=500, content={"reply": str(e)})
    except Exception as e:
        # Catch-all for any other unexpected errors
        return JSONResponse(status_code=500, content={"reply": str(e)})


# ================================================================================
# END OF MAIN.PY
# ================================================================================