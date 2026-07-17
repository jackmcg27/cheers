/* eslint-disable import/first -- jest.mock must run before the mocked modules are imported */
jest.mock('../supabase', () => ({
  supabase: { from: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}));
jest.mock('../auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('../places', () => ({ findNearestBar: jest.fn() }));
jest.mock('../companion-invites', () => ({
  fetchActiveHostTrip: jest.fn(),
  fetchTripCompanions: jest.fn(),
  respondToInvite: jest.fn(),
}));
jest.mock('../trip-sync', () => ({ fetchLiveTrip: jest.fn() }));
jest.mock('../crawls', () => ({
  fetchCrawlDetail: jest.fn(),
  crawlStopToPlaceBar: jest.fn((stop: any) => ({
    placeId: stop.bar.placeId,
    name: stop.bar.name,
    address: stop.bar.address,
    location: { latitude: stop.bar.lat, longitude: stop.bar.lng },
    photoRef: stop.bar.photoRef,
  })),
}));

import { act, create } from 'react-test-renderer';

import { useAuth } from '../auth-context';
import { fetchActiveHostTrip, fetchTripCompanions, respondToInvite } from '../companion-invites';
import { crawlStopToPlaceBar, fetchCrawlDetail } from '../crawls';
import { findNearestBar } from '../places';
import type { PlaceBar } from '../places';
import { supabase } from '../supabase';
import { TripProvider, useTrip } from '../trip-context';
import type { LiveTrip } from '../trip-sync';
import { fetchLiveTrip } from '../trip-sync';

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

/** A stub realtime channel: captures each `.on('postgres_changes', { table }, cb)` registration
 * by table name so a test can invoke the callback directly, the way a real Supabase realtime
 * event would. */
function fakeChannel() {
  const handlers: Record<string, (payload?: unknown) => unknown> = {};
  const obj: any = {
    on: jest.fn((_event: string, filter: { table: string }, cb: (payload?: unknown) => unknown) => {
      handlers[filter.table] = cb;
      return obj;
    }),
    subscribe: jest.fn(() => obj),
  };
  return { obj, handlers };
}

function makeLiveTrip(overrides: Partial<LiveTrip> = {}): LiveTrip {
  return {
    hostId: 'host-1',
    hostName: null,
    crawlId: null,
    startedAt: '2026-01-01T00:00:00Z',
    endedAt: null,
    phase: 'traveling',
    targetBar: bar,
    targetBarId: 'bar-row-1',
    routeIndex: 0,
    currentStopId: null,
    visitedPlaceIds: [],
    drinkCount: 0,
    companionDrinkCounts: {},
    ...overrides,
  };
}

const mockFrom = supabase.from as jest.Mock;
const mockChannel = supabase.channel as jest.Mock;
const mockRemoveChannel = supabase.removeChannel as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockFindNearestBar = findNearestBar as jest.Mock;
const mockFetchActiveHostTrip = fetchActiveHostTrip as jest.Mock;
const mockFetchTripCompanions = fetchTripCompanions as jest.Mock;
const mockRespondToInvite = respondToInvite as jest.Mock;
const mockFetchLiveTrip = fetchLiveTrip as jest.Mock;
const mockFetchCrawlDetail = fetchCrawlDetail as jest.Mock;

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

let lastChannel: ReturnType<typeof fakeChannel> | null = null;

beforeEach(() => {
  mockFrom.mockReset();
  mockChannel.mockReset();
  lastChannel = null;
  mockChannel.mockImplementation(() => {
    lastChannel = fakeChannel();
    return lastChannel.obj;
  });
  mockRemoveChannel.mockReset();
  mockFindNearestBar.mockReset();
  mockFetchActiveHostTrip.mockReset();
  mockFetchActiveHostTrip.mockResolvedValue(null);
  mockFetchTripCompanions.mockReset();
  mockFetchTripCompanions.mockResolvedValue([]);
  mockRespondToInvite.mockReset();
  mockRespondToInvite.mockResolvedValue(undefined);
  mockFetchLiveTrip.mockReset();
  mockFetchCrawlDetail.mockReset();
  mockUseAuth.mockReturnValue({ session: { user: { id: 'user-1' } }, initializing: false });
});

/** Freeform (nearest-bar) startCrawl through to `phase: 'traveling'`. */
async function startFreeformTrip(getCtx: () => ReturnType<typeof useTrip>, target: PlaceBar = bar) {
  mockFindNearestBar.mockResolvedValue(target);
  mockFrom.mockImplementation((table: string) => {
    if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
    if (table === 'trips') {
      return queryResult({ data: { id: 'trip-1', started_at: '2026-01-01T00:00:00Z' }, error: null });
    }
    throw new Error(`unexpected table: ${table}`);
  });
  await act(async () => {
    await getCtx().startCrawl({ latitude: 0, longitude: 0 });
  });
}

/** Freeform startCrawl + confirmArrival through to `phase: 'arrived'`, `currentStopId: 'stop-1'`. */
async function arriveAtBar(getCtx: () => ReturnType<typeof useTrip>) {
  await startFreeformTrip(getCtx);
  mockFrom.mockImplementation((table: string) => {
    if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
    if (table === 'trips') return queryResult({ error: null });
    throw new Error(`unexpected table: ${table}`);
  });
  await act(async () => {
    await getCtx().confirmArrival();
  });
}

describe('startCrawl', () => {
  it('finds the nearest bar, opens a trip, and moves to traveling', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);

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

  it('surfaces an error when saving the bar fails', async () => {
    const getCtx = await renderTrip();
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: null, error: { message: 'bar upsert failed' } });
      throw new Error(`unexpected table: ${table}`);
    });

    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().phase).toBe('idle');
    expect(getCtx().error).toBe('bar upsert failed');
  });

  it('surfaces the Supabase error and returns to idle when trip creation fails', async () => {
    const getCtx = await renderTrip();
    mockFindNearestBar.mockResolvedValue(bar);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trips') return queryResult({ data: null, error: { message: 'insert denied' } });
      throw new Error(`unexpected table: ${table}`);
    });

    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().phase).toBe('idle');
    expect(getCtx().error).toBe('insert denied');
  });

  it('attaches to the active host trip instead of starting a new one', async () => {
    const getCtx = await renderTrip();
    mockFetchActiveHostTrip.mockResolvedValue({ companionId: 'comp-1', hostName: 'Jack', tripId: 'trip-9' });
    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ hostName: 'Jack' }));

    await act(async () => {
      await getCtx().startCrawl({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().tripId).toBe('trip-9');
    expect(getCtx().hostName).toBe('Jack');
    expect(getCtx().phase).toBe('traveling');
    expect(mockFindNearestBar).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('startCrawlWithRoute', () => {
  it('opens a trip linked to the crawl and targets the first stop', async () => {
    const getCtx = await renderTrip();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trips') {
        return queryResult({ data: { id: 'trip-2', started_at: '2026-01-01T00:00:00Z' }, error: null });
      }
      throw new Error(`unexpected table: ${table}`);
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

  it('surfaces an error and returns to idle when trip creation fails', async () => {
    const getCtx = await renderTrip();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trips') return queryResult({ data: null, error: { message: 'insert failed' } });
      throw new Error(`unexpected table: ${table}`);
    });

    await act(async () => {
      await getCtx().startCrawlWithRoute({ id: 'crawl-1', stops: [bar, bar2] });
    });

    expect(getCtx().error).toBe('insert failed');
    expect(getCtx().phase).toBe('idle');
  });

  it('attaches to the active host trip instead of starting a new one', async () => {
    const getCtx = await renderTrip();
    mockFetchActiveHostTrip.mockResolvedValue({ companionId: 'comp-1', hostName: 'Jack', tripId: 'trip-9' });
    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ hostName: 'Jack' }));

    await act(async () => {
      await getCtx().startCrawlWithRoute({ id: 'crawl-1', stops: [bar, bar2] });
    });

    expect(getCtx().tripId).toBe('trip-9');
    expect(getCtx().hostName).toBe('Jack');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('confirmArrival', () => {
  it('logs the stop and moves to arrived', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      if (table === 'trips') return queryResult({ error: null });
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

  it('does nothing without a target bar / trip', async () => {
    const getCtx = await renderTrip();

    await act(async () => {
      await getCtx().confirmArrival();
    });

    expect(getCtx().phase).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('surfaces an error when logging the stop fails, without changing phase', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);

    mockFrom.mockImplementation(() => queryResult({ data: null, error: { message: 'stop insert failed' } }));

    await act(async () => {
      await getCtx().confirmArrival();
    });

    expect(getCtx().phase).toBe('traveling');
    expect(getCtx().error).toBe('stop insert failed');
  });
});

describe('addDrink', () => {
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

  it('surfaces the error and does not increment the count when the insert fails', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    mockFrom.mockImplementation(() => queryResult({ error: { message: 'insert failed' } }));

    await act(async () => {
      await getCtx().addDrink('IPA');
    });

    expect(getCtx().error).toBe('insert failed');
    expect(getCtx().drinkCount).toBe(0);
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
  it('adds a guest companion by name', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    const q = queryResult({
      data: { id: 'comp-1', guest_name: 'Sam', status: 'accepted', profiles: null },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trip_companions');
      return q;
    });

    await act(async () => {
      await getCtx().addCompanion({ guestName: 'Sam' });
    });

    expect(q.insert).toHaveBeenCalledWith({
      trip_id: 'trip-1',
      user_id: null,
      guest_name: 'Sam',
      status: undefined,
    });
    expect(getCtx().companions).toEqual([{ id: 'comp-1', name: 'Sam', status: 'accepted' }]);
  });

  it('adds an app-user companion as a pending invite, preferring their display name', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    const q = queryResult({
      data: { id: 'comp-2', guest_name: null, status: 'pending', profiles: { display_name: 'Alex' } },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trip_companions');
      return q;
    });

    await act(async () => {
      await getCtx().addCompanion({ userId: 'user-2' });
    });

    expect(q.insert).toHaveBeenCalledWith({
      trip_id: 'trip-1',
      user_id: 'user-2',
      guest_name: null,
      status: 'pending',
    });
    expect(getCtx().companions).toEqual([{ id: 'comp-2', name: 'Alex', status: 'pending' }]);
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
    await arriveAtBar(getCtx);

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

describe('refreshCompanions', () => {
  it('does nothing without a current trip', async () => {
    const getCtx = await renderTrip();

    await act(async () => {
      await getCtx().refreshCompanions();
    });

    expect(mockFetchTripCompanions).not.toHaveBeenCalled();
  });

  it('replaces the companion list with the latest statuses from the server', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);
    mockFetchTripCompanions.mockResolvedValue([{ id: 'comp-1', name: 'Alex', status: 'accepted' }]);

    await act(async () => {
      await getCtx().refreshCompanions();
    });

    expect(mockFetchTripCompanions).toHaveBeenCalledWith('trip-1');
    expect(getCtx().companions).toEqual([{ id: 'comp-1', name: 'Alex', status: 'accepted' }]);
  });

  it('keeps the last-known list when the fetch fails', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);
    mockFrom.mockImplementation(() =>
      queryResult({
        data: { id: 'comp-1', guest_name: 'Sam', status: 'accepted', profiles: null },
        error: null,
      })
    );
    await act(async () => {
      await getCtx().addCompanion({ guestName: 'Sam' });
    });

    mockFetchTripCompanions.mockRejectedValue(new Error('network down'));

    await act(async () => {
      await getCtx().refreshCompanions();
    });

    expect(getCtx().companions).toEqual([{ id: 'comp-1', name: 'Sam', status: 'accepted' }]);
  });
});

describe('pace warning', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays silent under the threshold and below the minimum drink count', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T01:00:00.000Z')); // 1hr elapsed
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('drink_logs');
      return queryResult({ error: null });
    });

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
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('drink_logs');
      return queryResult({ error: null });
    });

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
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('drink_logs');
      return queryResult({ error: null });
    });

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
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('drink_logs');
      return queryResult({ error: null });
    });

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
  it('freeform mode: finds the next nearest bar excluding visited ones', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ error: null });
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-2' }, error: null });
      if (table === 'trips') return queryResult({ error: null });
      throw new Error(`unexpected table: ${table}`);
    });
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

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ error: null });
      throw new Error(`unexpected table: ${table}`);
    });
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

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    mockFindNearestBar.mockResolvedValue(null);

    await act(async () => {
      await getCtx().nextBar({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().phase).toBe('arrived');
    expect(getCtx().error).toBe('No more nearby bars — end the crawl to save your trip.');
  });

  it('freeform mode: surfaces an error and returns to arrived when the request throws', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    mockFrom.mockImplementation(() => {
      throw new Error('network down');
    });

    await act(async () => {
      await getCtx().nextBar({ latitude: 0, longitude: 0 });
    });

    expect(getCtx().phase).toBe('arrived');
    expect(getCtx().error).toBe('network down');
  });

  it('does nothing without a current stop', async () => {
    const getCtx = await renderTrip();

    await act(async () => {
      await getCtx().nextBar(null);
    });

    expect(getCtx().phase).toBe('idle');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('route mode: advances to the next stop in the route', async () => {
    const getCtx = await renderTrip();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trips') {
        return queryResult({ data: { id: 'trip-2', started_at: '2026-01-01T00:00:00Z' }, error: null });
      }
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().startCrawlWithRoute({ id: 'crawl-1', stops: [bar, bar2] });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      if (table === 'trips') return queryResult({ error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ error: null });
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-2' }, error: null });
      if (table === 'trips') return queryResult({ error: null });
      throw new Error(`unexpected table: ${table}`);
    });

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
    mockFrom.mockImplementation((table: string) => {
      if (table === 'bars') return queryResult({ data: { id: 'bar-row-1' }, error: null });
      if (table === 'trips') {
        return queryResult({ data: { id: 'trip-2', started_at: '2026-01-01T00:00:00Z' }, error: null });
      }
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().startCrawlWithRoute({ id: 'crawl-1', stops: [bar] });
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ data: { id: 'stop-1' }, error: null });
      if (table === 'trips') return queryResult({ error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().confirmArrival();
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ error: null });
      throw new Error(`unexpected table: ${table}`);
    });

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
  it('does nothing without an active trip', async () => {
    const getCtx = await renderTrip();

    await act(async () => {
      await getCtx().endCrawl();
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('saves duration/distance and resets to idle', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

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

  it('clears a "Reveal" toggle left on from this crawl once it ends', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);
    act(() => {
      getCtx().setRevealMode(true);
    });
    expect(getCtx().revealMode).toBe(true);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ error: null });
      if (table === 'trips') return queryResult({ data: [], error: null });
      throw new Error(`unexpected table: ${table}`);
    });

    await act(async () => {
      await getCtx().endCrawl();
    });

    expect(getCtx().revealMode).toBe(false);
  });

  it('accumulates distance across multiple stops', async () => {
    const getCtx = await renderTrip();
    await arriveAtBar(getCtx);

    const tripUpdateCalls: unknown[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') {
        return queryResult({
          data: [
            { stop_order: 0, bars: { lat: 1, lng: 2 } },
            { stop_order: 1, bars: { lat: 1.01, lng: 2.01 } },
          ],
          error: null,
        });
      }
      if (table === 'trips') {
        const q = queryResult({ error: null });
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

    expect(tripUpdateCalls).toHaveLength(1);
    const update = tripUpdateCalls[0] as { total_distance_m: number };
    expect(update.total_distance_m).toBeGreaterThan(0);
  });

  it('surfaces an error without resetting the trip when the update fails', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);

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

describe('realtime sync', () => {
  it('subscribes to the trip channel and tears it down when the trip resets', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);

    expect(mockChannel).toHaveBeenCalledWith('trip-trip-1');
    const channel = lastChannel!;
    expect(channel.obj.subscribe).toHaveBeenCalled();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'trip_stops') return queryResult({ error: null });
      if (table === 'trips') return queryResult({ data: [], error: null });
      throw new Error(`unexpected table: ${table}`);
    });
    await act(async () => {
      await getCtx().endCrawl();
    });

    expect(mockRemoveChannel).toHaveBeenCalledWith(channel.obj);
  });

  it('reconciles phase/target/drink state from a trips or trip_stops change', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);
    const channel = lastChannel!;

    mockFetchLiveTrip.mockResolvedValue(
      makeLiveTrip({
        phase: 'arrived',
        targetBar: bar2,
        targetBarId: 'bar-row-2',
        currentStopId: 'stop-9',
        visitedPlaceIds: ['place-1'],
        drinkCount: 2,
        companionDrinkCounts: { c1: 1 },
      })
    );

    await act(async () => {
      await channel.handlers['trips']();
    });

    expect(getCtx().phase).toBe('arrived');
    expect(getCtx().targetBar).toEqual(bar2);
    expect(getCtx().currentStopId).toBe('stop-9');
    expect(getCtx().drinkCount).toBe(2);
    expect(getCtx().companionDrinkCounts).toEqual({ c1: 1 });

    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ routeIndex: 2 }));
    await act(async () => {
      await channel.handlers['trip_stops']();
    });
    expect(getCtx().routeIndex).toBe(2);
  });

  it('resets to idle when the reconciled trip has ended', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);
    const channel = lastChannel!;

    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ endedAt: '2026-01-01T02:00:00Z' }));

    await act(async () => {
      await channel.handlers['trip_stops']();
    });

    expect(getCtx().phase).toBe('idle');
    expect(getCtx().tripId).toBeNull();
  });

  it('swallows a reconcile failure and leaves local state untouched', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);
    const channel = lastChannel!;

    mockFetchLiveTrip.mockRejectedValue(new Error('network down'));

    await act(async () => {
      await channel.handlers['drink_logs']();
    });

    expect(getCtx().phase).toBe('traveling');
  });

  it('refreshes companions on a trip_companions change, and keeps the last-known list on failure', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);
    const channel = lastChannel!;

    mockFetchTripCompanions.mockResolvedValueOnce([{ id: 'comp-1', name: 'Sam', status: 'accepted' }]);
    await act(async () => {
      await channel.handlers['trip_companions']();
    });
    expect(getCtx().companions).toEqual([{ id: 'comp-1', name: 'Sam', status: 'accepted' }]);

    mockFetchTripCompanions.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      await channel.handlers['trip_companions']();
    });
    expect(getCtx().companions).toEqual([{ id: 'comp-1', name: 'Sam', status: 'accepted' }]);
  });
});

