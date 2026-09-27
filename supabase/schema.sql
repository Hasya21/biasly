-- Initial schema: run once in Supabase SQL Editor after inspecting existing objects.
-- Intentionally no IF NOT EXISTS: an incompatible existing schema must fail, not be hidden.
begin;

create extension vector with schema extensions;

create function public.valid_article_body(body text) returns boolean
language sql immutable strict security invoker set search_path = '' as $$
  select length(btrim(body)) >= 900 or
    (select count(*) >= 3 from regexp_split_to_table(btrim(body), E'\n[[:space:]]*\n') paragraph
     where length(btrim(paragraph)) >= 40);
$$;

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  listing_url text not null unique check (listing_url ~ '^https?://[^[:space:]/?#]+[^[:space:]]*$'),
  parser_strategy text,
  active boolean not null default true,
  logo_url text check (logo_url ~ '^https?://[^[:space:]/?#]+[^[:space:]]*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id),
  original_url text not null unique check (original_url ~ '^https?://[^[:space:]/?#]+[^[:space:]]*$'),
  canonical_url text not null unique check (canonical_url ~ '^https?://[^[:space:]/?#]+[^[:space:]]*$'),
  title text not null check (length(btrim(title)) > 0),
  image_url text not null check (image_url ~ '^https?://[^[:space:]/?#]+[^[:space:]]*$'),
  published_at timestamptz not null,
  raw_text text not null check (public.valid_article_body(raw_text)),
  scraped_at timestamptz not null default now(),
  analyzed_at timestamptz
);

create table public.article_analyses (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null unique references public.articles(id),
  summary text not null check (length(btrim(summary)) > 0),
  sentiment_score numeric not null check (sentiment_score between -1 and 1),
  sentiment_label text not null check (sentiment_label in ('positive', 'neutral', 'negative')),
  bias_score numeric generated always as ((right_percentage - left_percentage) / 100) stored,
  bias_label text not null check (bias_label in ('left', 'center', 'right', 'mixed', 'unclear')),
  left_percentage numeric not null check (left_percentage between 0 and 100),
  center_percentage numeric not null check (center_percentage between 0 and 100),
  right_percentage numeric not null check (right_percentage between 0 and 100),
  confidence numeric not null check (confidence between 0 and 1),
  framing_notes text[] not null default '{}',
  loaded_terms text[] not null default '{}',
  disclaimer text not null check (length(btrim(disclaimer)) > 0),
  model text not null check (length(btrim(model)) > 0),
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  check (left_percentage + center_percentage + right_percentage = 100)
);

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(btrim(event_type)) > 0),
  level text not null check (level in ('info', 'warn', 'error')),
  message text not null check (length(btrim(message)) > 0),
  source_id uuid references public.sources(id),
  article_id uuid references public.articles(id),
  run_id uuid,
  context jsonb not null default '{}' check (jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default now()
);

create table public.oxylabs_schedules (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.sources(id),
  schedule_id text not null unique check (schedule_id ~ '^[0-9]+$'),
  state text not null check (state in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.oxylabs_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.oxylabs_schedules(id),
  external_run_id text not null check (external_run_id ~ '^[0-9]+$'),
  job_id text not null unique check (job_id ~ '^[0-9]+$'),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}' check (jsonb_typeof(summary) = 'object'),
  error_code text,
  check ((status = 'processing' and completed_at is null) or
         (status in ('completed', 'failed') and completed_at is not null)),
  check (completed_at is null or completed_at >= started_at)
);

create index sources_active_name_idx on public.sources(name, id) where active;
create index articles_source_idx on public.articles(source_id);
create index articles_published_idx on public.articles(published_at desc, id desc) where analyzed_at is not null;
create index articles_pending_order_idx on public.articles(scraped_at, id);
create index article_analyses_embedding_idx on public.article_analyses
using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100)
where embedding is not null;
create index logs_created_idx on public.logs(created_at desc, id desc);
create index logs_source_idx on public.logs(source_id);
create index logs_article_idx on public.logs(article_id);
create index logs_run_idx on public.logs(run_id, created_at desc);
create index schedule_runs_schedule_idx on public.oxylabs_schedule_runs(schedule_id, started_at desc, id desc);

