-- Swiftcart initial schema.
-- All money is stored as integer paise (INR * 100), column names end in _paise.

-- ---------------------------------------------------------------- helpers
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- identity
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Roles live in their own table with NO client write access, so a user can never
-- grant themselves a role by editing their profile. Only the service role writes here.
create table public.user_roles (
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('admin')),
  created_at  timestamptz not null default now(),
  primary key (user_id, role)
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.serviceable_pincodes (
  pincode              text primary key check (pincode ~ '^[1-9][0-9]{5}$'),
  area_name            text not null,
  city                 text not null,
  delivery_fee_paise   integer not null default 0 check (delivery_fee_paise >= 0),
  min_order_paise      integer not null default 0 check (min_order_paise >= 0),
  is_active            boolean not null default true
);

create table public.addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  label        text not null default 'Home',
  line1        text not null check (length(line1) between 1 and 200),
  line2        text,
  landmark     text,
  city         text not null,
  state        text not null,
  pincode      text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default_per_user on public.addresses (user_id) where is_default;

-- ---------------------------------------------------------------- catalog
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories (id) on delete restrict,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null,
  image_path  text,                      -- storage object path, never a signed URL
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index categories_parent_idx on public.categories (parent_id);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.categories (id) on delete restrict,
  sku             text not null unique,
  name            text not null,
  description     text,
  brand           text,
  unit_label      text not null,         -- e.g. "500 g", "1 L"
  price_paise     integer not null check (price_paise >= 0),
  mrp_paise       integer not null check (mrp_paise >= price_paise),
  stock_quantity  integer not null default 0 check (stock_quantity >= 0),
  image_path      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index products_category_idx on public.products (category_id) where is_active;
create index products_name_idx on public.products (lower(name));

create table public.inventory_transactions (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete restrict,
  delta       integer not null check (delta <> 0),
  reason      text not null check (reason in ('restock', 'order', 'order_cancel', 'adjustment')),
  order_id    uuid,                      -- FK added after orders exist
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index inventory_tx_product_idx on public.inventory_transactions (product_id, created_at desc);

-- ---------------------------------------------------------------- cart
create table public.carts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.cart_items (
  cart_id     uuid not null references public.carts (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  quantity    integer not null check (quantity between 1 and 50),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (cart_id, product_id)
);

-- ---------------------------------------------------------------- coupons
create table public.coupons (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code = upper(code)),
  discount_type         text not null check (discount_type in ('percent', 'flat')),
  discount_value        integer not null check (discount_value > 0),   -- percent (1-100) or paise
  max_discount_paise    integer check (max_discount_paise > 0),
  min_order_paise       integer not null default 0 check (min_order_paise >= 0),
  usage_limit           integer check (usage_limit > 0),               -- total redemptions
  per_user_limit        integer not null default 1 check (per_user_limit > 0),
  starts_at             timestamptz not null default now(),
  expires_at            timestamptz,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (expires_at is null or expires_at > starts_at)
);

-- ---------------------------------------------------------------- orders
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete restrict,
  status               text not null default 'pending'
                         check (status in ('pending', 'confirmed', 'packed', 'out_for_delivery',
                                           'delivered', 'cancelled')),
  idempotency_key      text not null check (length(idempotency_key) between 8 and 128),
  delivery_address     jsonb not null,   -- snapshot, so later address edits don't rewrite history
  subtotal_paise       integer not null check (subtotal_paise >= 0),
  discount_paise       integer not null default 0 check (discount_paise >= 0),
  delivery_fee_paise   integer not null default 0 check (delivery_fee_paise >= 0),
  total_paise          integer not null check (total_paise >= 0),
  coupon_id            uuid references public.coupons (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (total_paise = subtotal_paise - discount_paise + delivery_fee_paise)
);
create index orders_user_idx on public.orders (user_id, created_at desc);

alter table public.inventory_transactions
  add constraint inventory_tx_order_fk foreign key (order_id) references public.orders (id) on delete set null;

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  product_id          uuid references public.products (id) on delete set null,
  sku                 text not null,
  name                text not null,
  quantity            integer not null check (quantity > 0),
  unit_price_paise    integer not null check (unit_price_paise >= 0)
);
create index order_items_order_idx on public.order_items (order_id);

create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete restrict,
  provider              text not null,
  provider_payment_id   text,
  status                text not null default 'created'
                          check (status in ('created', 'authorized', 'paid', 'failed', 'refunded')),
  amount_paise          integer not null check (amount_paise >= 0),
  raw_event             jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider, provider_payment_id)   -- webhook replay protection
);
create index payments_order_idx on public.payments (order_id);

create table public.coupon_redemptions (
  id                uuid primary key default gen_random_uuid(),
  coupon_id         uuid not null references public.coupons (id) on delete restrict,
  user_id           uuid not null references auth.users (id) on delete restrict,
  order_id          uuid not null unique references public.orders (id) on delete cascade,
  discount_paise    integer not null check (discount_paise >= 0),
  created_at        timestamptz not null default now()
);
create index coupon_redemptions_lookup_idx on public.coupon_redemptions (coupon_id, user_id);

-- ---------------------------------------------------------------- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','addresses','categories','products','carts','cart_items',
                           'orders','payments']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
