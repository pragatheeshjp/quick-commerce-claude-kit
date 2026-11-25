-- Atomic stock adjustment. A single conditional UPDATE guarantees stock never goes negative, even
-- under concurrent calls, and the inventory ledger row is written in the same transaction.
-- Callable only by the service role (Express); not exposed to anon/authenticated.
create function public.adjust_stock(
  p_product_id uuid,
  p_delta      integer,
  p_reason     text,
  p_actor      uuid default null,
  p_order_id   uuid default null
) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_new integer;
begin
  if p_delta = 0 then
    raise exception 'DELTA_MUST_BE_NONZERO' using errcode = 'P0001';
  end if;

  update public.products
     set stock_quantity = stock_quantity + p_delta
   where id = p_product_id
     and stock_quantity + p_delta >= 0
  returning stock_quantity into v_new;

  if not found then
    if exists (select 1 from public.products where id = p_product_id) then
      raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
    end if;
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.inventory_transactions (product_id, delta, reason, order_id, created_by)
  values (p_product_id, p_delta, p_reason, p_order_id, p_actor);

  return v_new;
end $$;

revoke all on function public.adjust_stock(uuid, integer, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.adjust_stock(uuid, integer, text, uuid, uuid) to service_role;
