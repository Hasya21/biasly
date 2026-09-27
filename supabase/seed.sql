-- Run in Supabase SQL Editor after schema.sql.
-- Homepage entry sources only; this does not scrape or schedule anything.
-- Reruns preserve existing settings, including a manually disabled source.
-- Existing source settings are preserved on reruns.
begin;

insert into public.sources (name, listing_url, parser_strategy, active, logo_url)
values
  ('BBC News', 'https://www.bbc.com/news', null, true, null),
  ('The Guardian', 'https://www.theguardian.com/international', null, true, null),
  ('NPR', 'https://www.npr.org/sections/news/', 'npr', true, null),
  ('Reuters', 'https://www.reuters.com/', 'reuters', true, null),
  ('AP News', 'https://apnews.com/', 'ap', true, null)
on conflict (listing_url) do nothing;

commit;

select id, name, listing_url, parser_strategy, active
from public.sources
where listing_url in ('https://www.bbc.com/news', 'https://www.theguardian.com/international', 'https://www.npr.org/sections/news/', 'https://www.reuters.com/', 'https://apnews.com/')
order by name;
