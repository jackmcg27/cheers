-- Phase 1 of "companions should consent, not just get tagged": a linked app-user companion
-- (0007) used to be added to a trip with no acknowledgement from them at all. Add a `status` so
-- tagging a linked user creates a pending invite instead of an instant add; the app sets it
-- explicitly to 'pending' for a user_id companion on insert (guest_name companions have no
-- account to ask, so they keep the old instant-add behavior via the column default).
--
-- Two new policies are needed so the *invitee*, not just the trip owner, can see and act on
-- their own invite — 0007's policies are all owner-only. The update is deliberately restricted
-- to the `status` column via a column-level grant, so accepting/declining an invite can't be used
-- to rewrite trip_id/guest_name/user_id on the row.
--
-- A third policy, on `trips` (not `trip_companions`), is also needed: `fetchPendingInvites` embeds
-- `trips!inner(profiles!user_id(display_name))` to show "who invited you", but `trips` RLS
-- (0001/0006) is owner-only or feed-post-visible-to-followers — a stranger who tags you has
-- neither, so the embed would silently deny the join and `!inner` would filter the invite out of
-- the result entirely (not just lose the host's name). Add a `trips` select policy for anyone
-- currently tagged as a companion on that trip, pending or not.
--
-- That policy can't be a plain correlated subquery on trip_companions, though: trip_companions'
-- own SELECT policy (0007, "readable by the trip owner") subqueries trips right back, so
-- Postgres finds trips reappearing in the same policy-expansion stack and raises "infinite
-- recursion detected in policy for relation trips" — the exact cycle 0006 already fixed once for
-- feed_posts/trips. Same fix here: a SECURITY DEFINER helper bypasses RLS on its own tables, so
-- calling it never re-enters trip_companions' policies and the cycle can't form.

alter table public.trip_companions
  add column if not exists status text not null default 'accepted'
    check (status in ('pending', 'accepted', 'declined'));

drop policy if exists "companions can see their own invites" on public.trip_companions;
create policy "companions can see their own invites" on public.trip_companions
  for select using (user_id = auth.uid());

revoke update on public.trip_companions from authenticated;
grant update (status) on public.trip_companions to authenticated;

drop policy if exists "invitee can respond to their own invite" on public.trip_companions;
create policy "invitee can respond to their own invite" on public.trip_companions
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.is_trip_companion(p_trip_id uuid, p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_companions tc
    where tc.trip_id = p_trip_id and tc.user_id = p_uid
  );
$$;

grant execute on function public.is_trip_companion(uuid, uuid) to authenticated;

drop policy if exists "trips are readable by their companions" on public.trips;
create policy "trips are readable by their companions" on public.trips
  for select using (public.is_trip_companion(id, auth.uid()));
