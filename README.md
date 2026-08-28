# TestFlow

TestFlow runs as a Docker Compose stack with MongoDB, the Node/Express API,
the FastAPI service, and the Angular frontend.

## Open the project with Docker

### Prerequisites

- Docker Desktop with Docker Compose enabled
- The service environment files:
  - `backend-2026/.env`
  - `python-2026/.env`

If the environment files do not exist yet, create them from the examples:

```powershell
Copy-Item backend-2026/.env.example backend-2026/.env
Copy-Item python-2026/.env.example python-2026/.env
```

On macOS or Linux, use:

```bash
cp backend-2026/.env.example backend-2026/.env
cp python-2026/.env.example python-2026/.env
```

Replace the placeholder secrets before starting. The internal API token must
match in both service environment files.

### Start the application

From the repository root, build and start all services:

```powershell
docker compose up --build
```

When the services are ready, open:

- Frontend: <http://localhost:4200>
- Backend API: <http://localhost:3000>
- FastAPI service: <http://localhost:8000>
- FastAPI documentation: <http://localhost:8000/docs>

Press `Ctrl+C` to stop the foreground process. To run the stack in the
background instead:

```powershell
docker compose up --build -d
```

The default local setup automatically includes `docker-compose.override.yml`,
which enables live reload and mounts the source directories into the
containers.

### Useful Docker commands

```powershell
# Show service status
docker compose ps

# Follow logs from all services
docker compose logs -f

# Follow logs from one service
docker compose logs -f backend
docker compose logs -f python
docker compose logs -f reback-front

# Rebuild after dependency or Dockerfile changes
docker compose up --build -d

# Stop and remove the containers
docker compose down
```

To also delete the MongoDB data and Hugging Face model-cache volumes, use
`docker compose down -v`. This permanently removes locally stored application
data.

To start only the base Compose configuration without the development
overrides, run:

```powershell
docker compose -f docker-compose.yml up --build
```

The first Python startup can take longer while the sentence-transformers model
is downloaded and cached.
