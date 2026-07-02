import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { FlatList, Modal, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import { publishTripAsCrawl } from '@/lib/crawls';
import { errorMessage } from '@/lib/errors';
import { formatDistance, formatDuration } from '@/lib/format';
import { fetchMyStats, type MyStats } from '@/lib/stats';
import { supabase } from '@/lib/supabase';

type TripSummary = {
  id: string;
  started_at: string;
  ended_at: string | null;
  total_distance_m: number | null;
  total_duration_s: number | null;
  trip_stops: { drink_logs: { count: number }[] }[];
};

type PendingAction = { type: 'post' | 'crawl'; tripId: string } | { type: 'name' };

export default function HistoryScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);

  const [action, setAction] = useState<PendingAction | null>(null);
  const [caption, setCaption] = useState('');
  const [crawlName, setCrawlName] = useState('');
  const [crawlDescription, setCrawlDescription] = useState('');
  const [crawlPublic, setCrawlPublic] = useState(true);
  const [nameDraft, setNameDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadTrips = useCallback(() => {
    if (!session) return;
    setLoading(true);
    supabase
      .from('trips')
      .select('id, started_at, ended_at, total_distance_m, total_duration_s, trip_stops(drink_logs(count))')
      .eq('user_id', session.user.id)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .then(({ data }) => {
        setTrips((data as unknown as TripSummary[]) ?? []);
        setLoading(false);
      });
  }, [session]);

  const loadMyProfile = useCallback(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setMyDisplayName(data?.display_name ?? null));
  }, [session]);

  const loadStats = useCallback(() => {
    if (!session) return;
    fetchMyStats(session.user.id)
      .then(setStats)
      .catch(() => {});
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadTrips();
      loadMyProfile();
      loadStats();
    }, [loadTrips, loadMyProfile, loadStats])
  );

  function openNameModal() {
    setNameDraft(myDisplayName ?? '');
    setAction({ type: 'name' });
  }

  function closeModal() {
    setAction(null);
    setCaption('');
    setCrawlName('');
    setCrawlDescription('');
    setCrawlPublic(true);
    setNameDraft('');
    setActionError(null);
  }

  async function submitAction() {
    if (!action || !session) return;
    setSubmitting(true);
    setActionError(null);
    try {
      if (action.type === 'post') {
        const { error } = await supabase
          .from('feed_posts')
          .insert({ trip_id: action.tripId, user_id: session.user.id, caption: caption.trim() || null });
        if (error) throw error;
      } else if (action.type === 'crawl') {
        if (!crawlName.trim()) throw new Error('Give the crawl a name.');
        await publishTripAsCrawl({
          tripId: action.tripId,
          creatorId: session.user.id,
          name: crawlName.trim(),
          description: crawlDescription.trim() || null,
          isPublic: crawlPublic,
        });
      } else {
        if (!nameDraft.trim()) throw new Error('Display name can\'t be empty.');
        const { error } = await supabase
          .from('profiles')
          .update({ display_name: nameDraft.trim() })
          .eq('id', session.user.id);
        if (error) throw error;
        setMyDisplayName(nameDraft.trim());
      }
      closeModal();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <ThemedText type="title" style={styles.title}>
        Trip History
      </ThemedText>
      <View style={styles.profileRow}>
        <ThemedText style={styles.profileText}>
          {myDisplayName ? `Signed in as ${myDisplayName}` : 'No display name set'}
        </ThemedText>
        <Pressable onPress={openNameModal}>
          <ThemedText style={styles.editName}>{myDisplayName ? 'Edit' : 'Set name'}</ThemedText>
        </Pressable>
      </View>
      <Pressable onPress={() => supabase.auth.signOut()}>
        <ThemedText style={styles.signOut}>Sign out</ThemedText>
      </Pressable>

      {stats && (
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <ThemedText type="defaultSemiBold">{stats.tripCount}</ThemedText>
            <ThemedText style={styles.statLabel}>Crawls</ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText type="defaultSemiBold">{stats.totalStops}</ThemedText>
            <ThemedText style={styles.statLabel}>Bars visited</ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText type="defaultSemiBold">{stats.totalDrinks}</ThemedText>
            <ThemedText style={styles.statLabel}>Drinks</ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText type="defaultSemiBold">
              {stats.totalDistanceM ? formatDistance(stats.totalDistanceM) : '0 m'}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Walked</ThemedText>
          </View>
          <View style={styles.statItem}>
            <ThemedText type="defaultSemiBold">{stats.crawlsPublished}</ThemedText>
            <ThemedText style={styles.statLabel}>Published</ThemedText>
          </View>
        </View>
      )}

      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        refreshing={loading}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 76 }]}
        ListEmptyComponent={
          !loading ? <ThemedText style={styles.empty}>No completed crawls yet.</ThemedText> : null
        }
        renderItem={({ item }) => (
          <ThemedView style={styles.card}>
            <ThemedText type="defaultSemiBold">
              {new Date(item.started_at).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </ThemedText>
            <ThemedText style={styles.meta}>
              {item.trip_stops?.length ?? 0} stops · 🍻{' '}
              {item.trip_stops?.reduce((sum, s) => sum + (s.drink_logs?.[0]?.count ?? 0), 0) ?? 0} ·{' '}
              {formatDuration(item.total_duration_s)} ·{' '}
              {item.total_distance_m ? formatDistance(item.total_distance_m) : '—'}
            </ThemedText>
            <View style={styles.cardActions}>
              <Pressable onPress={() => setAction({ type: 'post', tripId: item.id })}>
                <ThemedText style={styles.cardAction}>Post to Feed</ThemedText>
              </Pressable>
              <Pressable onPress={() => setAction({ type: 'crawl', tripId: item.id })}>
                <ThemedText style={styles.cardAction}>Publish as Crawl</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        )}
      />

      <Modal visible={action !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalBackdrop}>
          <ThemedView style={styles.modalCard}>
            <ThemedText type="subtitle">
              {action?.type === 'post'
                ? 'Post to Feed'
                : action?.type === 'crawl'
                  ? 'Publish as Crawl'
                  : 'Display Name'}
            </ThemedText>

            {action?.type === 'post' && (
              <TextInput
                style={styles.input}
                placeholder="Caption (optional)"
                placeholderTextColor="#888"
                value={caption}
                onChangeText={setCaption}
                multiline
              />
            )}
            {action?.type === 'crawl' && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Crawl name"
                  placeholderTextColor="#888"
                  value={crawlName}
                  onChangeText={setCrawlName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Description (optional)"
                  placeholderTextColor="#888"
                  value={crawlDescription}
                  onChangeText={setCrawlDescription}
                />
                <View style={styles.row}>
                  <ThemedText>Private</ThemedText>
                  <Switch value={crawlPublic} onValueChange={setCrawlPublic} />
                  <ThemedText>Public</ThemedText>
                </View>
              </>
            )}
            {action?.type === 'name' && (
              <TextInput
                style={styles.input}
                placeholder="Display name"
                placeholderTextColor="#888"
                value={nameDraft}
                onChangeText={setNameDraft}
              />
            )}

            {actionError && <ThemedText style={styles.error}>{actionError}</ThemedText>}

            <View style={styles.modalActions}>
              <Pressable onPress={closeModal}>
                <ThemedText style={styles.cancel}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.submitButton, submitting && styles.disabled]}
                disabled={submitting}
                onPress={submitAction}>
                <ThemedText style={styles.submitButtonText}>
                  {submitting ? 'Saving...' : 'Save'}
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  title: { marginBottom: 4 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  profileText: { opacity: 0.8 },
  editName: { color: '#0a84ff' },
  signOut: { color: '#ff453a', marginBottom: 16 },
  statsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  statItem: { alignItems: 'center', minWidth: 60 },
  statLabel: { fontSize: 11, opacity: 0.7, marginTop: 2 },
  list: { gap: 12 },
  card: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#3a3a3c', gap: 4 },
  meta: { opacity: 0.7 },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 40 },
  cardActions: { flexDirection: 'row', gap: 20, marginTop: 8 },
  cardAction: { color: '#0a84ff', fontSize: 13 },
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
  error: { color: '#ff453a' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 4 },
  cancel: { opacity: 0.7, paddingVertical: 10 },
  submitButton: { backgroundColor: '#0a84ff', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  disabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontWeight: '600' },
});
