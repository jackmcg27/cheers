import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useLocation } from '@/hooks/useLocation';
import { useAuth } from '@/lib/auth-context';
import {
  crawlStopToPlaceBar,
  deleteCrawl,
  fetchCrawlDetail,
  replaceCrawlStops,
  updateCrawl,
  type CrawlDetail,
} from '@/lib/crawls';
import { errorMessage } from '@/lib/errors';
import { searchBarsByText, type PlaceBar } from '@/lib/places';
import { useTrip } from '@/lib/trip-context';

// Guards against a router quirk: replacing away from this screen to a sibling static route
// (e.g. after delete, router.replace('/(tabs)/crawls/index')) can transiently re-render this
// still-mounted [id] screen against the new URL, matching the literal segment "index" as if it
// were the id param. crawls.id is a uuid column, so that query fails loudly — skip it instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CrawlDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { coords } = useLocation();
  const { startCrawlWithRoute } = useTrip();
  const [crawl, setCrawl] = useState<CrawlDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPublic, setEditPublic] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editingStops, setEditingStops] = useState(false);
  const [stopDraft, setStopDraft] = useState<PlaceBar[]>([]);
  const [stopQuery, setStopQuery] = useState('');
  const [stopResults, setStopResults] = useState<PlaceBar[]>([]);
  const [searchingStops, setSearchingStops] = useState(false);
  const [savingStops, setSavingStops] = useState(false);
  const [stopsError, setStopsError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id || !UUID_RE.test(id)) return;
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

  function openEdit() {
    if (!crawl) return;
    setEditName(crawl.name);
    setEditDescription(crawl.description ?? '');
    setEditPublic(crawl.isPublic);
    setSaveError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!crawl || !editName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateCrawl(crawl.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        isPublic: editPublic,
      });
      setCrawl({ ...crawl, name: editName.trim(), description: editDescription.trim() || null, isPublic: editPublic });
      setEditing(false);
    } catch (e) {
      setSaveError(errorMessage(e, 'Failed to save changes'));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!editingStops || !stopQuery.trim()) {
      setStopResults([]);
      return;
    }
    let cancelled = false;
    setSearchingStops(true);
    const timeout = setTimeout(() => {
      searchBarsByText(stopQuery, coords ?? undefined)
        .then((bars) => !cancelled && setStopResults(bars))
        .catch((e) => !cancelled && setStopsError(errorMessage(e, 'Search failed')))
        .finally(() => !cancelled && setSearchingStops(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [editingStops, stopQuery, coords]);

  function openEditStops() {
    if (!crawl) return;
    setStopDraft(crawl.stops.map(crawlStopToPlaceBar));
    setStopQuery('');
    setStopResults([]);
    setStopsError(null);
    setEditingStops(true);
  }

  function addStop(bar: PlaceBar) {
    if (stopDraft.some((s) => s.placeId === bar.placeId)) return;
    setStopDraft((prev) => [...prev, bar]);
  }

  function removeStop(placeId: string) {
    setStopDraft((prev) => prev.filter((s) => s.placeId !== placeId));
  }

  function moveStop(index: number, direction: -1 | 1) {
    setStopDraft((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function saveStops() {
    if (!crawl || stopDraft.length === 0) return;
    setSavingStops(true);
    setStopsError(null);
    try {
      await replaceCrawlStops(crawl.id, stopDraft);
      const refreshed = await fetchCrawlDetail(crawl.id);
      setCrawl(refreshed);
      setEditingStops(false);
    } catch (e) {
      setStopsError(errorMessage(e, 'Failed to save stops'));
    } finally {
      setSavingStops(false);
    }
  }

  async function handleDelete() {
    if (!crawl) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setSaving(true);
    try {
      await deleteCrawl(crawl.id);
      router.replace('/(tabs)/crawls/index');
    } catch (e) {
      setError(errorMessage(e, 'Failed to delete crawl'));
      setSaving(false);
      setConfirmingDelete(false);
    }
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

  const isOwner = session?.user.id === crawl.creatorId;

  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <ThemedText type="title">{crawl.name}</ThemedText>
        {crawl.creatorName && <ThemedText style={styles.meta}>by {crawl.creatorName}</ThemedText>}
        {crawl.description && <ThemedText style={styles.description}>{crawl.description}</ThemedText>}

        {isOwner && !editingStops && (
          <View style={styles.ownerRow}>
            <Pressable onPress={openEdit}>
              <ThemedText style={styles.ownerAction}>Edit</ThemedText>
            </Pressable>
            <Pressable onPress={openEditStops}>
              <ThemedText style={styles.ownerAction}>Edit Stops</ThemedText>
            </Pressable>
            <Pressable onPress={handleDelete} disabled={saving}>
              <ThemedText style={[styles.ownerAction, styles.deleteAction]}>
                {confirmingDelete ? 'Tap again to confirm delete' : 'Delete'}
              </ThemedText>
            </Pressable>
          </View>
        )}

        {editingStops ? (
          <View style={styles.stopsList}>
            <ThemedText type="defaultSemiBold">Stops</ThemedText>
            {stopDraft.map((s, i) => (
              <View key={s.placeId} style={styles.stopRow}>
                <ThemedText style={styles.stopIndex}>{i + 1}.</ThemedText>
                <ThemedText style={styles.stopInfo} numberOfLines={1}>
                  {s.name}
                </ThemedText>
                <Pressable onPress={() => moveStop(i, -1)} disabled={i === 0}>
                  <ThemedText style={styles.stopAction}>↑</ThemedText>
                </Pressable>
                <Pressable onPress={() => moveStop(i, 1)} disabled={i === stopDraft.length - 1}>
                  <ThemedText style={styles.stopAction}>↓</ThemedText>
                </Pressable>
                <Pressable onPress={() => removeStop(s.placeId)}>
                  <ThemedText style={[styles.stopAction, styles.deleteAction]}>✕</ThemedText>
                </Pressable>
              </View>
            ))}

            <TextInput
              style={styles.input}
              placeholder="Search bars to add..."
              placeholderTextColor="#888"
              value={stopQuery}
              onChangeText={setStopQuery}
            />
            {searchingStops && <ActivityIndicator style={{ marginVertical: 8 }} />}
            {stopResults.map((bar) => (
              <Pressable key={bar.placeId} style={styles.stopRow} onPress={() => addStop(bar)}>
                <View style={styles.stopInfo}>
                  <ThemedText type="defaultSemiBold">{bar.name}</ThemedText>
                  {bar.address && <ThemedText style={styles.meta}>{bar.address}</ThemedText>}
                </View>
              </Pressable>
            ))}

            {stopsError && <ThemedText style={styles.error}>{stopsError}</ThemedText>}

            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditingStops(false)}>
                <ThemedText style={styles.cancel}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.saveButton, (stopDraft.length === 0 || savingStops) && styles.disabled]}
                disabled={stopDraft.length === 0 || savingStops}
                onPress={saveStops}>
                <ThemedText style={styles.saveButtonText}>
                  {savingStops ? 'Saving...' : 'Save Stops'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
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
          </>
        )}
      </ScrollView>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <View style={styles.modalBackdrop}>
          <ThemedView style={styles.modalCard}>
            <ThemedText type="subtitle">Edit Crawl</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Crawl name"
              placeholderTextColor="#888"
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={styles.input}
              placeholder="Description (optional)"
              placeholderTextColor="#888"
              value={editDescription}
              onChangeText={setEditDescription}
            />
            <View style={styles.row}>
              <ThemedText>Private</ThemedText>
              <Switch value={editPublic} onValueChange={setEditPublic} />
              <ThemedText>Public</ThemedText>
            </View>
            {saveError && <ThemedText style={styles.error}>{saveError}</ThemedText>}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditing(false)}>
                <ThemedText style={styles.cancel}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.saveButton, (!editName.trim() || saving) && styles.disabled]}
                disabled={!editName.trim() || saving}
                onPress={saveEdit}>
                <ThemedText style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 12, paddingBottom: 60 },
  meta: { opacity: 0.7 },
  description: { marginTop: 4 },
  ownerRow: { flexDirection: 'row', gap: 20, marginTop: 4 },
  ownerAction: { color: '#0a84ff', fontSize: 13 },
  deleteAction: { color: '#ff453a' },
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
  stopAction: { fontSize: 16, paddingHorizontal: 4 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { borderRadius: 14, padding: 20, gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 4 },
  cancel: { opacity: 0.7, paddingVertical: 10 },
  saveButton: { backgroundColor: '#0a84ff', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  disabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '600' },
});
