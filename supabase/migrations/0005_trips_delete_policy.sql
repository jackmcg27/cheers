-- trips had select/insert/update RLS policies but no delete policy (0001_phase1_schema.sql),
-- so an owner could never delete their own trip — Supabase silently blocks it with no matching
-- row to delete. Add it so History can offer a "Delete" action.
--
-- No separate policy is needed on trip_stops/drink_logs/feed_posts to make the cascade work:
-- Postgres does not apply RLS to rows removed by ON DELETE CASCADE (they're a referential-
-- integrity side effect of the trips delete, not a user-issued DELETE on those tables), and
-- feed_posts.trip_id / trip_stops.trip_id / drink_logs.trip_stop_id are all already
-- ON DELETE CASCADE (0001, 0002).

create policy "trips are deletable by their owner" on public.trips
  for delete using (auth.uid() = user_id);
