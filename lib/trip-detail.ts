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
  ownerName: string | null;
  startedAt: string;
  endedAt: string | null;
  totalDistanceM: number | null;
  totalDurationS: number | null;
  crawlId: string | null;
  totalDrinks: number;
  ownDrinkSummary: string | null;
  stops: TripDetailStop[];
  companions: TripDetailCompanion[];
};

type TripDetailRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  total_distance_m: number | null;
  total_duration_s: number | null;
  crawl_id: string | null;
  profiles: { display_name: string | null } | null;
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
    guest_name: string | null;
    profiles: { display_name: string | null } | null;
  }[];
};

/** Full breakdown for one trip: ordered stops (bar, arrival window, per-stop drinks) plus who was
 * there and what each person drank. Every tagged companion appears in `companions` regardless of
 * whether they logged a named drink (unlike `format.ts`'s `summarizeDrinksByCompanion`, which is
 * built for a compact card and drops people with nothing to name) — "who was with me" shouldn't
 * disappear just because nobody typed a drink name in. RLS covers who's allowed to see this: the
 * trip owner always, or (via `0003`/`0006`/`0008`) anyone who can see a feed post built from it. */
export async function fetchTripDetail(tripId: string): Promise<TripDetail> {
  const { data, error } = await supabase
    .from('trips')
    .select(
      'id, started_at, ended_at, total_distance_m, total_duration_s, crawl_id, profiles!user_id(display_name), trip_stops(id, stop_order, arrived_at, left_at, bars(name, address), drink_logs(drink_name, companion_id)), trip_companions(id, guest_name, profiles(display_name))'
    )
    .eq('id', tripId)
    .single();
  if (error || !data) throw error ?? new Error('Trip not found');

  const row = data as unknown as TripDetailRow;
  const stops = (row.trip_stops ?? []).slice().sort((a, b) => a.stop_order - b.stop_order);
  const allLogs = stops.flatMap((s) => s.drink_logs ?? []);
  const ownLogs = allLogs.filter((l) => !l.companion_id);

  const companions = (row.trip_companions ?? []).map((c) => {
    const logs = allLogs.filter((l) => l.companion_id === c.id);
    return {
      id: c.id,
      label: c.profiles?.display_name ?? c.guest_name ?? 'Someone',
      drinkCount: logs.length,
      drinkSummary: summarizeDrinkNames(logs.map((l) => l.drink_name)),
    };
  });

  return {
    id: row.id,
    ownerName: row.profiles?.display_name ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalDistanceM: row.total_distance_m,
    totalDurationS: row.total_duration_s,
    crawlId: row.crawl_id,
    totalDrinks: allLogs.length,
    ownDrinkSummary: summarizeDrinkNames(ownLogs.map((l) => l.drink_name)),
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
