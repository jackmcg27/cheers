-- Phase 3 of "companions should consent, not just get tagged": an accepted companion (0011)
-- gets the same control options as the host on the host's live trip — see the live target bar,
-- confirm arrival, add drinks, advance to the next bar, end the crawl. Two things a read-only
-- companion view didn't need are required once companions can write:
--
-- 1. In freeform (nearest-bar) mode, the bar the host is walking toward previously only existed
--    in the host's local React state — nothing was persisted until confirmArrival ran. Add
--    trips.target_bar_id/phase/route_index, populated the moment a target is chosen (not just at
--    arrival), so a companion's device can see it too. Only two DB phase values are needed
--    ('traveling'/'arrived') — the client-local 'idle'/'loading' phases never correspond to a
--    persisted trips row (idle: no row yet; loading: a transient per-device search the other
--    party can harmlessly miss).
--
-- 2. Once both host and companion can write trip progress, each device's own optimistic local
--    state can't be trusted as the only truth — the DB has to be reconcilable from either side.
--    That's a client-side (trip-context) concern; this migration just grants the write access.
--
-- Column-level grant on trips (mirrors 0011's trip_companions grant): a companion-parity UPDATE
-- policy must not let a companion rewrite user_id/crawl_id, only progress-tracking columns.
alter table public.trips
  add column if not exists target_bar_id uuid references public.bars (id),
  add column if not exists phase text not null default 'traveling'
    check (phase in ('traveling', 'arrived')),
  add column if not exists route_index integer not null default 0;

revoke update on public.trips from authenticated;
grant update (target_bar_id, phase, route_index, ended_at, total_distance_m, total_duration_s)
  on public.trips to authenticated;

-- Same recursion-avoidance pattern as 0006 (trip_visible_via_feed_post) and 0011
-- (is_trip_companion): any cross-table RLS check has to go through a SECURITY DEFINER function,
-- since a raw correlated subquery into a table whose own policy subqueries back causes
-- "infinite recursion detected in policy." is_trip_companion (0011) is intentionally left
-- untouched (pending-inclusive, used for invite visibility) rather than reused here — the new
-- write/parity policies below need a status='accepted' gate, which is a different semantic.
create or replace function public.is_active_trip_participant(p_trip_id uuid, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_companions tc
    where tc.trip_id = p_trip_id and tc.user_id = p_uid and tc.status = 'accepted'
  );
$$;

grant execute on function public.is_active_trip_participant(uuid, uuid) to authenticated;

-- Lets an active companion read a saved crawl (and its stops) even when it's private, so
-- route-mode trips work for companions the same way freeform ones do.
create or replace function public.is_active_trip_crawl(p_crawl_id uuid, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trips t
    where t.crawl_id = p_crawl_id and public.is_active_trip_participant(t.id, p_uid)
  );
$$;

grant execute on function public.is_active_trip_crawl(uuid, uuid) to authenticated;

-- Postgres ORs permissive policies for the same command together, so these are additive
-- alongside the existing owner-only policies (0001) — same convention as 0003/0005's
-- feed-visibility policies.

create policy "trips are updatable by active trip participants" on public.trips
  for update using (public.is_active_trip_participant(id, auth.uid()));

create policy "trip stops are readable by active trip participants" on public.trip_stops
  for select using (public.is_active_trip_participant(trip_id, auth.uid()));
create policy "trip stops are insertable by active trip participants" on public.trip_stops
  for insert with check (public.is_active_trip_participant(trip_id, auth.uid()));
create policy "trip stops are updatable by active trip participants" on public.trip_stops
  for update using (public.is_active_trip_participant(trip_id, auth.uid()));

-- Needed for both direct reads (CompanionsPanel's drink counters) and realtime: postgres_changes
-- only delivers a row to a client that could SELECT it, so without this a companion would neither
-- see nor receive live updates for anyone's logged drinks, including their own.
create policy "drink logs are readable by active trip participants" on public.drink_logs
  for select using (
    exists (
      select 1 from public.trip_stops s
      where s.id = trip_stop_id and public.is_active_trip_participant(s.trip_id, auth.uid())
    )
  );
create policy "drink logs are insertable by active trip participants" on public.drink_logs
  for insert with check (
    exists (
      select 1 from public.trip_stops s
      where s.id = trip_stop_id and public.is_active_trip_participant(s.trip_id, auth.uid())
    )
  );

-- Closes a real gap: today an accepted companion can only see their own invite row (0011), not
-- the rest of the roster, so CompanionsPanel would render empty for them. addCompanion/
-- removeCompanion stay host-only (no insert/delete policy change) — managing who's on the trip
-- is a more sensitive action than progressing an already-agreed-upon crawl.
create policy "trip companions are readable by active participants" on public.trip_companions
  for select using (public.is_active_trip_participant(trip_id, auth.uid()));

create policy "crawls are readable by active trip participants" on public.crawls
  for select using (public.is_active_trip_crawl(id, auth.uid()));
create policy "crawl stops are readable by active trip participants" on public.crawl_stops
  for select using (public.is_active_trip_crawl(crawl_id, auth.uid()));

-- active_host_trip (0012) only returned companion_id/host_name — a companion had no trip id to
-- attach to, just enough to show a blocking banner. Now it needs to return trip_id too, so
-- Postgres requires dropping the function first (create or replace can't change output columns).
drop function if exists public.active_host_trip();

create function public.active_host_trip()
returns table (companion_id uuid, host_name text, trip_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select tc.id, p.display_name, t.id
  from public.trip_companions tc
  join public.trips t on t.id = tc.trip_id
  join public.profiles p on p.id = t.user_id
  where tc.user_id = auth.uid()
    and tc.status = 'accepted'
    and t.ended_at is null
  limit 1;
$$;

grant execute on function public.active_host_trip() to authenticated;
