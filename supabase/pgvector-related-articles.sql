-- Existing-project upgrade: pgvector embeddings and related articles.
-- Review, then run once in Supabase Dashboard -> SQL Editor.
begin;

create extension if not exists vector with schema extensions;

do $$
begin
  if (select extnamespace from pg_extension where extname = 'vector') <> 'extensions'::regnamespace then
    raise exception 'vector extension must be installed in the extensions schema';
  end if;
end;
$$;

do $$
declare column_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into column_type
  from pg_attribute a
  where a.attrelid = 'public.article_analyses'::regclass
    and a.attname = 'embedding' and not a.attisdropped;
  if column_type is null then
    alter table public.article_analyses add column embedding extensions.vector(1536);
  elsif column_type <> 'vector(1536)' then
    raise exception 'article_analyses.embedding has incompatible type %', column_type;
  end if;
end;
$$;

do $$
declare definition text;
begin
  select lower(indexdef) into definition from pg_indexes
  where schemaname = 'public' and indexname = 'article_analyses_embedding_idx';
  if definition is null then
    create index article_analyses_embedding_idx on public.article_analyses
    using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100)
    where embedding is not null;
  elsif definition not like '%using ivfflat%' or definition not like '%vector_cosine_ops%' or definition not like '%where (embedding is not null)%' then
    raise exception 'article_analyses_embedding_idx has an incompatible definition: %', definition;
  end if;
end;
$$;

drop function if exists public.save_article_analysis(uuid, jsonb);
drop function if exists public.save_article_analysis(uuid, jsonb, extensions.vector);
create function public.save_article_analysis(
  p_article_id uuid, p_analysis jsonb, p_embedding extensions.vector(1536)
)
returns public.article_analyses
language plpgsql security invoker set search_path = '' as $$
declare saved public.article_analyses;
begin
  if p_embedding is null or extensions.vector_dims(p_embedding) <> 1536 then
    raise exception 'Embedding must have 1536 dimensions' using errcode = '22023';
  end if;
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

create or replace function public.save_article_embedding(
  p_article_id uuid, p_embedding extensions.vector(1536)
)
returns public.article_analyses
language plpgsql security invoker set search_path = '' as $$
declare saved public.article_analyses;
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

drop function if exists public.get_pending_articles(integer, timestamptz, uuid, uuid[]);
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

create or replace function public.match_related_articles(
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

grant update (embedding) on public.article_analyses to service_role;

revoke all on function public.save_article_analysis(uuid, jsonb, extensions.vector),
  public.save_article_embedding(uuid, extensions.vector),
  public.get_pending_articles(integer, timestamptz, uuid, uuid[]),
  public.match_related_articles(uuid, extensions.vector, integer)
  from public, anon, authenticated;
grant execute on function public.save_article_analysis(uuid, jsonb, extensions.vector),
  public.save_article_embedding(uuid, extensions.vector),
  public.get_pending_articles(integer, timestamptz, uuid, uuid[]),
  public.match_related_articles(uuid, extensions.vector, integer) to service_role;

notify pgrst, 'reload schema';
commit;

-- Read-only verification after commit:
-- select extname, extnamespace::regnamespace from pg_extension where extname = 'vector';
-- select format_type(atttypid, atttypmod) from pg_attribute
-- where attrelid = 'public.article_analyses'::regclass and attname = 'embedding';
-- select indexdef from pg_indexes where schemaname = 'public' and indexname = 'article_analyses_embedding_idx';