describe('checkActiveHostTrip', () => {
  it('does nothing when already mid-trip', async () => {
    const getCtx = await renderTrip();
    await startFreeformTrip(getCtx);
    mockFetchActiveHostTrip.mockClear();

    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });

    expect(mockFetchActiveHostTrip).not.toHaveBeenCalled();
  });

  it('does nothing when there is no active host trip', async () => {
    const getCtx = await renderTrip();

    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });

    expect(getCtx().phase).toBe('idle');
    expect(getCtx().tripId).toBeNull();
  });

  it('swallows a fetchActiveHostTrip failure', async () => {
    const getCtx = await renderTrip();
    mockFetchActiveHostTrip.mockRejectedValue(new Error('network down'));

    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });

    expect(getCtx().phase).toBe('idle');
  });

  it('attaches to the host trip, pulling live state and companions', async () => {
    const getCtx = await renderTrip();
    mockFetchActiveHostTrip.mockResolvedValue({ companionId: 'comp-1', hostName: 'Jack', tripId: 'trip-9' });
    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ hostName: 'Jack' }));
    mockFetchTripCompanions.mockResolvedValue([{ id: 'comp-1', name: 'Me', status: 'accepted' }]);

    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });

    expect(getCtx().tripId).toBe('trip-9');
    expect(getCtx().hostName).toBe('Jack');
    expect(getCtx().phase).toBe('traveling');
    expect(getCtx().targetBar).toEqual(bar);
    expect(getCtx().companions).toEqual([{ id: 'comp-1', name: 'Me', status: 'accepted' }]);
  });

  it('resets a stale "Reveal" toggle from a previous crawl when attaching to a host trip', async () => {
    const getCtx = await renderTrip();
    act(() => {
      getCtx().setRevealMode(true);
    });
    expect(getCtx().revealMode).toBe(true);

    mockFetchActiveHostTrip.mockResolvedValue({ companionId: 'comp-1', hostName: 'Jack', tripId: 'trip-9' });
    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ hostName: 'Jack', phase: 'traveling' }));

    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });

    expect(getCtx().revealMode).toBe(false);
  });

  it('falls back to an empty companion list when fetching companions fails', async () => {
    const getCtx = await renderTrip();
    mockFetchActiveHostTrip.mockResolvedValue({ companionId: 'comp-1', hostName: 'Jack', tripId: 'trip-9' });
    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ hostName: 'Jack' }));
    mockFetchTripCompanions.mockRejectedValue(new Error('network down'));

    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });

    expect(getCtx().companions).toEqual([]);
  });

  it('reconstructs route stops from the crawl when the trip is in route mode', async () => {
    const getCtx = await renderTrip();
    mockFetchActiveHostTrip.mockResolvedValue({ companionId: 'comp-1', hostName: 'Jack', tripId: 'trip-9' });
    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ hostName: 'Jack', crawlId: 'crawl-1' }));
    mockFetchCrawlDetail.mockResolvedValue({
      id: 'crawl-1',
      name: 'Crawl',
      description: null,
      isPublic: true,
      createdAt: '',
      creatorId: 'host-1',
      creatorName: null,
      stopCount: 1,
      stops: [
        {
          id: 'cs-1',
          stopOrder: 0,
          bar: {
            id: 'bar-row-1',
            placeId: bar.placeId,
            name: bar.name,
            address: bar.address,
            lat: bar.location.latitude,
            lng: bar.location.longitude,
            photoRef: bar.photoRef,
          },
        },
      ],
    });

    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });

    expect(mockFetchCrawlDetail).toHaveBeenCalledWith('crawl-1');
    expect(getCtx().routeStops).toEqual([bar]);
  });

  it('leaves routeStops null when the crawl detail fetch fails', async () => {
    const getCtx = await renderTrip();
    mockFetchActiveHostTrip.mockResolvedValue({ companionId: 'comp-1', hostName: 'Jack', tripId: 'trip-9' });
    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ hostName: 'Jack', crawlId: 'crawl-1' }));
    mockFetchCrawlDetail.mockRejectedValue(new Error('network down'));

    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });

    expect(getCtx().routeStops).toBeNull();
  });
});

