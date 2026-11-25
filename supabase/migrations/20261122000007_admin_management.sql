-- Admin management helpers. Service-role only (called by Express behind requireAdmin).
-- SECURITY DEFINER is needed because auth.users is not readable by the API roles.

create function public.list_admins()
returns table (user_id uuid, email text, created_at timestamptz)
language sql security definer set search_path = ''
as $$
  select r.user_id, u.email::text, r.created_at
    from public.user_roles r
    join auth.users u on u.id = r.user_id
   where r.role = 'admin'
   order by r.created_at, u.email;
$$;

create function public.find_user_id_by_email(p_email text) returns uuid
language sql security definer set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- Revoke is one locked transaction so two admins can never revoke each other concurrently and leave
-- the system with no admin. You cannot revoke yourself, and the last admin cannot be removed.
create function public.revoke_admin(p_user_id uuid, p_actor_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(7001);
  if p_user_id = p_actor_id then
    raise exception 'CANNOT_REVOKE_SELF' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin') then
    return false;
  end if;
  if (select count(*) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;
  delete from public.user_roles where user_id = p_user_id and role = 'admin';
  return true;
end $$;

revoke all on function public.list_admins() from public, anon, authenticated;
revoke all on function public.find_user_id_by_email(text) from public, anon, authenticated;
revoke all on function public.revoke_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_admins() to service_role;
grant execute on function public.find_user_id_by_email(text) to service_role;
grant execute on function public.revoke_admin(uuid, uuid) to service_role;