-- A brief global insert lock is adequate for this small ingestion pipeline. It covers
-- cross-column collisions that two individual UNIQUE constraints cannot enforce.
-- VOLATILE queries get a fresh snapshot after the lock under READ COMMITTED.
-- Reject other isolation levels instead of silently allowing a stale-snapshot race.
create function public.guard_article_urls() returns trigger
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.original_url is distinct from old.original_url or new.canonical_url is distinct from old.canonical_url then
      raise exception 'Article URLs are immutable' using errcode = '23514';
    end if;
    return new;
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Article insertion requires READ COMMITTED isolation' using errcode = '25000';
  end if;
  perform pg_advisory_xact_lock(731490215::bigint);
  if exists (
    select 1 from public.articles
    where original_url in (new.original_url, new.canonical_url)
       or canonical_url in (new.original_url, new.canonical_url)
  ) then
    raise exception 'Article URL already stored' using errcode = '23505', constraint = 'articles_url_identity';
  end if;
  return new;
end;
$$;
create trigger guard_article_urls before insert or update of original_url, canonical_url
on public.articles for each row execute function public.guard_article_urls();

create function public.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger sources_updated_at before update on public.sources
for each row execute function public.touch_updated_at();
create trigger schedules_updated_at before update on public.oxylabs_schedules
for each row execute function public.touch_updated_at();

create function public.save_article_analysis(
  p_article_id uuid, p_analysis jsonb, p_embedding extensions.vector(1536)
)
returns public.article_analyses
language plpgsql security invoker set search_path = '' as $$
declare
  saved public.article_analyses;
begin
  if p_embedding is null or extensions.vector_dims(p_embedding) <> 1536 then
    raise exception 'Embedding must have 1536 dimensions' using errcode = '22023';
  end if;
  -- Serialize competing analyses of the same article; first valid result wins.
  perform 1 from public.articles where id = p_article_id for update;
  if not found then
    raise exception 'Article not found' using errcode = '23503';
  end if;
  select * into saved from public.article_analyses where article_id = p_article_id;
  if found then
    if saved.embedding is null then
      raise exception 'Existing analysis requires embedding backfill' using errcode = '55000';
    end if;
  else
    insert into public.article_analyses (
      article_id, summary, sentiment_score, sentiment_label, bias_label,
      left_percentage, center_percentage, right_percentage, confidence,
      framing_notes, loaded_terms, disclaimer, model, embedding
    ) select p_article_id, x.summary, x.sentiment_score, x.sentiment_label, x.bias_label,
      x.left_percentage, x.center_percentage, x.right_percentage, x.confidence,
      x.framing_notes, x.loaded_terms, x.disclaimer, x.model, p_embedding
    from jsonb_populate_record(null::public.article_analyses, p_analysis) x
    returning * into saved;
  end if;
  update public.articles set analyzed_at = coalesce(analyzed_at, now()) where id = p_article_id;
  return saved;
end;
$$;

create function public.save_article_embedding(
  p_article_id uuid, p_embedding extensions.vector(1536)
)
returns public.article_analyses
language plpgsql security invoker set search_path = '' as $$
declare
  saved public.article_analyses;
begin
  if p_embedding is null or extensions.vector_dims(p_embedding) <> 1536 then
    raise exception 'Embedding must have 1536 dimensions' using errcode = '22023';
  end if;
  perform 1 from public.articles where id = p_article_id for update;
  if not found then
    raise exception 'Article not found' using errcode = '23503';
  end if;
  select * into saved from public.article_analyses where article_id = p_article_id for update;
  if not found then
    raise exception 'Analysis not found' using errcode = '23503';
  end if;
  if saved.embedding is null then
    update public.article_analyses set embedding = p_embedding
    where article_id = p_article_id returning * into saved;
  end if;
  update public.articles set analyzed_at = coalesce(analyzed_at, now()) where id = p_article_id;
  return saved;
