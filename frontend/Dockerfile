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
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# ---- build: production build ----
FROM deps AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are inlined at build time (public values only, never secrets).
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
COPY . .
RUN npm run build

# ---- runner: minimal, non-root production image ----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]


