import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Coords } from '@/lib/bearing';
import { distanceMeters } from '@/lib/bearing';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/errors';
import { findNearestBar, type PlaceBar } from '@/lib/places';
import { supabase } from '@/lib/supabase';

export type TripPhase = 'idle' | 'loading' | 'traveling' | 'arrived';

export type TripCompanion = { id: string; name: string };

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
  error: string | null;
  paceWarning: string | null;
  dismissPaceWarning: () => void;
  revealMode: boolean;
  setRevealMode: (value: boolean) => void;
  /** Set once a published crawl is loaded; null in freeform (nearest-bar) mode. */
  routeStops: PlaceBar[] | null;
  routeIndex: number;
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

  function dismissPaceWarning() {
    setPaceWarning(null);
  }

  function resetTrip() {
    setTripId(null);
    setTripStartedAt(null);
    setTargetBar(null);
    setCurrentStopId(null);
    setVisitedPlaceIds([]);
    setDrinkCount(0);
    setTotalDrinkCount(0);
    setPaceWarning(null);
    setCompanions([]);
    setCompanionDrinkCounts({});
    setRouteStops(null);
    setRouteIndex(0);
    setPhase('idle');
  }

  async function startCrawl(coords: Coords) {
    if (!session) return;
    setError(null);
    setPhase('loading');
    try {
      const bar = await findNearestBar(coords, []);
      if (!bar) {
        setError('No bars found nearby.');
        setPhase('idle');
        return;
      }
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({ user_id: session.user.id })
        .select()
        .single();
      if (tripError || !trip) throw tripError ?? new Error('Failed to start trip');

      setTripId(trip.id);
      setTripStartedAt(trip.started_at);
      setVisitedPlaceIds([]);
      setRouteStops(null);
      setRouteIndex(0);
      setTargetBar(bar);
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
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({ user_id: session.user.id, crawl_id: crawl.id })
        .select()
        .single();
      if (tripError || !trip) throw tripError ?? new Error('Failed to start trip');

      setTripId(trip.id);
      setTripStartedAt(trip.started_at);
      setVisitedPlaceIds([]);
      setRouteStops(crawl.stops);
      setRouteIndex(0);
      setTargetBar(crawl.stops[0]);
      setPhase('traveling');
    } catch (e) {
      setError(errorMessage(e, 'Failed to start crawl'));
      setPhase('idle');
    }
  }

  async function confirmArrival() {
    if (!targetBar || !tripId) return;
    setError(null);
    try {
      const { data: barRow, error: barError } = await supabase
        .from('bars')
        .upsert(
          {
            place_id: targetBar.placeId,
            name: targetBar.name,
            address: targetBar.address,
            lat: targetBar.location.latitude,
            lng: targetBar.location.longitude,
            photo_ref: targetBar.photoRef,
          },
          { onConflict: 'place_id' }
        )
        .select()
        .single();
      if (barError || !barRow) throw barError ?? new Error('Failed to save bar');

      const { data: stopRow, error: stopError } = await supabase
        .from('trip_stops')
        .insert({ trip_id: tripId, bar_id: barRow.id, stop_order: visitedPlaceIds.length })
        .select()
        .single();
      if (stopError || !stopRow) throw stopError ?? new Error('Failed to log stop');

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
      })
      .select('id, guest_name, profiles(display_name)')
      .single();
    if (companionError || !data) {
      setError(errorMessage(companionError, 'Failed to add companion'));
      return;
    }
    const row = data as unknown as { id: string; guest_name: string | null; profiles: { display_name: string | null } | null };
    setCompanions((prev) => [
      ...prev,
      { id: row.id, name: row.guest_name ?? row.profiles?.display_name ?? 'Someone' },
    ]);
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
    if (!currentStopId) return;
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
        setCurrentStopId(null);
        setRouteIndex(next);
        setTargetBar(routeStops[next]);
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
      setCurrentStopId(null);
      setTargetBar(bar);
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
        error,
        paceWarning,
        dismissPaceWarning,
        revealMode,
        setRevealMode,
        routeStops,
        routeIndex,
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
