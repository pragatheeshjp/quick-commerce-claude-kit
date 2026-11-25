---
name: project-architecture
description: Use when planning or changing the quick-commerce application's architecture, monorepo structure, module boundaries, or cross-layer integrations.
---

# Project Architecture Skill

## Product context
Build an original quick-commerce grocery application inspired by the capabilities of Zepto, without copying its branding, assets, or proprietary design.

## Required stack
- TypeScript throughout.
- Frontend: React + Next.js App Router, deployed to Vercel.
- Backend: Node.js + Express REST API, deployed to Render.
- Data/auth/storage: Supabase PostgreSQL, Supabase Auth, Supabase Storage.
- Local development and reproducible services: Docker and Docker Compose.
- Source control and CI: GitHub and GitHub Actions.

## Architecture rules
- Keep frontend and backend as separate applications in one monorepo.
- Put business rules and REST endpoints in Express. Do not duplicate core business logic in Next.js route handlers.
- Next.js calls the Express API over HTTP.
- Express validates Supabase access tokens and enforces authorization.
- Supabase is the managed database/auth/storage provider. Do not assume the Supabase cloud stack itself runs inside the project's Docker Compose environment.
- Use a repository/service/controller separation in the backend where it improves clarity; avoid needless abstraction.
- Use shared TypeScript contracts only when a clear shared package is justified. Do not introduce a workspace/package manager without explaining why.
- Keep secrets on the server. Never expose service-role keys to the browser.

## Core domains
Authentication/profiles, categories, products, inventory, carts, addresses, coupons, orders, payments, and administration.

## Implementation workflow
1. Inspect the current repository before changing it.
2. Explain the proposed change and affected files.
3. Implement one coherent vertical slice at a time.
4. Run lint, typecheck, tests, and relevant build commands.
5. Update documentation and `.env.example` files.
6. Summarize changes, commands run, outcomes, and remaining work.

Do not generate the whole application in one pass. Work phase by phase and wait for user confirmation at phase boundaries.
