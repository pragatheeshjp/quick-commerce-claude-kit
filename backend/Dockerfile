# syntax=docker/dockerfile:1

ARG NODE_VERSION=22-alpine

# ---- base: build/dev tooling image. Optionally trusts extra CA certs from ./certs
# (needed behind TLS-inspecting antivirus/proxies). Never used by the runtime stage. ----
FROM node:${NODE_VERSION} AS base
COPY --from=certs . /usr/local/share/extra-ca/
RUN cat /usr/local/share/extra-ca/*.pem > /usr/local/share/extra-ca.pem 2>/dev/null || touch /usr/local/share/extra-ca.pem
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/extra-ca.pem
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci
# ---- dev: hot-reload target used by compose ----
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runner: production deps + compiled JS, non-root ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=4000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health >/dev/null || exit 1
CMD ["node", "dist/server.js"]

