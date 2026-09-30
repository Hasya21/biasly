-- Existing-project upgrade. Apply before deploying the corresponding application code.
begin;

alter table public.oxylabs_schedules add column if not exists last_attempted_at timestamptz;

create table if not exists public.article_analysis_work (
  article_id uuid primary key references public.articles(id) on delete cascade,
  attempt_token uuid not null,
  last_run_id uuid not null,
  last_attempted_at timestamptz not null,
  was_fresh boolean not null,
  in_progress boolean not null default true,
  failures integer not null default 0 check (failures >= 0),
  next_attempt_at timestamptz not null,
  error_code text check (error_code ~ '^[a-z0-9_]{1,64}$')
);
create index if not exists articleger, uuid[]) from public, anon, authenticated;
revoke all on function public.claim_article_analysis(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_article_analysis(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.get_analysis_candidates(uuid, integer, uuid[]) to service_role;
grant execute on function public.claim_article_analysis(uuid, uuid) to service_role;
grant execute on function public.finish_article_analysis(uuid, uuid, boolean, text) to service_role;

notify pgrst, 'reload schema';
commit;