end;
$$;

create function public.get_pending_articles(
  p_limit integer default 5, p_after_scraped_at timestamptz default null,
  p_after_id uuid default null, p_article_ids uuid[] default null
) returns table (
  id uuid, source_id uuid, original_url text, canonical_url text, title text,
  image_url text, published_at timestamptz, raw_text text, scraped_at timestamptz,
  analyzed_at timestamptz, needs_analysis boolean, analysis_summary text
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Limit must be between 1 and 100' using errcode = '22023';
  end if;
  if (p_after_scraped_at is null) <> (p_after_id is null) then
    raise exception 'Both cursor fields are required' using errcode = '22023';
  end if;
  return query select a.id, a.source_id, a.original_url, a.canonical_url, a.title,
    a.image_url, a.published_at, a.raw_text, a.scraped_at, a.analyzed_at,
    analysis.id is null as needs_analysis, analysis.summary as analysis_summary
  from public.articles a
  left join public.article_analyses analysis on analysis.article_id = a.id
  where (analysis.id is null or analysis.embedding is null)
    and (p_article_ids is null or a.id = any(p_article_ids))
    and (p_after_id is null or (a.scraped_at, a.id) > (p_after_scraped_at, p_after_id))
  order by a.scraped_at, a.id limit p_limit;
end;
$$;

create function public.match_related_articles(
  p_article_id uuid, p_query_embedding extensions.vector(1536), p_limit integer default 5
) returns table (
  id uuid, title text, image_url text, published_at timestamptz, source_name text
)
language plpgsql stable security invoker
set search_path = ''
set ivfflat.probes = 100 as $$
begin
  if p_query_embedding is null or extensions.vector_dims(p_query_embedding) <> 1536 then
    raise exception 'Embedding must have 1536 dimensions' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 5 then
    raise exception 'Limit must be between 1 and 5' using errcode = '22023';
  end if;
  return query
  select a.id, a.title, a.image_url, a.published_at, s.name
  from public.article_analyses analysis
  join public.articles a on a.id = analysis.article_id
  join public.sources s on s.id = a.source_id
  where analysis.embedding is not null
    and a.analyzed_at is not null
    and a.id <> p_article_id
  order by analysis.embedding OPERATOR(extensions.<=>) p_query_embedding, a.id
  limit p_limit;
end;
$$;

alter table public.sources enable row level security;
alter table public.articles enable row level security;
alter table public.article_analyses enable row level security;
alter table public.logs enable row level security;
alter table public.oxylabs_schedules enable row level security;
alter table public.oxylabs_schedule_runs enable row level security;

revoke all on public.sources, public.articles, public.article_analyses, public.logs,
  public.oxylabs_schedules, public.oxylabs_schedule_runs from public, anon, authenticated, service_role;
grant select, insert, update on public.sources, public.oxylabs_schedules, public.oxylabs_schedule_runs to service_role;
grant select, insert on public.articles, public.article_analyses, public.logs to service_role;
grant update (analyzed_at) on public.articles to service_role;
grant update (embedding) on public.article_analyses to service_role;

revoke all on function public.valid_article_body(text), public.guard_article_urls(), public.touch_updated_at(),
  public.save_article_analysis(uuid, jsonb, extensions.vector), public.save_article_embedding(uuid, extensions.vector),
  public.get_pending_articles(integer, timestamptz, uuid, uuid[]),
  public.match_related_articles(uuid, extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.valid_article_body(text),
  public.save_article_analysis(uuid, jsonb, extensions.vector),
  public.save_article_embedding(uuid, extensions.vector),
  public.get_pending_articles(integer, timestamptz, uuid, uuid[]),
  public.match_related_articles(uuid, extensions.vector, integer) to service_role;

notify pgrst, 'reload schema';
commit;
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
