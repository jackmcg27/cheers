import { useSyncExternalStore } from 'react';

/**
 * Dev-only GPS/heading fake, for developing the compass loop on a laptop with no phone,
 * emulator, or magnetometer. Enabled via EXPO_PUBLIC_MOCK_LOCATION=true — see .env.example
 * and docs/local-dev-without-a-phone.md.
 */
export const isMockLocationEnabled = process.env.EXPO_PUBLIC_MOCK_LOCATION === 'true';

export type MockLocationState = {
  latitude: number;
  longitude: number;
  heading: number;
};

const defaultCoords = {
  latitude: Number(process.env.EXPO_PUBLIC_MOCK_LAT ?? '40.7484'),
  longitude: Number(process.env.EXPO_PUBLIC_MOCK_LNG ?? '-73.9857'),
};

let state: MockLocationState = { ...defaultCoords, heading: 0 };

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getMockState(): MockLocationState {
  return state;
}

export function setMockCoords(latitude: number, longitude: number) {
  state = { ...state, latitude, longitude };
  emit();
}

/** Back to the EXPO_PUBLIC_MOCK_LAT/LNG starting point — handy after "jump to target". */
export function resetMockCoords() {
  setMockCoords(defaultCoords.latitude, defaultCoords.longitude);
}

export function setMockHeading(heading: number) {
  state = { ...state, heading: ((heading % 360) + 360) % 360 };
  emit();
}

export function nudgeMockHeading(deltaDeg: number) {
  setMockHeading(state.heading + deltaDeg);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Live-reactive read of the mock location/heading state. */
export function useMockLocation(): MockLocationState {
  return useSyncExternalStore(subscribe, getMockState);
}