describe('leaveHostTrip', () => {
  it('does nothing when not following anyone', async () => {
    const getCtx = await renderTrip();

    await act(async () => {
      await getCtx().leaveHostTrip();
    });

    expect(mockRespondToInvite).not.toHaveBeenCalled();
  });

  it('declines the invite and resets to idle', async () => {
    const getCtx = await renderTrip();
    mockFetchActiveHostTrip.mockResolvedValue({ companionId: 'comp-1', hostName: 'Jack', tripId: 'trip-9' });
    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ hostName: 'Jack' }));
    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });
    expect(getCtx().hostName).toBe('Jack');

    await act(async () => {
      await getCtx().leaveHostTrip();
    });

    expect(mockRespondToInvite).toHaveBeenCalledWith('comp-1', false);
    expect(getCtx().phase).toBe('idle');
    expect(getCtx().tripId).toBeNull();
    expect(getCtx().hostName).toBeNull();
  });

  it('surfaces an error when declining fails', async () => {
    const getCtx = await renderTrip();
    mockFetchActiveHostTrip.mockResolvedValue({ companionId: 'comp-1', hostName: 'Jack', tripId: 'trip-9' });
    mockFetchLiveTrip.mockResolvedValue(makeLiveTrip({ hostName: 'Jack' }));
    await act(async () => {
      await getCtx().checkActiveHostTrip();
    });

    mockRespondToInvite.mockRejectedValue(new Error('network down'));

    await act(async () => {
      await getCtx().leaveHostTrip();
    });

    expect(getCtx().error).toBe('network down');
    expect(getCtx().tripId).toBe('trip-9');
  });
});
