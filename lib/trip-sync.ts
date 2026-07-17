import type { PlaceBar } from './places';
import { supabase } from './supabase';

export type LiveTrip = {
  hostId: string;
  hostName: string | null;
  crawlId: string | null;
  startedAt: string;
  endedAt: string | null;
  phase: 'traveling' | 'arrived';
  targetBar: PlaceBar | null;
  /** `bars.id` for `targetBar` — `PlaceBar` itself carries no row id, but `confirmArrival`/
   * `nextBar` need it to write `trip_stops.bar_id`. */
  targetBarId: string | null;
  routeIndex: number;
  /** The open stop (arrived, not yet left) if there is one — null while traveling. */
  currentStopId: string | null;
  /** `bars.place_id` for every stop visited so far, ordered by `stop_order`. */
  visitedPlaceIds: string[];
  /** Drinks logged at the current stop with no `companion_id` (i.e. the host's own). */
  drinkCount: number;
  companionDrinkCounts: Record<string, number>;
};

type LiveTripRow = {
  user_id: string;
  crawl_id: string | null;
  started_at: string;
  ended_at: string | null;
  phase: 'traveling' | 'arrived';
  route_index: number;
  profiles: { display_name: string | null } | null;
  bars: {
    id: string;
    place_id: string;
    name: string;
    address: string | null;
    lat: number;
    lng: number;
    photo_ref: string | null;
  } | null;
  trip_stops: {
    id: string;
    stop_order: number;
    left_at: string | null;
    bars: { place_id: string } | null;
    drink_logs: { companion_id: string | null }[];
  }[];
};

/** The live/derived view of a trip in progress — used by trip-context to reconcile local state
 * for whoever's looking at it, host or an attached companion, from the DB rather than trusting
 * either device's own optimistic state (Phase 3: companions can now write trip progress too, so
 * the DB has to be the tiebreaker). Mirrors `trip-detail.ts`'s embed-query style but scoped to
 * the currently open stop rather than the full trip history. */
export async function fetchLiveTrip(tripId: string): Promise<LiveTrip> {
  const { data, error } = await supabase
    .from('trips')
    .select(
      'user_id, crawl_id, started_at, ended_at, phase, route_index, profiles!user_id(display_name), bars!target_bar_id(id, place_id, name, address, lat, lng, photo_ref), trip_stops(id, stop_order, left_at, bars(place_id), drink_logs(companion_id))'
    )
    .eq('id', tripId)
    .single();
  if (error || !data) throw error ?? new Error('Trip not found');

  const row = data as unknown as LiveTripRow;
  const stops = (row.trip_stops ?? []).slice().sort((a, b) => a.stop_order - b.stop_order);
  const currentStop = stops.find((s) => s.left_at === null) ?? null;
  const currentLogs = currentStop?.drink_logs ?? [];

  const companionDrinkCounts: Record<string, number> = {};
  for (const log of currentLogs) {
    if (log.companion_id) {
      companionDrinkCounts[log.companion_id] = (companionDrinkCounts[log.companion_id] ?? 0) + 1;
    }
  }

  return {
    hostId: row.user_id,
    hostName: row.profiles?.display_name ?? null,
    crawlId: row.crawl_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    phase: row.phase,
    targetBar: row.bars
      ? {
          placeId: row.bars.place_id,
          name: row.bars.name,
          address: row.bars.address,
          location: { latitude: row.bars.lat, longitude: row.bars.lng },
          photoRef: row.bars.photo_ref,
        }
      : null,
    targetBarId: row.bars?.id ?? null,
    routeIndex: row.route_index,
    currentStopId: currentStop?.id ?? null,
    visitedPlaceIds: stops.map((s) => s.bars?.place_id).filter((id): id is string => !!id),
    drinkCount: currentLogs.filter((l) => !l.companion_id).length,
    companionDrinkCounts,
  };
}
