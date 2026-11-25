-- Atomically make one address the user's default. Both statements run in one transaction, so the
-- partial unique index (one default per user) is never violated and a failure leaves no user without
-- their previous default. Callable only by the service role.
create function public.set_default_address(p_user_id uuid, p_address_id uuid) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.addresses where id = p_address_id and user_id = p_user_id) then
    return false;
  end if;
  update public.addresses set is_default = false where user_id = p_user_id and is_default and id <> p_address_id;
  update public.addresses set is_default = true  where user_id = p_user_id and id = p_address_id;
  return true;
end $$;

revoke all on function public.set_default_address(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_default_address(uuid, uuid) to service_role;
