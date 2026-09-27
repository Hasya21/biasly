-- Run after schema.sql. All fixtures and test mutations are rolled back.
begin;
set transaction isolation level read committed;

do $$
declare
  sid uuid;
  aid uuid;
  bid uuid;
  schedule uuid;
  analysis public.article_analyses;
  fixture text := 'https://verification.invalid/' || gen_random_uuid()::text;
  payload jsonb := '{"summary":"A neutral summary.","sentiment_score":0.2,"sentiment_label":"positive","bias_label":"center","left_percentage":20,"center_percentage":50,"right_percentage":30,"confidence":0.8,"framing_notes":["Text evidence"],"loaded_terms":[],"disclaimer":"AI-estimated, not objective truth.","model":"verification-only"}';
  embedding extensions.vector(1536) := array_fill(0.01::real, array[1536])::extensions.vector;
  table_name text;
  role_name text;
begin
  insert into public.sources(name, listing_url) values ('Transactional verification', fixture) returning id into sid;
  insert into public.articles(source_id, original_url, canonical_url, title, image_url, published_at, raw_text, analyzed_at)
    values (sid, fixture || '/original', fixture || '/canonical', 'Fixture article', fixture || '/image.jpg', now(), repeat('Meaningful article sentence. ', 40), now()) returning id into aid;
  insert into public.articles(source_id, original_url, canonical_url, title, image_url, published_at, raw_text)
    values (sid, fixture || '/second', fixture || '/second', 'Second fixture', fixture || '/image.jpg', now(), repeat('Another article sentence. ', 40)) returning id into bid;

  if not exists (select 1 from public.get_pending_articles(100, null, null, array[aid]) where id = aid) then
    raise exception 'FAIL: pending lookup ignored stale analyzed_at';
  end if;
  if (select count(*) from public.get_pending_articles(1, null, null, array[aid,bid])) <> 1 then
    raise exception 'FAIL: pending page bound';
  end if;
  if exists (select 1 from public.get_pending_articles(10, null, null, array[]::uuid[])) then
    raise exception 'FAIL: empty article selection';
  end if;
  if (select count(*) from public.get_pending_articles(100, (select scraped_at from public.articles where id = least(aid,bid)), least(aid,bid), array[aid,bid])) <> 1 then
    raise exception 'FAIL: pending keyset cursor';
  end if;

  begin
    insert into public.articles(source_id, original_url, canonical_url, title, image_url, published_at, raw_text)
      values (sid, fixture || '/canonical', fixture || '/third', 'Duplicate fixture', fixture || '/image.jpg', now(), repeat('Body text. ', 100));
    raise exception 'FAIL: canonical-to-original duplicate accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.articles(source_id, original_url, canonical_url, title, image_url, published_at, raw_text)
      values (sid, fixture || '/fourth', fixture || '/original', 'Duplicate fixture', fixture || '/image.jpg', now(), repeat('Body text. ', 100));
    raise exception 'FAIL: original-to-canonical duplicate accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.articles(source_id, original_url, canonical_url, title, image_url, published_at, raw_text)
      values (sid, fixture || '/fifth', fixture || '/fifth', 'Invalid fixture', null, now(), repeat('Body text. ', 100));
    raise exception 'FAIL: missing image accepted';
  exception when not_null_violation then null; end;
  begin
    insert into public.articles(source_id, original_url, canonical_url, title, image_url, published_at, raw_text)
      values (sid, fixture || '/sixth', fixture || '/sixth', 'Invalid fixture', fixture || '/image.jpg', null, repeat('Body text. ', 100));
    raise exception 'FAIL: missing publication date accepted';
  exception when not_null_violation then null; end;
  begin
    insert into public.articles(source_id, original_url, canonical_url, title, image_url, published_at, raw_text)
      values (sid, fixture || '/seventh', fixture || '/seventh', 'Invalid fixture', fixture || '/image.jpg', now(), E'x\n\ny\n\nz');
    raise exception 'FAIL: meaningless paragraphs accepted';
  exception when check_violation then null; end;

  begin
    perform public.save_article_analysis(bid, payload || '{"center_percentage":51}'::jsonb, embedding);
    raise exception 'FAIL: invalid percentages accepted';
  exception when check_violation then null; end;
  if exists (select 1 from public.article_analyses where article_id = bid) or
     (select analyzed_at is not null from public.articles where id = bid) then
    raise exception 'FAIL: invalid analysis partially saved';
  end if;
  analysis := public.save_article_analysis(aid, payload, embedding);
  if analysis.bias_score <> 0.1 then raise exception 'FAIL: derived bias score'; end if;
  if exists (select 1 from public.get_pending_articles(100, null, null, array[aid])) then
    raise exception 'FAIL: completed article still pending';
  end if;
  analysis := public.save_article_analysis(bid, payload, embedding);
  if (select analyzed_at is null from public.articles where id = bid) then raise exception 'FAIL: completion timestamp missing'; end if;
  if (public.save_article_analysis(bid, payload || '{"summary":"Must not replace existing analysis"}'::jsonb, embedding)).id <> analysis.id then
    raise exception 'FAIL: retry created new analysis';
  end if;
  if (select summary from public.article_analyses where article_id = bid) <> 'A neutral summary.' then
    raise exception 'FAIL: retry replaced existing analysis';
  end if;
  delete from public.article_analyses where article_id = aid;
  if not exists (select 1 from public.get_pending_articles(100, null, null, array[aid])) then
    raise exception 'FAIL: deleted analysis not picked up';
  end if;

  insert into public.oxylabs_schedules(source_id, schedule_id, state)
    values (sid, '9223372036854775807', 'active') returning id into schedule;
  insert into public.oxylabs_schedule_runs(schedule_id, external_run_id, job_id)
    values (schedule, '9223372036854775806', '9223372036854775805');
  if (select job_id from public.oxylabs_schedule_runs where schedule_id = schedule) <> '9223372036854775805' then
    raise exception 'FAIL: job ID precision';
  end if;
  begin
    insert into public.oxylabs_schedule_runs(schedule_id, external_run_id, job_id)
      values (schedule, '9223372036854775806', '9223372036854775805');
    raise exception 'FAIL: duplicate job claim accepted';
  exception when unique_violation then null; end;

  foreach table_name in array array['sources','articles','article_analyses','logs','oxylabs_schedules','oxylabs_schedule_runs'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || table_name)::regclass) then
      raise exception 'FAIL: RLS disabled on %', table_name;
    end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_table_privilege(role_name, 'public.' || table_name, 'SELECT,INSERT,UPDATE,DELETE') then
        raise exception 'FAIL: unexpected public access on %', table_name;
      end if;
    end loop;
    if not has_table_privilege('service_role', 'public.' || table_name, 'SELECT') then
      raise exception 'FAIL: missing service read access on %', table_name;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.save_article_analysis(uuid,jsonb,extensions.vector)', 'EXECUTE') or
     has_function_privilege('anon', 'public.match_related_articles(uuid,extensions.vector,integer)', 'EXECUTE') or
     has_function_privilege('authenticated', 'public.get_pending_articles(integer,timestamptz,uuid,uuid[])', 'EXECUTE') then
    raise exception 'FAIL: public RPC execution permitted';
  end if;
