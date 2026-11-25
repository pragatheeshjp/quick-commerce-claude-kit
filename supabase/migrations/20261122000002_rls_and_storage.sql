-- Row Level Security, least-privilege grants and the product image bucket.
--
-- Model: the browser only READS a narrow set of data directly (public catalog and the signed-in
-- user's own rows). Every write goes through Express using the service role, which bypasses RLS.
-- So there are intentionally NO insert/update/delete policies for anon/authenticated.

-- Start from zero privileges for client roles, then grant back only what is needed.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

alter table public.profiles                enable row level security;
alter table public.user_roles              enable row level security;
alter table public.serviceable_pincodes    enable row level security;
alter table public.addresses               enable row level security;
alter table public.categories              enable row level security;
alter table public.products                enable row level security;
alter table public.inventory_transactions  enable row level security;
alter table public.carts                   enable row level security;
alter table public.cart_items              enable row level security;
alter table public.coupons                 enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;
alter table public.payments                enable row level security;
alter table public.coupon_redemptions      enable row level security;

-- ---- public, read-only catalog data
grant select on public.categories, public.products, public.serviceable_pincodes to anon, authenticated;

create policy categories_read_active on public.categories
  for select to anon, authenticated using (is_active);
create policy products_read_active on public.products
  for select to anon, authenticated using (is_active);
create policy pincodes_read_active on public.serviceable_pincodes
  for select to anon, authenticated using (is_active);

-- ---- owner-only reads (writes are server-side only)
grant select on public.profiles, public.user_roles, public.addresses, public.carts,
                public.cart_items, public.orders, public.order_items, public.payments
  to authenticated;

create policy profiles_read_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy roles_read_own on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));
create policy addresses_read_own on public.addresses
  for select to authenticated using (user_id = (select auth.uid()));
create policy carts_read_own on public.carts
  for select to authenticated using (user_id = (select auth.uid()));
create policy cart_items_read_own on public.cart_items
  for select to authenticated
  using (exists (select 1 from public.carts c
                 where c.id = cart_items.cart_id and c.user_id = (select auth.uid())));
create policy orders_read_own on public.orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy order_items_read_own on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_items.order_id and o.user_id = (select auth.uid())));
create policy payments_read_own on public.payments
  for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = payments.order_id and o.user_id = (select auth.uid())));

-- inventory_transactions, coupons, coupon_redemptions: RLS enabled, no grants, no policies
-- => unreachable from the browser; only the service role (Express) can touch them.

-- ---------------------------------------------------------------- storage
-- Public-read bucket for product images; uploads happen only via Express (service role),
-- which validates type/size. The bucket enforces the same limits as defence in depth.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');
-- No insert/update/delete policies: clients cannot write to storage.
