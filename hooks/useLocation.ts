import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type LocationState = {
  coords: { latitude: number; longitude: number } | null;
  errorMsg: string | null;
  loading: boolean;
};

/** Live GPS position, updated as the device moves. Requires foreground location permission. */
export function useLocation() {
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
      subscription?.remove();
    };
  }, []);

  return state;
}
