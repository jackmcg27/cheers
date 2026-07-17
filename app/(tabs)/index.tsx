import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarRevealCard } from '@/components/BarRevealCard';
import { BottleCompass } from '@/components/BottleCompass';
import { CompanionsPanel } from '@/components/CompanionsPanel';
import { DrinkCounter } from '@/components/DrinkCounter';
import { MockLocationControls } from '@/components/MockLocationControls';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useHeading } from '@/hooks/useHeading';
import { useLocation } from '@/hooks/useLocation';
import { useAuth } from '@/lib/auth-context';
import { bearingDegrees, distanceMeters, formatDistance } from '@/lib/bearing';
import {
  fetchPendingInvites,
  respondToInvite,
  subscribeToInviteChanges,
  type PendingInvite,
} from '@/lib/companion-invites';
import { searchProfiles, type ProfileMatch } from '@/lib/feed';
import { isMockLocationEnabled } from '@/lib/mock-location';
import { useTrip } from '@/lib/trip-context';

const ARRIVAL_RADIUS_M = 40;

export default function CompassScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { coords, errorMsg: locationError } = useLocation();
  const heading = useHeading();
  const {
    phase,
    targetBar,
    drinkCount,
    companions,
    companionDrinkCounts,
    addCompanion,
    removeCompanion,
    refreshCompanions,
    error,
    paceWarning,
    dismissPaceWarning,
    revealMode,
    setRevealMode,
    routeStops,
    routeIndex,
    hostName,
    followingCompanionId,
    checkActiveHostTrip,
    leaveHostTrip,
    startCrawl,
    confirmArrival,
    addDrink,
    nextBar,
    endCrawl,
  } = useTrip();

  const [companionQuery, setCompanionQuery] = useState('');
  const [companionResults, setCompanionResults] = useState<ProfileMatch[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);

  const loadInvites = useCallback(() => {
    if (!session) return;
    fetchPendingInvites(session.user.id)
      .then(setPendingInvites)
      .catch(() => {});
  }, [session]);

  const loadFocusData = useCallback(() => {
    loadInvites();
    refreshCompanions();
    checkActiveHostTrip();
  }, [loadInvites, refreshCompanions, checkActiveHostTrip]);

  useFocusEffect(loadFocusData);

  // Focus-only polling misses two live cases: a new invite arriving while already sitting on
  // this tab, and this device's own accept needing to attach to the host's trip without waiting
  // for the next tab switch. Subscribe for as long as there's a session so both resolve live.
  useEffect(() => {
    if (!session) return;
    return subscribeToInviteChanges(session.user.id, loadFocusData);
  }, [session, loadFocusData]);

  async function respond(invite: PendingInvite, accept: boolean) {
    try {
      await respondToInvite(invite.id, accept);
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
      if (accept) await checkActiveHostTrip();
    } catch {
      // Best-effort — the invite just stays in the list to retry.
    }
  }

  useEffect(() => {
    if (!companionQuery.trim() || !session) {
      setCompanionResults([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      searchProfiles(companionQuery, session.user.id)
        .then((r) => !cancelled && setCompanionResults(r))
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [companionQuery, session]);

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

  // On a companion's device the top counter must show their own tally, not the host's — and the
  // host (who has no entry in `companions`, which only tracks people tagged onto the trip) needs
  // a synthesized row below so a companion can still see and add to the host's count.
  const isHost = !hostName;
  const myDrinkCount = followingCompanionId ? (companionDrinkCounts[followingCompanionId] ?? 0) : drinkCount;
  const otherCompanions = companions.filter((c) => c.id !== followingCompanionId);
  const listCompanions =
    hostName != null
      ? [{ id: 'host', name: hostName, status: 'accepted' as const }, ...otherCompanions]
      : otherCompanions;
  const listDrinkCounts = hostName != null ? { ...companionDrinkCounts, host: drinkCount } : companionDrinkCounts;

  return (
    <ThemedView
      style={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 76 },
      ]}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          🍺 Cheers
        </ThemedText>
        <View style={styles.revealRow}>
          <ThemedText style={styles.revealLabel}>Surprise Me</ThemedText>
          <Switch
            value={revealMode}
            onValueChange={setRevealMode}
            trackColor={{ false: '#3a3a3c', true: '#f2c14e' }}
            thumbColor="#fff"
          />
          <ThemedText style={styles.revealLabel}>Reveal</ThemedText>
        </View>
      </View>

      {pendingInvites.map((invite) => (
        <View key={invite.id} style={styles.inviteBanner}>
          <ThemedText style={styles.inviteText}>
            {invite.hostName} added you to their crawl
          </ThemedText>
          <View style={styles.row}>
            <Pressable onPress={() => respond(invite, true)}>
              <ThemedText style={styles.inviteAccept}>Accept</ThemedText>
            </Pressable>
            <Pressable onPress={() => respond(invite, false)}>
              <ThemedText style={styles.inviteDecline}>Decline</ThemedText>
            </Pressable>
          </View>
        </View>
      ))}

      {hostName && (
        <View style={styles.inviteBanner}>
          <ThemedText style={styles.inviteText}>Following {hostName}'s crawl</ThemedText>
          <Pressable onPress={leaveHostTrip}>
            <ThemedText style={styles.inviteDecline}>Leave</ThemedText>
          </Pressable>
        </View>
      )}

      {isMockLocationEnabled && <MockLocationControls targetLocation={targetBar?.location ?? null} />}

      {locationError && <ThemedText style={styles.error}>{locationError}</ThemedText>}
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {paceWarning && (
        <Pressable style={styles.paceBanner} onPress={dismissPaceWarning}>
          <ThemedText style={styles.paceBannerText}>{paceWarning}</ThemedText>
          <ThemedText style={styles.paceBannerDismiss}>✕</ThemedText>
        </Pressable>
      )}

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
            <ThemedText style={styles.lightButtonText}>Load a Crawl</ThemedText>
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
          <BottleCompass rotationDegrees={rotation} size={190} />
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
        <ScrollView contentContainerStyle={styles.arrivedCenter}>
          {routeStops && (
            <ThemedText style={styles.hint}>
              Stop {routeIndex + 1} of {routeStops.length}
            </ThemedText>
          )}
          <BarRevealCard bar={targetBar} compact />
          <DrinkCounter
            count={myDrinkCount}
            onAdd={(name) => addDrink(name, followingCompanionId ?? undefined)}
            label="You"
          />
          <CompanionsPanel
            companions={listCompanions}
            drinkCounts={listDrinkCounts}
            showDrinkCounters
            isHost={isHost}
            searchQuery={companionQuery}
            onSearchQueryChange={setCompanionQuery}
            searchResults={companionResults}
            onAddUser={(userId) => addCompanion({ userId })}
            onAddGuest={(name) => addCompanion({ guestName: name })}
            onRemove={removeCompanion}
            onAddDrink={(companionId, name) => addDrink(name, companionId === 'host' ? undefined : companionId)}
          />
          <View style={styles.row}>
            <Pressable style={styles.secondaryButton} onPress={() => nextBar(coords)}>
              <ThemedText style={styles.lightButtonText}>Next Bar</ThemedText>
            </Pressable>
            <Pressable style={styles.endButton} onPress={endCrawl}>
              <ThemedText style={styles.lightButtonText}>End Crawl</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, gap: 10 },
  header: { gap: 10 },
  title: { letterSpacing: 0.5 },
  revealRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  revealLabel: { fontSize: 13, opacity: 0.75 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  arrivedCenter: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hint: { opacity: 0.7 },
  distance: { fontSize: 24, fontWeight: '700', color: '#f2c14e', letterSpacing: 0.5 },
  error: { color: '#ff453a' },
  paceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(242, 193, 78, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(242, 193, 78, 0.4)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  paceBannerText: { flex: 1, color: '#f2c14e', fontSize: 13 },
  paceBannerDismiss: { color: '#f2c14e', opacity: 0.7, fontSize: 13 },
  inviteBanner: {
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(10, 132, 255, 0.4)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  inviteText: { fontSize: 13 },
  inviteAccept: { color: '#0a84ff', fontWeight: '600', fontSize: 13 },
  inviteDecline: { color: '#ff453a', fontWeight: '600', fontSize: 13 },
  primaryButton: {
    backgroundColor: '#f2c14e',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#f2c14e',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonDim: { opacity: 0.5 },
  primaryButtonText: { color: '#1c1204', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  lightButtonText: { color: '#fff', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  secondaryButton: {
    backgroundColor: '#3a3a3c',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  endButton: { backgroundColor: '#ff453a', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14 },
});
