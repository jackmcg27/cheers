# Developing without a phone

The compass loop needs live GPS and a device compass heading, which normally means testing on a
physical phone (see `docs/setup.md`). For day-to-day feature work that's often overkill — this
page covers developing entirely on a laptop instead, no phone or emulator required.

## The short version

```bash
# .env
EXPO_PUBLIC_MOCK_LOCATION=true
EXPO_PUBLIC_MOCK_LAT=40.7484    # pick coordinates near real bars — see below
EXPO_PUBLIC_MOCK_LNG=-73.9857
```

```bash
npx expo start --web
```

Open it in your laptop's browser. The Compass tab now shows an orange **"MOCK LOCATION (dev
only)"** box with:

- **⟲15° / 15°⟳** — nudge the fake compass heading, to test the arrow actually rotates.
- **Jump to target** — teleports your fake position to whatever bar the compass is currently
  pointing at, to instantly test arrival (rather than needing to actually be there).
- **Reset position** — back to your `EXPO_PUBLIC_MOCK_LAT`/`LNG` starting point.

Sign in, tap Start Crawl, use the controls to point at and "walk to" a bar, confirm arrival, log
drinks, next bar, end crawl — the entire loop works with nothing but a browser tab.

## Why this exists, and why it's better than a simulator/emulator

- **iOS Simulator** (Mac only, and you're on Windows anyway) has GPS location simulation but
  **no compass/heading simulation at all** — the compass arrow would just never move.
- **Android Emulator** has GPS simulation and a "virtual sensors" panel that can technically
  fake a magnetometer reading, but it's a fiddly 3D-drag control, not something you'd want to
  use dozens of times while iterating on a feature.
- The mock mode here is exact, fast, and works in a plain browser tab — no Android Studio
  install, no Mac, no waiting for an emulator to boot.

## Picking a mock coordinate

`findNearestBar`/`searchBarsByText` still hit the **real** Google Places API — only the GPS/
heading are faked, not the bar data. Pick coordinates near real bars for it to be useful:
somewhere you know has a real bar scene (your own city's downtown, a neighborhood you know).
The default in `lib/mock-location.ts` (`40.7484, -73.9857`) is Midtown Manhattan, which works
fine if you don't set your own.

## Caveats

- **This is dev-only and must never be true in a real build.** It's gated behind
  `EXPO_PUBLIC_MOCK_LOCATION`, which is unset by default — don't set it in any `.env` used for a
  real device build or deployment (see `docs/deployment.md`).
- Running in a browser (`--web`) means you're testing `react-native-web`'s rendering, which is
  usually identical to native but hasn't been exhaustively verified — if something looks off in
  the browser but you're not sure if it's a real bug, double check on a real device before
  filing it.
- You can also use mock mode with `npx expo start` (not `--web`) and Expo Go on a real phone —
  useful for testing the mock-controls UI itself, or if you want a phone's screen size without
  needing to physically go anywhere. Just as valid, just not "laptop only."
