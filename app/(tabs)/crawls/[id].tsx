import { useCallback, useState } from 'react';
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
import { useAuth } from '@/lib/auth-context';
import {
  crawlStopToPlaceBar,
  deleteCrawl,
  fetchCrawlDetail,
  updateCrawl,
  type CrawlDetail,
} from '@/lib/crawls';
import { errorMessage } from '@/lib/errors';
import { useTrip } from '@/lib/trip-context';

export default function CrawlDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
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

        {isOwner && (
          <View style={styles.ownerRow}>
            <Pressable onPress={openEdit}>
              <ThemedText style={styles.ownerAction}>Edit</ThemedText>
            </Pressable>
            <Pressable onPress={handleDelete} disabled={saving}>
              <ThemedText style={[styles.ownerAction, styles.deleteAction]}>
                {confirmingDelete ? 'Tap again to confirm delete' : 'Delete'}
              </ThemedText>
            </Pressable>
          </View>
        )}

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
