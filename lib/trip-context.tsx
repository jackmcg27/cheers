import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Coords } from '@/lib/bearing';
import { distanceMeters } from '@/lib/bearing';
import { useAuth } from '@/lib/auth-context';
import {
  fetchActiveHostTrip,
  fetchTripCompanions,
  respondToInvite,
  type ActiveHostTrip,
} from '@/lib/companion-invites';
import { crawlStopToPlaceBar, fetchCrawlDetail } from '@/lib/crawls';
import { errorMessage } from '@/lib/errors';
import { findNearestBar, type PlaceBar } from '@/lib/places';
import { supabase } from '@/lib/supabase';
import { fetchLiveTrip } from '@/lib/trip-sync';

export type TripPhase = 'idle' | 'loading' | 'traveling' | 'arrived';

export type TripCompanion = {
  id: string;
  name: string;
  status: 'pending' | 'accepted' | 'declined';
};

// A gentle nudge, not a hard limit — only fires once the trip has some drinks logged, so
// it can't trigger off the first round ordered the moment you sit down.
const PACE_WARNING_DRINKS_PER_HOUR = 2;
const PACE_WARNING_MIN_DRINKS = 3;

type TripContextValue = {
  phase: TripPhase;
  targetBar: PlaceBar | null;
  tripId: string | null;
  currentStopId: string | null;
  drinkCount: number;
  companions: TripCompanion[];
  companionDrinkCounts: Record<string, number>;
  addCompanion: (input: { userId?: string; guestName?: string }) => Promise<void>;
  removeCompanion: (companionId: string) => Promise<void>;
  refreshCompanions: () => Promise<void>;
  error: string | null;
  paceWarning: string | null;
  dismissPaceWarning: () => void;
  revealMode: boolean;
  setRevealMode: (value: boolean) => void;
  /** Set once a published crawl is loaded; null in freeform (nearest-bar) mode. */
  routeStops: PlaceBar[] | null;
  routeIndex: number;
  /** Non-null only when attached to another host's trip as an accepted companion. */
  hostName: string | null;
  /** This device's own `trip_companions` row id when attached as a companion; null when the
   * device is the host (or idle). Lets the UI pick "my own" count out of `companionDrinkCounts`
   * instead of showing the host's `drinkCount` mislabeled as "You". */
  followingCompanionId: string | null;
  /** Polls for an active host trip to attach to — called on screen focus, mirroring
   * `refreshCompanions`'s poll-on-focus pattern, rather than a bespoke mount effect. A no-op
   * once a trip (own or attached) is already in progress. */
  checkActiveHostTrip: () => Promise<void>;
  /** Declines the invite that attached this device to the host's trip and resets to idle. */
  leaveHostTrip: () => Promise<void>;
  startCrawl: (coords: Coords) => Promise<void>;
  startCrawlWithRoute: (crawl: { id: string; stops: PlaceBar[] }) => Promise<void>;
  confirmArrival: () => Promise<void>;
  addDrink: (name?: string, companionId?: string) => Promise<void>;
  nextBar: (coords: Coords | null) => Promise<void>;
  endCrawl: () => Promise<void>;
};

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  const [revealMode, setRevealMode] = useState(false);
  const [phase, setPhase] = useState<TripPhase>('idle');
  const [targetBar, setTargetBar] = useState<PlaceBar | null>(null);
  const [targetBarId, setTargetBarId] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [tripStartedAt, setTripStartedAt] = useState<string | null>(null);
  const [currentStopId, setCurrentStopId] = useState<string | null>(null);
  const [visitedPlaceIds, setVisitedPlaceIds] = useState<string[]>([]);
  const [drinkCount, setDrinkCount] = useState(0);
  const [totalDrinkCount, setTotalDrinkCount] = useState(0);
  const [companions, setCompanions] = useState<TripCompanion[]>([]);
  const [companionDrinkCounts, setCompanionDrinkCounts] = useState<Record<string, number>>({});
  const [paceWarning, setPaceWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [routeStops, setRouteStops] = useState<PlaceBar[] | null>(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const [hostName, setHostName] = useState<string | null>(null);
  const [followingCompanionId, setFollowingCompanionId] = useState<string | null>(null);

  useEffect(() => {
    if (!tripStartedAt || totalDrinkCount < PACE_WARNING_MIN_DRINKS) {
      setPaceWarning(null);
      return;
    }
    const elapsedHours = (Date.now() - new Date(tripStartedAt).getTime()) / 3_600_000;
    if (elapsedHours <= 0) return;
    const pace = totalDrinkCount / elapsedHours;
    setPaceWarning(
      pace > PACE_WARNING_DRINKS_PER_HOUR
        ? `Averaging ${pace.toFixed(1)} drinks/hr — maybe pace it with some water 💧`
        : null
    );
  }, [totalDrinkCount, tripStartedAt]);

  // Single source of truth once both host and companion can write trip progress: any change to
  // trips/trip_stops/drink_logs for this trip re-derives local state from the DB rather than
  // trusting either device's own optimistic state. drink_logs has no trip_id column, so it can't
  // be filtered trip-wide — left unfiltered and reconciled via the same full re-fetch, which also
  // means the writer's own inserts harmlessly echo back through this path instead of being special
  // cased.
  useEffect(() => {
    if (!tripId) return;
    const id = tripId;
    const channel = supabase
      .channel(`trip-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${id}` },
        () => reconcileTrip(id)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_stops', filter: `trip_id=eq.${id}` },
        () => reconcileTrip(id)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drink_logs' }, () =>
        reconcileTrip(id)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_companions', filter: `trip_id=eq.${id}` },
        () => {
          fetchTripCompanions(id)
            .then(setCompanions)
            .catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  async function reconcileTrip(id: string) {
    try {
      const live = await fetchLiveTrip(id);
      if (live.endedAt) {
        resetTrip();
        return;
      }
      setPhase(live.phase);
      setTargetBar(live.targetBar);
      setTargetBarId(live.targetBarId);
      setRouteIndex(live.routeIndex);
      setCurrentStopId(live.currentStopId);
      setVisitedPlaceIds(live.visitedPlaceIds);
      setDrinkCount(live.drinkCount);
      setCompanionDrinkCounts(live.companionDrinkCounts);
    } catch {
      // Best-effort — the next realtime event or focus retry will resync.
    }
  }

  function dismissPaceWarning() {
    setPaceWarning(null);
  }

  function resetTrip() {
    setTripId(null);
    setTripStartedAt(null);
    setTargetBar(null);
    setTargetBarId(null);
    setCurrentStopId(null);
    setVisitedPlaceIds([]);
    setDrinkCount(0);
    setTotalDrinkCount(0);
    setPaceWarning(null);
    setCompanions([]);
    setCompanionDrinkCounts({});
    setRouteStops(null);
    setRouteIndex(0);
    setHostName(null);
    setFollowingCompanionId(null);
    setRevealMode(false);
    setPhase('idle');
  }

  /** Upserts a bar into the shared cache and returns its row id — called uniformly whenever a
   * new target is chosen (start/route-advance/freeform-advance) so `trips.target_bar_id` is
   * always backed by a real row immediately, not just at arrival. */
  async function upsertBar(bar: PlaceBar): Promise<string> {
    const { data: barRow, error: barError } = await supabase
      .from('bars')
      .upsert(
        {
          place_id: bar.placeId,
          name: bar.name,
          address: bar.address,
          lat: bar.location.latitude,
          lng: bar.location.longitude,
          photo_ref: bar.photoRef,
        },
        { onConflict: 'place_id' }
      )
      .select()
      .single();
    if (barError || !barRow) throw barError ?? new Error('Failed to save bar');
    return barRow.id;
  }

  /** Attaches this device to another host's live trip as an accepted companion, pulling the
   * current DB state straight into local state — consent already happened at accept-time, so
   * there's no reason to gate a second confirmation before joining the live view. */
  async function attachToTrip(active: ActiveHostTrip) {
    setRevealMode(false);
    const live = await fetchLiveTrip(active.tripId);
    let stops: PlaceBar[] | null = null;
    if (live.crawlId) {
      try {
        const detail = await fetchCrawlDetail(live.crawlId);
        stops = detail.stops.map(crawlStopToPlaceBar);
      } catch {
        stops = null;
      }
    }

    setTripId(active.tripId);
    setTripStartedAt(live.startedAt);
    setFollowingCompanionId(active.companionId);
    setHostName(live.hostName ?? active.hostName);
    setTargetBar(live.targetBar);
    setTargetBarId(live.targetBarId);
    setRouteStops(stops);
    setRouteIndex(live.routeIndex);
    setCurrentStopId(live.currentStopId);
    setVisitedPlaceIds(live.visitedPlaceIds);
    setDrinkCount(live.drinkCount);
    setCompanionDrinkCounts(live.companionDrinkCounts);
    setPhase(live.phase);

    try {
      setCompanions(await fetchTripCompanions(active.tripId));
    } catch {
      setCompanions([]);
    }
  }

  async function checkActiveHostTrip() {
    if (phase !== 'idle') return;
    try {
      const active = await fetchActiveHostTrip();
      if (!active) return;
      await attachToTrip(active);
    } catch {
      // Best-effort — retried on the next focus.
    }
  }

  async function leaveHostTrip() {
    if (!followingCompanionId) return;
    try {
      await respondToInvite(followingCompanionId, false);
      resetTrip();
    } catch (e) {
      setError(errorMessage(e, 'Failed to leave trip'));
    }
  }

  async function startCrawl(coords: Coords) {
    if (!session) return;
    setError(null);
    setPhase('loading');
    try {
      const activeHostTrip = await fetchActiveHostTrip();
      if (activeHostTrip) {
        await attachToTrip(activeHostTrip);
        return;
      }
      const bar = await findNearestBar(coords, []);
      if (!bar) {
        setError('No bars found nearby.');
        setPhase('idle');
        return;
      }
      const barId = await upsertBar(bar);
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({ user_id: session.user.id, target_bar_id: barId, phase: 'traveling', route_index: 0 })
        .select()
        .single();
      if (tripError || !trip) throw tripError ?? new Error('Failed to start trip');

      setTripId(trip.id);
      setTripStartedAt(trip.started_at);
      setVisitedPlaceIds([]);
      setRouteStops(null);
      setRouteIndex(0);
      setTargetBar(bar);
      setTargetBarId(barId);
      setHostName(null);
      setFollowingCompanionId(null);
      setPhase('traveling');
    } catch (e) {
      setError(errorMessage(e, 'Failed to start crawl'));
      setPhase('idle');
    }
  }

  async function startCrawlWithRoute(crawl: { id: string; stops: PlaceBar[] }) {
    if (!session || crawl.stops.length === 0) return;
    setError(null);
    setPhase('loading');
    try {
      const activeHostTrip = await fetchActiveHostTrip();
      if (activeHostTrip) {
        await attachToTrip(activeHostTrip);
        return;
      }
      const barId = await upsertBar(crawl.stops[0]);
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({
          user_id: session.user.id,
          crawl_id: crawl.id,
          target_bar_id: barId,
          phase: 'traveling',
          route_index: 0,
        })
        .select()
        .single();
      if (tripError || !trip) throw tripError ?? new Error('Failed to start trip');

      setTripId(trip.id);
      setTripStartedAt(trip.started_at);
      setVisitedPlaceIds([]);
      setRouteStops(crawl.stops);
      setRouteIndex(0);
      setTargetBar(crawl.stops[0]);
      setTargetBarId(barId);
      setHostName(null);
      setFollowingCompanionId(null);
      setPhase('traveling');
    } catch (e) {
      setError(errorMessage(e, 'Failed to start crawl'));
      setPhase('idle');
    }
  }

  async function confirmArrival() {
    if (!targetBar || !tripId || !targetBarId) return;
    setError(null);
    try {
      const { data: stopRow, error: stopError } = await supabase
        .from('trip_stops')
        .insert({ trip_id: tripId, bar_id: targetBarId, stop_order: visitedPlaceIds.length })
        .select()
        .single();
      if (stopError || !stopRow) throw stopError ?? new Error('Failed to log stop');

      await supabase.from('trips').update({ phase: 'arrived' }).eq('id', tripId);

      setCurrentStopId(stopRow.id);
      setVisitedPlaceIds((prev) => [...prev, targetBar.placeId]);
      setDrinkCount(0);
      setCompanionDrinkCounts({});
      setPhase('arrived');
    } catch (e) {
      setError(errorMessage(e, 'Failed to confirm arrival'));
    }
  }

  async function addDrink(name?: string, companionId?: string) {
    if (!currentStopId) return;
    const { error: drinkError } = await supabase
      .from('drink_logs')
      .insert({ trip_stop_id: currentStopId, drink_name: name ?? null, companion_id: companionId ?? null });
    if (drinkError) {
      setError(drinkError.message);
      return;
    }
    if (companionId) {
      setCompanionDrinkCounts((prev) => ({ ...prev, [companionId]: (prev[companionId] ?? 0) + 1 }));
    } else {
      setDrinkCount((c) => c + 1);
      setTotalDrinkCount((c) => c + 1);
    }
  }

  async function addCompanion(input: { userId?: string; guestName?: string }) {
    if (!tripId) return;
    const guestName = input.guestName?.trim();
    if (!input.userId && !guestName) return;
    const { data, error: companionError } = await supabase
      .from('trip_companions')
      .insert({
        trip_id: tripId,
        user_id: input.userId ?? null,
        guest_name: input.userId ? null : (guestName ?? null),
        // A linked app user gets a pending invite, not an instant add — they haven't consented
        // to being tagged yet. A guest has no account to ask, so it keeps the column default
        // ('accepted') by not being set here.
        status: input.userId ? 'pending' : undefined,
      })
      .select('id, guest_name, status, profiles(display_name)')
      .single();
    if (companionError || !data) {
      setError(errorMessage(companionError, 'Failed to add companion'));
      return;
    }
    const row = data as unknown as {
      id: string;
      guest_name: string | null;
      status: 'pending' | 'accepted' | 'declined';
      profiles: { display_name: string | null } | null;
    };
    setCompanions((prev) => [
      ...prev,
      { id: row.id, name: row.guest_name ?? row.profiles?.display_name ?? 'Someone', status: row.status },
    ]);
  }

  async function refreshCompanions() {
    if (!tripId) return;
    try {
      setCompanions(await fetchTripCompanions(tripId));
    } catch {
      // Best-effort — keep the last-known list on failure, try again on the next focus.
    }
  }

  async function removeCompanion(companionId: string) {
    const { error: removeError } = await supabase.from('trip_companions').delete().eq('id', companionId);
    if (removeError) {
      setError(errorMessage(removeError, 'Failed to remove companion'));
      return;
    }
    setCompanions((prev) => prev.filter((c) => c.id !== companionId));
    setCompanionDrinkCounts((prev) => {
      const next = { ...prev };
      delete next[companionId];
      return next;
    });
  }

  async function nextBar(coords: Coords | null) {
    if (!currentStopId || !tripId) return;
    setError(null);
    setPhase('loading');
    try {
      await supabase
        .from('trip_stops')
        .update({ left_at: new Date().toISOString() })
        .eq('id', currentStopId);

      if (routeStops) {
        const next = routeIndex + 1;
        if (next >= routeStops.length) {
          setError('That was the last stop on this crawl — end the crawl to save your trip.');
          setPhase('arrived');
          return;
        }
        const nextStopBar = routeStops[next];
        const barId = await upsertBar(nextStopBar);
        await supabase
          .from('trips')
          .update({ target_bar_id: barId, phase: 'traveling', route_index: next })
          .eq('id', tripId);

        setCurrentStopId(null);
        setRouteIndex(next);
        setTargetBar(nextStopBar);
        setTargetBarId(barId);
        setPhase('traveling');
        return;
      }

      if (!coords) {
        setError('Waiting for GPS to find the next bar.');
        setPhase('arrived');
        return;
      }
      const bar = await findNearestBar(coords, visitedPlaceIds);
      if (!bar) {
        setError('No more nearby bars — end the crawl to save your trip.');
        setPhase('arrived');
        return;
      }
      const barId = await upsertBar(bar);
      await supabase.from('trips').update({ target_bar_id: barId, phase: 'traveling' }).eq('id', tripId);

      setCurrentStopId(null);
      setTargetBar(bar);
      setTargetBarId(barId);
      setPhase('traveling');
    } catch (e) {
      setError(errorMessage(e, 'Failed to find next bar'));
      setPhase('arrived');
    }
  }

  async function endCrawl() {
    if (!tripId || !tripStartedAt) return;
    setError(null);
    try {
      if (currentStopId) {
        await supabase
          .from('trip_stops')
          .update({ left_at: new Date().toISOString() })
          .eq('id', currentStopId);
      }

      const { data: stops } = await supabase
        .from('trip_stops')
        .select('stop_order, bars(lat, lng)')
        .eq('trip_id', tripId)
        .order('stop_order', { ascending: true });

      let totalDistance = 0;
      if (stops && stops.length > 1) {
        for (let i = 1; i < stops.length; i++) {
          const a = stops[i - 1].bars as unknown as { lat: number; lng: number } | null;
          const b = stops[i].bars as unknown as { lat: number; lng: number } | null;
          if (a && b) {
            totalDistance += distanceMeters(
              { latitude: a.lat, longitude: a.lng },
              { latitude: b.lat, longitude: b.lng }
            );
          }
        }
      }

      const endedAt = new Date();
      const totalDuration = Math.round(
        (endedAt.getTime() - new Date(tripStartedAt).getTime()) / 1000
      );

      await supabase
        .from('trips')
        .update({
          ended_at: endedAt.toISOString(),
          total_distance_m: Math.round(totalDistance),
          total_duration_s: totalDuration,
        })
        .eq('id', tripId);

      resetTrip();
    } catch (e) {
      setError(errorMessage(e, 'Failed to end crawl'));
    }
  }

  return (
    <TripContext.Provider
      value={{
        phase,
        targetBar,
        tripId,
        currentStopId,
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
        startCrawlWithRoute,
        confirmArrival,
        addDrink,
        nextBar,
        endCrawl,
      }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used within a TripProvider');
  return ctx;
}
