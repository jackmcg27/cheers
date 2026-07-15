/* eslint-disable import/first -- jest.mock must run before the mocked module is imported */
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../supabase';
import {
  addComment,
  deletePost,
  fetchComments,
  fetchFeed,
  fetchFollowers,
  fetchFollowingIds,
  follow,
  searchProfiles,
  toggleLike,
  unfollow,
  FEED_PAGE_SIZE,
} from '../feed';

/** A stub PostgREST query builder: every chain method returns itself, and it resolves
 * (thenable, like the real builder) to whatever response you configure. */
function queryResult(response: unknown) {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    neq: jest.fn(() => obj),
    order: jest.fn(() => obj),
    range: jest.fn(() => obj),
    ilike: jest.fn(() => obj),
    limit: jest.fn(() => obj),
    insert: jest.fn(() => obj),
    delete: jest.fn(() => obj),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return obj;
}

const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockFrom.mockReset();
});

describe('fetchFeed', () => {
  it('sorts stops, sums drinks, collects bar names, and flags likedByMe', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('feed_posts');
      return queryResult({
        data: [
          {
            id: 'post-1',
            trip_id: 'trip-1',
            caption: 'Great night',
            created_at: '2026-01-01T00:00:00Z',
            user_id: 'author-1',
            profiles: { display_name: 'Jack' },
            trips: {
              total_duration_s: 3600,
              total_distance_m: 1500,
              // deliberately out of order, and one stop with no bar / no drinks
              trip_stops: [
                {
                  stop_order: 1,
                  bars: { name: 'Bar B' },
                  drink_logs: [{ drink_name: 'Stout' }, { drink_name: null }],
                },
                {
                  stop_order: 0,
                  bars: { name: 'Bar A' },
                  drink_logs: [{ drink_name: 'IPA' }, { drink_name: 'IPA' }, { drink_name: 'IPA' }],
                },
                { stop_order: 2, bars: null, drink_logs: [] },
              ],
            },
            post_likes: [{ user_id: 'me' }, { user_id: 'someone-else' }],
            post_comments: [{ count: 4 }],
          },
        ],
        error: null,
      });
    });

    const [post] = await fetchFeed('me');

    expect(post.tripId).toBe('trip-1');
    expect(post.authorName).toBe('Jack');
    expect(post.barNames).toEqual(['Bar A', 'Bar B']); // sorted, null bar dropped
    expect(post.stopCount).toBe(3); // still counts the barless stop
    expect(post.totalDrinks).toBe(5);
    expect(post.drinkNames).toEqual(['IPA', 'IPA', 'IPA', 'Stout']); // null names dropped
    expect(post.likeCount).toBe(2);
    expect(post.likedByMe).toBe(true);
    expect(post.commentCount).toBe(4);
  });

  it('handles a post with no trip data and no likes/comments gracefully', async () => {
    mockFrom.mockImplementation(() =>
      queryResult({
        data: [
          {
            id: 'post-2',
            trip_id: null,
            caption: null,
            created_at: '2026-01-01T00:00:00Z',
            user_id: 'author-2',
            profiles: null,
            trips: null,
            post_likes: [],
            post_comments: [],
          },
        ],
        error: null,
      })
    );

    const [post] = await fetchFeed('me');

    expect(post.authorName).toBeNull();
    expect(post.barNames).toEqual([]);
    expect(post.stopCount).toBe(0);
    expect(post.totalDrinks).toBe(0);
    expect(post.drinkNames).toEqual([]);
    expect(post.likeCount).toBe(0);
    expect(post.likedByMe).toBe(false);
    expect(post.commentCount).toBe(0);
  });

  it('throws the Supabase error when the query fails', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: { message: 'nope' } }));
    await expect(fetchFeed('me')).rejects.toEqual({ message: 'nope' });
  });

  it('defaults to the first page, and honors a custom offset/limit', async () => {
    const q = queryResult({ data: [], error: null });
    mockFrom.mockImplementation(() => q);

    await fetchFeed('me');
    expect(q.range).toHaveBeenCalledWith(0, FEED_PAGE_SIZE - 1);

    await fetchFeed('me', { offset: 20, limit: 10 });
    expect(q.range).toHaveBeenCalledWith(20, 29);
  });
});

