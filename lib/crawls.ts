import type { PlaceBar } from './places';
import { supabase } from './supabase';

export type CrawlSummary = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  creatorId: string;
  creatorName: string | null;
  stopCount: number;
};

export type CrawlStopDetail = {
  id: string;
  stopOrder: number;
  bar: {
    id: string;
    placeId: string;
    name: string;
    address: string | null;
    lat: number;
    lng: number;
    photoRef: string | null;
  };
};

export type CrawlDetail = CrawlSummary & { stops: CrawlStopDetail[] };

/** Reconstructs a PlaceBar (as used by the compass/trip flow) from a cached crawl stop. */
export function crawlStopToPlaceBar(stop: CrawlStopDetail): PlaceBar {
  return {
    placeId: stop.bar.placeId,
    name: stop.bar.name,
    address: stop.bar.address,
    location: { latitude: stop.bar.lat, longitude: stop.bar.lng },
    photoRef: stop.bar.photoRef,
  };
}

type CrawlSummaryRow = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  creator_id: string;
  profiles: { display_name: string | null } | null;
  crawl_stops: { count: number }[];
};

/**
 * Crawls visible to the current user — RLS already restricts this to public crawls plus
 * the user's own, so no extra filtering is needed here.
 */
export async function fetchCrawls(): Promise<CrawlSummary[]> {
  const { data, error } = await supabase
    .from('crawls')
    .select('id, name, description, is_public, created_at, creator_id, profiles!creator_id(display_name), crawl_stops(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return ((data as unknown as CrawlSummaryRow[]) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isPublic: row.is_public,
    createdAt: row.created_at,
    creatorId: row.creator_id,
    creatorName: row.profiles?.display_name ?? null,
    stopCount: row.crawl_stops?.[0]?.count ?? 0,
  }));
}

export async function fetchCrawlDetail(crawlId: string): Promise<CrawlDetail> {
  const { data: crawlRow, error: crawlError } = await supabase
    .from('crawls')
    .select('id, name, description, is_public, created_at, creator_id, profiles!creator_id(display_name)')
    .eq('id', crawlId)
    .single();
  if (crawlError || !crawlRow) throw crawlError ?? new Error('Crawl not found');

  const { data: stopRows, error: stopsError } = await supabase
    .from('crawl_stops')
    .select('id, stop_order, bars(id, place_id, name, address, lat, lng, photo_ref)')
    .eq('crawl_id', crawlId)
    .order('stop_order', { ascending: true });
  if (stopsError) throw stopsError;

  const crawl = crawlRow as unknown as Omit<CrawlSummaryRow, 'crawl_stops'>;
  const stops = (stopRows ?? []) as unknown as {
    id: string;
    stop_order: number;
    bars: {
      id: string;
      place_id: string;
      name: string;
      address: string | null;
      lat: number;
      lng: number;
      photo_ref: string | null;
    } | null;
  }[];

  return {
    id: crawl.id,
    name: crawl.name,
    description: crawl.description,
    isPublic: crawl.is_public,
    createdAt: crawl.created_at,
    creatorId: crawl.creator_id,
    creatorName: crawl.profiles?.display_name ?? null,
    stopCount: stops.length,
    stops: stops
      .filter((s) => s.bars)
      .map((s) => ({
        id: s.id,
        stopOrder: s.stop_order,
        bar: {
          id: s.bars!.id,
          placeId: s.bars!.place_id,
          name: s.bars!.name,
          address: s.bars!.address,
          lat: s.bars!.lat,
          lng: s.bars!.lng,
          photoRef: s.bars!.photo_ref,
        },
      })),
  };
}

async function insertCrawlStops(crawlId: string, barIds: string[]) {
  const { error } = await supabase.from('crawl_stops').insert(
    barIds.map((barId, index) => ({ crawl_id: crawlId, bar_id: barId, stop_order: index }))
  );
  if (error) throw error;
}

