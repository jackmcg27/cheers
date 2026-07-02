import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { crawlStopToPlaceBar, fetchCrawlDetail, type CrawlDetail } from '@/lib/crawls';
import { errorMessage } from '@/lib/errors';
import { useTrip } from '@/lib/trip-context';

export default function CrawlDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { startCrawlWithRoute } = useTrip();
  const [crawl, setCrawl] = useState<CrawlDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      setLoading(true);
      fetchCrawlDetail(id)
        .then((data) => !cancelled && setCrawl(data))
        .catch((e) => !cancelled && setError(errorMessage(e, 'Failed to load crawl')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  async function startThisCrawl() {
    if (!crawl) return;
    await startCrawlWithRoute({ id: crawl.id, stops: crawl.stops.map(crawlStopToPlaceBar) });
    router.push('/(tabs)');
  }

  function openInMaps(lat: number, lng: number) {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (error || !crawl) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.error}>{error ?? 'Crawl not found'}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">{crawl.name}</ThemedText>
        {crawl.creatorName && <ThemedText style={styles.meta}>by {crawl.creatorName}</ThemedText>}
        {crawl.description && <ThemedText style={styles.description}>{crawl.description}</ThemedText>}

        <View style={styles.stopsList}>
          {crawl.stops.map((stop, i) => (
            <Pressable
              key={stop.id}
              style={styles.stopRow}
              onPress={() => openInMaps(stop.bar.lat, stop.bar.lng)}>
              <ThemedText style={styles.stopIndex}>{i + 1}.</ThemedText>
              <View style={styles.stopInfo}>
                <ThemedText type="defaultSemiBold">{stop.bar.name}</ThemedText>
                {stop.bar.address && <ThemedText style={styles.meta}>{stop.bar.address}</ThemedText>}
              </View>
              <ThemedText style={styles.mapLink}>Open in Maps</ThemedText>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.startButton} onPress={startThisCrawl}>
          <ThemedText style={styles.startButtonText}>Start This Crawl</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 12, paddingBottom: 60 },
  meta: { opacity: 0.7 },
  description: { marginTop: 4 },
  stopsList: { gap: 10, marginTop: 12 },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a3c',
  },
  stopIndex: { opacity: 0.6, width: 20 },
  stopInfo: { flex: 1, gap: 2 },
  mapLink: { color: '#0a84ff', fontSize: 13 },
  startButton: {
    backgroundColor: '#0a84ff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  startButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#ff453a' },
});
