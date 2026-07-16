import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { formatDistance, formatDuration, summarizeDrinkNames } from '@/lib/format';
import {
  addComment,
  deletePost,
  fetchComments,
  fetchFeed,
  fetchFollowingIds,
  follow,
  searchProfiles,
  toggleLike,
  unfollow,
  FEED_PAGE_SIZE,
  type FeedPost,
  type PostComment,
  type ProfileMatch,
} from '@/lib/feed';
import { supabase } from '@/lib/supabase';

export default function FeedScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileMatch[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, PostComment[]>>({});
  const [draft, setDraft] = useState('');

  const loadFeed = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    fetchFeed(userId)
      .then((data) => {
        setPosts(data);
        setHasMore(data.length === FEED_PAGE_SIZE);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, 'Failed to load feed')))
      .finally(() => setLoading(false));
  }, [userId]);

  function loadMore() {
    if (!userId || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchFeed(userId, { offset: posts.length })
      .then((data) => {
        setPosts((prev) => [...prev, ...data]);
        setHasMore(data.length === FEED_PAGE_SIZE);
      })
      .catch((e) => setError(errorMessage(e, 'Failed to load more posts')))
      .finally(() => setLoadingMore(false));
  }

  useFocusEffect(
    useCallback(() => {
      loadFeed();
      if (userId) fetchFollowingIds(userId).then(setFollowingIds).catch(() => {});
    }, [loadFeed, userId])
  );

  useEffect(() => {
    const channel = supabase
      .channel('feed-posts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feed_posts' }, () => {
        loadFeed();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFeed]);

  useEffect(() => {
    if (!query.trim() || !userId) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      searchProfiles(query, userId)
        .then((r) => !cancelled && setResults(r))
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, userId]);

  async function handleToggleFollow(targetId: string) {
    if (!userId) return;
    const isFollowing = followingIds.has(targetId);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
    try {
      if (isFollowing) await unfollow(userId, targetId);
      else await follow(userId, targetId);
    } catch {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
    }
  }

  async function handleToggleLike(post: FeedPost) {
    if (!userId) return;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
          : p
      )
    );
    try {
      await toggleLike(post.id, userId, post.likedByMe);
    } catch {
      loadFeed();
    }
  }

  function confirmDeletePost(postId: string) {
    Alert.alert('Delete post?', "This removes it from the feed. Can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setPosts((prev) => prev.filter((p) => p.id !== postId));
          deletePost(postId).catch(() => {
            Alert.alert('Failed to delete post');
            loadFeed();
          });
        },
      },
    ]);
  }

  async function toggleComments(postId: string) {
    if (expandedPostId === postId) {
      setExpandedPostId(null);
      return;
    }
    setExpandedPostId(postId);
    if (!comments[postId]) {
      const data = await fetchComments(postId).catch(() => []);
      setComments((prev) => ({ ...prev, [postId]: data }));
    }
  }

  async function submitComment(postId: string) {
    if (!userId || !draft.trim()) return;
    const body = draft.trim();
    setDraft('');
    await addComment(postId, userId, body);
    const data = await fetchComments(postId).catch(() => comments[postId] ?? []);
    setComments((prev) => ({ ...prev, [postId]: data }));
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p))
    );
  }

  function openPost(post: FeedPost) {
    if (!post.tripId) return;
    router.push({
      pathname: '/(tabs)/feed/[id]',
      params: {
        id: post.tripId,
        postId: post.id,
        authorName: post.authorName ?? '',
        caption: post.caption ?? '',
      },
    });
  }

  function openProfile(id: string, displayName: string | null) {
    router.push({ pathname: '/(tabs)/feed/user/[id]', params: { id, displayName: displayName ?? '' } });
  }

  return (
    <ThemedView style={[styles.root, { paddingTop: 12 }]}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        refreshing={loading}
        onRefresh={loadFeed}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 76 }]}
        ListHeaderComponent={
          <View style={styles.searchBlock}>
            <Pressable onPress={() => router.push('/(tabs)/feed/followers')}>
              <ThemedText style={styles.followersLink}>See your followers</ThemedText>
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Find people to follow"
              placeholderTextColor="#888"
              value={query}
              onChangeText={setQuery}
            />
            {results.map((p) => (
              <View key={p.id} style={styles.resultRow}>
                <Pressable style={[styles.resultNameTap, styles.nameTapRow]} onPress={() => openProfile(p.id, p.displayName)}>
                  <Avatar avatarUrl={p.avatarUrl} displayName={p.displayName} size={28} />
                  <ThemedText style={styles.resultName}>{p.displayName ?? 'Someone'}</ThemedText>
                </Pressable>
                <Pressable style={styles.followButton} onPress={() => handleToggleFollow(p.id)}>
                  <ThemedText style={styles.followButtonText}>
                    {followingIds.has(p.id) ? 'Following' : 'Follow'}
                  </ThemedText>
                </Pressable>
              </View>
            ))}
            {error && <ThemedText style={styles.error}>{error}</ThemedText>}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.empty}>
              No posts yet — follow people or post a trip from History.
            </ThemedText>
          ) : null
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} /> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openPost(item)}>
            <View style={styles.authorRow}>
              <Pressable style={styles.nameTapRow} onPress={() => openProfile(item.userId, item.authorName)}>
                <Avatar avatarUrl={item.authorAvatarUrl} displayName={item.authorName} size={28} />
                <ThemedText type="defaultSemiBold">{item.authorName ?? 'Someone'}</ThemedText>
              </Pressable>
              {item.userId !== userId && followingIds.has(item.userId) && (
                <Pressable onPress={() => handleToggleFollow(item.userId)}>
                  <ThemedText style={styles.unfollowBadge}>Following ✕</ThemedText>
                </Pressable>
              )}
              {item.userId === userId && (
                <Pressable onPress={() => confirmDeletePost(item.id)}>
                  <ThemedText style={styles.deleteBadge}>Delete</ThemedText>
                </Pressable>
              )}
            </View>
            <ThemedText style={styles.meta}>
              {item.stopCount} {item.stopCount === 1 ? 'stop' : 'stops'} · 🍻 {item.totalDrinks} ·{' '}
              {formatDuration(item.totalDurationS)} ·{' '}
              {item.totalDistanceM ? formatDistance(item.totalDistanceM) : '—'}
            </ThemedText>
            {item.barNames.length > 0 && (
              <ThemedText style={styles.barNames}>{item.barNames.join(' → ')}</ThemedText>
            )}
            {summarizeDrinkNames(item.drinkNames) && (
              <ThemedText style={styles.drinkNames}>🍺 {summarizeDrinkNames(item.drinkNames)}</ThemedText>
            )}
            {item.caption && <ThemedText style={styles.caption}>{item.caption}</ThemedText>}

            <View style={styles.actionsRow}>
              <Pressable onPress={() => handleToggleLike(item)}>
                <ThemedText style={item.likedByMe ? styles.liked : styles.action}>
                  {item.likedByMe ? '♥' : '♡'} {item.likeCount}
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => toggleComments(item.id)}>
                <ThemedText style={styles.action}>💬 {item.commentCount}</ThemedText>
              </Pressable>
            </View>

            {expandedPostId === item.id && (
              <View style={styles.commentsBlock}>
                {(comments[item.id] ?? []).map((c) => (
                  <View key={c.id} style={styles.commentRow}>
                    <Pressable onPress={() => openProfile(c.authorId, c.authorName)}>
                      <Avatar avatarUrl={c.authorAvatarUrl} displayName={c.authorName} size={22} />
                    </Pressable>
                    <ThemedText style={styles.comment}>
                      <ThemedText type="defaultSemiBold" onPress={() => openProfile(c.authorId, c.authorName)}>
                        {c.authorName ?? 'Someone'}:{' '}
                      </ThemedText>
                      {c.body}
                    </ThemedText>
                  </View>
                ))}
                <View style={styles.commentInputRow}>
                  <TextInput
                    style={[styles.input, styles.commentInput]}
                    placeholder="Add a comment..."
                    placeholderTextColor="#888"
                    value={draft}
                    onChangeText={setDraft}
                  />
                  <Pressable onPress={() => submitComment(item.id)}>
                    <ThemedText style={styles.send}>Send</ThemedText>
                  </Pressable>
                </View>
              </View>
            )}
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 20, gap: 12 },
  searchBlock: { gap: 8, marginBottom: 16 },
  followersLink: { color: '#0a84ff' },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultNameTap: { flex: 1 },
  nameTapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultName: {},
  followButton: { backgroundColor: '#0a84ff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  followButtonText: { color: '#fff', fontWeight: '600' },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#3a3a3c', gap: 6 },
  authorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unfollowBadge: { color: '#0a84ff', opacity: 0.8, fontSize: 12 },
  deleteBadge: { color: '#ff453a', opacity: 0.8, fontSize: 12 },
  meta: { opacity: 0.7 },
  barNames: { opacity: 0.85, fontSize: 13, marginTop: 2 },
  drinkNames: { opacity: 0.85, fontSize: 13, marginTop: 2 },
  caption: { marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 20, marginTop: 6 },
  action: { opacity: 0.8 },
  liked: { color: '#ff453a' },
  commentsBlock: { marginTop: 10, gap: 6, borderTopWidth: 1, borderTopColor: '#3a3a3c', paddingTop: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  comment: { fontSize: 14, flex: 1 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commentInput: { flex: 1, paddingVertical: 8 },
  send: { color: '#0a84ff', fontWeight: '600' },
  error: { color: '#ff453a' },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 40 },
  footerSpinner: { marginVertical: 20 },
});
