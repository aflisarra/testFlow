# Reback Angular frontend

Angular 19 frontend for Reback. The runnable application is in `Admin`; the `Documentation` directory contains the original static theme documentation.

## Prerequisites

- Node.js 24 and npm (the version used by the Dockerfile)
- Google Chrome for the Karma unit-test suite
- The Reback backend on `http://localhost:3000` for application features

## Local setup

All Angular commands must be run from the `Admin` directory, not from the `Reback-Angular_v1.0` root:

```powershell
cd Admin
npm install
```

`Admin` contains a Yarn Classic lockfile but no npm lockfile. The Dockerfile uses npm, so `npm install` is the documented path. If the team chooses Yarn instead, use Yarn consistently and do not mix package managers in the same working tree.

## Run the application

Start the development server:

```powershell
npm start
```

Open `http://localhost:4200`. Angular watches the source tree and reloads the browser after changes.

The development environment in `Admin/src/environments/environment.ts` sends API requests to `http://localhost:3000`. Start the backend before testing signed-in or data-driven features. The backend must also allow `http://localhost:4200` in its `CORS_ORIGINS` setting.

For the complete application, use four terminals and start:

1. MongoDB.
2. `python-2026` on port `8000`.
3. `backend-2026` on port `3000`.
4. This Angular app from `Reback-Angular_v1.0/Admin` on port `4200`.

## Tests

Run the interactive Karma/Jasmine test runner:

```powershell
npm test
```

Chrome opens and the tests rerun when files change. For a one-time headless run suitable for CI:

```powershell
npm test -- --watch=false --browsers=ChromeHeadless
```

Generate a coverage report under `Admin/coverage`:

```powershell
npm test -- --watch=false --browsers=ChromeHeadless --code-coverage
```

Run static checks separately:

```powershell
npm run lint
npm run stylelint
```

Automatically fix supported stylesheet issues with `npm run stylelint:fix`. Run `npm run format` to rewrite TypeScript and HTML files with Prettier; review those changes before committing them.

## Build

Create an optimized production build:

```powershell
npm run build
```

Build output is written under `Admin/dist/reback`. The production environment sets `apiUrl` to an empty string, so a deployed build expects the backend API to be available on the same origin (typically through a reverse proxy). Update `Admin/src/environments/environment.prod.ts` before building if the production API is hosted elsewhere.

Create a continuously rebuilt development bundle with:

```powershell
npm run watch
```

## Available scripts

| Command | Description |
| --- | --- |
| `npm start` | Serve the app at `http://localhost:4200` |
| `npm run build` | Create an optimized production build |
| `npm run watch` | Rebuild on changes using the development configuration |
| `npm test` | Run Karma/Jasmine tests in watch mode |
| `npm run lint` | Run Angular ESLint |
| `npm run stylelint` | Check CSS and SCSS |
| `npm run stylelint:fix` | Fix supported CSS and SCSS issues |
| `npm run format` | Format TypeScript and HTML source files |

## Docker development image

The project does not currently include a `.dockerignore`. Before building, create `Admin/.dockerignore` with at least:

```gitignore
node_modules
dist
.angular
```

Then build from the `Admin` directory:

```powershell
docker build -t reback-frontend .
docker run --rm -p 4200:4200 reback-frontend
```

Open `http://localhost:4200`. This image runs Angular's development server; it is not a production web-server image.

## Troubleshooting

- **API calls fail or show CORS errors:** confirm the backend is on port `3000` and allows `http://localhost:4200`.
- **Karma cannot launch Chrome:** install Chrome and ensure its executable is available. In CI, set `CHROME_BIN` when Chrome is installed at a nonstandard path.
- **Dependency or Angular CLI errors:** remove no files automatically; first confirm the terminal is in `Admin` and that the active Node version is compatible.
- **PowerShell blocks `npm.ps1`:** use `npm.cmd` in place of `npm`, for example `npm.cmd start`.

Additional theme installation and customization notes are available in `Documentation/index.html`.
