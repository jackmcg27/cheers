-- Phase 2 of "companions should consent, not just get tagged": once you've *accepted* an invite
-- (0011) onto someone else's still-active trip, you shouldn't be able to start a separate crawl
-- of your own at the same time — that's the whole point of the invite. This is a soft lock, not
-- a hard one: it's enforced client-side (`startCrawl`/`startCrawlWithRoute` check before
-- inserting a new trip) rather than a DB trigger, and the way out is simply declining the invite
-- you already accepted (`respondToInvite`, which the invitee can call regardless of the row's
-- current status — see 0011's update policy).
--
-- The check itself has to be a SECURITY DEFINER function rather than a plain client query: the
-- invitee needs to know whether *any* of their own trip_companions rows points at a trip that's
-- still active (`ended_at is null`) and who's hosting it, but `trips` RLS only grants them read
-- access to that one trip's row (0011's new policy) — not a cheap way to search "all trips I'm
-- tagged on" without re-deriving the same join RLS already encodes. Scoping to auth.uid()
-- internally (no uid parameter) means there's nothing for a caller to pass that would let them
-- probe another user's active-companion status.

create or replace function public.active_host_trip()
returns table (companion_id uuid, host_name text)
language sql
security definer
set search_path = public
stable
as $$
  select tc.id, p.display_name
  from public.trip_companions tc
  join public.trips t on t.id = tc.trip_id
  join public.profiles p on p.id = t.user_id
  where tc.user_id = auth.uid()
    and tc.status = 'accepted'
    and t.ended_at is null
  limit 1;
$$;

grant execute on function public.active_host_trip() to authenticated;
