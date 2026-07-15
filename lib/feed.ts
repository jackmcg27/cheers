import { supabase } from './supabase';

export type FeedPost = {
  id: string;
  tripId: string | null;
  caption: string | null;
  createdAt: string;
  userId: string;
  authorName: string | null;
  stopCount: number;
  barNames: string[];
  totalDurationS: number | null;
  totalDistanceM: number | null;
  totalDrinks: number;
  drinkNames: string[];
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
};

type FeedPostRow = {
  id: string;
  trip_id: string | null;
  caption: string | null;
  created_at: string;
  user_id: string;
  profiles: { display_name: string | null } | null;
  trips: {
    total_duration_s: number | null;
    total_distance_m: number | null;
    trip_stops: {
      stop_order: number;
      bars: { name: string } | null;
      drink_logs: { drink_name: string | null }[];
    }[];
  } | null;
  post_likes: { user_id: string }[];
  post_comments: { count: number }[];
};

export const FEED_PAGE_SIZE = 20;

/** Posts visible to `currentUserId` — RLS already restricts to own + followed users' posts.
 * Paginated newest-first; pass `offset` to fetch the next page. A returned page shorter than
 * `FEED_PAGE_SIZE` means there's nothing more to load. */
export async function fetchFeed(
  currentUserId: string,
  { offset = 0, limit = FEED_PAGE_SIZE }: { offset?: number; limit?: number } = {}
): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from('feed_posts')
    .select(
      'id, trip_id, caption, created_at, user_id, profiles!user_id(display_name), trips(total_duration_s, total_distance_m, trip_stops(stop_order, bars(name), drink_logs(drink_name))), post_likes(user_id), post_comments(count)'
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  return ((data as unknown as FeedPostRow[]) ?? []).map((row) => {
    const stops = (row.trips?.trip_stops ?? [])
      .slice()
      .sort((a, b) => a.stop_order - b.stop_order);

    return {
      id: row.id,
      tripId: row.trip_id,
      caption: row.caption,
      createdAt: row.created_at,
      userId: row.user_id,
      authorName: row.profiles?.display_name ?? null,
      stopCount: stops.length,
      barNames: stops.map((s) => s.bars?.name).filter((n): n is string => !!n),
      totalDurationS: row.trips?.total_duration_s ?? null,
      totalDistanceM: row.trips?.total_distance_m ?? null,
      totalDrinks: stops.reduce((sum, s) => sum + (s.drink_logs?.length ?? 0), 0),
      drinkNames: stops.flatMap((s) => (s.drink_logs ?? []).map((d) => d.drink_name)).filter((n): n is string => !!n),
      likeCount: row.post_likes?.length ?? 0,
      likedByMe: row.post_likes?.some((l) => l.user_id === currentUserId) ?? false,
      commentCount: row.post_comments?.[0]?.count ?? 0,
    };
  });
}

export async function toggleLike(postId: string, userId: string, currentlyLiked: boolean) {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
    if (error) throw error;
  }
}

export async function deletePost(postId: string) {
  const { error } = await supabase.from('feed_posts').delete().eq('id', postId);
  if (error) throw error;
}

export type PostComment = { id: string; body: string; createdAt: string; authorName: string | null };

export async function fetchComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select('id, body, created_at, profiles!user_id(display_name)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as {
    id: string;
    body: string;
    created_at: string;
    profiles: { display_name: string | null } | null;
  }[]).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorName: row.profiles?.display_name ?? null,
  }));
}

export async function addComment(postId: string, userId: string, body: string) {
  const { error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: userId, body });
  if (error) throw error;
}

export type ProfileMatch = { id: string; displayName: string | null };

export async function searchProfiles(query: string, excludeUserId: string): Promise<ProfileMatch[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', `%${query.trim()}%`)
    .neq('id', excludeUserId)
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, displayName: p.display_name }));
}

export async function fetchFollowingIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('follows').select('followee_id').eq('follower_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map((f) => f.followee_id));
}

export async function follow(followerId: string, followeeId: string) {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, followee_id: followeeId });
  if (error) throw error;
}

export async function unfollow(followerId: string, followeeId: string) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('followee_id', followeeId);
  if (error) throw error;
}
