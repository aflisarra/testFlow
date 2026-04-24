# python-2026

Service FastAPI pour:
- upload de spec (`.docx`)
- generation de test plans
- generation de test cases
- chat avec Ollama

## Demarrage rapide

1. Creer et activer un environnement virtuel.
2. Installer les dependances:
```bash
pip install -r requirements.txt
```
3. Copier `.env.example` vers `.env` puis ajuster les valeurs.
4. Lancer l'API:
```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## Endpoints principaux

- `GET /` health check
- `POST /chat`
- `POST /upload-spec`
- `POST /generate-plan`
- `POST /generate-test-cases`

## Timeouts Ollama

Variables disponibles dans `.env`:
- `OLLAMA_TIMEOUT`: timeout global (defaut 300s)
- `OLLAMA_CHAT_TIMEOUT`: timeout pour `/chat` (fallback: `OLLAMA_TIMEOUT`)
- `OLLAMA_TEST_PLANS_TIMEOUT`: timeout pour `/generate-plan` (fallback: `OLLAMA_TIMEOUT`)
- `OLLAMA_TEST_CASES_TIMEOUT`: timeout pour `/generate-test-cases` (fallback: `OLLAMA_TIMEOUT`)
- `MODEL_NAME`: alias optionnel pour `OLLAMA_MODEL`
- `OLLAMA_HTTP_TIMEOUT`: timeout pour l'appel HTTP Ã  Ollama (defaut 20s)
- `OLLAMA_NUM_PREDICT`: limite de tokens de sortie (optionnel, speed-up)
- `OLLAMA_TEMPERATURE`: tempÃ©rature (defaut 0.2)

Exemple:
```env
OLLAMA_TIMEOUT=300
OLLAMA_CHAT_TIMEOUT=300
OLLAMA_TEST_PLANS_TIMEOUT=300
OLLAMA_TEST_CASES_TIMEOUT=420
```

## Checklist priorisee

### Quick wins (1h)

- Ajouter ce README (setup + run + endpoints + timeouts). Done.
- Fixer les timeouts via `.env` pour eviter les 504 sur specs longues. Done.
- Ajouter une commande de lancement standard (Makefile ou script shell/powershell).
- Restreindre `CORS` en production (ne pas laisser `*`).
- Ajouter un fichier `tests/smoke_test.py` avec `fastapi.testclient` sur `GET /`.

### Court terme (1 jour)

- Ajouter `pyproject.toml` avec outils qualite:
  - `ruff`
  - `black`
  - `mypy` (optionnel au debut)
  - `pytest`
- Geler les versions de dependances (ou lockfile).
- Ajouter tests API minimaux:
  - health check
  - validation upload `.docx`
  - generation mock (`USE_MOCK=true`)
- Centraliser les logs (niveau, message, context request).
- Ajouter CI (GitHub Actions):
  - installation
  - lint
  - tests

### Moyen terme (1 semaine)

- Dockeriser le service (`Dockerfile` + `.dockerignore`).
- Ajouter environnements dev/prod explicites.
- Ajouter monitoring basique (latence endpoints, erreurs 5xx, timeouts).
- Ajouter politique retry/backoff sur appels externes si necessaire.
