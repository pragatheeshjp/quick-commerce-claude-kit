# Swiftcart

**Swiftcart** is an original quick-commerce grocery application (inspired by the capabilities of apps like Zepto, with original branding and design). Customers pick a delivery pincode, browse and search products, build a cart, check out and track orders. Admins manage the catalog, stock, orders and other admins.

The frontend (Next.js App Router, React, Tailwind) never calculates prices. The Express API owns all business rules. Postgres functions in Supabase make checkout and cancellation atomic: they re-read prices, lock stock to prevent overselling, apply coupons, and make retries idempotent. Prices are stored as integer paise, and row-level security means browsers cannot write to the database directly.

Includes Docker Compose for local development, GitHub Actions CI, a Render blueprint, a manual migration workflow and a pre-push hook.

| Layer | Tech | Port |
|---|---|---|
| `frontend/` | Next.js (App Router), React, TypeScript, Tailwind | 3000 |
| `backend/` | Node.js, Express 5, TypeScript, Zod | 4000 |
| Data/Auth/Storage | Supabase (Postgres, Auth, Storage, RLS) | - |

Docs: [architecture](docs/architecture.md) · [database](docs/database.md) · [REST API](docs/api.md) · [frontend](docs/frontend.md) · [testing](docs/testing.md) · [git hooks](docs/git-hooks.md) · [CI and deployment](docs/deployment.md).

**Status:** the full shopping flow (browse, search, auth, cart, checkout, orders) and the admin console (orders, products, stock, categories, admins) are built and covered by unit tests, with live tests against Supabase run manually. Not included yet: online payments, product image upload, editing a saved address, an admin audit log. Deployment to Vercel, Render and a production Supabase project is documented but not set up yet.

## Run with Docker (recommended)

```bash
docker compose config        # validate
docker compose build         # build images
docker compose up --build    # build + start (add -d for background)
docker compose logs -f       # follow logs (append a service name to filter)
docker compose down          # stop and remove containers
docker compose build --no-cache && docker compose up -d   # clean rebuild
```

- Frontend: http://localhost:3000 - Backend health: http://localhost:4000/api/v1/health
- Compose uses the `dev` image targets with bind mounts for hot reload. The `runner` targets are the
  production images (`docker build --target runner ...`).
- No database container: Supabase is a managed cloud service. Vercel and Render deploy natively from
  GitHub; Docker is for local parity, CI and optional container deployment.

### Behind TLS-inspecting antivirus/proxy (e.g. Avast Web Shield)
`npm ci` in containers fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Export your root CA as PEM into
`certs/` (e.g. `certs/avast-root.pem`). It is git-ignored and used only by build/dev stages, never the
runtime image. Verification stays enabled.

## Run without Docker

```bash
cd backend  && cp .env.example .env && npm install && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev
```

## Checks
`npm run lint`, `npm run typecheck`, `npm run build`, `npm test` and `npm run test:coverage` in both apps.
`npm run test:live` (backend) runs against a real Supabase project. See [docs/testing.md](docs/testing.md).

## Git pre-push hook
Installing dependencies in `backend/` or `frontend/` enables a pre-push hook that blocks secrets, direct pushes to `main`, edited migrations, and failing lint/typecheck/tests for the changed app. See [docs/git-hooks.md](docs/git-hooks.md).

## Claude Code kit
`CLAUDE.md` and `.claude/skills/` hold the project instructions. Work proceeds one phase at a time.

## Docker note: changed dependencies
Compose caches `node_modules` in named volumes. After editing a `package.json`, run
`docker compose down -v && docker compose up -d --build` or the container will miss new packages.
`backend/.env` (real Supabase URL and service-role key) is required; copy from `backend/.env.example`.


