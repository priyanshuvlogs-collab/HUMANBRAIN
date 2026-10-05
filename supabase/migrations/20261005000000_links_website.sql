-- OFFER BRAIN — review from a link, and websites as a "platform".

-- Where the reviewed content came from (a social post or web page URL), if it was fetched from a link.
alter table public.posts
  add column source_url text check (source_url is null or length(source_url) <= 2000);

-- Allow "website" (landing / sales pages) everywhere a platform is stored.
alter table public.brand_settings drop constraint brand_settings_platforms_check;
alter table public.brand_settings add constraint brand_settings_platforms_check
  check (platforms <@ array['instagram', 'tiktok', 'youtube', 'website']::text[]);

alter table public.platform_averages drop constraint platform_averages_platform_check;
alter table public.platform_averages add constraint platform_averages_platform_check
  check (platform in ('instagram', 'tiktok', 'youtube', 'website'));

alter table public.posts drop constraint posts_platform_check;
alter table public.posts add constraint posts_platform_check
  check (platform in ('instagram', 'tiktok', 'youtube', 'website'));

alter table public.posts drop constraint posts_platform_format;
alter table public.posts add constraint posts_platform_format check (
  (platform = 'instagram' and format in ('reel', 'carousel', 'post', 'story'))
  or (platform = 'tiktok' and format in ('video', 'carousel'))
  or (platform = 'youtube' and format in ('short'))
  or (platform = 'website' and format in ('landing_page', 'sales_page'))
);
