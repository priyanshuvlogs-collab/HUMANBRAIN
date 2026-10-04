-- OFFER BRAIN — Phase 2 hardening (found in review). Additive / policy-only changes.

-- ---------------------------------------------------------------------------
-- 1. Results and learning notes can only point at your own post (also on update),
--    and a note's review/result must belong to the same post.
-- ---------------------------------------------------------------------------
alter policy "results update own" on public.results
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
  );

alter policy "calibration_notes insert own" on public.calibration_notes
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
    and (review_id is null or exists (
      select 1 from public.reviews r where r.id = review_id and r.post_id = calibration_notes.post_id and r.user_id = (select auth.uid())
    ))
    and (result_id is null or exists (
      select 1 from public.results x where x.id = result_id and x.post_id = calibration_notes.post_id and x.user_id = (select auth.uid())
    ))
  );
alter policy "calibration_notes update own" on public.calibration_notes
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.posts p where p.id = post_id and p.user_id = (select auth.uid()))
    and (review_id is null or exists (
      select 1 from public.reviews r where r.id = review_id and r.post_id = calibration_notes.post_id and r.user_id = (select auth.uid())
    ))
    and (result_id is null or exists (
      select 1 from public.results x where x.id = result_id and x.post_id = calibration_notes.post_id and x.user_id = (select auth.uid())
    ))
  );

-- ---------------------------------------------------------------------------
-- 2. latest_results: each post's newest saved result (the one that counts), with the
--    post fields the proof library needs. security_invoker = RLS of the caller applies.
-- ---------------------------------------------------------------------------
create view public.latest_results with (security_invoker = true) as
select distinct on (r.post_id)
  r.id,
  r.post_id,
  r.user_id,
  r.views, r.hold_3s_pct, r.avg_watch_pct, r.likes, r.comments, r.saves, r.shares,
  r.dms, r.link_clicks, r.leads, r.sales,
  r.performance_index,
  r.collected_at,
  r.created_at,
  p.platform,
  p.format,
  p.goal,
  p.hook,
  p.script,
  coalesce(p.root_post_id, p.id) as root_id
from public.results r
join public.posts p on p.id = r.post_id
order by r.post_id, r.created_at desc, r.id desc;

revoke all on public.latest_results from anon;
grant select on public.latest_results to authenticated;
grant select on public.latest_results to service_role;

-- ---------------------------------------------------------------------------
-- 3. CSV import: posts + their results saved together (all or nothing).
--    security invoker: runs as the signed-in user, so RLS applies to both inserts.
-- ---------------------------------------------------------------------------
create function public.import_csv_batch(items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.posts (id, platform, format, goal, hook, script, on_screen_text, status, posted_at, source)
  select x.id, x.platform, x.format, x.goal, x.hook, coalesce(x.script, ''), coalesce(x.on_screen_text, ''),
         'posted', x.posted_at, 'csv'
  from jsonb_to_recordset(items) as x(
    id uuid, platform text, format text, goal text, hook text, script text, on_screen_text text, posted_at timestamptz
  );
  get diagnostics inserted = row_count;

  insert into public.results (post_id, views, hold_3s_pct, avg_watch_pct, likes, comments, saves, shares, dms,
                              link_clicks, leads, sales, performance_index, source)
  select x.id, x.views, x.hold_3s_pct, x.avg_watch_pct, x.likes, x.comments, x.saves, x.shares, x.dms,
         x.link_clicks, x.leads, x.sales, x.performance_index, 'csv'
  from jsonb_to_recordset(items) as x(
    id uuid, views numeric, hold_3s_pct numeric, avg_watch_pct numeric, likes numeric, comments numeric,
    saves numeric, shares numeric, dms numeric, link_clicks numeric, leads numeric, sales numeric,
    performance_index numeric
  );

  return inserted;
end;
$$;

revoke execute on function public.import_csv_batch(jsonb) from public, anon;
grant execute on function public.import_csv_batch(jsonb) to authenticated, service_role;