describe('toggleLike', () => {
  it('deletes the like when currently liked', async () => {
    const q = queryResult({ error: null });
    mockFrom.mockImplementation(() => q);

    await toggleLike('post-1', 'user-1', true);

    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('post_id', 'post-1');
    expect(q.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(q.insert).not.toHaveBeenCalled();
  });

  it('inserts a like when not currently liked', async () => {
    const q = queryResult({ error: null });
    mockFrom.mockImplementation(() => q);

    await toggleLike('post-1', 'user-1', false);

    expect(q.insert).toHaveBeenCalledWith({ post_id: 'post-1', user_id: 'user-1' });
    expect(q.delete).not.toHaveBeenCalled();
  });

  it('throws on failure', async () => {
    mockFrom.mockImplementation(() => queryResult({ error: { message: 'denied' } }));
    await expect(toggleLike('post-1', 'user-1', false)).rejects.toEqual({ message: 'denied' });
  });
});

describe('deletePost', () => {
  it('deletes the post by id', async () => {
    const q = queryResult({ error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('feed_posts');
      return q;
    });

    await deletePost('post-1');

    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 'post-1');
  });

  it('throws on failure', async () => {
    mockFrom.mockImplementation(() => queryResult({ error: { message: 'denied' } }));
    await expect(deletePost('post-1')).rejects.toEqual({ message: 'denied' });
  });
});

describe('fetchComments / addComment', () => {
  it('maps comment rows to PostComment, defaulting a missing author name', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('post_comments');
      return queryResult({
        data: [
          { id: 'c1', body: 'nice route', created_at: '2026-01-01T00:00:00Z', profiles: { display_name: 'Jack' } },
          { id: 'c2', body: 'agreed', created_at: '2026-01-01T00:01:00Z', profiles: null },
        ],
        error: null,
      });
    });

    const comments = await fetchComments('post-1');

    expect(comments).toEqual([
      { id: 'c1', body: 'nice route', createdAt: '2026-01-01T00:00:00Z', authorName: 'Jack' },
      { id: 'c2', body: 'agreed', createdAt: '2026-01-01T00:01:00Z', authorName: null },
    ]);
  });

  it('addComment inserts with the given post/user/body', async () => {
    const q = queryResult({ error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('post_comments');
      return q;
    });

    await addComment('post-1', 'user-1', 'great crawl');

    expect(q.insert).toHaveBeenCalledWith({ post_id: 'post-1', user_id: 'user-1', body: 'great crawl' });
  });
});

describe('searchProfiles', () => {
  it('returns [] for a blank query without querying', async () => {
    expect(await searchProfiles('   ', 'me')).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('maps profile rows and excludes the current user via the query', async () => {
    const q = queryResult({ data: [{ id: 'u1', display_name: 'Jack' }], error: null });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('profiles');
      return q;
    });

    const results = await searchProfiles('jack', 'me');

    expect(results).toEqual([{ id: 'u1', displayName: 'Jack' }]);
    expect(q.ilike).toHaveBeenCalledWith('display_name', '%jack%');
    expect(q.neq).toHaveBeenCalledWith('id', 'me');
  });
});

describe('follows', () => {
  it('fetchFollowingIds returns a Set of followee ids', async () => {
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('follows');
      return queryResult({ data: [{ followee_id: 'a' }, { followee_id: 'b' }], error: null });
    });
    const ids = await fetchFollowingIds('me');
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('follow inserts a follows row', async () => {
    const q = queryResult({ error: null });
    mockFrom.mockImplementation(() => q);
    await follow('me', 'them');
    expect(q.insert).toHaveBeenCalledWith({ follower_id: 'me', followee_id: 'them' });
  });

  it('unfollow deletes matching the follower/followee pair', async () => {
    const q = queryResult({ error: null });
    mockFrom.mockImplementation(() => q);
    await unfollow('me', 'them');
    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('follower_id', 'me');
    expect(q.eq).toHaveBeenCalledWith('followee_id', 'them');
  });

  it('fetchFollowers maps rows to id/displayName, newest first', async () => {
    const q = queryResult({
      data: [
        { follower_id: 'a', created_at: '2026-01-02T00:00:00Z', profiles: { display_name: 'Alex' } },
        { follower_id: 'b', created_at: '2026-01-01T00:00:00Z', profiles: null },
      ],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      expect(table).toBe('follows');
      return q;
    });

    const followers = await fetchFollowers('me');

    expect(followers).toEqual([
      { id: 'a', displayName: 'Alex' },
      { id: 'b', displayName: null },
    ]);
    expect(q.eq).toHaveBeenCalledWith('followee_id', 'me');
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('fetchFollowers throws on failure', async () => {
    mockFrom.mockImplementation(() => queryResult({ data: null, error: { message: 'nope' } }));
    await expect(fetchFollowers('me')).rejects.toEqual({ message: 'nope' });
  });
});
