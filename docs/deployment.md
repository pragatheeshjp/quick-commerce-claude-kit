# CI and deployment

| Piece | Where | How it deploys |
|---|---|---|
| Frontend (Next.js) | **Vercel** | Native Git deployment of the `frontend/` directory |
| API (Express) | **Render** | Native Git deployment of `backend/`, described by `render.yaml` |
| Database, Auth, Storage | **Supabase** | SQL migrations in `supabase/migrations/` |
| Source + CI | **GitHub** | `.github/workflows/` |

Docker is for **local parity and CI**. Vercel and Render build from Git natively; they do not use the Dockerfiles
unless you deliberately switch Render to Docker deployment.

> **Status:** the CI workflow and config files in this repo were validated locally (workflow lint, clean-checkout
> run of the same commands in Node 22, secret/ignore checks). Nothing has been deployed yet: no GitHub repo,
> Vercel project or Render service exists until you create them. Section 6 lists what to verify after the first
> real deployment.

## 1. Use a separate production Supabase project
The project used while developing (`Quick_commerce`) contains dev seed data and test users. Create a second
Supabase project for production, apply the migrations to it (section 4), and **do not** run `supabase/seed.sql`
there. Keep the dev project for development.

## 2. GitHub and CI

### One-time
1. Create a GitHub repository and push this folder (the root already has a `.gitignore` that excludes `.env`
   files, `certs/*.pem`, `node_modules` and build output).
2. Repository -> Settings -> Branches: protect `main` and require these status checks to pass before merging:
   **Backend**, **Frontend**, **Repo hygiene**, **Docker images build and start**.

### What `ci.yml` does (on every pull request and push to `main`)
- **Backend / Frontend:** `npm ci` (deterministic, from `package-lock.json`), lint, typecheck, tests with a coverage
  report, production build, and `npm audit --omit=dev --audit-level=high`. Node 22, matching the Dockerfiles. The
  coverage table appears on the run's Summary page and the HTML report is uploaded as an artifact (report-only, no
  threshold; see `docs/testing.md`).
- **Repo hygiene:** fails if a real `.env`, `.pem`/`.key` file, Supabase secret key or JWT is tracked; checks
  migration filenames are well-formed and have unique timestamps.
- **Docker:** validates `compose.yaml`, builds both production images, starts them with placeholder credentials,
  checks `/api/v1/health` and `/login`, and checks both run as a non-root user.
- The workflow uses **no secrets**. The frontend build uses obviously-fake public placeholders.

### What CI deliberately does not do
- The **live tests** (`npm run test:live` in `backend/`) hit a real Supabase project, create users and write data.
  Run them manually against the dev project before releases. If you later want them in CI, use a dedicated
  throwaway Supabase project and store its keys as GitHub Secrets; never point CI at production.
- It does not deploy. Vercel and Render deploy from Git (below).

Dependabot (`.github/dependabot.yml`) opens weekly grouped PRs for npm, Docker base images and GitHub Actions.
For stronger supply-chain protection, pin third-party actions to commit SHAs.

## 3. Deploy the API on Render
`render.yaml` at the repo root is a Blueprint for the API.

1. Render dashboard -> **New -> Blueprint**, connect the GitHub repo, pick `main`. Render reads `render.yaml`.
2. When prompted, enter the three `sync: false` values (they are never stored in Git):
   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | production project URL, e.g. `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | production **secret / service-role** key (server-only) |
   | `CORS_ORIGINS` | the **exact** frontend origin(s), comma separated, no trailing slash, e.g. `https://swiftcart.vercel.app` |
3. What the Blueprint sets: root directory `backend`; build `npm ci --include=dev && npm run build`; start
   `npm start` (`node dist/server.js`); health check `/api/v1/health`; `autoDeployTrigger: checksPass` (deploy only
   after GitHub CI passes); `NODE_ENV=production`; region `singapore` (closest to a Seoul Supabase project).
4. `PORT` is provided by Render and read by the app; it binds `0.0.0.0`. In production the app trusts one proxy
   hop so rate limiting sees real client IPs.
5. Notes:
   - `--include=dev` is required: Render sets `NODE_ENV=production` for builds, which would otherwise skip
     `typescript` and fail the build.
   - `NODE_VERSION=22` is set as an environment variable. I could not confirm in Render's Blueprint reference
     how Node versions are selected, so check the first build log shows Node 22 (the app needs >= 22;
     `package.json` also declares `engines.node >= 22`).
   - The `free` plan spins down when idle, so the first request after a pause is slow. Use a paid plan for real
     traffic.
   - Changing `CORS_ORIGINS` later requires editing it in the Render dashboard and redeploying.

## 4. Supabase production setup

### Apply migrations
Option A (recommended): the manual workflow **Apply database migrations** (`db-migrate.yml`).
1. Repo -> Settings -> Environments -> create **production**, add required reviewers.
2. In that environment add the secrets `SUPABASE_ACCESS_TOKEN` (an account access token) and
   `SUPABASE_DB_PASSWORD`, and the variable `SUPABASE_PROJECT_REF` (the production project ref).
