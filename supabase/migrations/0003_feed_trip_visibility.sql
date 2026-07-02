-- Phase-1 RLS on trips/trip_stops/drink_logs only allowed the trip owner to read them.
-- Feed posts are now visible to followers too, so extend read access: anyone who can see
-- a feed post (owner, or a follower of the poster) can also read the trip data it summarizes.
-- Postgres RLS policies on the same table/action are OR'd together, so these are additive
-- alongside the existing owner-only policies from 0001_phase1_schema.sql.

create policy "trips are readable via visible feed posts" on public.trips
  for select using (
    exists (
      select 1 from public.feed_posts p
      where p.trip_id = trips.id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.followee_id = p.user_id
          )
        )
    )
  );

create policy "trip stops are readable via visible feed posts" on public.trip_stops
  for select using (
    exists (
      select 1 from public.feed_posts p
      where p.trip_id = trip_stops.trip_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.followee_id = p.user_id
          )
        )
    )
  );

create policy "drink logs are readable via visible feed posts" on public.drink_logs
  for select using (
    exists (
      select 1 from public.trip_stops s
      join public.feed_posts p on p.trip_id = s.trip_id
      where s.id = drink_logs.trip_stop_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.followee_id = p.user_id
          )
        )
    )
  );
