/* eslint-disable import/first -- jest.mock must run before the mocked modules are imported */
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../places', () => ({ findNearestBar: jest.fn() }));

import { act, create } from 'react-test-renderer';

import { useAuth } from '../auth-context';
import { findNearestBar } from '../places';
import type { PlaceBar } from '../places';
import { supabase } from '../supabase';
import { TripProvider, useTrip } from '../trip-context';

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
    delete: jest.fn(() => obj),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return obj;
}

const mockFrom = supabase.from as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockFindNearestBar = findNearestBar as jest.Mock;

const bar: PlaceBar = {
  placeId: 'place-1',
  name: 'The Thirsty Crow',
  address: '123 Main St',
  location: { latitude: 1, longitude: 2 },
  photoRef: null,
};
const bar2: PlaceBar = {
  placeId: 'place-2',
  name: 'Second Stop',
  address: '456 Main St',
  location: { latitude: 3, longitude: 4 },
  photoRef: null,
};

let ctx: ReturnType<typeof useTrip>;
function Harness() {
  ctx = useTrip();
  return null;
}

async function renderTrip() {
  await act(async () => {
    create(
      <TripProvider>
        <Harness />
      </TripProvider>
    );
  });
  return () => ctx;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockFindNearestBar.mockReset();
  mockUseAuth.mockReturnValue({ session: { user: { id: 'user-1' } }, initializing: false });
});

describe('startCrawl', () => {
  it('finds the nearest bar, opens a trip, and moves to traveling', async () => {
    const getCtx = await renderTrip();
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trips');
      return queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00Z' }, error: null });
    });

    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().phase).toBe('traveling');
    expect(getCtx().targetBar).toEqual(bar);
    expect(getCtx().tripId).toBe('trip-1');
    expect(getCtx().error).toBeNull();
  });

  it('sets an error and returns to idle when no bar is nearby', async () => {
    const getCtx = await renderTrip();
    mockFindNearestBar.mockResolvedValue(null);

    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().phase).toBe('idle');
    expect(getCtx().error).toBe('No bars found nearby.');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does nothing without a session', async () => {
    mockUseAuth.mockReturnValue({ session: null, initializing: false });
    const getCtx = await renderTrip();

    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().phase).toBe('idle');
    expect(mockFindNearestBar).not.toHaveBeenCalled();
  });

  it('surfaces the Supabase error and returns to idle when trip creation fails', async () => {
    const getCtx = await renderTrip();
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation(() => queryResult({ data: null, error: { message: 'insert denied' } }));

    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().phase).toBe('idle');
    expect(getCtx().error).toBe('insert denied');
  });
});

describe('startCrawlWithRoute', () => {
  it('opens a trip linked to the crawl and targets the first stop', async () => {
    const getCtx = await renderTrip();
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trips');
      return queryResult({ data: { id: 'trip-2', started_at: '2026-01-01T00:00:00Z' }, error: null });
    });

    await act(async () => {
      await getCtx().startCrawlWithRoute({ id: 'crawl-1', stops: [bar, bar2] });
    });

    expect(getCtx().phase).toBe('traveling');
    expect(getCtx().targetBar).toEqual(bar);
    expect(getCtx().routeStops).toEqual([bar, bar2]);
    expect(getCtx().routeIndex).toBe(0);
  });

  it('does nothing for a crawl with no stops', async () => {
    const getCtx = await renderTrip();

    await act(async () => {
      await getCtx().startCrawlWithRoute({ id: 'crawl-1', stops: [] });
    });

    expect(getCtx().phase).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('confirmArrival', () => {
  async function startFreeformTrip(getCtx: () => ReturnType<typeof useTrip>) {
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });
  }

  it('logs the stop and moves to arrived', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });

    await act(async () => {
      await getCtx().confirmArrival();
    });

    expect(getCtx().phase).toBe('arrived');
    expect(getCtx().currentStopId).toBe('stop-1');
    expect(getCtx().drinkCount).toBe(0);
    expect(getCtx().error).toBeNull();
  });

  it('surfaces an error when saving the bar fails, without changing phase', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);

    mockFrom.mockImplementation(() => queryResult({ data: null, error: { message: 'bar upsert failed' } }));

    await act(async () => {
      await getCtx().confirmArrival();
    });

    expect(getCtx().phase).toBe('traveling');
    expect(getCtx().error).toBe('bar upsert failed');
  });
});

