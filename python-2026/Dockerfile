FROM python:3.12-slim

ARG PYTORCH_INDEX_URL=https://download.pytorch.org/whl/cpu

# Keep Python output unbuffered and don't write .pyc files in the container
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Point HF / sentence-transformers cache at the named volume mount
    HF_HOME=/cache/huggingface

WORKDIR /app

COPY requirements.txt .
# sentence-transformers depends on PyTorch. PyPI's Linux PyTorch wheel pulls
# the complete CUDA runtime by default, which is unnecessary for this service
# and can exhaust Docker Desktop's builder storage. Install the CPU wheel first;
# the requirements pass will then reuse it instead of resolving nvidia-* packages.
RUN python -m pip install --no-cache-dir --only-binary=:all: \
      --index-url "${PYTORCH_INDEX_URL}" torch \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Healthcheck — polls the FastAPI /health endpoint
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" \
      || exit 1

# Production-stable start (no --reload).
# The dev override in docker-compose.override.yml switches this to uvicorn --reload.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
