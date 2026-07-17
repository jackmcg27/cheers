import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { TripDetailView } from '@/components/TripDetailView';
import { TripPhotoEditor } from '@/components/TripPhotoEditor';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { fetchTripDetail, type TripDetail } from '@/lib/trip-detail';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      setLoading(true);
      fetchTripDetail(id, session?.user.id ?? null)
        .then((data) => !cancelled && setDetail(data))
        .catch((e) => !cancelled && setError(errorMessage(e, 'Failed to load trip')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [id, session])
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
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 76 }]}>
        <ThemedText type="title">
          {new Date(detail.startedAt).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </ThemedText>
        <TripDetailView detail={detail} />

        {session && session.user.id === detail.ownerId && (
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
  error: { color: '#ff453a' },
});