describe('addDrink', () => {
  async function arriveAtBar(getCtx: () => ReturnType<typeof useTrip>) {
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });
  }

  it('inserts a drink log and increments the count', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    const q = queryResult({ error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('drink_logs');
      return q;
    });

    await act(async () => {
      await getCtx().addDrink('IPA');
    });

    expect(q.insert).toHaveBeenCalledWith({
      trip_stop_id: 'stop-1',
      drink_name: 'IPA',
      companion_id: null,
    });
    expect(getCtx().drinkCount).toBe(1);
  });

  it('does nothing without a current stop', async () => {
    const getCtx = await renderTrip();

    await act(async () => {
      await getCtx().addDrink();
    });

    expect(getCtx().drinkCount).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('logs a companion drink into companionDrinkCounts, leaving drinkCount untouched', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    const q = queryResult({ error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('drink_logs');
      return q;
    });

    await act(async () => {
      await getCtx().addDrink('Lager', 'comp-1');
    });

    expect(q.insert).toHaveBeenCalledWith({
      trip_stop_id: 'stop-1',
      drink_name: 'Lager',
      companion_id: 'comp-1',
    });
    expect(getCtx().companionDrinkCounts).toEqual({ 'comp-1': 1 });
    expect(getCtx().drinkCount).toBe(0);
  });
});

describe('addCompanion', () => {
  async function arriveAtBar(getCtx: () => ReturnType<typeof useTrip>) {
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });
  }

  it('adds a guest companion by name', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    const q = queryResult({ data: { id: 'comp-1', guest_name: 'Sam', profiles: null }, error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trip_companions');
      return q;
    });

    await act(async () => {
      await getCtx().addCompanion({ guestName: 'Sam' });
    });

    expect(q.insert).toHaveBeenCalledWith({ trip_id: 'trip-1', user_id: null, guest_name: 'Sam' });
    expect(getCtx().companions).toEqual([{ id: 'comp-1', name: 'Sam' }]);
  });

  it('adds an app-user companion, preferring their display name', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    const q = queryResult({
      data: { id: 'comp-2', guest_name: null, profiles: { display_name: 'Alex' } },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trip_companions');
      return q;
    });

    await act(async () => {
      await getCtx().addCompanion({ userId: 'user-2' });
    });

    expect(q.insert).toHaveBeenCalledWith({ trip_id: 'trip-1', user_id: 'user-2', guest_name: null });
    expect(getCtx().companions).toEqual([{ id: 'comp-2', name: 'Alex' }]);
  });

  it('surfaces an error and adds nothing when the insert fails', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    mockFrom.mockImplementation(() => queryResult({ data: null, error: { message: 'insert denied' } }));

    await act(async () => {
      await getCtx().addCompanion({ guestName: 'Sam' });
    });

    expect(getCtx().companions).toEqual([]);
    expect(getCtx().error).toBe('insert denied');
  });
});

describe('removeCompanion', () => {
  async function arriveAtBarWithCompanion(getCtx: () => ReturnType<typeof useTrip>) {
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });

    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'comp-1', guest_name: 'Sam', profiles: null }, error: null })
    );
    await act(async () => {
      await getCtx().addCompanion({ guestName: 'Sam' });
    });

    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('drink_logs');
      return queryResult({ error: null });
    });
    await act(async () => {
      await getCtx().addDrink(undefined, 'comp-1');
    });
  }

  it('removes the companion and clears their drink count', async () => {
    const getCtx = await renderTrip();
    await arriveAtBarWithCompanion(getCtx);
    expect(getCtx().companions).toHaveLength(1);
    expect(getCtx().companionDrinkCounts).toEqual({ 'comp-1': 1 });

    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trip_companions');
      return queryResult({ error: null });
    });

    await act(async () => {
      await getCtx().removeCompanion('comp-1');
    });

    expect(getCtx().companions).toEqual([]);
    expect(getCtx().companionDrinkCounts).toEqual({});
  });

  it('surfaces an error and keeps the companion when the delete fails', async () => {
    const getCtx = await renderTrip();
    await arriveAtBarWithCompanion(getCtx);

    mockFrom.mockImplementation(() => queryResult({ error: { message: 'delete denied' } }));

    await act(async () => {
      await getCtx().removeCompanion('comp-1');
    });

    expect(getCtx().companions).toHaveLength(1);
    expect(getCtx().error).toBe('delete denied');
  });
});

describe('pace warning', () => {
  async function arriveAtBar(getCtx: () => ReturnType<typeof useTrip>) {
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00.000Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });

    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('drink_logs');
      return queryResult({ error: null });
    });
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays silent under the threshold and below the minimum drink count', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T01:00:00.000Z')); // 1hr elapsed
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    // 2 drinks in 1hr = 2/hr, at the threshold but not over it, and below the 3-drink minimum
    await act(async () => {
      await getCtx().addDrink();
      await getCtx().addDrink();
    });

    expect(getCtx().paceWarning).toBeNull();
  });

  it('warns once pace exceeds the threshold with enough drinks logged', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T01:00:00.000Z')); // 1hr elapsed
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    // 3 drinks in 1hr = 3/hr, over the 2/hr threshold and past the 3-drink minimum
    await act(async () => {
      await getCtx().addDrink();
      await getCtx().addDrink();
      await getCtx().addDrink();
    });

    expect(getCtx().paceWarning).toBe('Averaging 3.0 drinks/hr — maybe pace it with some water 💧');
  });

  it('dismissPaceWarning clears the banner until the next drink is logged', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T01:00:00.000Z'));
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    await act(async () => {
      await getCtx().addDrink();
      await getCtx().addDrink();
      await getCtx().addDrink();
    });
    expect(getCtx().paceWarning).not.toBeNull();

    act(() => {
      getCtx().dismissPaceWarning();
    });
    expect(getCtx().paceWarning).toBeNull();

    await act(async () => {
      await getCtx().addDrink();
    });
    expect(getCtx().paceWarning).not.toBeNull();
  });

  it('clears on resetTrip (via endCrawl)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T01:00:00.000Z'));
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    await act(async () => {
      await getCtx().addDrink();
      await getCtx().addDrink();
      await getCtx().addDrink();
    });
    expect(getCtx().paceWarning).not.toBeNull();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ error: null });
      if (table === 'trips') return queryResult({ data: [], error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().endCrawl();
    });

    expect(getCtx().paceWarning).toBeNull();
  });
});

