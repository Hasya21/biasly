-- Existing-project upgrade. Run once in Supabase Dashboard > SQL Editor.
begin;
alter table public.oxylabs_schedules add column if not exists listing_url text;

create table if not exists public.pipeline_leases (
  name text primary key check (name in ('scheduler', 'hourly_pipeline')),
  owner uuid not null,
  expires_at timestamptz not null
);
alter table public.pipeline_leases enable row level security;
revoke all on public.pipeline_leases from public, anon, authenticated, service_role;
grant select, insert, update on public.pipeline_leases to service_role;

create or replace function public.acquire_pipeline_lease(p_name text, p_owner uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare acquired boolean;
begin
  insert into public.pipeline_leases(name, owner, expires_at)
  values (p_name, p_owner, clock_timestamp() + interval '15 minutes')
  on conflict (name) do update set owner = excluded.owner, expires_at = excluded.expires_at
  where public.pipeline_leases.expires_at < clock_timestamp()
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;
create or replace function public.release_pipeline_lease(p_name text, p_owner uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.pipeline_leases set expires_at = clock_timestamp()
  where name = p_name and owner = p_owner;
$$;
revoke all on function public.acquire_pipeline_lease(text, uuid) from public, anon, authenticated;
revoke all on function public.release_pipeline_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_pipeline_lease(text, uuid) to service_role;
grant execute on function public.release_pipeline_lease(text, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
