/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../supabase';
import { fetchUserCrawls, fetchUserPosts, fetchUserProfile } from '../profile';

function queryResult(response: unknown) {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    single: jest.fn(() => obj),
    order: jest.fn(() => obj),
    range: jest.fn(() => obj),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return obj;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockFrom.mockReset();
});

describe('fetchUserProfile', () => {
  it('combines the profile row with follower/following counts and my-follow status', async () => {
    mockFrom
      .mockReturnValueOnce(
        queryResult({ data: { display_name: 'Alex', avatar_url: 'https://cdn.example/alex.jpg' }, error: null })
      )
      .mockReturnValueOnce(queryResult({ count: 12, error: null }))
      .mockReturnValueOnce(queryResult({ count: 3, error: null }))
      .mockReturnValueOnce(queryResult({ count: 1, error: null }));

    const profile = await fetchUserProfile('u2', 'u1');

    expect(profile).toEqual({
      id: 'u2',
      displayName: 'Alex',
      avatarUrl: 'https://cdn.example/alex.jpg',
      followerCount: 12,
      followingCount: 3,
      isFollowedByMe: true,
      isMe: false,
    });
  });

  it('reports isFollowedByMe: false and isMe: true when viewing your own profile', async () => {
    mockFrom
      .mockReturnValueOnce(queryResult({ data: { display_name: 'Jack' }, error: null }))
      .mockReturnValueOnce(queryResult({ count: 0, error: null }))
      .mockReturnValueOnce(queryResult({ count: 0, error: null }))
      .mockReturnValueOnce(queryResult({ count: 0, error: null }));

    const profile = await fetchUserProfile('u1', 'u1');

    expect(profile.isMe).toBe(true);
    expect(profile.isFollowedByMe).toBe(false);
  });

  it('throws when the profile row is missing', async () => {
    mockFrom
      .mockReturnValueOnce(queryResult({ data: null, error: { message: 'not found' } }))
      .mockReturnValueOnce(queryResult({ count: 0, error: null }))
      .mockReturnValueOnce(queryResult({ count: 0, error: null }))
      .mockReturnValueOnce(queryResult({ count: 0, error: null }));

    await expect(fetchUserProfile('missing', 'u1')).rejects.toEqual({ message: 'not found' });
  });
});

describe('fetchUserPosts', () => {
  it('maps a user’s posts, sorted stops feeding the bar/drink summaries', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('feed_posts');
      return queryResult({
        data: [
          {
            id: 'p1',
            trip_id: 't1',
            caption: 'Fun night',
            created_at: '2026-01-01T00:00:00Z',
            trips: {
              total_duration_s: 3600,
              total_distance_m: 500,
              trip_stops: [
                {
                  stop_order: 1,
                  bars: { name: 'Bar B' },
                  drink_logs: [{ drink_name: 'Stout' }],
                },
                {
                  stop_order: 0,
                  bars: { name: 'Bar A' },
                  drink_logs: [{ drink_name: 'IPA' }, { drink_name: 'IPA' }],
                },
              ],
            },
          },
        ],
        error: null,
      });
    });

    const posts = await fetchUserPosts('u2');

    expect(posts).toEqual([
      {
        id: 'p1',
        tripId: 't1',
        caption: 'Fun night',
        createdAt: '2026-01-01T00:00:00Z',
        stopCount: 2,
        barNames: ['Bar A', 'Bar B'],
        totalDurationS: 3600,
        totalDistanceM: 500,
        totalDrinks: 3,
        drinkNames: ['IPA', 'IPA', 'Stout'],
      },
    ]);
  });

  it('throws if the query fails', async () => {
    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'boom' } }));
    await expect(fetchUserPosts('u2')).rejects.toEqual({ message: 'boom' });
  });
});

describe('fetchUserCrawls', () => {
  it('maps crawl rows, defaulting a missing stop count to zero', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('crawls');
      return queryResult({
        data: [
          {
            id: 'c1',
            name: 'Downtown Crawl',
            description: null,
            is_public: true,
            created_at: '2026-01-01T00:00:00Z',
            creator_id: 'u2',
            profiles: { display_name: 'Alex' },
            crawl_stops: [{ count: 5 }],
          },
        ],
        error: null,
      });
    });

    const crawls = await fetchUserCrawls('u2');

    expect(crawls).toEqual([
      {
        id: 'c1',
        name: 'Downtown Crawl',
        description: null,
        isPublic: true,
        createdAt: '2026-01-01T00:00:00Z',
        creatorId: 'u2',
        creatorName: 'Alex',
        stopCount: 5,
      },
    ]);
  });

  it('throws if the query fails', async () => {
    mockFrom.mockReturnValue(queryResult({ data: null, error: { message: 'denied' } }));
    await expect(fetchUserCrawls('u2')).rejects.toEqual({ message: 'denied' });
  });
});
