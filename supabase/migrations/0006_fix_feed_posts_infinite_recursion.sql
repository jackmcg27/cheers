-- 0003 added SELECT policies on trips/trip_stops/drink_logs that each subquery feed_posts
-- directly (so a follower can see the trip data behind a visible post). feed_posts' own INSERT
-- policy (0002, "users post their own trips") subqueries trips to verify ownership. Combined,
-- that's a cycle back to the same relation: feed_posts insert-check -> trips select -> feed_posts
-- select again. Postgres detects feed_posts reappearing in the same policy-expansion stack and
-- raises "infinite recursion detected in policy for relation feed_posts" — this breaks both
-- posting to the feed AND plain feed browsing, since fetchFeed always embeds
-- trips(trip_stops(drink_logs(...))) under a feed_posts-rooted query.
--
-- Fix: move the feed_posts lookup into a SECURITY DEFINER function. It's owned by the table
-- owner, which bypasses RLS on its own tables entirely, so calling it never re-enters
-- feed_posts' RLS policies and the cycle can't form. Semantics are unchanged — still "owner or
-- follower of the feed post's author."

create or replace function public.trip_visible_via_feed_post(p_trip_id uuid, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.feed_posts p
    where p.trip_id = p_trip_id
      and (
        p.user_id = p_uid
        or exists (
          select 1 from public.follows f
          where f.follower_id = p_uid and f.followee_id = p.user_id
        )
      )
  );
$$;

grant execute on function public.trip_visible_via_feed_post(uuid, uuid) to authenticated;

drop policy if exists "trips are readable via visible feed posts" on public.trips;
create policy "trips are readable via visible feed posts" on public.trips
  for select using (public.trip_visible_via_feed_post(id, auth.uid()));

drop policy if exists "trip stops are readable via visible feed posts" on public.trip_stops;
create policy "trip stops are readable via visible feed posts" on public.trip_stops
  for select using (public.trip_visible_via_feed_post(trip_id, auth.uid()));

drop policy if exists "drink logs are readable via visible feed posts" on public.drink_logs;
create policy "drink logs are readable via visible feed posts" on public.drink_logs
  for select using (
    exists (
      select 1 from public.trip_stops s
      where s.id = drink_logs.trip_stop_id
        and public.trip_visible_via_feed_post(s.trip_id, auth.uid())
    )
  );
