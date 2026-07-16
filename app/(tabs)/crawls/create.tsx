import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedTextInput } from '@/components/ThemedTextInput';
import { ThemedView } from '@/components/ThemedView';
import { useLocation } from '@/hooks/useLocation';
import { useAuth } from '@/lib/auth-context';
import { createCrawl } from '@/lib/crawls';
import { errorMessage } from '@/lib/errors';
import { searchBarsByText, type PlaceBar } from '@/lib/places';

export default function CreateCrawlScreen() {
  const { session } = useAuth();
  const { coords } = useLocation();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceBar[]>([]);
  const [searching, setSearching] = useState(false);
  const [stops, setStops] = useState<PlaceBar[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(() => {
      searchBarsByText(query, coords ?? undefined)
        .then((bars) => !cancelled && setResults(bars))
        .catch((e) => !cancelled && setError(errorMessage(e, 'Search failed')))
        .finally(() => !cancelled && setSearching(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, coords]);

  function addStop(bar: PlaceBar) {
    if (stops.some((s) => s.placeId === bar.placeId)) return;
    setStops((prev) => [...prev, bar]);
  }

  function removeStop(placeId: string) {
    setStops((prev) => prev.filter((s) => s.placeId !== placeId));
  }

  function moveStop(index: number, direction: -1 | 1) {
    setStops((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    if (!session || !name.trim() || stops.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const id = await createCrawl({
        creatorId: session.user.id,
        name: name.trim(),
        description: description.trim() || null,
        isPublic,
        stops,
      });
      router.replace({ pathname: '/(tabs)/crawls/[id]', params: { id } });
    } catch (e) {
      setError(errorMessage(e, 'Failed to save crawl'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 76 }]}>
        <ThemedTextInput
          style={styles.input}
          placeholder="Crawl name"
          value={name}
          onChangeText={setName}
        />
        <ThemedTextInput
          style={styles.input}
          placeholder="Description (optional)"
          value={description}
          onChangeText={setDescription}
        />
        <View style={styles.row}>
          <ThemedText>Private</ThemedText>
          <Switch value={isPublic} onValueChange={setIsPublic} />
          <ThemedText>Public</ThemedText>
        </View>

        {stops.length > 0 && (
          <View style={styles.stopsList}>
            <ThemedText type="defaultSemiBold">Stops</ThemedText>
            {stops.map((s, i) => (
              <View key={s.placeId} style={styles.stopRow}>
                <ThemedText style={styles.stopIndex}>{i + 1}.</ThemedText>
                <ThemedText style={styles.stopName} numberOfLines={1}>
                  {s.name}
                </ThemedText>
                <Pressable onPress={() => moveStop(i, -1)} disabled={i === 0}>
                  <ThemedText style={styles.stopAction}>↑</ThemedText>
                </Pressable>
                <Pressable onPress={() => moveStop(i, 1)} disabled={i === stops.length - 1}>
                  <ThemedText style={styles.stopAction}>↓</ThemedText>
                </Pressable>
                <Pressable onPress={() => removeStop(s.placeId)}>
                  <ThemedText style={[styles.stopAction, styles.remove]}>✕</ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <ThemedTextInput
          style={styles.input}
          placeholder="Search bars to add..."
          value={query}
          onChangeText={setQuery}
        />
        {searching && <ActivityIndicator style={{ marginVertical: 8 }} />}
        {results.map((bar) => (
          <Pressable key={bar.placeId} style={styles.resultRow} onPress={() => addStop(bar)}>
            <ThemedText type="defaultSemiBold">{bar.name}</ThemedText>
            {bar.address && <ThemedText style={styles.meta}>{bar.address}</ThemedText>}
          </Pressable>
        ))}

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <Pressable
          style={[styles.saveButton, (!name.trim() || stops.length === 0 || saving) && styles.disabled]}
          disabled={!name.trim() || stops.length === 0 || saving}
          onPress={save}>
          <ThemedText style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Crawl'}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 20, gap: 12, paddingBottom: 60 },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopsList: { gap: 8, marginTop: 4 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopIndex: { opacity: 0.6, width: 20 },
  stopName: { flex: 1 },
  stopAction: { fontSize: 16, paddingHorizontal: 4 },
  remove: { color: '#ff453a' },
  resultRow: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    gap: 2,
  },
  meta: { opacity: 0.7, fontSize: 13 },
  error: { color: '#ff453a' },
  saveButton: {
    backgroundColor: '#0a84ff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