end;
$$;

-- Exercise invoker functions and triggers under the actual restricted service role.
set local role service_role;
do $$
declare s uuid; a uuid; analysis public.article_analyses;
  embedding extensions.vector(1536) := array_fill(0.01::real, array[1536])::extensions.vector;
begin
  insert into public.sources(name, listing_url) values ('Service-role fixture', 'https://verification.invalid/' || gen_random_uuid()::text) returning id into s;
  insert into public.articles(source_id, original_url, canonical_url, title, image_url, published_at, raw_text)
    values (s, 'https://verification.invalid/' || gen_random_uuid()::text, 'https://verification.invalid/' || gen_random_uuid()::text,
    'Service fixture', 'https://verification.invalid/image.jpg', now(), repeat('Service article body. ', 50)) returning id into a;
  analysis := public.save_article_analysis(a, '{"summary":"Summary","sentiment_score":0,"sentiment_label":"neutral","bias_label":"center","left_percentage":0,"center_percentage":100,"right_percentage":0,"confidence":0.5,"framing_notes":[],"loaded_terms":[],"disclaimer":"AI-estimated","model":"test"}', embedding);
  if analysis.article_id <> a then raise exception 'FAIL: service role save'; end if;
  perform * from public.get_pending_articles(1);
end;
$$;
reset role;
rollback;
select 'PASS: database constraints, dedupe, pending cursors, atomic analysis/embedding, vector RPC security, IDs, RLS, and service permissions; fixtures rolled back' as result;
