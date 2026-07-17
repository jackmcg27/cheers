-- Phase 3 continued: push live trip progress to an attached companion (and back to the host)
-- the same way 0002 already does for feed_posts. postgres_changes respects each connected
-- client's own RLS SELECT policy, so this is safe now that 0013 extended trips/trip_stops/
-- drink_logs/trip_companions read access to active trip participants. Kept as its own migration,
-- separate from 0013's RLS changes, so it can be reverted independently if realtime misbehaves
-- against a real project without touching the load-bearing policy changes underneath it.

alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.trip_stops;
alter publication supabase_realtime add table public.drink_logs;
alter publication supabase_realtime add table public.trip_companions;
