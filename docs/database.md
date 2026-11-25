# Database, auth and security (Phase 2)

## Apply the schema to your Supabase cloud project
1. Create a project at https://supabase.com/dashboard.
2. Copy **Project URL** and the **service_role / secret key** (Settings -> API) into `backend/.env`
   (see `backend/.env.example`). The key is server-only and `.env` is git-ignored.
3. From the repo root:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --remote   # applies supabase/migrations/* to the linked project
   ```
   (Alternative: paste each migration file into the dashboard SQL editor, in order.)
4. Optional dev data (never production): paste `supabase/seed.sql` into the SQL editor.
5. Make yourself an admin - see the next section.

## Make yourself an admin (first admin)
The first admin must be created by SQL as below. After that, existing admins can add or remove other admins
in the app (Admin -> Admins) without touching SQL.
Admin status is a row in `public.user_roles`. Clients (browser, anon/authenticated roles) cannot write
that table, so this can only be done from the Supabase **SQL editor** (runs as a privileged role) or with
the service-role key. There is deliberately no API endpoint or UI for it.

1. **Create your account first.** The role row points at a real user, so you must exist in
   Supabase Auth. Either:
   - Dashboard -> **Authentication -> Users -> Add user -> Create new user**, enter your email and a
     password, and tick **Auto Confirm User**; or
   - sign up through the app once the signup UI exists (a later phase).
2. Open Dashboard -> **SQL Editor -> New query**.
3. Run this, replacing the email with the one you registered (it looks up your id for you):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```
   Expected result: `Success. 1 row affected` (or 0 rows if the email doesn't match any user -
   check for typos or that the user exists in Authentication -> Users).
4. **Verify it:**
   ```sql
   select u.email, r.role
   from public.user_roles r join auth.users u on u.id = r.user_id;
   ```
   You should see your email with `admin`.
5. **Check through the API.** Admin is looked up on every request, so there is no need to log out and
   in. Get an access token (e.g. from the app once login exists, or by signing in with
   `supabase-js` `signInWithPassword`) and call:
   ```bash
   curl -H "Authorization: Bearer <access_token>" http://localhost:4000/api/v1/me
   #   -> "role": "admin"
   curl -H "Authorization: Bearer <access_token>" http://localhost:4000/api/v1/admin/ping
   #   -> {"success":true,"data":{"admin":true}}      (a non-admin gets 403)
   ```

To revoke admin:
```sql
delete from public.user_roles
where role = 'admin' and user_id = (select id from auth.users where email = 'you@example.com');
```

Security notes: never expose the service-role key to the browser to do this from the frontend, and
grant admin only to people you trust, since admins can reach every `/api/v1/admin/*` route.

## Model
Tables: profiles, user_roles, serviceable_pincodes, addresses, categories, products,
inventory_transactions, carts, cart_items, coupons, orders, order_items, payments, coupon_redemptions.
All prices are integer paise (`*_paise`). `orders` has a CHECK that total = subtotal - discount + fee, a
unique `(user_id, idempotency_key)`, and an address snapshot. `order_items` snapshot sku/name/price.
`payments` has `unique(provider, provider_payment_id)` for webhook replay protection.

## Security model
- RLS is enabled on every table. Client roles (`anon`, `authenticated`) start with **no** privileges.
- Browser-readable: active catalog rows, active pincodes, and the signed-in user's own profile,
  addresses, cart, orders, order items and payments. **No client write policies exist anywhere**; all
  writes go through Express with the service role.
- `inventory_transactions`, `coupons`, `coupon_redemptions`: no client access at all.
- Roles live in `user_roles`, which clients cannot write, so users cannot self-promote.
- Storage bucket `product-images`: public read, 2 MB limit, jpeg/png/webp only, no client writes.

## Backend auth
`Authorization: Bearer <supabase access token>` -> `jose` verifies signature against the project's JWKS
(`/auth/v1/.well-known/jwks.json`), issuer and `authenticated` audience -> `req.user`. `requireAdmin`
looks the role up server-side. Endpoints: `GET /api/v1/me`, `GET /api/v1/admin/ping`.
Note: JWKS verification needs a project using Supabase's asymmetric signing keys (the default for new projects).

## Migrations applied to the dev project
`001` schema, `002` RLS + storage, `003` service_role grants (tables created by the CLI migration role
do not inherit Supabase's default grants, so Express's service role needs them explicitly).
Never edit an applied migration; add a new one. The CLI needs `--remote` to target the linked project
(`npx supabase db push --remote`); without it, it targets a local stack.

## Live verification
`cd backend && npm run test:live` runs against the real project in `backend/.env`. It needs
`SUPABASE_ANON_KEY` (use the project's publishable key) in the environment, creates two throwaway users,
checks the signup trigger, RLS isolation, no client writes, no self-promotion and real-token auth through
Express, then deletes the users. Regular `npm test` is mocked and offline.

## Seed data caveat
`supabase/seed.sql` sets opening stock directly on `products`, so seeded items have no matching
`inventory_transactions` ledger rows. Stock added through `POST /admin/products/:id/stock` is always ledgered.
Seed was applied to the dev project with `npx supabase db push --remote --include-seed`.


Migration `007` adds `list_admins()`, `find_user_id_by_email()` and `revoke_admin()` (service-role only) for the
admin-management API; `004`-`006` add `adjust_stock`, `set_default_address`, `checkout` and `cancel_order`.
