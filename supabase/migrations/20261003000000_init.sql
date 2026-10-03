-- OFFER BRAIN — Phase 1 schema
-- Tables: brand_settings, platform_averages, offers, personas, posts, reviews.
-- Every table is private to its owner via Row Level Security (RLS).
-- Supabase no longer auto-grants table access, so every table gets explicit GRANTs below.

-- Helper functions live in a schema that is NOT exposed through the API.
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- brand_settings: one row per user (created automatically at signup)
-- ---------------------------------------------------------------------------
create table public.brand_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  handle text not null default '',
  niche text not null default '',
  platforms text[] not null default '{}'
    check (platforms <@ array['instagram', 'tiktok', 'youtube']::text[]),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- platform_averages: "my average performance" per platform (fills {{AVERAGE_METRICS}})
-- ---------------------------------------------------------------------------
create table public.platform_averages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube')),
  avg_views numeric check (avg_views >= 0),
  avg_hold_3s_pct numeric check (avg_hold_3s_pct between 0 and 100),
  avg_watch_pct numeric check (avg_watch_pct between 0 and 100),
  avg_saves numeric check (avg_saves >= 0),
  avg_shares numeric check (avg_shares >= 0),
  avg_dms numeric check (avg_dms >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

-- ---------------------------------------------------------------------------
-- offers: what a post is meant to sell
-- ---------------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  price numeric check (price >= 0),
  cta_type text not null check (cta_type in ('dm_keyword', 'link', 'booking')),
  cta_destination text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- personas: the simulated audience panel. Any number; at most 10 active.
-- ---------------------------------------------------------------------------
create table public.personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  voice text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- posts: content being reviewed. Re-reviews create a new post whose
-- root_post_id points at the ORIGINAL post (root = source.root_post_id ?? source.id).
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok', 'youtube')),
  format text not null,
  goal text not null check (goal in ('views', 'engagement', 'leads', 'sales')),
  hook text not null check (length(trim(hook)) > 0),
  script text not null default '',
  on_screen_text text not null default '',
  offer_id uuid references public.offers (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  posted_at timestamptz,
  external_post_id text,
  root_post_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint posts_platform_format check (
    (platform = 'instagram' and format in ('reel', 'carousel', 'post', 'story'))
    or (platform = 'tiktok' and format in ('video', 'carousel'))
    or (platform = 'youtube' and format in ('short'))
  )
);

-- ---------------------------------------------------------------------------
-- reviews: one AI review of one post version
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  raw_response text not null,
  parsed jsonb not null,
  schema_version integer not null,
  provisional_format boolean not null default false,
  total_score numeric(4, 1) not null check (total_score between 0 and 100), -- computed in app code
  predicted_tier text not null check (predicted_tier in ('BELOW', 'AVERAGE', 'ABOVE', 'BREAKOUT')),
  confidence text not null check (confidence in ('LOW', 'MEDIUM', 'HIGH')),
  predicted_outcome text check (predicted_outcome in ('VIEWS', 'ENGAGEMENT', 'SAVES_SHARES', 'LEADS', 'SALES')),
  model text not null,
  brain_version text not null,
  usage jsonb,
  created_at timestamptz not null default now()
);

