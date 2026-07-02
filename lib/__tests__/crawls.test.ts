/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../supabase';
import {
  createCrawl,
  crawlStopToPlaceBar,
  fetchCrawlDetail,
  fetchCrawls,
  publishTripAsCrawl,
} from '../crawls';
import type { PlaceBar } from '../places';

/** A stub PostgREST query builder: every chain method returns itself, and it resolves
 * (thenable, like the real builder) to whatever response you configure. */
function queryResult(response: unknown) {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    order: jest.fn(() => obj),
    single: jest.fn(() => obj),
    upsert: jest.fn(() => obj),
    insert: jest.fn(() => obj),
    update: jest.fn(() => obj),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return obj;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockFrom.mockReset();
});

describe('crawlStopToPlaceBar', () => {
  it('reconstructs a PlaceBar from a cached crawl stop', () => {
    const placeBar = crawlStopToPlaceBar({
      id: 'stop-1',
      stopOrder: 0,
      bar: {
        id: 'bar-1',
        placeId: 'places/abc',
        name: 'The Thirsty Crow',
        address: '123 Main St',
        lat: 40.71,
        lng: -74.0,
        photoRef: 'places/abc/photos/1',
      },
    });
    expect(placeBar).toEqual({
      placeId: 'places/abc',
      name: 'The Thirsty Crow',
      address: '123 Main St',
      location: { latitude: 40.71, longitude: -74.0 },
      photoRef: 'places/abc/photos/1',
    });
  });
});

describe('fetchCrawls', () => {
  it('maps rows into CrawlSummary, defaulting missing creator name / stop count', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('crawls');
      return queryResult({
        data: [
          {
            id: 'c1',
            name: 'Downtown Dive',
            description: null,
            is_public: true,
            created_at: '2026-01-01T00:00:00Z',
            creator_id: 'u1',
            profiles: { display_name: 'Jack' },
            crawl_stops: [{ count: 3 }],
          },
          {
            id: 'c2',
            name: 'No Stops Yet',
            description: null,
            is_public: false,
            created_at: '2026-01-02T00:00:00Z',
            creator_id: 'u2',
            profiles: null,
            crawl_stops: [],
          },
        ],
        error: null,
      });
    });

    const crawls = await fetchCrawls();

    expect(crawls).toEqual([
      expect.objectContaining({ id: 'c1', creatorName: 'Jack', stopCount: 3, isPublic: true }),
      expect.objectContaining({ id: 'c2', creatorName: null, stopCount: 0, isPublic: false }),
    ]);
  });

  it('throws the Supabase error when the query fails', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: { message: 'boom' } }));
    await expect(fetchCrawls()).rejects.toEqual({ message: 'boom' });
  });
});

describe('fetchCrawlDetail', () => {
  it('combines the crawl row and ordered stops, dropping stops with no bar', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'crawls') {
        return queryResult({
          data: {
            id: 'c1',
            name: 'Downtown Dive',
            description: 'A good one',
            is_public: true,
            created_at: '2026-01-01T00:00:00Z',
            creator_id: 'u1',
            profiles: { display_name: 'Jack' },
          },
          error: null,
        });
      }
      if (table === 'crawl_stops') {
        return queryResult({
          data: [
            {
              id: 's1',
              stop_order: 0,
              bars: {
                id: 'b1',
                place_id: 'places/1',
                name: 'Bar One',
                address: 'Addr 1',
                lat: 1,
                lng: 2,
                photo_ref: null,
              },
            },
            { id: 's2', stop_order: 1, bars: null }, // dangling stop, should be dropped
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const detail = await fetchCrawlDetail('c1');

    expect(detail.name).toBe('Downtown Dive');
    expect(detail.creatorName).toBe('Jack');
    expect(detail.stops).toHaveLength(1);
    expect(detail.stops[0]).toEqual({
      id: 's1',
      stopOrder: 0,
      bar: {
        id: 'b1',
        placeId: 'places/1',
        name: 'Bar One',
        address: 'Addr 1',
        lat: 1,
        lng: 2,
        photoRef: null,
      },
    });
  });

  it('throws when the crawl itself is not found', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: null }));
    await expect(fetchCrawlDetail('missing')).rejects.toThrow('Crawl not found');
  });
});