/** Upserts each bar into the shared cache and resolves its id, preserving input order. */
async function upsertBarsAndGetIds(stops: PlaceBar[]): Promise<string[]> {
  const { data: barRows, error: barError } = await supabase
    .from('bars')
    .upsert(
      stops.map((s) => ({
        place_id: s.placeId,
        name: s.name,
        address: s.address,
        lat: s.location.latitude,
        lng: s.location.longitude,
        photo_ref: s.photoRef,
      })),
      { onConflict: 'place_id' }
    )
    .select('id, place_id');
  if (barError || !barRows) throw barError ?? new Error('Failed to save crawl bars');

  const idByPlaceId = new Map(barRows.map((b) => [b.place_id, b.id]));
  return stops.map((s) => {
    const id = idByPlaceId.get(s.placeId);
    if (!id) throw new Error(`Failed to resolve bar id for ${s.name}`);
    return id;
  });
}

/** Upserts each stop's bar into the shared cache, then creates the crawl + ordered stops. */
export async function createCrawl(options: {
  creatorId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  stops: PlaceBar[];
}): Promise<string> {
  const { creatorId, name, description, isPublic, stops } = options;
  if (stops.length === 0) throw new Error('A crawl needs at least one stop.');

  const barIds = await upsertBarsAndGetIds(stops);

  const { data: crawl, error: crawlError } = await supabase
    .from('crawls')
    .insert({ creator_id: creatorId, name, description, is_public: isPublic })
    .select()
    .single();
  if (crawlError || !crawl) throw crawlError ?? new Error('Failed to create crawl');

  await insertCrawlStops(crawl.id, barIds);
  return crawl.id;
}

/**
 * Replaces a crawl's entire stop list (order, additions, removals) in one go — delete-then-
 * reinsert rather than a diff, since `crawl_stops` rows carry no state worth preserving beyond
 * `stop_order`. RLS restricts this to the crawl's creator, same as `updateCrawl`.
 */
export async function replaceCrawlStops(crawlId: string, stops: PlaceBar[]): Promise<void> {
  if (stops.length === 0) throw new Error('A crawl needs at least one stop.');

  const barIds = await upsertBarsAndGetIds(stops);

  const { error: deleteError } = await supabase.from('crawl_stops').delete().eq('crawl_id', crawlId);
  if (deleteError) throw deleteError;

  await insertCrawlStops(crawlId, barIds);
}

/** Publishes an already-completed trip's stop order as a new named, shareable crawl. */
export async function publishTripAsCrawl(options: {
  tripId: string;
  creatorId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
}): Promise<string> {
  const { tripId, creatorId, name, description, isPublic } = options;

  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('crawl_id')
    .eq('id', tripId)
    .single();
  if (tripError) throw tripError;
  if (trip?.crawl_id) throw new Error('This trip has already been published as a crawl.');

  const { data: tripStops, error: stopsError } = await supabase
    .from('trip_stops')
    .select('stop_order, bar_id')
    .eq('trip_id', tripId)
    .order('stop_order', { ascending: true });
  if (stopsError) throw stopsError;
  if (!tripStops || tripStops.length === 0) {
    throw new Error('This trip has no stops to publish.');
  }

  const { data: crawl, error: crawlError } = await supabase
    .from('crawls')
    .insert({ creator_id: creatorId, name, description, is_public: isPublic })
    .select()
    .single();
  if (crawlError || !crawl) throw crawlError ?? new Error('Failed to create crawl');

  await insertCrawlStops(
    crawl.id,
    tripStops.map((s) => s.bar_id)
  );
  await supabase.from('trips').update({ crawl_id: crawl.id }).eq('id', tripId);

  return crawl.id;
}

/** Updates a crawl's name/description/visibility. RLS restricts this to the crawl's creator. */
export async function updateCrawl(
  crawlId: string,
  updates: { name: string; description: string | null; isPublic: boolean }
): Promise<void> {
  const { error } = await supabase
    .from('crawls')
    .update({ name: updates.name, description: updates.description, is_public: updates.isPublic })
    .eq('id', crawlId);
  if (error) throw error;
}

/** Deletes a crawl. RLS restricts this to the creator; crawl_stops cascade-delete with it. */
export async function deleteCrawl(crawlId: string): Promise<void> {
  const { error } = await supabase.from('crawls').delete().eq('id', crawlId);
  if (error) throw error;
}