-- Indexes (every RLS filter column, plus common lookups)
create index platform_averages_user_id_idx on public.platform_averages (user_id);
create index offers_user_id_idx on public.offers (user_id);
create index personas_user_id_idx on public.personas (user_id);
create index posts_user_id_created_idx on public.posts (user_id, created_at desc);
create index posts_root_post_id_idx on public.posts (root_post_id);
create index posts_offer_id_idx on public.posts (offer_id);
create index reviews_user_id_created_idx on public.reviews (user_id, created_at desc);
create index reviews_post_id_idx on public.reviews (post_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: each user only sees and changes their own rows
-- ---------------------------------------------------------------------------
alter table public.brand_settings enable row level security;
alter table public.platform_averages enable row level security;
alter table public.offers enable row level security;
alter table public.personas enable row level security;
alter table public.posts enable row level security;
alter table public.reviews enable row level security;

-- brand_settings
create policy "brand_settings select own" on public.brand_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "brand_settings insert own" on public.brand_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "brand_settings update own" on public.brand_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "brand_settings delete own" on public.brand_settings for delete to authenticated
  using ((select auth.uid()) = user_id);

-- platform_averages
create policy "platform_averages select own" on public.platform_averages for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "platform_averages insert own" on public.platform_averages for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "platform_averages update own" on public.platform_averages for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "platform_averages delete own" on public.platform_averages for delete to authenticated
  using ((select auth.uid()) = user_id);

-- offers
create policy "offers select own" on public.offers for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "offers insert own" on public.offers for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "offers update own" on public.offers for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "offers delete own" on public.offers for delete to authenticated
  using ((select auth.uid()) = user_id);

-- personas
create policy "personas select own" on public.personas for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "personas insert own" on public.personas for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "personas update own" on public.personas for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "personas delete own" on public.personas for delete to authenticated
  using ((select auth.uid()) = user_id);

-- posts: foreign keys ignore RLS, so also check that a linked offer is yours.
-- (root_post_id isn't checked here: a policy on posts can't query posts — Postgres reports
-- infinite recursion — and linking to someone else's post id reveals nothing, since RLS hides it.)
create policy "posts select own" on public.posts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "posts insert own" on public.posts for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (offer_id is null or exists (
      select 1 from public.offers o where o.id = offer_id and o.user_id = (select auth.uid())))
  );
create policy "posts update own" on public.posts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (offer_id is null or exists (
      select 1 from public.offers o where o.id = offer_id and o.user_id = (select auth.uid())))
  );
create policy "posts delete own" on public.posts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- reviews: can only be attached to your own post
create policy "reviews select own" on public.reviews for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "reviews insert own" on public.reviews for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
  );
create policy "reviews delete own" on public.reviews for delete to authenticated
  using ((select auth.uid()) = user_id);
-- (no update policy: reviews are a permanent record)

-- ---------------------------------------------------------------------------
-- Grants (required: tables are not auto-exposed to the API any more)
-- ---------------------------------------------------------------------------
revoke all on public.brand_settings, public.platform_averages, public.offers,
  public.personas, public.posts, public.reviews from anon;
grant select, insert, update, delete on public.brand_settings to authenticated;
grant select, insert, update, delete on public.platform_averages to authenticated;
grant select, insert, update, delete on public.offers to authenticated;
grant select, insert, update, delete on public.personas to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.reviews to authenticated;
grant all on public.brand_settings, public.platform_averages, public.offers,
  public.personas, public.posts, public.reviews to service_role;

-- ---------------------------------------------------------------------------
-- Max 10 ACTIVE personas per user (the app checks too; this is the safety net).
-- The advisory lock makes two simultaneous requests wait for each other, so they
-- can't both see "9 active" and both switch one on.
-- ---------------------------------------------------------------------------
create or replace function private.enforce_active_persona_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
begin
  if new.active then
    perform pg_advisory_xact_lock(hashtext('personas_active'), hashtext(new.user_id::text));
    select count(*) into active_count
      from public.personas p
     where p.user_id = new.user_id
       and p.active
       and p.id is distinct from new.id;
    if active_count >= 10 then
      raise exception 'You can have at most 10 active personas'
        using errcode = 'check_violation',
              hint = 'Switch another persona off first.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_active_persona_limit() from public;

create trigger personas_active_limit
  before insert or update of active, user_id on public.personas
  for each row execute function private.enforce_active_persona_limit();

-- ---------------------------------------------------------------------------
-- New user → create their brand_settings row and the 5 default personas.
-- Runs inside the signup transaction as supabase_auth_admin, where auth.uid() is
-- NULL, so user_id is set from new.id explicitly.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.brand_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;

  insert into public.personas (user_id, name, description, voice, active, sort_order) values
    (new.id, 'The Skeptic',
     'Has bought courses before and got burned; hunts for hype and fake promises.',
     'Blunt and suspicious. Calls out anything that sounds too good to be true.', true, 1),
    (new.id, 'The Busy Beginner',
     'Wants extra income, has 10 minutes a day, confused by jargon.',
     'Tired, hopeful, a little overwhelmed. Plain words only.', true, 2),
    (new.id, 'The Ready Buyer',
     'Already wants the result; deciding who to trust.',
     'Focused and practical. Looking for a reason to say yes.', true, 3),
    (new.id, 'The Scroller',
     'Not in the market, very low attention; only stops for novelty, emotion, or surprise.',
     'Distracted, thumb already moving. Reacts in a few words.', true, 4),
    (new.id, 'The Expert Peer',
     'Knows the topic; judges credibility and originality.',
     'Knowledgeable and a bit critical. Notices recycled advice instantly.', true, 5);

  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
