-- 0007 made trip_companions readable by the trip owner only. Trip detail (History, and now
-- Feed post detail) shows companions alongside the rest of the trip's data, and 0003/0006
-- already extended trips/trip_stops/drink_logs to be readable by anyone who can see a feed post
-- built from that trip (owner, or a follower of the poster) via a SECURITY DEFINER helper that
-- avoids the feed_posts/trips RLS recursion 0006 fixed. Extend trip_companions the same way,
-- reusing that helper rather than a fresh correlated subquery.

create policy "trip companions are readable via visible feed posts" on public.trip_companions
  for select using (public.trip_visible_via_feed_post(trip_id, auth.uid()));
