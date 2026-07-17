import { summarizeDrinkNames } from './format';
import { supabase } from './supabase';

export type TripDetailStop = {
  id: string;
  order: number;
  barName: string | null;
  barAddress: string | null;
  arrivedAt: string;
  leftAt: string | null;
  drinkCount: number;
  drinkSummary: string | null;
};

export type TripDetailCompanion = {
  id: string;
  label: string;
  drinkCount: number;
  drinkSummary: string | null;
};

export type TripDetail = {
  id: string;
  ownerId: string;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  startedAt: string;
  endedAt: string | null;
  totalDistanceM: number | null;
  totalDurationS: number | null;
  crawlId: string | null;
  photoUrl: string | null;
  totalDrinks: number;
  /** True when the viewer is the owner or a tagged companion (any status) — i.e. they were
   * actually on this trip, so a "You" row makes sense. False for e.g. a follower viewing someone
   * else's trip via a Feed post they didn't take part in. */
  viewerInvolved: boolean;
  ownDrinkCount: number;
  ownDrinkSummary: string | null;
  stops: TripDetailStop[];
  companions: TripDetailCompanion[];
};

type TripDetailRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  total_distance_m: number | null;
  total_duration_s: number | null;
  crawl_id: string | null;
  photo_url: string | null;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
  trip_stops: {
    id: string;
    stop_order: number;
    arrived_at: string;
    left_at: string | null;
    bars: { name: string; address: string | null } | null;
    drink_logs: { drink_name: string | null; companion_id: string | null }[];
  }[];
  trip_companions: {
    id: string;
    user_id: string | null;
    guest_name: string | null;
    profiles: { display_name: string | null } | null;
  }[];
};

/** Full breakdown for one trip: ordered stops (bar, arrival window, per-stop drinks) plus who was
 * there and what each person drank. Every tagged companion appears in `companions` regardless of
 * whether they logged a named drink (unlike `format.ts`'s `summarizeDrinksByCompanion`, which is
 * built for a compact card and drops people with nothing to name) — "who was with me" shouldn't
 * disappear just because nobody typed a drink name in. RLS covers who's allowed to see this: the
 * trip owner always, a tagged companion (any status), or (via `0003`/`0006`/`0008`) anyone who can
 * see a feed post built from it.
 *
 * `viewerId` decides whose drinks are "You": the owner's own (null `companion_id`) logs if the
 * viewer owns the trip, a companion's own logs if the viewer is that companion (their own entry
 * is then excluded from `companions` and the owner gets a synthesized entry there instead, labeled
 * with the owner's name), or nobody's if the viewer is neither (e.g. a follower who wasn't on the
 * trip) — `viewerInvolved` is false in that last case and the owner's logs still show up in
 * `companions` rather than silently vanishing. */
export async function fetchTripDetail(tripId: string, viewerId: string | null): Promise<TripDetail> {
  const { data, error } = await supabase
    .from('trips')
    .select(
      'id, user_id, started_at, ended_at, total_distance_m, total_duration_s, crawl_id, photo_url, profiles!user_id(display_name, avatar_url), trip_stops(id, stop_order, arrived_at, left_at, bars(name, address), drink_logs(drink_name, companion_id)), trip_companions(id, user_id, guest_name, profiles(display_name))'
    )
    .eq('id', tripId)
    .single();
  if (error || !data) throw error ?? new Error('Trip not found');

  const row = data as unknown as TripDetailRow;
  const stops = (row.trip_stops ?? []).slice().sort((a, b) => a.stop_order - b.stop_order);
  const allLogs = stops.flatMap((s) => s.drink_logs ?? []);

  const isOwner = row.user_id === viewerId;
  const myCompanion = (row.trip_companions ?? []).find((c) => c.user_id === viewerId) ?? null;
  const viewerInvolved = isOwner || myCompanion !== null;
  const myKey: string | null = isOwner ? null : (myCompanion?.id ?? null);
  const logsFor = (key: string | null) => allLogs.filter((l) => (l.companion_id ?? null) === key);

  const companions: TripDetailCompanion[] = [];
  if (!isOwner) {
    const ownerLogs = logsFor(null);
    companions.push({
      id: 'owner',
      label: row.profiles?.display_name ?? 'Someone',
      drinkCount: ownerLogs.length,
      drinkSummary: summarizeDrinkNames(ownerLogs.map((l) => l.drink_name)),
    });
  }
  for (const c of row.trip_companions ?? []) {
    if (viewerInvolved && c.id === myKey) continue;
    const logs = logsFor(c.id);
    companions.push({
      id: c.id,
      label: c.profiles?.display_name ?? c.guest_name ?? 'Someone',
      drinkCount: logs.length,
      drinkSummary: summarizeDrinkNames(logs.map((l) => l.drink_name)),
    });
  }

  return {
    id: row.id,
    ownerId: row.user_id,
    ownerName: row.profiles?.display_name ?? null,
    ownerAvatarUrl: row.profiles?.avatar_url ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalDistanceM: row.total_distance_m,
    totalDurationS: row.total_duration_s,
    crawlId: row.crawl_id,
    photoUrl: row.photo_url,
    totalDrinks: allLogs.length,
    viewerInvolved,
    ownDrinkCount: viewerInvolved ? logsFor(myKey).length : 0,
    ownDrinkSummary: viewerInvolved ? summarizeDrinkNames(logsFor(myKey).map((l) => l.drink_name)) : null,
    stops: stops.map((s) => ({
      id: s.id,
      order: s.stop_order,
      barName: s.bars?.name ?? null,
      barAddress: s.bars?.address ?? null,
      arrivedAt: s.arrived_at,
      leftAt: s.left_at,
      drinkCount: s.drink_logs?.length ?? 0,
      drinkSummary: summarizeDrinkNames((s.drink_logs ?? []).map((d) => d.drink_name)),
    })),
    companions,
  };
}
