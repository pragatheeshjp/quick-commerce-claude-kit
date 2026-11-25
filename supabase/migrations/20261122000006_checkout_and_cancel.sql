-- Checkout and order cancellation. Each runs as ONE transaction, so partial orders are impossible.
-- Callable only by the service role (Express). Express validates input and maps the error codes below.
--
-- Concurrency design:
--  * pg_advisory_xact_lock on (user, idempotency key): concurrent double-submits serialise, the second
--    one finds the first order and returns it (replayed = true) instead of creating another.
--  * Product rows are locked FOR UPDATE in id order: two checkouts can never both take the last unit,
--    and the fixed order prevents deadlocks. products.stock_quantity >= 0 CHECK is the final backstop.
--  * The coupon row is locked FOR UPDATE so usage limits cannot be exceeded by racing requests.
--
-- p_dry_run = true runs the identical pricing/validation path but writes nothing (used for quotes),
-- so a quote can never disagree with the real order.

create function public.checkout(
  p_user_id          uuid,
  p_address_id       uuid,
  p_idempotency_key  text,
  p_coupon_code      text    default null,
  p_dry_run          boolean default false
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_existing   public.orders;
  v_addr       public.addresses;
  v_pin        public.serviceable_pincodes;
  v_coupon     public.coupons;
  v_cart_id    uuid;
  v_subtotal   bigint := 0;
  v_discount   bigint := 0;
  v_total      bigint;
  v_lines      integer := 0;
  v_order_id   uuid;
  v_code       text;
  r            record;
begin
  if not p_dry_run then
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0));
    select * into v_existing from public.orders
     where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'order_id', v_existing.id, 'replayed', true,
        'subtotal_paise', v_existing.subtotal_paise, 'discount_paise', v_existing.discount_paise,
        'delivery_fee_paise', v_existing.delivery_fee_paise, 'total_paise', v_existing.total_paise);
    end if;
  end if;

  -- Address must belong to the user and be in a serviceable area.
  select * into v_addr from public.addresses where id = p_address_id and user_id = p_user_id;
  if not found then
    raise exception 'ADDRESS_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_pin from public.serviceable_pincodes where pincode = v_addr.pincode and is_active;
  if not found then
    raise exception 'PINCODE_NOT_SERVICEABLE' using errcode = 'P0001';
  end if;

  -- Re-read CURRENT prices and stock, locking the product rows.
  select id into v_cart_id from public.carts where user_id = p_user_id;
  for r in
    select ci.product_id, ci.quantity, p.price_paise, p.stock_quantity, p.is_active
      from public.cart_items ci
      join public.products p on p.id = ci.product_id
     where ci.cart_id = v_cart_id
     order by p.id
       for update of p
  loop
    v_lines := v_lines + 1;
    if not r.is_active then
      raise exception 'PRODUCT_UNAVAILABLE' using errcode = 'P0001', detail = r.product_id::text;
    end if;
    if r.stock_quantity < r.quantity then
      raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001', detail = r.product_id::text;
    end if;
    v_subtotal := v_subtotal + r.price_paise::bigint * r.quantity;
  end loop;

  if v_lines = 0 then
    raise exception 'CART_EMPTY' using errcode = 'P0001';
  end if;
  if v_subtotal < v_pin.min_order_paise then
    raise exception 'BELOW_MINIMUM_ORDER' using errcode = 'P0001', detail = v_pin.min_order_paise::text;
  end if;

  -- Optional coupon: eligibility and limits are decided here, never by the client.
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    v_code := upper(trim(p_coupon_code));
    select * into v_coupon from public.coupons where code = v_code for update;
    if not found or not v_coupon.is_active or v_coupon.starts_at > now()
       or (v_coupon.expires_at is not null and v_coupon.expires_at <= now()) then
      raise exception 'COUPON_INVALID' using errcode = 'P0001';
    end if;
    if v_subtotal < v_coupon.min_order_paise then
      raise exception 'COUPON_MIN_ORDER_NOT_MET' using errcode = 'P0001', detail = v_coupon.min_order_paise::text;
    end if;
    if v_coupon.usage_limit is not null
       and (select count(*) from public.coupon_redemptions where coupon_id = v_coupon.id) >= v_coupon.usage_limit then
      raise exception 'COUPON_EXHAUSTED' using errcode = 'P0001';
    end if;
    if (select count(*) from public.coupon_redemptions
         where coupon_id = v_coupon.id and user_id = p_user_id) >= v_coupon.per_user_limit then
      raise exception 'COUPON_ALREADY_USED' using errcode = 'P0001';
    end if;

    if v_coupon.discount_type = 'percent' then
      v_discount := v_subtotal * v_coupon.discount_value / 100;       -- integer division floors
      if v_coupon.max_discount_paise is not null then
        v_discount := least(v_discount, v_coupon.max_discount_paise);
      end if;
    else
      v_discount := v_coupon.discount_value;
    end if;
    v_discount := least(v_discount, v_subtotal);
  end if;

  v_total := v_subtotal - v_discount + v_pin.delivery_fee_paise;
  if v_total > 2000000000 then
    raise exception 'ORDER_TOO_LARGE' using errcode = 'P0001';
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'order_id', null, 'replayed', false,
      'subtotal_paise', v_subtotal, 'discount_paise', v_discount,
      'delivery_fee_paise', v_pin.delivery_fee_paise, 'total_paise', v_total);
  end if;

  insert into public.orders (user_id, idempotency_key, delivery_address, subtotal_paise, discount_paise,
                             delivery_fee_paise, total_paise, coupon_id)
  values (p_user_id, p_idempotency_key,
          jsonb_build_object('label', v_addr.label, 'line1', v_addr.line1, 'line2', v_addr.line2,
                             'landmark', v_addr.landmark, 'city', v_addr.city, 'state', v_addr.state,
                             'pincode', v_addr.pincode),
          v_subtotal, v_discount, v_pin.delivery_fee_paise, v_total, v_coupon.id)
  returning id into v_order_id;

  -- Snapshot name/sku/price so later catalog edits never rewrite order history.
  insert into public.order_items (order_id, product_id, sku, name, quantity, unit_price_paise)
  select v_order_id, p.id, p.sku, p.name, ci.quantity, p.price_paise
    from public.cart_items ci join public.products p on p.id = ci.product_id
   where ci.cart_id = v_cart_id;

  update public.products p
     set stock_quantity = p.stock_quantity - ci.quantity
    from public.cart_items ci
   where ci.cart_id = v_cart_id and ci.product_id = p.id;

  insert into public.inventory_transactions (product_id, delta, reason, order_id, created_by)
  select ci.product_id, -ci.quantity, 'order', v_order_id, p_user_id
    from public.cart_items ci where ci.cart_id = v_cart_id;

  if v_coupon.id is not null then
    insert into public.coupon_redemptions (coupon_id, user_id, order_id, discount_paise)
    values (v_coupon.id, p_user_id, v_order_id, v_discount);
  end if;

  delete from public.cart_items where cart_id = v_cart_id;

  return jsonb_build_object(
    'order_id', v_order_id, 'replayed', false,
    'subtotal_paise', v_subtotal, 'discount_paise', v_discount,
    'delivery_fee_paise', v_pin.delivery_fee_paise, 'total_paise', v_total);
end $$;

-- Cancels an order, restores stock, releases the coupon redemption. Idempotent: cancelling an
-- already-cancelled order changes nothing (no double restock). p_user_id NULL = admin cancel.
create function public.cancel_order(p_order_id uuid, p_user_id uuid default null) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_order public.orders;
  r       record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or (p_user_id is not null and v_order.user_id <> p_user_id) then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_order.status = 'cancelled' then
    return 'cancelled';
  end if;
  if v_order.status not in ('pending', 'confirmed') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;

  for r in
    select product_id, quantity from public.order_items
     where order_id = p_order_id and product_id is not null
     order by product_id
  loop
    update public.products set stock_quantity = stock_quantity + r.quantity where id = r.product_id;
    insert into public.inventory_transactions (product_id, delta, reason, order_id, created_by)
    values (r.product_id, r.quantity, 'order_cancel', p_order_id, p_user_id);
  end loop;

  delete from public.coupon_redemptions where order_id = p_order_id;
  return 'cancelled';
end $$;

revoke all on function public.checkout(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.cancel_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.checkout(uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.cancel_order(uuid, uuid) to service_role;
