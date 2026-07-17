/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../supabase';
import { fetchHistoryPage, hideCompanionTrip } from '../history';

/** A stub PostgREST query builder: every chain method returns itself, and it resolves
 * (thenable, like the real builder) to whatever response you configure. */
function queryResult(response: unknown) {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    is: jest.fn(() => obj),
    not: jest.fn(() => obj),
    or: jest.fn(() => obj),
    order: jest.fn(() => obj),
    range: jest.fn(() => obj),
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

describe('fetchHistoryPage', () => {
  it('queries only the owner filter when the user has no companion trips', async () => {
    const tripsResult = queryResult({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_companions') return queryResult({ data: [], error: null });
      expect(table).toBe('trips');
      return tripsResult;
    });

    await fetchHistoryPage('me', 0, 20);

    expect(tripsResult.eq).toHaveBeenCalledWith('user_id', 'me');
    expect(tripsResult.or).not.toHaveBeenCalled();
  });

  it('unions owned trips with accepted, non-hidden companion trips via .or', async () => {
    const tripsResult = queryResult({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_companions') {
        return queryResult({ data: [{ trip_id: 't1' }, { trip_id: 't2' }], error: null });
      }
      return tripsResult;
    });

    await fetchHistoryPage('me', 0, 20);

    expect(tripsResult.or).toHaveBeenCalledWith('user_id.eq.me,id.in.(t1,t2)');
  });

  it('maps rows: isOwner true and no synthesized owner entry for the user\'s own trip', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_companions') return queryResult({ data: [], error: null });
      return queryResult({
        data: [
          {
            id: 't1',
            user_id: 'me',
            started_at: '2026-01-01T00:00:00Z',
            ended_at: '2026-01-01T02:00:00Z',
            total_distance_m: 100,
            total_duration_s: 200,
            crawl_id: null,
            profiles: { display_name: 'Me' },
            trip_stops: [{ drink_logs: [{ drink_name: 'IPA', companion_id: null }] }],
            trip_companions: [{ id: 'c1', user_id: 'other', guest_name: null, profiles: { display_name: 'Sam' } }],
          },
        ],
        error: null,
      });
    });

    const { trips, hasMore } = await fetchHistoryPage('me', 0, 20);

    expect(hasMore).toBe(false);
    expect(trips).toEqual([
      {
        id: 't1',
        startedAt: '2026-01-01T00:00:00Z',
        endedAt: '2026-01-01T02:00:00Z',
        totalDistanceM: 100,
        totalDurationS: 200,
        crawlId: null,
        stopCount: 1,
        logs: [{ drinkName: 'IPA', companionId: null }],
        isOwner: true,
        myCompanionId: null,
        companions: [{ id: 'c1', userId: 'other', label: 'Sam' }],
      },
    ]);
  });

  it('maps rows: isOwner false, synthesizes an owner entry, excludes the viewer\'s own companion entry, sets myCompanionId', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_companions') return queryResult({ data: [{ trip_id: 't1' }], error: null });
      return queryResult({
        data: [
          {
            id: 't1',
            user_id: 'host',
            started_at: '2026-01-01T00:00:00Z',
            ended_at: '2026-01-01T02:00:00Z',
            total_distance_m: null,
            total_duration_s: null,
            crawl_id: 'crawl-1',
            profiles: { display_name: 'Host Person' },
            trip_stops: [],
            trip_companions: [
              { id: 'c1', user_id: 'me', guest_name: null, profiles: null },
              { id: 'c2', user_id: 'other', guest_name: 'Guest', profiles: null },
            ],
          },
        ],
        error: null,
      });
    });

    const { trips } = await fetchHistoryPage('me', 0, 20);

    expect(trips[0].isOwner).toBe(false);
    expect(trips[0].myCompanionId).toBe('c1');
    expect(trips[0].companions).toEqual([
      { id: 'owner', userId: 'host', label: 'Host Person' },
      { id: 'c2', userId: 'other', label: 'Guest' },
    ]);
  });

  it('falls back to "Someone" for a missing owner display name', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_companions') return queryResult({ data: [{ trip_id: 't1' }], error: null });
      return queryResult({
        data: [
          {
            id: 't1',
            user_id: 'host',
            started_at: '2026-01-01T00:00:00Z',
            ended_at: null,
            total_distance_m: null,
            total_duration_s: null,
            crawl_id: null,
            profiles: null,
            trip_stops: [],
            trip_companions: [],
          },
        ],
        error: null,
      });
    });

    const { trips } = await fetchHistoryPage('me', 0, 20);
    expect(trips[0].companions).toEqual([{ id: 'owner', userId: 'host', label: 'Someone' }]);
  });

  it('reports hasMore when a full page comes back', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_companions') return queryResult({ data: [], error: null });
      return queryResult({
        data: [
          {
            id: 't1',
            user_id: 'me',
            started_at: '2026-01-01T00:00:00Z',
            ended_at: null,
            total_distance_m: null,
            total_duration_s: null,
            crawl_id: null,
            profiles: null,
            trip_stops: [],
            trip_companions: [],
          },
        ],
        error: null,
      });
    });

    const { hasMore } = await fetchHistoryPage('me', 0, 1);
    expect(hasMore).toBe(true);
  });

  it('throws when fetching companion trip ids fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_companions') return queryResult({ data: null, error: new Error('boom') });
      return queryResult({ data: [], error: null });
    });

    await expect(fetchHistoryPage('me', 0, 20)).rejects.toThrow('boom');
  });

  it('throws when fetching trips fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_companions') return queryResult({ data: [], error: null });
      return queryResult({ data: null, error: new Error('boom') });
    });

    await expect(fetchHistoryPage('me', 0, 20)).rejects.toThrow('boom');
  });
});

describe('hideCompanionTrip', () => {
  it('sets hidden_at on the companion\'s own row', async () => {
    const result = queryResult({ error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trip_companions');
      return result;
    });

    await hideCompanionTrip('c1');

    expect(result.update).toHaveBeenCalledWith({ hidden_at: expect.any(String) });
    expect(result.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('throws the Supabase error', async () => {
    mockFrom.mockImplementation(() => queryResult({ error: new Error('boom') }));
    await expect(hideCompanionTrip('c1')).rejects.toThrow('boom');
  });
});
