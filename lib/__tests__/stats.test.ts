/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../supabase';
import { fetchMyStats } from '../stats';

function queryResult(response: unknown) {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    not: jest.fn(() => obj),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return obj;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockFrom.mockReset();
});

describe('fetchMyStats', () => {
  it('sums stops/drinks/distance across trips and reports crawls published', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trips') {
        return queryResult({
          data: [
            {
              total_distance_m: 500,
              trip_stops: [
                { drink_logs: [{ count: 2 }] },
                { drink_logs: [{ count: 1 }] },
              ],
            },
            {
              total_distance_m: 300,
              trip_stops: [{ drink_logs: [] }],
            },
          ],
          error: null,
        });
      }
      if (table === 'crawls') {
        return queryResult({ count: 4, error: null });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const stats = await fetchMyStats('me');

    expect(stats).toEqual({
      tripCount: 2,
      totalStops: 3,
      totalDrinks: 3,
      totalDistanceM: 800,
      crawlsPublished: 4,
    });
  });

  it('defaults to zero for a user with no trips or crawls', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trips') return queryResult({ data: [], error: null });
      if (table === 'crawls') return queryResult({ count: null, error: null });
      throw new Error(`unexpected table: ${table}`);
    });

    expect(await fetchMyStats('me')).toEqual({
      tripCount: 0,
      totalStops: 0,
      totalDrinks: 0,
      totalDistanceM: 0,
      crawlsPublished: 0,
    });
  });

  it('throws if the trips query fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trips') return queryResult({ data: null, error: { message: 'boom' } });
      return queryResult({ count: 0, error: null });
    });
    await expect(fetchMyStats('me')).rejects.toEqual({ message: 'boom' });
  });
});
