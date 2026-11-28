# Frontend (Phases 6-8: browsing, auth, ordering and the admin console)

Next.js App Router + React + TypeScript + Tailwind. It never contains business logic: every commerce action
goes through the Express API (`src/lib/api.ts`).

## Structure
```
src/app/            routes: / , /category/[slug], /search, /product/[id], /login, /signup,
                    /forgot-password, /reset-password, /account, /account/addresses, /cart, /checkout,
                    /orders, /orders/[id], error + not-found
src/components/     shared UI (header, product card, text field, pagination, feedback states)
src/features/       auth/ (provider, forms, RequireAuth, use-api hooks), location/ (pincode picker),
                    catalog/ (queries), cart/ (provider, add-to-cart, cart view), addresses/ (address book + form),
                    checkout/ (checkout view), orders/ (list, detail, status helpers)
src/lib/            api.ts (single typed API client), errors.ts (API error codes -> friendly copy),
                    supabase.ts (browser client), money.ts, validation.ts
src/types/api.ts    response types mirroring docs/api.md
tests/              vitest + Testing Library
```

## Environment (`frontend/.env`, git-ignored; template in `.env.example`)
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Express base URL as seen by the **browser** |
| `API_INTERNAL_URL` | Express base URL as seen by **server rendering** (Compose sets `http://backend:4000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key. Public by design; **never** put the service-role key in the frontend |

## One-time Supabase dashboard settings (Authentication -> URL Configuration)
- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/**` (needed for password-reset and email-confirmation links;
  add your Vercel URL later).
- By default Supabase requires email confirmation on sign-up. For quicker local testing you can disable
  "Confirm email" under Authentication -> Providers -> Email, or create users in the dashboard.

## Design decisions
- **Server components by default** for catalog pages; data is fetched on the server inside `<Suspense>`
  (required by Cache Components, which `next.config.ts` enables). Interactive bits (header, location picker,
  auth forms) are client components.
- **Auth:** `@supabase/supabase-js` in the browser; the access token is attached to API calls by the caller
  (`api(path, { token })`). `RequireAuth` is a UX guard only: the API enforces authorization on every request.
- **Money:** integer paise everywhere; `formatPaise` formats with integer math only (no floats).
  Prices shown are informational until checkout recalculates them on the server.
- **Location:** the chosen pincode is validated, checked against `GET /serviceability/:pincode`, and kept in
  `localStorage` (wrapped in try/catch for private mode).
- Safe redirects: the post-login `next` parameter must be a same-site relative path.
- No Google Fonts: system font stack, so builds need no external network.

## Light and dark theme
- The sun/moon button in the header (`components/theme-toggle.tsx`) switches themes. The choice is saved in
  `localStorage` (`theme`); with no saved choice the site follows the OS `prefers-color-scheme`.
- The theme is the `data-theme` attribute on `<html>`. An inline script in `app/layout.tsx` (`lib/theme.ts`)
  sets it before first paint, so there is no light flash on reload.
- Components do **not** use `dark:` classes. `globals.css` remaps the Tailwind palette variables under
  `[data-theme="dark"]` (white/stone-50 become dark surfaces; zinc, emerald, red and amber scales are mirrored).
  Keep using the existing palette; if you introduce a new colour family, add its dark mapping there.

## Commands
`npm run dev` | `npm run build` | `npm run lint` | `npm run typecheck` | `npm test`

## Ordering flow (Phase 7)
- **Cart:** `CartProvider` mirrors the server cart (tagged with the owner so another user's cart never shows).
  Add/step/remove call the API, which returns the repriced cart; the UI never computes prices or totals.
- **Checkout:** pick an address, optionally a coupon, and the page shows `POST /checkout/quote` verbatim.
  A bad coupon shows its error but keeps the quote without it. Placing the order sends only
  `{address_id, coupon_code?}` plus an `Idempotency-Key`.
- **Idempotency:** the key is generated once per distinct attempt (address + coupon + cart contents) and reused
  when the same attempt is retried (e.g. after a network error), so a retry can never create a second order.
- **Orders:** list, detail with a status timeline, and cancellation (only while pending/confirmed; the API is
  the authority, and the page reloads to show the real status if the cancel is refused).
- Orders are not paid yet (payments deferred): new orders stay "Order placed" until an admin confirms them.
- CORS: the browser calls the API cross-origin with `Authorization` and `Idempotency-Key` headers and
  PUT/PATCH/DELETE; the backend allowlists only `CORS_ORIGINS` (verified via preflight).
- Not built: editing an existing address (delete and re-add instead), reorder, order search.

## Admin console (Phase 8) - `/admin/*`
Reached from Account -> "Open the admin console" for admins. `noindex`, behind `RequireAdmin`.
- **Overview**, **Orders** (status filter; detail page offers only the legal next steps; cancel needs a confirm
  and restores stock), **Products** (search, create, edit, activate/deactivate, stock adjustment), **Categories**
  (create/edit, parent, sort, visibility), **Admins** (grant by email, revoke with confirm; self and the last
  admin cannot be removed).
- Prices are typed in rupees and converted to integer paise with string math (`lib/rupees.ts`); never floats.
  Stock is changed only through the stock adjuster (ledgered), never through the product edit form.
- `RequireAdmin` is a UX gate (it reads the role from `/me`). Every `/admin` API call is independently
  enforced server-side, so bypassing the gate yields 403s and no data.
- Not built: product image upload (needs a multipart library), bulk edit, audit log of admin actions.

## Not yet built
Payments, product image upload, Google OAuth / phone OTP, address editing, admin audit log.

## Known trade-offs
- **Soft 404 status:** unknown product/category URLs render the not-found page (with a `noindex` meta tag) but
  the HTTP status is 200, because streamed pages send the status line before `notFound()` runs inside
  `<Suspense>`. Search engines are told not to index them; revisit if a true 404 status matters.
- Auth guards (`RequireAuth`) run in the browser; the session lives in `localStorage` via supabase-js, so
  protected pages cannot be gated on the server. All protected data still requires a valid token at the API.
- Docker Compose caches `node_modules` in named volumes: after changing `package.json` run
  `docker compose down -v && docker compose up -d --build`.
- Production image: pass `NEXT_PUBLIC_*` as build args (they are inlined at build time), e.g.
  `docker build --target runner --build-arg NEXT_PUBLIC_API_URL=... --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
   --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... frontend`, and set `API_INTERNAL_URL` at runtime.


