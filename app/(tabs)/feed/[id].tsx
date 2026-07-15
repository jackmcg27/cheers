import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { TripDetailView } from '@/components/TripDetailView';
import { errorMessage } from '@/lib/errors';
import { fetchTripDetail, type TripDetail } from '@/lib/trip-detail';

export default function FeedTripDetailScreen() {
  const { id, authorName, caption } = useLocalSearchParams<{
    id: string;
    authorName?: string;
    caption?: string;
  }>();
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">{authorName || detail.ownerName || 'Someone'}</ThemedText>
        <ThemedText style={styles.meta}>
          {new Date(detail.startedAt).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </ThemedText>
        {caption && <ThemedText style={styles.caption}>{caption}</ThemedText>}
        <TripDetailView detail={detail} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 12, paddingBottom: 60 },
  meta: { opacity: 0.7 },
  caption: { marginBottom: 4 },
  error: { color: '#ff453a' },
});
