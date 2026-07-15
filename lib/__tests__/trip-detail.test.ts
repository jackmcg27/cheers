/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../supabase';
import { fetchTripDetail } from '../trip-detail';

function queryResult(response: unknown) {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    single: jest.fn(() => obj),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return obj;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockFrom.mockReset();
});

describe('fetchTripDetail', () => {
  it('sorts stops, builds per-stop drink summaries, and a per-companion breakdown', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trips');
      return queryResult({
        data: {
          id: 'trip-1',
          started_at: '2026-01-01T00:00:00Z',
          ended_at: '2026-01-01T02:00:00Z',
          total_distance_m: 1200,
          total_duration_s: 7200,
          crawl_id: null,
          profiles: { display_name: 'Jack' },
          trip_stops: [
            {
              id: 'stop-2',
              stop_order: 1,
              arrived_at: '2026-01-01T01:00:00Z',
              left_at: '2026-01-01T02:00:00Z',
              bars: { name: 'Bar B', address: '2 Main St' },
              drink_logs: [{ drink_name: 'Stout', companion_id: 'c1' }],
            },
            {
              id: 'stop-1',
              stop_order: 0,
              arrived_at: '2026-01-01T00:00:00Z',
              left_at: '2026-01-01T01:00:00Z',
              bars: { name: 'Bar A', address: '1 Main St' },
              drink_logs: [
                { drink_name: 'IPA', companion_id: null },
                { drink_name: 'IPA', companion_id: null },
              ],
            },
          ],
          trip_companions: [
            { id: 'c1', guest_name: 'Sam', profiles: null },
            { id: 'c2', guest_name: 'Quiet Guy', profiles: null },
          ],
        },
        error: null,
      });
    });

    const detail = await fetchTripDetail('trip-1');

    expect(detail.ownerName).toBe('Jack');
    expect(detail.totalDrinks).toBe(3);
    expect(detail.ownDrinkSummary).toBe('IPA ×2');
    expect(detail.stops.map((s) => s.id)).toEqual(['stop-1', 'stop-2']); // sorted by stop_order
    expect(detail.stops[0]).toMatchObject({ barName: 'Bar A', drinkCount: 2, drinkSummary: 'IPA ×2' });
    expect(detail.stops[1]).toMatchObject({ barName: 'Bar B', drinkCount: 1, drinkSummary: 'Stout' });

    expect(detail.companions).toEqual([
      { id: 'c1', label: 'Sam', drinkCount: 1, drinkSummary: 'Stout' },
      // present with a zero count even though they never logged a named drink
      { id: 'c2', label: 'Quiet Guy', drinkCount: 0, drinkSummary: null },
    ]);
  });

  it('prefers a linked app-user display name over a guest_name for a companion label', async () => {
    mockFrom.mockImplementation(() =>
      queryResult({
        data: {
          id: 'trip-1',
          started_at: '2026-01-01T00:00:00Z',
          ended_at: null,
          total_distance_m: null,
          total_duration_s: null,
          crawl_id: null,
          profiles: null,
          trip_stops: [],
          trip_companions: [{ id: 'c1', guest_name: null, profiles: { display_name: 'Alex' } }],
        },
        error: null,
      })
    );

    const detail = await fetchTripDetail('trip-1');
    expect(detail.companions).toEqual([{ id: 'c1', label: 'Alex', drinkCount: 0, drinkSummary: null }]);
  });

  it('throws when the trip is not found or not visible', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: { message: 'not found' } }));
    await expect(fetchTripDetail('missing')).rejects.toEqual({ message: 'not found' });
  });
});
