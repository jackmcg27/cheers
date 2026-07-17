import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { isMockLocationEnabled, useMockLocation } from '@/lib/mock-location';

export type LocationState = {
  coords: { latitude: number; longitude: number } | null;
  errorMsg: string | null;
  loading: boolean;
};

function useRealLocation(): LocationState {
  const [state, setState] = useState<LocationState>({
    coords: null,
    errorMsg: null,
    loading: true,
  });

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) {
          setState({ coords: null, errorMsg: 'Location permission denied', loading: false });
        }
        return;
      }

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 },
        (loc) => {
          if (cancelled) return;
          setState({
            coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
            errorMsg: null,
            loading: false,
          });
        }
      );
    })();

    return () => {
      cancelled = true;
      try {
        subscription?.remove();
      } catch {
        // expo-location's web shim doesn't implement LocationEventEmitter.removeSubscription
        // (LegacyEventEmitter returns the raw native module on web instead of wrapping it).
      }
    };
  }, []);

  return state;
}

function useFakeLocation(): LocationState {
  const mock = useMockLocation();
  return {
    coords: { latitude: mock.latitude, longitude: mock.longitude },
    errorMsg: null,
    loading: false,
  };
}

/**
 * Live GPS position, updated as the device moves. Requires foreground location permission.
 * When EXPO_PUBLIC_MOCK_LOCATION=true, returns a fake position instead — see
 * lib/mock-location.ts and docs/local-dev-without-a-phone.md.
 */
export const useLocation = isMockLocationEnabled ? useFakeLocation : useRealLocation;
