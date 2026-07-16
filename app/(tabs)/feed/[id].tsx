import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { TripDetailView } from '@/components/TripDetailView';
import { TripPhotoEditor } from '@/components/TripPhotoEditor';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { deletePost } from '@/lib/feed';
import { fetchTripDetail, type TripDetail } from '@/lib/trip-detail';

export default function FeedTripDetailScreen() {
  const { id, postId, authorName, caption } = useLocalSearchParams<{
    id: string;
    postId?: string;
    authorName?: string;
    caption?: string;
  }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      setLoading(true);
      fetchTripDetail(id)
        .then((data) => !cancelled && setDetail(data))
        .catch((e) => !cancelled && setError(errorMessage(e, 'Failed to load trip')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (error || !detail) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.error}>{error ?? 'Trip not found'}</ThemedText>
      </ThemedView>
    );
  }

  const isOwner = session?.user.id === detail.ownerId;

  function confirmDeletePost() {
    if (!postId) return;
    Alert.alert('Delete post?', "This removes it from the feed. Can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deletePost(postId);
            router.back();
          } catch (e) {
            setDeleting(false);
            Alert.alert('Failed to delete post', errorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 76 }]}>
        <View style={styles.titleRow}>
          <Pressable
            style={styles.authorTap}
            disabled={isOwner}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/feed/user/[id]',
                params: { id: detail.ownerId, displayName: authorName || detail.ownerName || '' },
              })
            }>
            <Avatar avatarUrl={detail.ownerAvatarUrl} displayName={authorName || detail.ownerName} size={36} />
            <ThemedText type="title">{authorName || detail.ownerName || 'Someone'}</ThemedText>
          </Pressable>
          {isOwner && postId && (
            <Pressable onPress={confirmDeletePost} disabled={deleting}>
              <ThemedText style={styles.deleteAction}>{deleting ? 'Deleting…' : 'Delete'}</ThemedText>
            </Pressable>
          )}
        </View>
        <ThemedText style={styles.meta}>
          {new Date(detail.startedAt).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </ThemedText>
        {caption && <ThemedText style={styles.caption}>{caption}</ThemedText>}
        <TripDetailView detail={detail} />

        {isOwner && session && (
          <TripPhotoEditor
            tripId={detail.id}
            userId={session.user.id}
            photoUrl={detail.photoUrl}
            onPhotoChange={(photoUrl) => setDetail((prev) => (prev ? { ...prev, photoUrl } : prev))}
          />
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 12, paddingBottom: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authorTap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteAction: { color: '#ff453a', opacity: 0.8, fontSize: 13 },
  meta: { opacity: 0.7 },
  caption: { marginBottom: 4 },
  error: { color: '#ff453a' },
});
