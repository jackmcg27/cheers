import type { CrawlSummary } from './crawls';
import { supabase } from './supabase';

export type UserProfile = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number;
  followingCount: number;
  isFollowedByMe: boolean;
  isMe: boolean;
};

/** A public-facing profile: display name, follower/following counts, and whether the current
 * viewer already follows them. Deliberately doesn't include History's stats card numbers (trip
 * count, drinks, distance) — those come from *all* of a user's trips, which RLS only exposes to
 * the owner themself (`0006`'s `trip_visible_via_feed_post`: a trip is visible to someone else
 * only if it's been posted to the feed and they follow the poster), so "total drinks" for
 * someone else would silently only count their posted trips, not their real total. Their posted
 * trips and public crawls (`fetchUserPosts`/`fetchUserCrawls`) are shown as lists instead, where
 * a partial/RLS-scoped view is the expected, honest behavior. */
export async function fetchUserProfile(targetUserId: string, viewerId: string): Promise<UserProfile> {
  const [profileResult, followerResult, followingResult, isFollowedResult] = await Promise.all([
    supabase.from('profiles').select('display_name, avatar_url').eq('id', targetUserId).single(),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', targetUserId),
    supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', targetUserId),
    supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('follower_id', viewerId)
      .eq('followee_id', targetUserId),
  ]);

  if (profileResult.error || !profileResult.data) throw profileResult.error ?? new Error('User not found');
  if (followerResult.error) throw followerResult.error;
  if (followingResult.error) throw followingResult.error;
  if (isFollowedResult.error) throw isFollowedResult.error;

  return {
    id: targetUserId,
    displayName: profileResult.data.display_name,
    avatarUrl: profileResult.data.avatar_url,
    followerCount: followerResult.count ?? 0,
    followingCount: followingResult.count ?? 0,
    isFollowedByMe: (isFollowedResult.count ?? 0) > 0,
    isMe: targetUserId === viewerId,
  };
}

export type UserPost = {
  id: string;
  tripId: string | null;
  caption: string | null;
  createdAt: string;
  stopCount: number;
  barNames: string[];
  totalDurationS: number | null;
  totalDistanceM: number | null;
  totalDrinks: number;
  drinkNames: string[];
};

type UserPostRow = {
  id: string;
  trip_id: string | null;
  caption: string | null;
  created_at: string;
  trips: {
    total_duration_s: number | null;
    total_distance_m: number | null;
    trip_stops: {
      stop_order: number;
      bars: { name: string } | null;
      drink_logs: { drink_name: string | null }[];
    }[];
  } | null;
};

export const USER_POSTS_PAGE_SIZE = 20;

/** A single user's feed posts, newest first. RLS on `feed_posts` already restricts results to
 * posts the viewer is allowed to see (their own, or an author they follow) — scoping to
 * `targetUserId` on top of that just narrows an already-safe set, no extra visibility check
 * needed here. */
export async function fetchUserPosts(
  targetUserId: string,
  { offset = 0, limit = USER_POSTS_PAGE_SIZE }: { offset?: number; limit?: number } = {}
): Promise<UserPost[]> {
  const { data, error } = await supabase
    .from('feed_posts')
    .select(
      'id, trip_id, caption, created_at, trips(total_duration_s, total_distance_m, trip_stops(stop_order, bars(name), drink_logs(drink_name)))'
    )
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  return ((data as unknown as UserPostRow[]) ?? []).map((row) => {
    const stops = (row.trips?.trip_stops ?? []).slice().sort((a, b) => a.stop_order - b.stop_order);
    return {
      id: row.id,
      tripId: row.trip_id,
      caption: row.caption,
      createdAt: row.created_at,
      stopCount: stops.length,
      barNames: stops.map((s) => s.bars?.name).filter((n): n is string => !!n),
      totalDurationS: row.trips?.total_duration_s ?? null,
      totalDistanceM: row.trips?.total_distance_m ?? null,
      totalDrinks: stops.reduce((sum, s) => sum + (s.drink_logs?.length ?? 0), 0),
      drinkNames: stops.flatMap((s) => (s.drink_logs ?? []).map((d) => d.drink_name)).filter((n): n is string => !!n),
    };
  });
}

type UserCrawlRow = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  creator_id: string;
  profiles: { display_name: string | null } | null;
  crawl_stops: { count: number }[];
};

/** A user's crawls — RLS already restricts this to public crawls plus the viewer's own, so a
 * profile you don't own only ever shows their public ones. */
export async function fetchUserCrawls(targetUserId: string): Promise<CrawlSummary[]> {
  const { data, error } = await supabase
    .from('crawls')
    .select(
      'id, name, description, is_public, created_at, creator_id, profiles!creator_id(display_name), crawl_stops(count)'
    )
    .eq('creator_id', targetUserId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return ((data as unknown as UserCrawlRow[]) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isPublic: row.is_public,
    createdAt: row.created_at,
    creatorId: row.creator_id,
    creatorName: row.profiles?.display_name ?? null,
    stopCount: row.crawl_stops?.[0]?.count ?? 0,
  }));
}
