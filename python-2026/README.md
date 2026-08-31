# python-2026

Service FastAPI pour :

- l'upload et l'itemisation de spécifications `.docx` ;
- le tagging déterministe des rôles ;
- la génération et l'affectation des modules pendant `/generate-plan` ;
- l'assemblage déterministe des plans de test ;
- la génération de cas de test via OpenRouter ;
- les décisions et automatisations Selenium.

## Démarrage rapide

1. Créer et activer un environnement virtuel.
2. Installer les dépendances :

```powershell
python -m pip install -r requirements.txt
```

3. Copier `.env.example` vers `.env` et remplacer les secrets.
4. Démarrer `backend-2026` avant FastAPI, car Node/MongoDB possède le store
   durable des ingestions et modules.
5. Lancer FastAPI :

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## Endpoints principaux

- `GET /health`
- `POST /upload-spec`
- `POST /generate-plan`
- `POST /generate-test-cases`
- `GET/POST /review-queue/...`
- `POST /ai/decide`
- `POST /cancel-generation`

`POST /upload-spec` n'appelle ni OpenRouter ni le modèle d'embedding. Il
persiste les items et rôles avec `module_status=pending`.

`POST /generate-plan` accepte `module_mode=ensure|regenerate`. Il génère ou
réutilise les modules, affecte les items, persiste une version puis assemble
les plans depuis les preuves `REQUIREMENT`, `ACCEPTANCE` et `NON_FUNCTIONAL`.

## Configuration OpenRouter et modules

Variables principales de `.env` :

- `OPENROUTER_API_KEY` : clé requise lorsque `USE_MOCK=false` ;Requit sur le site web officiel OpenRouter
- `OPENROUTER_MODEL` : modèle utilisé ;
- `OPENROUTER_TIMEOUT` : timeout global en secondes ;
- `OPENROUTER_CHAT_TIMEOUT` : timeout de `/chat` ;
- `OPENROUTER_TEST_PLANS_TIMEOUT` : génération des modules pendant `/generate-plan` ;
- `OPENROUTER_TEST_CASES_TIMEOUT` : génération des cas ;
- `OPENROUTER_TEST_TRANSLATOR_TIMEOUT` : traduction ;
- `OPENROUTER_MAX_TOKENS` et `OPENROUTER_TEMPERATURE` : paramètres de génération ;
- `BACKEND_API_BASE_URL` : URL du backend Node ;
- `INTERNAL_API_TOKEN` : secret partagé identique à celui de `backend-2026` ;
- `HF_HOME` : cache durable du modèle sentence-transformers ;
- `HF_TOKEN` : optionnel, recommandé pour éviter les limites anonymes Hugging Face.

Exemple minimal :

```env
OPENROUTER_API_KEY=replace-me
OPENROUTER_MODEL=google/gemini-2.5-flash
OPENROUTER_TIMEOUT=120
OPENROUTER_TEST_PLANS_TIMEOUT=120
OPENROUTER_TEST_CASES_TIMEOUT=300
BACKEND_API_BASE_URL=http://127.0.0.1:3000
INTERNAL_API_TOKEN=replace-with-the-same-token-as-backend-2026
HF_HOME=.cache/huggingface
```

Le modèle `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` est
chargé lors de la première génération de plan. En production, précharger son
cache afin d'éviter un téléchargement Hugging Face pendant une requête.

## Vérification

```powershell
python -m pip install -r requirements-dev.txt
python -m ruff check .
python -m ruff format --check .
python -m pytest
python -m pytest --cov --cov-report=term-missing
```

Pour appliquer les corrections automatiques sûres de Ruff :

```powershell
python -m ruff check . --fix
python -m ruff format .
```
