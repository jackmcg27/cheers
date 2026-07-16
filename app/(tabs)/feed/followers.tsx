import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { fetchFollowers, fetchFollowingIds, follow, unfollow, type Follower } from '@/lib/feed';

export default function FollowersScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const insets = useSafeAreaInsets();

  const [followers, setFollowers] = useState<Follower[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([fetchFollowers(userId), fetchFollowingIds(userId)])
      .then(([f, ids]) => {
        setFollowers(f);
        setFollowingIds(ids);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e, 'Failed to load followers')))
      .finally(() => setLoading(false));
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
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
        onRefresh={load}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 76 }]}
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
              <Pressable
                style={styles.nameTap}
                disabled={isMe}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/feed/user/[id]',
                    params: { id: item.id, displayName: item.displayName ?? '' },
                  })
                }>
                <Avatar avatarUrl={item.avatarUrl} displayName={item.displayName} size={32} />
                <ThemedText style={styles.name}>{item.displayName ?? 'Someone'}</ThemedText>
              </Pressable>
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
  nameTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: {},
  button: { backgroundColor: '#0a84ff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  buttonFollowing: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3a3a3c' },
  buttonText: { color: '#fff', fontWeight: '600' },
  buttonTextFollowing: { opacity: 0.7 },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 40 },
});
