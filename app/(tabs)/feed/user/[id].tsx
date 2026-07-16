import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import type { CrawlSummary } from '@/lib/crawls';
import { errorMessage } from '@/lib/errors';
import { follow, unfollow } from '@/lib/feed';
import { formatDistance, formatDuration, summarizeDrinkNames } from '@/lib/format';
import { fetchUserCrawls, fetchUserPosts, fetchUserProfile, type UserPost, type UserProfile } from '@/lib/profile';

type Row = { kind: 'crawl'; crawl: CrawlSummary } | { kind: 'post'; post: UserPost };

export default function UserProfileScreen() {
  const { id, displayName } = useLocalSearchParams<{ id: string; displayName?: string }>();
  const { session } = useAuth();
  const viewerId = session?.user.id;
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [crawls, setCrawls] = useState<CrawlSummary[]>([]);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id || !viewerId) return;
      let cancelled = false;
      setLoading(true);
      Promise.all([fetchUserProfile(id, viewerId), fetchUserCrawls(id), fetchUserPosts(id)])
        .then(([p, c, posts]) => {
          if (cancelled) return;
          setProfile(p);
          setCrawls(c);
          setPosts(posts);
          setError(null);
        })
        .catch((e) => !cancelled && setError(errorMessage(e, 'Failed to load profile')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [id, viewerId])
  );

  async function handleToggleFollow() {
    if (!viewerId || !profile) return;
    const wasFollowing = profile.isFollowedByMe;
    setFollowBusy(true);
    setProfile({
      ...profile,
      isFollowedByMe: !wasFollowing,
      followerCount: profile.followerCount + (wasFollowing ? -1 : 1),
    });
    try {
      if (wasFollowing) await unfollow(viewerId, profile.id);
      else await follow(viewerId, profile.id);
    } catch (e) {
      setProfile((prev) =>
        prev ? { ...prev, isFollowedByMe: wasFollowing, followerCount: prev.followerCount + (wasFollowing ? 1 : -1) } : prev
      );
      setError(errorMessage(e, 'Failed to update follow'));
    } finally {
      setFollowBusy(false);
    }
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (error || !profile) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.error}>{error ?? 'User not found'}</ThemedText>
      </ThemedView>
    );
  }

  const rows: Row[] = [
    ...crawls.map((crawl): Row => ({ kind: 'crawl', crawl })),
    ...posts.map((post): Row => ({ kind: 'post', post })),
  ];

  return (
    <ThemedView style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(row) => `${row.kind}-${row.kind === 'crawl' ? row.crawl.id : row.post.id}`}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 76 }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Avatar avatarUrl={profile.avatarUrl} displayName={profile.displayName ?? displayName} size={64} />
            <ThemedText type="title">{profile.displayName ?? displayName ?? 'Someone'}</ThemedText>
            <ThemedText style={styles.counts}>
              {profile.followerCount} {profile.followerCount === 1 ? 'follower' : 'followers'} ·{' '}
              {profile.followingCount} following
            </ThemedText>
            {!profile.isMe && (
              <Pressable
                style={[styles.followButton, profile.isFollowedByMe && styles.followButtonFollowing]}
                disabled={followBusy}
                onPress={handleToggleFollow}>
                <ThemedText style={profile.isFollowedByMe ? styles.followButtonTextFollowing : styles.followButtonText}>
                  {profile.isFollowedByMe ? 'Following' : 'Follow'}
                </ThemedText>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={<ThemedText style={styles.empty}>Nothing to show yet.</ThemedText>}
        renderItem={({ item }) =>
          item.kind === 'crawl' ? (
            <Pressable
              style={styles.card}
              onPress={() => router.push({ pathname: '/(tabs)/crawls/[id]', params: { id: item.crawl.id } })}>
              <ThemedText type="defaultSemiBold">{item.crawl.name}</ThemedText>
              <ThemedText style={styles.meta}>
                {item.crawl.stopCount} {item.crawl.stopCount === 1 ? 'stop' : 'stops'}
                {!item.crawl.isPublic ? ' · Private' : ''}
              </ThemedText>
            </Pressable>
          ) : (
            <Pressable
              style={styles.card}
              onPress={() =>
                item.post.tripId &&
                router.push({
                  pathname: '/(tabs)/feed/[id]',
                  params: {
                    id: item.post.tripId,
                    postId: item.post.id,
                    authorName: profile.displayName ?? '',
                    caption: item.post.caption ?? '',
                  },
                })
              }>
              <ThemedText style={styles.meta}>
                {item.post.stopCount} {item.post.stopCount === 1 ? 'stop' : 'stops'} · 🍻 {item.post.totalDrinks} ·{' '}
                {formatDuration(item.post.totalDurationS)} ·{' '}
                {item.post.totalDistanceM ? formatDistance(item.post.totalDistanceM) : '—'}
              </ThemedText>
              {item.post.barNames.length > 0 && (
                <ThemedText style={styles.barNames}>{item.post.barNames.join(' → ')}</ThemedText>
              )}
              {summarizeDrinkNames(item.post.drinkNames) && (
                <ThemedText style={styles.drinkNames}>🍺 {summarizeDrinkNames(item.post.drinkNames)}</ThemedText>
              )}
              {item.post.caption && <ThemedText style={styles.caption}>{item.post.caption}</ThemedText>}
            </Pressable>
          )
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 20, gap: 12 },
  header: { gap: 8, marginBottom: 8 },
  counts: { opacity: 0.7 },
  followButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#0a84ff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  followButtonFollowing: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3a3a3c' },
  followButtonText: { color: '#fff', fontWeight: '600' },
  followButtonTextFollowing: { opacity: 0.7 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#3a3a3c', gap: 6 },
  meta: { opacity: 0.7 },
  barNames: { opacity: 0.85, fontSize: 13, marginTop: 2 },
  drinkNames: { opacity: 0.85, fontSize: 13, marginTop: 2 },
  caption: { marginTop: 2 },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 40 },
  error: { color: '#ff453a' },
});