3. Actions -> *Apply database migrations* -> Run workflow, typing the project ref to confirm. A reviewer approves;
   it shows a dry run then applies. **This workflow has not been run yet**; run it once and read the output
   before relying on it. (The same `supabase db push --remote` command was used successfully from a laptop.)

Option B: from a laptop: `npx supabase login`, `npx supabase link --project-ref <prod-ref>`,
`npx supabase db push --remote`.

Never edit a migration that was already applied; add a new one.

### Create the first admin
Sign up in the deployed app (or create the user in the dashboard), then run once in the SQL editor:
```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com' on conflict do nothing;
```
After that, admins manage other admins in the app (Admin -> Admins).

### Authentication settings (Dashboard -> Authentication)
- **URL Configuration:** Site URL = your production frontend URL; Redirect URLs include
  `https://<your-domain>/**` (needed for password reset and email confirmation). Remove `localhost` entries from
  production if the project is production-only.
- **Email:** keep "Confirm email" **on** in production, and configure a real SMTP provider: the built-in sender is
  heavily rate limited and meant for testing.
- **API keys:** disable the legacy `anon`/`service_role` keys once everything uses the new publishable/secret keys.
- Enable backups appropriate to your plan.

### Security reminders
RLS is enabled on every table with no client write policies; all writes go through the API using the service
role. The service-role key must exist only in Render's environment, never in Vercel, GitHub (except as a
scoped secret for the migration workflow's *access token*, which is a different credential) or the browser.

## 5. Deploy the frontend on Vercel
1. Vercel -> **Add New Project** -> import the GitHub repo.
2. **Root Directory:** `frontend`. Framework preset: Next.js (auto-detected). Build/install commands: defaults
   (`npm ci` is used when a lockfile exists; `next build`).
3. Environment variables (Production, and Preview if you use previews):
   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | the Render service URL, e.g. `https://swiftcart-api.onrender.com` |
   | `NEXT_PUBLIC_SUPABASE_URL` | production project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production **publishable** key (public by design) |

   `NEXT_PUBLIC_*` values are inlined at **build time**: after changing one, redeploy.
   Do **not** set `API_INTERNAL_URL` on Vercel (it is only for Docker Compose, where the backend is reached by
   service name); server rendering then calls `NEXT_PUBLIC_API_URL`.
   Never add the service-role key here.
4. Vercel -> Settings -> Git: enable deployments from `main`; to gate on CI, use GitHub branch protection (section 2)
   so only merged, passing code reaches `main`.
5. `output: "standalone"` in `next.config.ts` exists for the Docker image; Vercel does not use it.

### Order for the first deployment
1. Create the production Supabase project, apply migrations.
2. Deploy the API on Render with a **placeholder** `CORS_ORIGINS`; note its URL.
3. Deploy the frontend on Vercel with `NEXT_PUBLIC_API_URL` = the Render URL; note its URL.
4. Set Render's `CORS_ORIGINS` to the exact Vercel origin and redeploy the API.
5. Set Supabase Auth Site URL / Redirect URLs to the Vercel URL.
6. Create the first admin (section 4).

## 6. Release verification (do this after every deployment)
Do not call a release successful until you have observed each of these on the deployed URLs:
- [ ] Render deploy shows **Live** and the build log shows Node 22; `GET <api>/api/v1/health` returns `status: ok`.
- [ ] Vercel deployment is **Ready**; the home page loads with products (not an error banner).
- [ ] Browser console shows no CORS errors (if it does, `CORS_ORIGINS` does not exactly match the frontend origin).
- [ ] Sign up / log in / log out work; the password-reset email link returns to your domain.
- [ ] Browse, search, product page; add to cart; cart totals look right.
- [ ] Checkout: quote, place an order, see it under Orders, cancel it.
- [ ] Authorization: a customer account gets "No access" on `/admin`; an anonymous request to
      `<api>/api/v1/admin/orders` returns 401.
- [ ] Admin: log in as an admin, confirm an order, adjust stock.

## 7. Rollback
- **API:** Render -> Deploys -> redeploy a previous successful deploy.
- **Frontend:** Vercel -> Deployments -> promote a previous deployment.
- **Database:** migrations are forward-only. To undo a bad migration, write a new migration that reverses it. Take
  a backup before any destructive change. Keep migrations backward compatible with the previous app version where
  possible so an app rollback does not break against the new schema.

## 8. Secrets checklist
| Secret | Lives in | Never in |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Render env | Git, Vercel, browser, Docker image, logs |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | GitHub `production` environment secrets | Git, the repo variables |
| `NEXT_PUBLIC_*` (incl. publishable key) | Vercel env | n/a (public by design, but still not in Git) |
| Local `.env` files | your machine | Git (ignored; CI fails if tracked) |

If a secret is ever exposed, rotate it in Supabase immediately and update Render.