describe('nextBar', () => {
  async function arriveAtBar(getCtx: () => ReturnType<typeof useTrip>) {
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });
  }

  it('freeform mode: finds the next nearest bar excluding visited ones', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    mockFrom.mockImplementation(() => queryResult({ error: null }));
    mockFindNearestBar.mockResolvedValue(bar2);

    await act(async () => {
      await getCtx().nextBar({ latitude: 0, longitude: 0 });
    });

    expect(mockFindNearestBar).toHaveBeenCalledWith({ latitude: 0, longitude: 0 }, ['place-1']);
    expect(getCtx().targetBar).toEqual(bar2);
    expect(getCtx().phase).toBe('traveling');
  });

  it('freeform mode: errors back to arrived when no more bars and no coords', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    mockFrom.mockImplementation(() => queryResult({ error: null }));
    mockFindNearestBar.mockClear();

    await act(async () => {
      await getCtx().nextBar(null);
    });

    expect(getCtx().phase).toBe('arrived');
    expect(getCtx().error).toBe('Waiting for GPS to find the next bar.');
    expect(mockFindNearestBar).not.toHaveBeenCalled();
  });

  it('freeform mode: errors back to arrived when no more bars are found', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    mockFrom.mockImplementation(() => queryResult({ error: null }));
    mockFindNearestBar.mockResolvedValue(null);

    await act(async () => {
      await getCtx().nextBar({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().phase).toBe('arrived');
    expect(getCtx().error).toBe('No more nearby bars — end the crawl to save your trip.');
  });

  it('route mode: advances to the next stop in the route', async () => {
    const getCtx = await renderTrip();
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-2', started_at: '2026-01-01T00:00:00Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawlWithRoute({ id: 'crawl-1', stops: [bar, bar2] });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });

    mockFrom.mockImplementation(() => queryResult({ error: null }));

    await act(async () => {
      await getCtx().nextBar(null);
    });

    expect(getCtx().phase).toBe('traveling');
    expect(getCtx().routeIndex).toBe(1);
    expect(getCtx().targetBar).toEqual(bar2);
    expect(mockFindNearestBar).not.toHaveBeenCalled();
  });

  it('route mode: ends at the last stop with a hint instead of erroring silently', async () => {
    const getCtx = await renderTrip();
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-2', started_at: '2026-01-01T00:00:00Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawlWithRoute({ id: 'crawl-1', stops: [bar] });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });

    mockFrom.mockImplementation(() => queryResult({ error: null }));

    await act(async () => {
      await getCtx().nextBar(null);
    });

    expect(getCtx().phase).toBe('arrived');
    expect(getCtx().error).toBe(
      'That was the last stop on this crawl — end the crawl to save your trip.'
    );
  });
});

describe('endCrawl', () => {
  it('saves duration/distance and resets to idle', async () => {
    const getCtx = await renderTrip();
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });

    const tripUpdateCalls: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ error: null });
      if (table === 'trips') {
        const q = queryResult({ data: [{ stop_order: 0, bars: { lat: 1, lng: 2 } }], error: null });
        q.update = jest.fn((values: unknown) => {
          tripUpdateCalls.push(values);
          return q;
        });
        return q;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    await act(async () => {
      await getCtx().endCrawl();
    });

    expect(getCtx().phase).toBe('idle');
    expect(getCtx().tripId).toBeNull();
    expect(tripUpdateCalls).toHaveLength(1);
    const update = tripUpdateCalls[0] as { total_distance_m: number; total_duration_s: number };
    expect(update.total_distance_m).toBe(0);
    expect(update.total_duration_s).toBeGreaterThanOrEqual(0);
  });

  it('surfaces an error without resetting the trip when the update fails', async () => {
    const getCtx = await renderTrip();
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation(() =>
      queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00Z' }, error: null })
    );
    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    mockFrom.mockImplementation(() => {
      throw new Error('network down');
    });

    await act(async () => {
      await getCtx().endCrawl();
    });

    expect(getCtx().error).toBe('network down');
    expect(getCtx().phase).toBe('traveling');
    expect(getCtx().tripId).toBe('trip-1');
  });
});
