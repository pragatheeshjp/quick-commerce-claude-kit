# Architecture

## Shape
Monorepo with two independent apps. The browser talks only to Express over HTTP; Express (later) talks
to Supabase.

```
Browser -> Next.js (frontend, :3000) -> Express REST /api/v1 (backend, :4000) -> Supabase (Postgres/Auth/Storage)
```

## Rules (from CLAUDE.md)
- Business logic and REST endpoints live in Express; Next.js is a client.
- Supabase Auth identifies users; Express verifies tokens. Service-role key is server-only.
- Money is integer paise; totals and stock are recalculated on the backend.
- Schema changes via migrations. No Zepto branding or assets.

## Layout
```
frontend/  src/app, src/components (features/lib/types/utils added as needed)
backend/   src/{config,routes,middleware}, app.ts (createApp), server.ts (listen)
           controllers/services/repositories/validators added per feature
certs/     optional local CA PEMs for building behind TLS inspection (git-ignored)
compose.yaml  frontend + backend, dev targets
```

## Decisions
- **No workspace tool** (npm workspaces/turbo): two apps share no code yet.
- **Express 5, Zod, Helmet, CORS allowlist, pino**: validation, security headers, structured logs per skill.
- **Vitest + Supertest**: backend tests; `createApp()` is separate from `listen()` for testability.
- **Node 22 LTS (alpine)** images, multi-stage, non-root runtime, healthchecks.
- **System font stack**: `next/font/google` removed so builds need no network access to Google.
- Frontend `output: "standalone"` for a small production image.
