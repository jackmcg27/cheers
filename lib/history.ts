import { supabase } from './supabase';

export type HistoryCompanion = { id: string; userId: string | null; label: string };

export type HistoryTrip = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  totalDistanceM: number | null;
  totalDurationS: number | null;
  crawlId: string | null;
  stopCount: number;
  logs: { drinkName: string | null; companionId: string | null }[];
  /** True when the viewer owns this trip — drives which History card actions are shown
   * ("Delete"/"Post to Feed"/"Publish as Crawl" are owner-only; a companion gets "Remove from my
   * history" instead, since a hard delete isn't theirs to do and RLS wouldn't allow it anyway). */
  isOwner: boolean;
  /** The viewer's own `trip_companions.id` when they're an attached companion (not the owner) —
   * needed to call `hideCompanionTrip`. Null for the owner. */
  myCompanionId: string | null;
  /** Everyone else on the trip, viewer-relative: excludes the viewer's own entry, and includes a
   * synthesized `{ id: 'owner', ... }` entry for the host when the viewer isn't the owner. Pass
   * straight through to `summarizeDrinksByCompanion` alongside `myCompanionId`/`null` as the
   * viewer key. */
  companions: HistoryCompanion[];
};

type TripRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  total_distance_m: number | null;
  total_duration_s: number | null;
  crawl_id: string | null;
  profiles: { display_name: string | null } | null;
  trip_stops: { drink_logs: { drink_name: string | null; companion_id: string | null }[] }[];
  trip_companions: {
    id: string;
    user_id: string | null;
    guest_name: string | null;
    profiles: { display_name: string | null } | null;
  }[];
};

export const HISTORY_TRIP_SELECT =
  'id, user_id, started_at, ended_at, total_distance_m, total_duration_s, crawl_id, profiles!user_id(display_name), trip_stops(drink_logs(drink_name, companion_id)), trip_companions(id, user_id, guest_name, profiles(display_name))';

function mapTripRow(row: TripRow, viewerId: string): HistoryTrip {
  const isOwner = row.user_id === viewerId;
  const mine = row.trip_companions?.find((c) => c.user_id === viewerId) ?? null;
  const logs = (row.trip_stops ?? []).flatMap((s) => s.drink_logs ?? []).map((d) => ({
    drinkName: d.drink_name,
    companionId: d.companion_id,
  }));

  const companions: HistoryCompanion[] = [];
  if (!isOwner) {
    companions.push({ id: 'owner', userId: row.user_id, label: row.profiles?.display_name ?? 'Someone' });
  }
  for (const c of row.trip_companions ?? []) {
    if (mine && c.id === mine.id) continue;
    companions.push({ id: c.id, userId: c.user_id, label: c.profiles?.display_name ?? c.guest_name ?? 'Someone' });
  }

  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalDistanceM: row.total_distance_m,
    totalDurationS: row.total_duration_s,
    crawlId: row.crawl_id,
    stopCount: row.trip_stops?.length ?? 0,
    logs,
    isOwner,
    myCompanionId: mine?.id ?? null,
    companions,
  };
}

/** Trip ids the user is an accepted, still-visible companion on — merged with their own trips so
 * History shows both "crawls I ran" and "crawls I tagged along on." Hidden (soft-unlinked) trips
 * are excluded here rather than filtered client-side after the fact, so a hidden trip never even
 * reaches the `trips` query below. */
async function fetchVisibleCompanionTripIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('trip_companions')
    .select('trip_id')
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .is('hidden_at', null);
  if (error) throw error;
  return (data ?? []).map((r) => r.trip_id as string);
}

/** One page of History: the user's own completed trips, unioned with completed trips they're an
 * accepted (non-hidden) companion on. PostgREST has no subquery join, so this is two round trips —
 * first the companion trip ids, then the `trips` page filtered to "mine OR one of those ids." */
export async function fetchHistoryPage(
  userId: string,
  offset: number,
  limit: number
): Promise<{ trips: HistoryTrip[]; hasMore: boolean }> {
  const companionTripIds = await fetchVisibleCompanionTripIds(userId);
  let query = supabase.from('trips').select(HISTORY_TRIP_SELECT).not('ended_at', 'is', null);
  query =
    companionTripIds.length > 0
      ? query.or(`user_id.eq.${userId},id.in.(${companionTripIds.join(',')})`)
      : query.eq('user_id', userId);
  const { data, error } = await query.order('started_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data as unknown as TripRow[]) ?? [];
  return { trips: rows.map((r) => mapTripRow(r, userId)), hasMore: rows.length === limit };
}

/** Removes a trip from a companion's own History without touching the shared trip: sets
 * `hidden_at` on their own `trip_companions` row so it's excluded from future
 * `fetchVisibleCompanionTripIds` calls, while their `trip_companions` row (and drink attribution)
 * stays fully intact for the host and everyone else. Not a delete — see 0015's migration comment
 * for why a hard delete isn't an option here. */
export async function hideCompanionTrip(companionId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_companions')
    .update({ hidden_at: new Date().toISOString() })
    .eq('id', companionId);
  if (error) throw error;
}
