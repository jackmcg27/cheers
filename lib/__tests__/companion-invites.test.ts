/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('../supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), channel: jest.fn(), removeChannel: jest.fn() },
}));

import { supabase } from '../supabase';
import {
  fetchActiveHostTrip,
  fetchPendingInvites,
  fetchTripCompanions,
  respondToInvite,
  subscribeToInviteChanges,
} from '../companion-invites';

/** A stub PostgREST query builder: every chain method returns itself, and it resolves
 * (thenable, like the real builder) to whatever response you configure. */
function queryResult(response: unknown) {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    update: jest.fn(() => obj),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return obj;
}

/** A stub realtime channel: captures the `.on('postgres_changes', filter, cb)` registration so a
 * test can invoke it directly, mirroring `trip-context.test.tsx`'s `fakeChannel()`. */
function fakeChannel() {
  let handler: ((payload?: unknown) => unknown) | null = null;
  const obj: any = {
    on: jest.fn((_event: string, _filter: unknown, cb: (payload?: unknown) => unknown) => {
      handler = cb;
      return obj;
    }),
    subscribe: jest.fn(() => obj),
  };
  return { obj, getHandler: () => handler! };
}

const mockFrom = supabase.from as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;
const mockChannel = supabase.channel as jest.Mock;
const mockRemoveChannel = supabase.removeChannel as jest.Mock;

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockChannel.mockReset();
  mockRemoveChannel.mockReset();
});

describe('fetchPendingInvites', () => {
  it('maps pending invites, falling back to "Someone" when the host has no display name', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trip_companions');
      return queryResult({
        data: [
          { id: 'c1', trip_id: 't1', trips: { profiles: { display_name: 'Jack' } } },
          { id: 'c2', trip_id: 't2', trips: { profiles: { display_name: null } } },
          { id: 'c3', trip_id: 't3', trips: null },
        ],
        error: null,
      });
    });

    const invites = await fetchPendingInvites('me');

    expect(invites).toEqual([
      { id: 'c1', tripId: 't1', hostName: 'Jack' },
      { id: 'c2', tripId: 't2', hostName: 'Someone' },
      { id: 'c3', tripId: 't3', hostName: 'Someone' },
    ]);
  });

  it('returns an empty array when there is no data', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: null }));

    expect(await fetchPendingInvites('me')).toEqual([]);
  });

  it('throws the Supabase error', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: new Error('boom') }));

    await expect(fetchPendingInvites('me')).rejects.toThrow('boom');
  });
});

describe('fetchTripCompanions', () => {
  it('maps rows, preferring guest_name then display_name then "Someone"', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trip_companions');
      return queryResult({
        data: [
          { id: 'c1', guest_name: 'Sam', status: 'accepted', profiles: null },
          { id: 'c2', guest_name: null, status: 'pending', profiles: { display_name: 'Alex' } },
          { id: 'c3', guest_name: null, status: 'declined', profiles: null },
        ],
        error: null,
      });
    });

    expect(await fetchTripCompanions('trip-1')).toEqual([
      { id: 'c1', name: 'Sam', status: 'accepted' },
      { id: 'c2', name: 'Alex', status: 'pending' },
      { id: 'c3', name: 'Someone', status: 'declined' },
    ]);
  });

  it('returns an empty array when there is no data', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: null }));

    expect(await fetchTripCompanions('trip-1')).toEqual([]);
  });

  it('throws the Supabase error', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: new Error('boom') }));

    await expect(fetchTripCompanions('trip-1')).rejects.toThrow('boom');
  });
});

describe('respondToInvite', () => {
  it('updates status to accepted', async () => {
    const result = queryResult({ error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('trip_companions');
      return result;
    });

    await respondToInvite('c1', true);

    expect(result.update).toHaveBeenCalledWith({ status: 'accepted' });
    expect(result.eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('updates status to declined', async () => {
    const result = queryResult({ error: null });
    mockFrom.mockImplementation(() => result);

    await respondToInvite('c1', false);

    expect(result.update).toHaveBeenCalledWith({ status: 'declined' });
  });

  it('throws the Supabase error', async () => {
    mockFrom.mockImplementation(() => queryResult({ error: new Error('boom') }));

    await expect(respondToInvite('c1', true)).rejects.toThrow('boom');
  });
});

describe('subscribeToInviteChanges', () => {
  it('subscribes filtered to the user and invokes onChange on a postgres_changes event', () => {
    const channel = fakeChannel();
    mockChannel.mockReturnValue(channel.obj);
    const onChange = jest.fn();

    const unsubscribe = subscribeToInviteChanges('me', onChange);

    expect(mockChannel).toHaveBeenCalledWith('invites-me');
    expect(channel.obj.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trip_companions', filter: 'user_id=eq.me' },
      onChange
    );
    expect(channel.obj.subscribe).toHaveBeenCalled();

    channel.getHandler()();
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(mockRemoveChannel).toHaveBeenCalledWith(channel.obj);
  });
});

describe('fetchActiveHostTrip', () => {
  it('returns the accepted invite when there is one, falling back to "Someone"', async () => {
    mockRpc.mockResolvedValue({
      data: [{ companion_id: 'c1', host_name: null, trip_id: 't1' }],
      error: null,
    });

    expect(await fetchActiveHostTrip()).toEqual({ companionId: 'c1', hostName: 'Someone', tripId: 't1' });
    expect(mockRpc).toHaveBeenCalledWith('active_host_trip');
  });

  it('passes through the host name when present', async () => {
    mockRpc.mockResolvedValue({
      data: [{ companion_id: 'c1', host_name: 'Jack', trip_id: 't1' }],
      error: null,
    });

    expect(await fetchActiveHostTrip()).toEqual({ companionId: 'c1', hostName: 'Jack', tripId: 't1' });
  });

  it('returns null when there is no active host trip', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    expect(await fetchActiveHostTrip()).toBeNull();
  });

  it('throws the Supabase error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('boom') });

    await expect(fetchActiveHostTrip()).rejects.toThrow('boom');
  });
});
