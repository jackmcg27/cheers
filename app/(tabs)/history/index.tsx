import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/lib/auth-context';
import { publishTripAsCrawl } from '@/lib/crawls';
import { errorMessage } from '@/lib/errors';
import { formatDistance, formatDuration, summarizeDrinkNames, summarizeDrinksByCompanion } from '@/lib/format';
import { fetchMyStats, type MyStats } from '@/lib/stats';
import { supabase } from '@/lib/supabase';

type TripSummary = {
  id: string;
  started_at: string;
  ended_at: string | null;
  total_distance_m: number | null;
  total_duration_s: number | null;
  crawl_id: string | null;
  trip_stops: { drink_logs: { drink_name: string | null; companion_id: string | null }[] }[];
  trip_companions: {
    id: string;
    guest_name: string | null;
    profiles: { display_name: string | null } | null;
  }[];
};

type PendingAction = { type: 'post' | 'crawl'; tripId: string } | { type: 'name' };

const HISTORY_PAGE_SIZE = 20;

const TRIP_SUMMARY_SELECT =
  'id, started_at, ended_at, total_distance_m, total_duration_s, crawl_id, trip_stops(drink_logs(drink_name, companion_id)), trip_companions(id, guest_name, profiles(display_name))';

export default function HistoryScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
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
      .select(TRIP_SUMMARY_SELECT)
      .eq('user_id', session.user.id)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .range(0, HISTORY_PAGE_SIZE - 1)
      .then(({ data }) => {
        const page = (data as unknown as TripSummary[]) ?? [];
        setTrips(page);
        setHasMore(page.length === HISTORY_PAGE_SIZE);
        setLoading(false);
      });
  }, [session]);

  function loadMoreTrips() {
    if (!session || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    supabase
      .from('trips')
      .select(TRIP_SUMMARY_SELECT)
      .eq('user_id', session.user.id)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .range(trips.length, trips.length + HISTORY_PAGE_SIZE - 1)
      .then(({ data }) => {
        const page = (data as unknown as TripSummary[]) ?? [];
        setTrips((prev) => [...prev, ...page]);
        setHasMore(page.length === HISTORY_PAGE_SIZE);
        setLoadingMore(false);
      });
  }

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

  function confirmDeleteTrip(tripId: string) {
    Alert.alert(
      'Delete trip?',
      "This also removes it from the feed if you posted it. Can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTrip(tripId) },
      ]
    );
  }

  async function deleteTrip(tripId: string) {
    const { error } = await supabase.from('trips').delete().eq('id', tripId);
    if (error) {
      Alert.alert('Failed to delete trip', errorMessage(error));
      return;
    }
    setTrips((prev) => prev.filter((t) => t.id !== tripId));
  }

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
        loadTrips();
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
    <ThemedView style={[styles.container, { paddingTop: 16 }]}>
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
        onEndReached={loadMoreTrips}
        onEndReachedThreshold={0.4}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 76 }]}
        ListEmptyComponent={
          !loading ? <ThemedText style={styles.empty}>No completed crawls yet.</ThemedText> : null
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} /> : null}
        renderItem={({ item }) => {
          const logs = item.trip_stops?.flatMap((s) => s.drink_logs) ?? [];
          const companions = (item.trip_companions ?? []).map((c) => ({
            id: c.id,
            label: c.profiles?.display_name ?? c.guest_name ?? 'Someone',
          }));
          const drinkSummary = summarizeDrinkNames(logs.map((d) => d.drink_name));
          const byCompanion = companions.length > 0 ? summarizeDrinksByCompanion(logs, companions) : [];
          return (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push({ pathname: '/(tabs)/history/[id]', params: { id: item.id } })
              }>
              <ThemedText type="defaultSemiBold">
                {new Date(item.started_at).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </ThemedText>
              <ThemedText style={styles.meta}>
                {item.trip_stops?.length ?? 0} stops · 🍻{' '}
                {item.trip_stops?.reduce((sum, s) => sum + (s.drink_logs?.length ?? 0), 0) ?? 0} ·{' '}
                {formatDuration(item.total_duration_s)} ·{' '}
                {item.total_distance_m ? formatDistance(item.total_distance_m) : '—'}
              </ThemedText>
              {byCompanion.length > 0 ? (
                <View style={styles.companionBreakdown}>
                  {byCompanion.map((c) => (
                    <ThemedText key={c.label} style={styles.drinkNames}>
                      <ThemedText type="defaultSemiBold" style={styles.drinkNames}>
                        {c.label}:{' '}
                      </ThemedText>
                      {c.summary}
                    </ThemedText>
                  ))}
                </View>
              ) : (
                drinkSummary && <ThemedText style={styles.drinkNames}>{drinkSummary}</ThemedText>
              )}
              <View style={styles.cardActions}>
                <Pressable onPress={() => setAction({ type: 'post', tripId: item.id })}>
                  <ThemedText style={styles.cardAction}>Post to Feed</ThemedText>
                </Pressable>
                {item.crawl_id ? (
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/(tabs)/crawls/[id]', params: { id: item.crawl_id! } })
                    }>
                    <ThemedText style={styles.cardAction}>View Crawl</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setAction({ type: 'crawl', tripId: item.id })}>
                    <ThemedText style={styles.cardAction}>Publish as Crawl</ThemedText>
                  </Pressable>
                )}
                <Pressable onPress={() => confirmDeleteTrip(item.id)}>
                  <ThemedText style={styles.deleteAction}>Delete</ThemedText>
                </Pressable>
              </View>
            </Pressable>
          );
        }}
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
  drinkNames: { opacity: 0.85, fontSize: 13, marginTop: 2 },
  companionBreakdown: { marginTop: 2, gap: 2 },
  empty: { opacity: 0.6, textAlign: 'center', marginTop: 40 },
  footerSpinner: { marginVertical: 20 },
  cardActions: { flexDirection: 'row', gap: 20, marginTop: 8 },
  cardAction: { color: '#0a84ff', fontSize: 13 },
  deleteAction: { color: '#ff453a', fontSize: 13 },
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
