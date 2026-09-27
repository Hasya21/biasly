-- Paste this entire file into Supabase SQL Editor after schema.sql is installed.
-- Creates fictional demo data only. No scraping or AI calls. Safe to rerun.
-- The inactive source cannot be picked up by active-source scraping/scheduling.
-- Image points to this app's existing local asset through its development URL.
-- If testing a hosted app, replace the image URL with that app's absolute URL.
begin;
set transaction isolation level read committed;

do $fixture$
declare
  source_uuid uuid;
  article_uuid uuid;
  demo_url constant text := 'https://demo.biasly.invalid/articles/community-library-pilot';
begin
  insert into public.sources(name, listing_url, active)
  values ('Biasly Demo — Fictional', 'https://demo.biasly.invalid/', false)
  on conflict (listing_url) do nothing;
  select id into strict source_uuid from public.sources where listing_url = 'https://demo.biasly.invalid/';

  -- The URL trigger runs before ON CONFLICT, so explicitly look up the fixture first.
  perform pg_advisory_xact_lock(731490215::bigint);
  select id into article_uuid from public.articles
  where original_url = demo_url or canonical_url = demo_url;
  if article_uuid is null then
    insert into public.articles (
      source_id, original_url, canonical_url, title, image_url, published_at, raw_text
    ) values (
      source_uuid, demo_url, demo_url,
      '[DEMO] Community library tests longer evening opening hours',
      'http://localhost:3000/images/homepage/peace.jpg',
      now(),
      $body$This is a fictional article created for interface testing. The imaginary town of Brookfield has announced a six-week trial of longer evening hours at its community library. During the trial, the library would remain open until nine o'clock on two weekdays. The example does not describe a real council decision or a verified news event.

In this fictional scenario, supporters say the additional hours could help residents who work during the day and students who need a quiet place to study. The proposal includes access to reading rooms, public computers and the existing book collection. No new membership fee is included in the example plan, and weekend opening hours would remain the same.

Other participants in the fictional discussion ask how staffing and utility costs would be covered. They request a published spending estimate before any permanent extension. Library staff propose recording evening attendance and inviting visitors to complete a short feedback form. These details are invented to provide balanced article text for testing the framing display.

At the end of the hypothetical trial, a public report would compare attendance, operating costs and visitor feedback. The town would then decide whether to continue, revise or end the extended hours. This demonstration deliberately includes both access benefits and budget questions. The accompanying scores and summary are hand-written fixtures, not the output of an AI model or an assessment of a real publisher.$body$
    ) returning id into article_uuid;
  end if;

  -- Reuses the atomic save function; it also sets articles.analyzed_at.
  perform public.save_article_analysis(article_uuid, jsonb_build_object(
    'summary', 'FICTIONAL DEMO: A community library considers a six-week evening-hours trial. The article presents potential access benefits alongside staffing and cost questions, with a review planned after the trial.',
    'sentiment_score', 0.15,
    'sentiment_label', 'positive',
    'bias_label', 'center',
    'left_percentage', 25,
    'center_percentage', 60,
    'right_percentage', 15,
    'confidence', 0.72,
    'framing_notes', jsonb_build_array(
      'Dummy framing: access benefits and budget concerns both receive space.',
      'These percentages describe this fictional article, not the publisher.',
      'All values are manually supplied for UI testing; no model was called.'
    ),
    'loaded_terms', jsonb_build_array('supporters'),
    'disclaimer', 'Fictional test article and manually authored analysis. The scores and confidence are dummy values, not an actual AI assessment. The image is illustrative and unrelated to a real library event.',
    'model', 'manual-demo-fixture'
  ));
end;
$fixture$;
commit;

select a.id, a.title, '/news/' || a.id::text as future_details_path,
       a.analyzed_at, s.name as source, s.active as source_active,
       x.left_percentage, x.center_percentage, x.right_percentage, x.bias_score
from public.articles a
join public.sources s on s.id = a.source_id
join public.article_analyses x on x.article_id = a.id
where a.original_url = 'https://demo.biasly.invalid/articles/community-library-pilot';
