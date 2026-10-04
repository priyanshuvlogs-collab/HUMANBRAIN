-- OFFER BRAIN — Phase 2: real results, Performance Index, learning mode, CSV import.
-- Additive only: nothing from Phase 1 is removed or renamed.

-- ---------------------------------------------------------------------------
-- More "my average" metrics (Performance Index for engagement / leads / sales posts)
-- ---------------------------------------------------------------------------
alter table public.platform_averages
  add column avg_likes numeric check (avg_likes >= 0),
  add column avg_comments numeric check (avg_comments >= 0),
  add column avg_link_clicks numeric check (avg_link_clicks >= 0),
  add column avg_leads numeric check (avg_leads >= 0),
  add column avg_sales numeric check (avg_sales >= 0);

-- ---------------------------------------------------------------------------
-- posts: where the post came from, and video length (used later for watch %)
-- ---------------------------------------------------------------------------
alter table public.posts
  add column source text not null default 'app' check (source in ('app', 'csv')),
  add column video_length_sec integer check (video_length_sec > 0);

-- ---------------------------------------------------------------------------
-- results: real metrics for a posted post. Append-only history:
-- every save / import / API fetch adds a row; the newest row is the current result.
-- ---------------------------------------------------------------------------
create table public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  views numeric check (views >= 0),
  hold_3s_pct numeric check (hold_3s_pct between 0 and 100),
  avg_watch_pct numeric check (avg_watch_pct between 0 and 100),
  likes numeric check (likes >= 0),
  comments numeric check (comments >= 0),
  saves numeric check (saves >= 0),
  shares numeric check (shares >= 0),
  dms numeric check (dms >= 0),
  link_clicks numeric check (link_clicks >= 0),
  leads numeric check (leads >= 0),
  sales numeric check (sales >= 0),
  performance_index numeric(8, 2), -- computed in app code; 1.0 = your average
  collected_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'api', 'csv')),
  created_at timestamptz not null default now()
);
create index results_user_id_idx on public.results (user_id);
create index results_post_id_collected_idx on public.results (post_id, collected_at desc);

-- ---------------------------------------------------------------------------
-- calibration_notes: learning-mode output (why the prediction differed from reality)
-- ---------------------------------------------------------------------------
create table public.calibration_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  review_id uuid references public.reviews (id) on delete set null,
  result_id uuid references public.results (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'done', 'error')),
  gap_summary text,
  lesson text,
  details jsonb,           -- what_was_right, what_was_missed, weigh_differently
  error text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calibration_notes_user_created_idx on public.calibration_notes (user_id, created_at desc);
create index calibration_notes_post_id_idx on public.calibration_notes (post_id);
create index calibration_notes_review_id_idx on public.calibration_notes (review_id);
create index calibration_notes_result_id_idx on public.calibration_notes (result_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.results enable row level security;
alter table public.calibration_notes enable row level security;

-- results: only for your own posts
create policy "results select own" on public.results for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "results insert own" on public.results for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
  );
create policy "results update own" on public.results for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "results delete own" on public.results for delete to authenticated
  using ((select auth.uid()) = user_id);

-- calibration_notes: only for your own posts
create policy "calibration_notes select own" on public.calibration_notes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "calibration_notes insert own" on public.calibration_notes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
  );
create policy "calibration_notes update own" on public.calibration_notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "calibration_notes delete own" on public.calibration_notes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.results, public.calibration_notes from anon;
grant select, insert, update, delete on public.results to authenticated;
grant select, insert, update, delete on public.calibration_notes to authenticated;
grant all on public.results, public.calibration_notes to service_role;
