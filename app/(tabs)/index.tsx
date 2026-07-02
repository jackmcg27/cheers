import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarRevealCard } from '@/components/BarRevealCard';
import { CompassArrow } from '@/components/CompassArrow';
import { DrinkCounter } from '@/components/DrinkCounter';
import { MockLocationControls } from '@/components/MockLocationControls';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useHeading } from '@/hooks/useHeading';
import { useLocation } from '@/hooks/useLocation';
import { bearingDegrees, distanceMeters, formatDistance } from '@/lib/bearing';
import { isMockLocationEnabled } from '@/lib/mock-location';
import { useTrip } from '@/lib/trip-context';

const ARRIVAL_RADIUS_M = 40;

export default function CompassScreen() {
  const insets = useSafeAreaInsets();
  const { coords, errorMsg: locationError } = useLocation();
  const heading = useHeading();
  const {
    phase,
    targetBar,
    drinkCount,
    error,
    revealMode,
    setRevealMode,
    routeStops,
    routeIndex,
    startCrawl,
    confirmArrival,
    addDrink,
    nextBar,
    endCrawl,
  } = useTrip();

  const distance = useMemo(
    () => (coords && targetBar ? distanceMeters(coords, targetBar.location) : null),
    [coords, targetBar]
  );
  const bearing = useMemo(
    () => (coords && targetBar ? bearingDegrees(coords, targetBar.location) : null),
    [coords, targetBar]
  );
  const rotation = useMemo(
    () => (bearing !== null && heading !== null ? (bearing - heading + 360) % 360 : 0),
    [bearing, heading]
  );

  const canReveal = revealMode || phase === 'arrived';
  const canConfirmArrival =
    phase === 'traveling' && distance !== null && distance < ARRIVAL_RADIUS_M * 3;

  return (
    <ThemedView
      style={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 76 },
      ]}>
      <View style={styles.header}>
        <ThemedText type="title">Cheers</ThemedText>
        <View style={styles.revealRow}>
          <ThemedText>Surprise Me</ThemedText>
          <Switch value={revealMode} onValueChange={setRevealMode} />
          <ThemedText>Reveal</ThemedText>
        </View>
      </View>

      {isMockLocationEnabled && <MockLocationControls targetLocation={targetBar?.location ?? null} />}

      {locationError && <ThemedText style={styles.error}>{locationError}</ThemedText>}
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {phase === 'idle' && (
        <View style={styles.center}>
          <ThemedText style={styles.hint}>Ready to find your first bar?</ThemedText>
          <Pressable
            style={styles.primaryButton}
            disabled={!coords}
            onPress={() => coords && startCrawl(coords)}>
            <ThemedText style={styles.primaryButtonText}>Start Crawl</ThemedText>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.push('/(tabs)/crawls/index')}>
            <ThemedText style={styles.primaryButtonText}>Load a Crawl</ThemedText>
          </Pressable>
          {!coords && <ActivityIndicator style={{ marginTop: 12 }} />}
        </View>
      )}

      {phase === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.hint}>Finding a bar...</ThemedText>
        </View>
      )}

      {phase === 'traveling' && targetBar && (
        <View style={styles.center}>
          {routeStops && (
            <ThemedText style={styles.hint}>
              Stop {routeIndex + 1} of {routeStops.length}
            </ThemedText>
          )}
          <CompassArrow rotationDegrees={rotation} size={190} />
          <ThemedText type="subtitle" style={styles.distance}>
            {distance !== null ? formatDistance(distance) : '—'}
          </ThemedText>

          {canReveal && <BarRevealCard bar={targetBar} />}

          <Pressable
            style={[styles.primaryButton, !canConfirmArrival && styles.buttonDim]}
            onPress={confirmArrival}>
            <ThemedText style={styles.primaryButtonText}>
              {canConfirmArrival ? "I'm here" : "I'm here (confirm manually)"}
            </ThemedText>
          </Pressable>
        </View>
      )}

      {phase === 'arrived' && targetBar && (
        <View style={styles.arrivedCenter}>
          {routeStops && (
            <ThemedText style={styles.hint}>
              Stop {routeIndex + 1} of {routeStops.length}
            </ThemedText>
          )}
          <BarRevealCard bar={targetBar} compact />
          <DrinkCounter count={drinkCount} onAdd={addDrink} />
          <View style={styles.row}>
            <Pressable style={styles.secondaryButton} onPress={() => nextBar(coords)}>
              <ThemedText style={styles.primaryButtonText}>Next Bar</ThemedText>
            </Pressable>
            <Pressable style={styles.endButton} onPress={endCrawl}>
              <ThemedText style={styles.primaryButtonText}>End Crawl</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, gap: 10 },
  header: { gap: 8 },
  revealRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  arrivedCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { opacity: 0.7 },
  distance: { fontSize: 22 },
  error: { color: '#ff453a' },
  primaryButton: {
    backgroundColor: '#0a84ff',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonDim: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  secondaryButton: {
    backgroundColor: '#3a3a3c',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  endButton: { backgroundColor: '#ff453a', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12 },
});
