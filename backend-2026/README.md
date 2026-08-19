# Reback backend

Node.js/Express API for Reback. It provides authentication, users, roles, projects, test-suite management, specification ingestion, document export, and Selenium execution. AI-assisted ingestion and generation are delegated to the separate `python-2026` FastAPI service.

## Prerequisites

- Node.js 24 and npm (the version used by the Dockerfile)
- MongoDB, available locally or through a remote connection string
- The `python-2026` service for AI, ingestion, and generation features
- Google Chrome for Selenium execution features

The unit tests do not require MongoDB, FastAPI, or Chrome.

## Local setup

Run these commands from `backend-2026`:

```powershell
npm ci
Copy-Item .env.example .env
```

On macOS or Linux, copy the environment file with:

```bash
cp .env.example .env
```

Edit `.env` before starting the API. At minimum, replace both JWT placeholders and check the MongoDB connection:

| Variable | Purpose | Development default/example |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/pfe1-2026` |
| `JWT_SECRET` | Access-token signing secret | Replace the placeholder |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret | Replace the placeholder with a different secret |
| `PORT` | Express port | `3000` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins | `http://localhost:4200,http://127.0.0.1:4200` |
| `FASTAPI_BASE_URL` | URL of the `python-2026` service | `http://127.0.0.1:8000` |
| `FASTAPI_TIMEOUT_MS` | Timeout for long generation requests | `420000` |
| `FASTAPI_SECRET` | Token sent from Node to FastAPI | Replace the placeholder |
| `INTERNAL_API_TOKEN` | Token accepted by internal ingestion routes | Replace the placeholder |

`FASTAPI_SECRET` and `INTERNAL_API_TOKEN` normally use the same value as `INTERNAL_API_TOKEN` in `python-2026`. Do not commit `.env`; it is ignored by Git.

Password-reset email requires the optional `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `FRONTEND_URL` settings. Selenium API-login flows can also use `SELENIUM_LOGIN_EMAIL` and `SELENIUM_LOGIN_PASSWORD` when required by the target application.

## Run the API

Start MongoDB first, then run:

```powershell
npm run dev
```

The development server listens on `http://localhost:3000` by default and restarts when files under `src` change.

To run without automatic restart:

```powershell
npm start
```

A successful startup prints the MongoDB connection message followed by the server URL. If MongoDB is unavailable, Express does not begin listening.

For the complete application, start services in this order:

1. MongoDB.
2. `python-2026` on port `8000`.
3. This backend on port `3000`.
4. The Angular frontend on port `4200`.

The API can run without FastAPI, but AI, ingestion, generation, and AI-assisted Selenium operations will fail until FastAPI is available.

## Tests

Run the complete Node test suite:

```powershell
npm test
```

The tests use Node's built-in test runner. The current suite covers model validation, test-artifact normalization, role-review response mapping, and FastAPI URL construction.

Run one test file:

```powershell
npm test -- test/role-review-controller.test.js
```

Run tests whose names match a pattern:

```powershell
npm test -- --test-name-pattern="role-review"
```

Run with Node's test coverage report:

```powershell
npm test -- --experimental-test-coverage
```

## Other scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run with Nodemon and reload on source changes |
| `npm start` | Run once with Node |
| `npm run start:dev` | Run once with Node; currently equivalent to `npm start` |
| `npm test` | Run all Node tests |
| `npm run build` | No-op; the backend is plain CommonJS JavaScript |
| `npm run migrate:test-artifacts` | Add/normalize test-artifact metadata in MongoDB |
| `npm run migrate:role-review-state` | Add/normalize durable role-review state in MongoDB |
| `npm run seed` | Placeholder only; no seed entry point is configured |

Back up the database before running migrations.

For a new disposable development database, authorization data can be seeded manually in this order:

```powershell
node src/database/seeders/seed.actions.js
node src/database/seeders/seed.roles.js
node src/database/seeders/seed.roleActions.js
```

These seeders clear and recreate their respective collections. Do not run them against a database containing data that must be preserved.

## Docker development image

The included Dockerfile runs the Nodemon development server. The project does not currently include a `.dockerignore`; before building, create one that excludes at least local dependencies, secrets, and runtime uploads:

```gitignore
node_modules
.env
.env.*
uploads
```

Then build and run the image:

```powershell
docker build -t reback-backend .
docker run --rm -p 3000:3000 --env-file .env reback-backend
```

When MongoDB or FastAPI runs on the host, container URLs must use `host.docker.internal` instead of `127.0.0.1`. Never bake a populated `.env` into an image.

## Troubleshooting

- **MongoDB connection error:** verify MongoDB is running and `MONGODB_URI` names a reachable host and database.
- **CORS rejection:** add the exact frontend origin to `CORS_ORIGINS`, including its scheme and port, then restart the backend.
- **FastAPI unreachable:** start `python-2026`, check `FASTAPI_BASE_URL`, and ensure the shared tokens match.
- **Selenium cannot start Chrome:** install a Chrome version compatible with the installed ChromeDriver dependency and ensure Chrome is visible to the process.
- **PowerShell blocks `npm.ps1`:** use `npm.cmd` in place of `npm`, for example `npm.cmd test`.

Authentication-specific behavior is described in [AUTH_README.md](AUTH_README.md).
