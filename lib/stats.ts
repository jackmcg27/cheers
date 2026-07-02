import { supabase } from './supabase';

export type MyStats = {
  tripCount: number;
  totalStops: number;
  totalDrinks: number;
  totalDistanceM: number;
  crawlsPublished: number;
};

type TripStatsRow = {
  total_distance_m: number | null;
  trip_stops: { drink_logs: { count: number }[] }[];
};

export async function fetchMyStats(userId: string): Promise<MyStats> {
  const [tripsResult, crawlsResult] = await Promise.all([
    supabase
      .from('trips')
      .select('total_distance_m, trip_stops(drink_logs(count))')
      .eq('user_id', userId)
      .not('ended_at', 'is', null),
    supabase.from('crawls').select('id', { count: 'exact', head: true }).eq('creator_id', userId),
  ]);

  if (tripsResult.error) throw tripsResult.error;
  if (crawlsResult.error) throw crawlsResult.error;

  const trips = (tripsResult.data ?? []) as unknown as TripStatsRow[];

  let totalStops = 0;
  let totalDrinks = 0;
  let totalDistanceM = 0;
  for (const trip of trips) {
    const stops = trip.trip_stops ?? [];
    totalStops += stops.length;
    totalDrinks += stops.reduce((sum, s) => sum + (s.drink_logs?.[0]?.count ?? 0), 0);
    totalDistanceM += trip.total_distance_m ?? 0;
  }

  return {
    tripCount: trips.length,
    totalStops,
    totalDrinks,
    totalDistanceM,
    crawlsPublished: crawlsResult.count ?? 0,
  };
}
