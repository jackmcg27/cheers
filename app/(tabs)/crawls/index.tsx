import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, SectionList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import { fetchCrawls, type CrawlSummary } from '@/lib/crawls';
import { errorMessage } from '@/lib/errors';

export default function CrawlsScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [crawls, setCrawls] = useState<CrawlSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchCrawls()
        .then((data) => {
          if (!cancelled) {
            setCrawls(data);
            setError(null);
          }
        })
        .catch((e) => !cancelled && setError(errorMessage(e, 'Failed to load crawls')))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const mine = crawls.filter((c) => c.creatorId === session?.user.id);
  const others = crawls.filter((c) => c.creatorId !== session?.user.id);
  const sections = [
    ...(mine.length ? [{ title: 'Your Crawls', data: mine }] : []),
    ...(others.length ? [{ title: 'Public Crawls', data: others }] : []),
  ];

  return (
    <ThemedView style={styles.container}>
      <Pressable style={styles.newButton} onPress={() => router.push('/(tabs)/crawls/create')}>
        <ThemedText style={styles.newButtonText}>+ New Crawl</ThemedText>
      </Pressable>

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 76 }]}
        ListEmptyComponent={
          !loading ? (
            <ThemedText style={styles.empty}>
              No crawls yet — publish a trip from History or build one from scratch.
            </ThemedText>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <ThemedText type="subtitle" style={styles.sectionHeader}>
            {section.title}
          </ThemedText>
        )}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({ pathname: '/(tabs)/crawls/[id]', params: { id: item.id } })
            }>
            <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
            <ThemedText style={styles.meta}>
              {item.stopCount} {item.stopCount === 1 ? 'stop' : 'stops'}
              {item.creatorName ? ` · by ${item.creatorName}` : ''}
            </ThemedText>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, paddingHorizontal: 20 },
  newButton: {
    backgroundColor: '#0a84ff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  newButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  list: { gap: 12 },
  sectionHeader: { marginTop: 8, marginBottom: 4 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#3a3a3c', gap: 4 },
  meta: { opacity: 0.7 },
  error: { color: '#ff453a', marginBottom: 12 },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 40 },
});
