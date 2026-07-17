import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { formatDistance, formatDuration } from '@/lib/format';
import type { TripDetail } from '@/lib/trip-detail';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Full read-only breakdown of a trip: stop-by-stop bar list with arrival windows and per-stop
 * drinks, plus who was there and what each person had. Shared by History's and Feed's detail
 * screens — each owns its own fetch/loading/error state and just passes the result down. */
export function TripDetailView({ detail }: { detail: TripDetail }) {
  return (
    <View style={styles.root}>
      {detail.photoUrl && <Image source={{ uri: detail.photoUrl }} style={styles.photo} />}

      <ThemedText style={styles.meta}>
        🍻 {detail.totalDrinks} · {formatDuration(detail.totalDurationS)} ·{' '}
        {detail.totalDistanceM ? formatDistance(detail.totalDistanceM) : '—'}
      </ThemedText>

      {(detail.companions.length > 0 || detail.viewerInvolved) && (
        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Who was there
          </ThemedText>
          {detail.viewerInvolved && (
            <View style={styles.companionRow}>
              <ThemedText type="defaultSemiBold">You</ThemedText>
              <ThemedText style={styles.companionDrinks}>
                {detail.ownDrinkSummary ??
                  (detail.ownDrinkCount > 0 ? `${detail.ownDrinkCount} drinks` : 'No drinks logged')}
              </ThemedText>
            </View>
          )}
          {detail.companions.map((c) => (
            <View key={c.id} style={styles.companionRow}>
              <ThemedText type="defaultSemiBold">{c.label}</ThemedText>
              <ThemedText style={styles.companionDrinks}>
                {c.drinkSummary ?? (c.drinkCount > 0 ? `${c.drinkCount} drinks` : 'No drinks logged')}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Stops
        </ThemedText>
        {detail.stops.map((stop, i) => (
          <View key={stop.id} style={styles.stopRow}>
            <ThemedText style={styles.stopIndex}>{i + 1}.</ThemedText>
            <View style={styles.stopInfo}>
              <ThemedText type="defaultSemiBold">{stop.barName ?? 'Unknown bar'}</ThemedText>
              {stop.barAddress && <ThemedText style={styles.meta}>{stop.barAddress}</ThemedText>}
              <ThemedText style={styles.meta}>
                {formatTime(stop.arrivedAt)}
                {stop.leftAt ? ` – ${formatTime(stop.leftAt)}` : ''}
              </ThemedText>
              {stop.drinkSummary && <ThemedText style={styles.drinkNames}>🍺 {stop.drinkSummary}</ThemedText>}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 16 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12 },
  meta: { opacity: 0.7 },
  section: { gap: 8 },
  sectionTitle: { marginBottom: 2 },
  companionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  companionDrinks: { opacity: 0.8, fontSize: 13 },
  stopRow: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#3a3a3c' },
  stopIndex: { opacity: 0.6, width: 20 },
  stopInfo: { flex: 1, gap: 2 },
  drinkNames: { opacity: 0.85, fontSize: 13, marginTop: 2 },
});
