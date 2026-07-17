/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../supabase';
import { fetchLiveTrip } from '../trip-sync';

/** A stub PostgREST query builder: every chain method returns itself, and it resolves
 * (thenable, like the real builder) to whatever response you configure. */
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

describe('fetchLiveTrip', () => {
  it('maps a traveling trip with an open stop, a target bar, and drink counts', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trips');
      return queryResult({
        data: {
          user_id: 'host-1',
          crawl_id: 'crawl-1',
          started_at: '2026-07-16T20:00:00Z',
          ended_at: null,
          phase: 'traveling',
          route_index: 2,
          profiles: { display_name: 'Jack' },
          bars: {
            id: 'bar-row-1',
            place_id: 'place-1',
            name: 'The Local',
            address: '123 Main St',
            lat: 1.5,
            lng: 2.5,
            photo_ref: 'photo-1',
          },
          trip_stops: [
            {
              id: 'stop-1',
              stop_order: 0,
              left_at: '2026-07-16T20:30:00Z',
              bars: { place_id: 'place-0' },
              drink_logs: [{ companion_id: null }],
            },
            {
              id: 'stop-2',
              stop_order: 1,
              left_at: null,
              bars: { place_id: 'place-1' },
              drink_logs: [{ companion_id: null }, { companion_id: 'c1' }, { companion_id: 'c1' }],
            },
          ],
        },
        error: null,
      });
    });

    expect(await fetchLiveTrip('trip-1')).toEqual({
      hostId: 'host-1',
      hostName: 'Jack',
      crawlId: 'crawl-1',
      startedAt: '2026-07-16T20:00:00Z',
      endedAt: null,
      phase: 'traveling',
      targetBar: {
        placeId: 'place-1',
        name: 'The Local',
        address: '123 Main St',
        location: { latitude: 1.5, longitude: 2.5 },
        photoRef: 'photo-1',
      },
      targetBarId: 'bar-row-1',
      routeIndex: 2,
      currentStopId: 'stop-2',
      visitedPlaceIds: ['place-0', 'place-1'],
      drinkCount: 1,
      companionDrinkCounts: { c1: 2 },
    });
  });

  it('maps a trip with no open stop, no target bar, and no host display name', async () => {
    mockFrom.mockImplementation(() =>
      queryResult({
        data: {
          user_id: 'host-1',
          crawl_id: null,
          started_at: '2026-07-16T20:00:00Z',
          ended_at: '2026-07-16T22:00:00Z',
          phase: 'arrived',
          route_index: 0,
          profiles: null,
          bars: null,
          trip_stops: [
            {
              id: 'stop-1',
              stop_order: 0,
              left_at: '2026-07-16T20:30:00Z',
              bars: null,
              drink_logs: [],
            },
          ],
        },
        error: null,
      })
    );

    expect(await fetchLiveTrip('trip-1')).toEqual({
      hostId: 'host-1',
      hostName: null,
      crawlId: null,
      startedAt: '2026-07-16T20:00:00Z',
      endedAt: '2026-07-16T22:00:00Z',
      phase: 'arrived',
      targetBar: null,
      targetBarId: null,
      routeIndex: 0,
      currentStopId: null,
      visitedPlaceIds: [],
      drinkCount: 0,
      companionDrinkCounts: {},
    });
  });

  it('handles a trip with no stops at all', async () => {
    mockFrom.mockImplementation(() =>
      queryResult({
        data: {
          user_id: 'host-1',
          crawl_id: null,
          started_at: '2026-07-16T20:00:00Z',
          ended_at: null,
          phase: 'traveling',
          route_index: 0,
          profiles: { display_name: 'Jack' },
          bars: null,
          trip_stops: [],
        },
        error: null,
      })
    );

    expect(await fetchLiveTrip('trip-1')).toEqual(
      expect.objectContaining({ currentStopId: null, visitedPlaceIds: [], drinkCount: 0 })
    );
  });

  it('throws the Supabase error', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: new Error('boom') }));

    await expect(fetchLiveTrip('trip-1')).rejects.toThrow('boom');
  });

  it('throws a fallback error when there is no data and no error', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: null }));

    await expect(fetchLiveTrip('trip-1')).rejects.toThrow('Trip not found');
  });
});
