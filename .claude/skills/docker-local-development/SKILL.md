---
name: docker-local-development
description: Use when adding Dockerfiles, Docker Compose, container workflows, local development environments, or troubleshooting containers.
---

# Docker and Local Development Skill

## Goal
Make the frontend and Express backend reproducible in containers for local development and testing. Supabase cloud remains a managed external service unless the user explicitly chooses the Supabase local development stack.

## Required deliverables
- `frontend/Dockerfile`
- `backend/Dockerfile`
- root `compose.yaml`
- `.dockerignore` files for frontend and backend
- `.env.example` files with placeholders only
- README instructions for build, start, logs, stop, and rebuild

## Dockerfile practices
- Prefer supported, pinned Node.js LTS base-image tags and explain upgrades.
- Use multi-stage builds for production images where practical.
- Use non-root users in runtime images.
- Use `npm ci` when a lockfile exists.
- Copy dependency manifests before source to improve layer caching.
- Do not copy `.env` files or secrets into images.
- Add health checks where practical.
- Keep images small and avoid development tooling in production stages.
- Ensure Next.js standalone output is configured if the production Dockerfile relies on it.
- Ensure Express listens on `0.0.0.0` inside the container.

## Compose practices
- Provide services for frontend and backend with clear ports, environment variables, and dependency/health behavior.
- Do not add a local PostgreSQL container if the project is using Supabase cloud by default; explain that the containers connect to the Supabase project.
- Do not assume `depends_on` means an external Supabase service is ready.
- Use named volumes only where they provide value, such as development dependency caching.
- Keep local development commands distinct from production deployment commands.
- Never bake secrets into image layers or commit real `.env` files.

## Commands to document
- `docker compose config`
- `docker compose build`
- `docker compose up`
- `docker compose up --build`
- `docker compose logs -f`
- `docker compose down`

Explain that Vercel and Render can build/deploy the applications natively from GitHub; Docker is useful for local parity, CI, and optional container-based deployment. Do not claim Vercel deploys the frontend from the provided Docker image unless that deployment mode is explicitly configured and supported.

## Verification
Build both images and run the services. Check container logs and health endpoints. Report failures honestly and do not claim Docker works without running it.
