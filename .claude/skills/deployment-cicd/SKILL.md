---
name: deployment-cicd
description: Use when configuring GitHub workflows, Vercel, Render, production environment variables, release processes, or deployment documentation.
---

# Deployment and CI/CD Skill

## Hosting topology
- Next.js frontend: Vercel.
- Express API: Render.
- PostgreSQL/Auth/Storage: Supabase.
- Source control: GitHub.
- Docker: local development, reproducible CI builds, and optional container deployment.

## CI
Create GitHub Actions workflows only after identifying the package manager and lockfiles. CI should install deterministically and run lint, typecheck, tests, and production builds for affected applications. Do not put secrets in workflow files.

## Vercel
Document connecting the frontend directory/project, build settings, and environment variables such as `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and the publishable/anon key. Only public Supabase values belong in browser environment variables.

## Render
Document deploying the backend from its directory, build/start commands, health-check path, `PORT` handling, and server-only environment variables. Configure CORS with the exact production frontend origin(s).

## Supabase
Document applying migrations, configuring Auth redirect URLs, RLS, Storage policies, and production secrets. Do not commit credentials.

## Docker clarification
Docker is not mandatory for Vercel or Render's native Git-based deployments. Keep Dockerfiles and Compose for local parity and CI; use Render's Docker deployment only if intentionally selected and configured.

## Release verification
After deployment, verify frontend loading, API health, authentication, product browsing, cart, checkout, and authorization. Never state that a deployment succeeded without observing the platform result.
