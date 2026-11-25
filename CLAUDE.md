# Claude Code Project Instructions

This repository contains an original quick-commerce grocery application.

## Stack
- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS; deploy to Vercel.
- Backend: Node.js, Express, TypeScript REST API; deploy to Render.
- Platform services: Supabase PostgreSQL, Auth, and Storage.
- Containers: Docker and Docker Compose for reproducible local development and CI.
- Source control/CI: GitHub and GitHub Actions.

## Architecture rules
1. Keep `frontend/` and `backend/` as separate applications in a monorepo.
2. Keep business logic and REST APIs in Express. Next.js consumes the API.
3. Use Supabase Auth for identity and verify access tokens in Express.
4. Keep the Supabase service-role key server-only.
5. Enforce authorization in Express and with appropriate Supabase RLS policies.
6. Recalculate all commerce totals and validate stock on the backend.
7. Use integer paise for INR monetary values.
8. Use migrations for database changes.
9. Do not add dependencies or change the stack without explaining the reason.
10. Do not copy Zepto branding, logos, or proprietary assets.

## Docker
- Provide Dockerfiles for frontend and backend, a root `compose.yaml`, and `.dockerignore` files.
- Compose should run frontend and backend and connect to the configured Supabase project.
- Do not add a local database container by default when using Supabase cloud.
- Never bake secrets into images. Keep real `.env` files out of Git.
- Document Docker build, run, logs, stop, and rebuild commands.
- Treat Vercel/Render native deployments separately from Docker-based deployment.

## Workflow
- Inspect the repository before editing.
- Work one phase at a time; do not generate the entire application in one response.
- Before each phase, state the goal, files to create/change, dependencies, and commands.
- Implement, run checks, fix errors, and report actual results.
- Ask for confirmation before moving to the next major phase.
- Keep README and `docs/` current.

## Skills
Read and follow the relevant skill under `.claude/skills/` before working on that area:
- `project-architecture`
- `frontend-nextjs`
- `backend-express`
- `supabase-data-auth`
- `docker-local-development`
- `testing-security`
- `deployment-cicd`
