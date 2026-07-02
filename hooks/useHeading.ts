import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/** Live device compass heading in degrees [0, 360), true north where available. */
export function useHeading() {
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
