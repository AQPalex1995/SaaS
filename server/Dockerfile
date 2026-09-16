# ── Land Intelligence API / Worker ─────────────────────────────
# Multi-stage build: dev deps, compile, then a slim production image.
# RUNTIME config (DATABASE_URL, REDIS_URL, secrets, ...) is injected via
# environment variables — NEVER baked into the image.

# ---- Stage 1: builder ---------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# Install production + dev dependencies (needed for `tsc` build).
COPY server/package.json server/package-lock.json ./
RUN npm ci

# Copy sources and compile to dist/.
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build

# ---- Stage 2: runtime ---------------------------------------------------
FROM node:22-alpine AS runtime

# Run as non-root for security.
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
ENV NODE_ENV=production

# Only production dependencies in the final image.
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Compiled output.
COPY --from=builder /app/dist ./dist

# Migration + healthcheck scripts ship with the image.
COPY server/drizzle ./drizzle
COPY server/drizzle.config.ts ./drizzle.config.ts
COPY server/scripts ./scripts

# Runtime requires top-level awaits removed (ESM output) — dist runs on node.
USER app

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "const p=process.env.PORT||'8080';fetch('http://127.0.0.1:'+p+'/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"

# Default entrypoint: the API. Override with `npm run worker` (or node dist/worker.js).
CMD ["node", "dist/index.js"]