describe('createCrawl', () => {
  const stops: PlaceBar[] = [
    { placeId: 'p1', name: 'Bar One', address: 'A1', location: { latitude: 1, longitude: 1 }, photoRef: null },
    { placeId: 'p2', name: 'Bar Two', address: 'A2', location: { latitude: 2, longitude: 2 }, photoRef: null },
  ];

  it('rejects an empty stop list before making any request', async () => {
    await expect(
      createCrawl({ creatorId: 'u1', name: 'Empty', description: null, isPublic: true, stops: [] })
    ).rejects.toThrow('at least one stop');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('upserts bars, creates the crawl, and inserts stops in the original order', async () => {
    const insertedStopRows: unknown[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') {
        // Supabase doesn't guarantee upsert return order matches input order.
        return queryResult({
          data: [
            { id: 'bar-2', place_id: 'p2' },
            { id: 'bar-1', place_id: 'p1' },
          ],
          error: null,
        });
      }
      if (table === 'crawls') {
        return queryResult({ data: { id: 'crawl-1' }, error: null });
      }
      if (table === 'crawl_stops') {
        const q = queryResult({ error: null });
        q.insert = jest.fn((rows: unknown[]) => {
          insertedStopRows.push(...rows);
          return q;
        });
        return q;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const id = await createCrawl({
      creatorId: 'u1',
      name: 'My Crawl',
      description: null,
      isPublic: true,
      stops,
    });

    expect(id).toBe('crawl-1');
    // Stop order must follow the input `stops` order, not the upsert response order.
    expect(insertedStopRows).toEqual([
      { crawl_id: 'crawl-1', bar_id: 'bar-1', stop_order: 0 },
      { crawl_id: 'crawl-1', bar_id: 'bar-2', stop_order: 1 },
    ]);
  });

  it('throws if a bar upserted is missing from the returned rows', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: [{ id: 'bar-1', place_id: 'p1' }], error: null });
      throw new Error(`unexpected table: ${table}`);
    });

    await expect(
      createCrawl({ creatorId: 'u1', name: 'X', description: null, isPublic: true, stops })
    ).rejects.toThrow('Failed to resolve bar id for Bar Two');
  });
});

describe('publishTripAsCrawl', () => {
  it('copies the trip stop order into a new crawl and links the trip back to it', async () => {
    const calls: Record<string, unknown[]> = {};

    mockFrom.mockImplementation((table: string) => {
      calls[table] = calls[table] ?? [];
      if (table === 'trip_stops') {
        return queryResult({
          data: [
            { stop_order: 0, bar_id: 'bar-1' },
            { stop_order: 1, bar_id: 'bar-2' },
          ],
          error: null,
        });
      }
      if (table === 'crawls') {
        return queryResult({ data: { id: 'crawl-9' }, error: null });
      }
      if (table === 'crawl_stops') {
        const q = queryResult({ error: null });
        q.insert = jest.fn((rows: unknown[]) => {
          calls[table].push(...rows);
          return q;
        });
        return q;
      }
      if (table === 'trips') {
        const q = queryResult({ error: null });
        q.update = jest.fn((values: unknown) => {
          calls[table].push(values);
          return q;
        });
        return q;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const id = await publishTripAsCrawl({
      tripId: 'trip-1',
      creatorId: 'u1',
      name: 'From my trip',
      description: null,
      isPublic: false,
    });

    expect(id).toBe('crawl-9');
    expect(calls['crawl_stops']).toEqual([
      { crawl_id: 'crawl-9', bar_id: 'bar-1', stop_order: 0 },
      { crawl_id: 'crawl-9', bar_id: 'bar-2', stop_order: 1 },
    ]);
    expect(calls['trips']).toEqual([{ crawl_id: 'crawl-9' }]);
  });

  it('refuses to publish a trip with no stops', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ data: [], error: null });
      throw new Error(`unexpected table: ${table}`);
    });

    await expect(
      publishTripAsCrawl({
        tripId: 'trip-1',
        creatorId: 'u1',
        name: 'Empty',
        description: null,
        isPublic: false,
      })
    ).rejects.toThrow('no stops to publish');
  });
});
