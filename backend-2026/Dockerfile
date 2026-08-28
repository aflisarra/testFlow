FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
# The local Compose override runs `npm run dev`, which needs nodemon from
# devDependencies. Production deployments can use a dedicated build target.
RUN npm install

COPY . .

EXPOSE 3000

# Healthcheck — hits /health if it exists, falls back to /
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://localhost:3000/health 2>/dev/null \
      || wget -qO- http://localhost:3000/ 2>/dev/null \
      || exit 1

# Production-stable start (no nodemon).
# The dev override in docker-compose.override.yml switches this to `npm run dev`.
CMD ["node", "src/index.js"]
