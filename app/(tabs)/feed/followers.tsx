import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { fetchFollowers, fetchFollowingIds, follow, unfollow, type Follower } from '@/lib/feed';

export default function FollowersScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [followers, setFollowers] = useState<Follower[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      setLoading(true);
      Promise.all([fetchFollowers(userId), fetchFollowingIds(userId)])
        .then(([f, ids]) => {
          if (cancelled) return;
          setFollowers(f);
          setFollowingIds(ids);
          setError(null);
        })
        .catch((e) => !cancelled && setError(errorMessage(e, 'Failed to load followers')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

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

  return (
    <ThemedView style={styles.root}>
      <FlatList
        data={followers}
        keyExtractor={(f) => f.id}
        refreshing={loading}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.empty}>
              {error ?? 'No followers yet.'}
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => {
          const isFollowing = followingIds.has(item.id);
          const isMe = item.id === userId;
          return (
            <View style={styles.row}>
              <ThemedText style={styles.name}>{item.displayName ?? 'Someone'}</ThemedText>
              {!isMe && (
                <Pressable
                  style={[styles.button, isFollowing && styles.buttonFollowing]}
                  onPress={() => handleToggleFollow(item.id)}>
                  <ThemedText style={isFollowing ? styles.buttonTextFollowing : styles.buttonText}>
                    {isFollowing ? 'Following' : 'Follow back'}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1 },
  button: { backgroundColor: '#0a84ff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  buttonFollowing: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3a3a3c' },
  buttonText: { color: '#fff', fontWeight: '600' },
  buttonTextFollowing: { opacity: 0.7 },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 40 },
});
