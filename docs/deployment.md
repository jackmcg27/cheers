# Deployment / getting the app onto real devices

Three paths, roughly in order of effort. **For testing with a group this weekend, start with
Path 1** — it's free, works today, and needs nothing beyond what you already have set up.

See [`docs/costs.md`](costs.md) for what each path actually costs and what to spin down after.

## Path 1 — Expo Go + tunnel (fastest, free, no build step)

What we've been using for local dev, except `--tunnel` routes through Expo's relay so testers
don't need to be on your Wi-Fi — they can be anywhere with internet.

```bash
npx expo start --tunnel
```

(First run will prompt to install `@expo/ngrok` — accept it.)

Share the QR code or the `exp://` URL it prints. Each tester needs the **Expo Go** app
installed (App Store / Play Store) — same as local dev, just remote.

**Limitations**: your computer has to stay running with the tunnel open for the whole session.
Testers need Expo Go installed, and the app icon won't be "Cheers" on their home screen (it runs
inside Expo Go, not as its own app). Fine for a weekend test session; not what you'd hand
someone to keep using afterward.

## Path 2 — Android APK via EAS Build (free, installable, no store account)

Produces a real, installable `.apk` — no Play Store account needed, no Apple involvement. This
is the best "give someone a file, they install it, it's just there as an app" option, and it's
completely free.

1. Install the EAS CLI and log in (free Expo account):
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. One-time project config (creates `eas.json`):
   ```bash
   eas build:configure
   ```
3. Build an APK for internal testing:
   ```bash
   eas build --platform android --profile preview
   ```
   If `eas.json`'s `preview` profile doesn't already say `"buildType": "apk"` under
   `android`, add it — otherwise EAS defaults to an `.aab` (App Bundle), which is for Play
   Store submission, not direct install.
4. When the build finishes, EAS gives you a URL (and a QR code) to download the `.apk` directly
   to an Android phone. On the phone: open the link, allow "install from unknown sources" if
   prompted, install.

No `.env` values are baked into the build automatically — make sure `eas.json`'s build profile
either reads from EAS's own [environment variables](https://docs.expo.dev/eas/environment-variables/)
or you pass them via `eas secret:create`, since `.env` itself is gitignored and won't exist in
EAS's cloud build environment.

## Path 3 — iOS via EAS Build (requires a paid Apple Developer account)

Same EAS flow as Android, but iOS device installs always require an Apple Developer Program
membership ($99/year — see `docs/costs.md`), no way around it. Two flavors:

- **Ad-hoc / internal distribution**: install directly on specific registered devices, similar
  workflow to the Android APK above (`eas build --platform ios --profile preview`, EAS walks you
  through registering device UDIDs). Good for a small, known group of testers.
- **TestFlight**: `eas submit -p ios` after a build, distribute via TestFlight instead of a
  direct link. Better for a slightly larger or less technical group (they just get a TestFlight
  invite), same underlying Apple Developer Program requirement.

Either way, you'll need to have the Apple Developer Program membership active
(https://developer.apple.com/programs/) before `eas build`/`eas submit` for iOS will fully work
— EAS can walk you through creating the needed certificates/provisioning profiles
interactively the first time.

## Path 4 — Web (limited — compass/GPS heading won't work)

`app.json`'s `web.output` is `"single"` (a plain SPA build), so a web build is possible:

```bash
npx expo export --platform web
npx serve dist   # or host the dist/ folder anywhere static (Vercel, Netlify, etc.)
```

**Be aware**: the Compass tab depends on `expo-location`'s device-heading API, which does not
work on web — the core feature of this app is native-only. A web build would work for
browsing Feed/Crawls/History but not for actually running a crawl. Not recommended as the way
to "go test the app" — use Path 1 or 2 for that. Web export is here mainly for completeness /
in case a future non-compass feature (e.g. a public crawl directory) wants a web presence.

## Recommendation for a weekend test session

- **Just you + a few friends, one afternoon**: Path 1 (`expo start --tunnel`). Zero setup beyond
  what exists today.
- **Want it to feel like a real app / people keep it installed after**: Path 2 (Android APK) for
  Android testers — free and no account needed. Add Path 3 only if iOS testers are essential and
  you're fine with the $99/year.
