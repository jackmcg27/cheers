import { supabase } from './supabase';

export type PendingInvite = {
  id: string;
  tripId: string;
  hostName: string;
};

type PendingInviteRow = {
  id: string;
  trip_id: string;
  trips: { profiles: { display_name: string | null } | null } | null;
};

/** Trip-companion invites tagged to `userId` still awaiting a response — 0011 makes tagging a
 * linked app user create a `status: 'pending'` row instead of an instant add. Guest-name
 * companions never appear here; they have no account/session to ask. */
export async function fetchPendingInvites(userId: string): Promise<PendingInvite[]> {
  const { data, error } = await supabase
    .from('trip_companions')
    .select('id, trip_id, trips!inner(profiles!user_id(display_name))')
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (error) throw error;

  return ((data as unknown as PendingInviteRow[]) ?? []).map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    hostName: row.trips?.profiles?.display_name ?? 'Someone',
  }));
}

/** Accept or decline a pending invite. RLS (0011) restricts this to the invitee's own row, and a
 * column-level grant restricts the update to `status` only. */
export async function respondToInvite(companionId: string, accept: boolean) {
  const { error } = await supabase
    .from('trip_companions')
    .update({ status: accept ? 'accepted' : 'declined' })
    .eq('id', companionId);
  if (error) throw error;
}

export type TripCompanionRow = {
  id: string;
  name: string;
  status: 'pending' | 'accepted' | 'declined';
};

type TripCompanionsResponseRow = {
  id: string;
  guest_name: string | null;
  status: 'pending' | 'accepted' | 'declined';
  profiles: { display_name: string | null } | null;
};

/** All companions (any status) currently tagged on a trip — used to refresh the host's view
 * after an invitee accepts/declines elsewhere, since trip-context's `companions` state only
 * updates locally on `addCompanion`/`removeCompanion` otherwise. */
export async function fetchTripCompanions(tripId: string): Promise<TripCompanionRow[]> {
  const { data, error } = await supabase
    .from('trip_companions')
    .select('id, guest_name, status, profiles(display_name)')
    .eq('trip_id', tripId);
  if (error) throw error;

  return ((data as unknown as TripCompanionsResponseRow[]) ?? []).map((row) => ({
    id: row.id,
    name: row.guest_name ?? row.profiles?.display_name ?? 'Someone',
    status: row.status,
  }));
}

/** Live updates for the current user's own `trip_companions` rows — a new invite arriving, or
 * one of theirs changing status — without waiting for the next screen focus. Filtered to
 * `user_id=eq.<uid>` since a client only ever needs to react to invites addressed to it. Returns
 * an unsubscribe function; the caller decides what to re-fetch on change. */
export function subscribeToInviteChanges(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`invites-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trip_companions', filter: `user_id=eq.${userId}` },
      onChange
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

export type ActiveHostTrip = {
  companionId: string;
  hostName: string;
  tripId: string;
};

/** Whether the current user has already accepted an invite onto someone else's crawl that's
 * still going (`ended_at is null`). `companionId` is the invitee's own `trip_companions` row id,
 * so the caller can offer "leave" by passing it straight to `respondToInvite(companionId, false)`.
 * `tripId` (0013) is what trip-context attaches to for Phase 3 live parity — the companion gets
 * the same control options as the host on this trip. Uses the `active_host_trip` SECURITY
 * DEFINER function (0012) rather than a plain query — see that migration for why. */
export async function fetchActiveHostTrip(): Promise<ActiveHostTrip | null> {
  const { data, error } = await supabase.rpc('active_host_trip');
  if (error) throw error;

  const row = data?.[0];
  if (!row) return null;
  return { companionId: row.companion_id, hostName: row.host_name ?? 'Someone', tripId: row.trip_id };
}
