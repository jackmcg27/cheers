import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { isMockLocationEnabled, useMockLocation } from '@/lib/mock-location';

function useRealHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchHeadingAsync((event) => {
        if (cancelled) return;
        const value = event.trueHeading >= 0 ? event.trueHeading : event.magHeading;
        setHeading(value);
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return heading;
}

function useFakeHeading(): number | null {
  return useMockLocation().heading;
}

/**
 * Live device compass heading in degrees [0, 360), true north where available.
 * When EXPO_PUBLIC_MOCK_LOCATION=true, returns a fake heading you control on-screen instead —
 * see lib/mock-location.ts and docs/local-dev-without-a-phone.md.
 */
export const useHeading = isMockLocationEnabled ? useFakeHeading : useRealHeading;
