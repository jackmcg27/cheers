import type { Coords } from './bearing';

const PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

export type PlaceBar = {
  placeId: string;
  name: string;
  address: string | null;
  location: Coords;
  photoRef: string | null;
};

type PlacesSearchResponse = {
  places?: {
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    photos?: { name: string }[];
  }[];
};

const PLACE_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.photos';

function mapPlacesResponse(data: PlacesSearchResponse, excludePlaceIds: string[] = []): PlaceBar[] {
  const excluded = new Set(excludePlaceIds);
  return (data.places ?? [])
    .filter((p) => !excluded.has(p.id))
    .filter((p) => p.location)
    .map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? 'Unknown bar',
      address: p.formattedAddress ?? null,
      location: { latitude: p.location!.latitude, longitude: p.location!.longitude },
      photoRef: p.photos?.[0]?.name ?? null,
    }));
}

/**
 * Nearest bars to `origin`, closest first, excluding any place_id in `excludePlaceIds`.
 * Uses Places API (New) searchNearby with rankPreference DISTANCE.
 */
export async function findNearbyBars(
  origin: Coords,
  excludePlaceIds: string[] = [],
  radiusMeters = 2000
): Promise<PlaceBar[]> {
  if (!PLACES_API_KEY) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY. Copy .env.example to .env and fill it in.'
    );
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY,
      'X-Goog-FieldMask': PLACE_FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: ['bar'],
      maxResultCount: 15,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude: origin.latitude, longitude: origin.longitude },
          radius: radiusMeters,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places searchNearby failed (${res.status}): ${body}`);
  }

  const data: PlacesSearchResponse = await res.json();
  return mapPlacesResponse(data, excludePlaceIds);
}

/**
 * Bars matching a free-text query anywhere (not just nearby), for the crawl builder.
 * Uses Places API (New) searchText, optionally biased toward `biasOrigin`.
 */
export async function searchBarsByText(query: string, biasOrigin?: Coords): Promise<PlaceBar[]> {
  if (!PLACES_API_KEY) {
    throw new Error(
      'Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY. Copy .env.example to .env and fill it in.'
    );
  }
  if (!query.trim()) return [];

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY,
      'X-Goog-FieldMask': PLACE_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      includedType: 'bar',
      maxResultCount: 15,
      ...(biasOrigin
        ? {
            locationBias: {
              circle: {
                center: { latitude: biasOrigin.latitude, longitude: biasOrigin.longitude },
                radius: 20000,
              },
            },
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places searchText failed (${res.status}): ${body}`);
  }

  const data: PlacesSearchResponse = await res.json();
  return mapPlacesResponse(data);
}

/** Nearest bar to `origin`, or null if none found within radius. */
export async function findNearestBar(
  origin: Coords,
  excludePlaceIds: string[] = []
): Promise<PlaceBar | null> {
  const bars = await findNearbyBars(origin, excludePlaceIds);
  return bars[0] ?? null;
}

/** Public image URL for a bar photo returned by the Places API. */
export function placePhotoUrl(photoRef: string, maxWidthPx = 800): string | null {
  if (!PLACES_API_KEY) return null;
  return `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=${maxWidthPx}&key=${PLACES_API_KEY}`;
}
