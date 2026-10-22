# ---- Stage 1: install all dependencies (including dev tools) ---------------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 is a native module; these tools compile it if no prebuilt
# binary is available for the platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: compile TypeScript and drop dev dependencies -----------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- Stage 3: the runtime image ---------------------------------------------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_SQLITE_PATH=/app/data/vehicles.sqlite
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# The SQLite database file lives here; mount a volume to keep it.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

# Never run as root inside the container.
USER node
EXPOSE 3000

# Docker marks the container "unhealthy" if /health stops answering.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Exec form: Node receives SIGTERM directly and shuts down gracefully.
CMD ["node", "dist/main.js"]
